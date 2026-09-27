import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs/promises';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import WebSocket from 'ws';
import type { WebContents } from 'electron';
import type { DebugAction, DebugFrame, DebugSession, DebugVariable } from '../shared/contracts';
import { WorkspaceService } from './workspace';

type Response = { id?: number; result?: Record<string,unknown>; error?: { message?: string }; method?: string; params?: Record<string,unknown> };
export class DebugService {
  private child: ChildProcessWithoutNullStreams | null = null;
  private socket: WebSocket | null = null;
  private sequence = 0;
  private pending = new Map<number, { resolve: (result: Record<string,unknown>)=>void; reject: (reason: Error)=>void; timer: NodeJS.Timeout }>();
  private state: DebugSession | null = null;
  private frameId: string | null = null;
  private scripts = new Map<string,string>();
  private breakpointIds = new Set<string>();
  constructor(private workspace: WorkspaceService, private webContents: () => WebContents | undefined) {}
  private emit(patch: Partial<DebugSession>) {
    if (!this.state) return;
    this.state = { ...this.state, ...patch };
    const web = this.webContents();
    if (web && !web.isDestroyed()) web.send('debug:event', this.state);
  }
  snapshot() { return this.state; }
  private async send(method: string, params: Record<string,unknown> = {}): Promise<Record<string,unknown>> {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) throw new Error('Debugger connection is not ready.');
    const id = ++this.sequence;
    return new Promise((resolve,reject) => {
      const timer = setTimeout(()=>{this.pending.delete(id);reject(new Error(`Debugger timed out: ${method}`));},8000);
      this.pending.set(id,{resolve,reject,timer});
      this.socket!.send(JSON.stringify({ id, method, params }), error=>{if(error){clearTimeout(timer);this.pending.delete(id);reject(error)}});
    });
  }
  private async onPaused(params: Record<string,unknown>) {
    const raw = (params.callFrames || []) as { callFrameId: string; functionName:string; url:string; location:{scriptId?:string;lineNumber:number;columnNumber:number}; scopeChain:{type:string;object?:{objectId?:string}}[] }[];
    const frames: DebugFrame[] = raw.slice(0,20).map(f => {
      let file=f.url || this.scripts.get(f.location.scriptId||'') || ''; try { if(file.startsWith('file:')) file=fileURLToPath(file); } catch { /* keep debugger URL */ }
      return { id:f.callFrameId, functionName:f.functionName||'(anonymous)', file, line:f.location.lineNumber+1, column:f.location.columnNumber+1 };
    });
    this.frameId=raw[0]?.callFrameId || null;
    this.emit({ status:'paused', reason:String(params.reason||'paused'), frames, variables:[] });
    const scopes=raw[0]?.scopeChain.filter(x=>x.type==='local'||x.type==='closure').slice(0,2) || [];
    const variables: DebugVariable[]=[];
    for(const scope of scopes) {
      if(!scope.object?.objectId) continue;
      try {
        const result=await this.send('Runtime.getProperties',{objectId:scope.object.objectId,ownProperties:true});
        for(const prop of (result.result||[]) as {name:string;value?:{type:string;value?:unknown;description?:string}}[]) {
          if(!prop.value||variables.length>=40) continue;
          const value=prop.value;
          variables.push({name:prop.name,type:value.type,value:String(value.value??value.description??value.type).slice(0,200)});
        }
      } catch { /* variables are best effort; the pause itself remains valid */ }
    }
    if(this.state?.status==='paused')this.emit({variables});
  }
  private onMessage(text: string){let packet:Response;try{packet=JSON.parse(text) as Response}catch{return}
    if(packet.id!==undefined){const pending=this.pending.get(packet.id);if(!pending)return;this.pending.delete(packet.id);clearTimeout(pending.timer);if(packet.error)pending.reject(new Error(packet.error.message||'Debugger error'));else pending.resolve(packet.result||{});return}
    if(packet.method==='Debugger.scriptParsed' && packet.params?.scriptId && packet.params?.url) this.scripts.set(String(packet.params.scriptId),String(packet.params.url));
    if(packet.method==='Debugger.paused')void this.onPaused(packet.params||{});
    if(packet.method==='Debugger.resumed')this.emit({status:'running',reason:undefined,frames:[],variables:[]});
  }
  async start(entry?: string): Promise<DebugSession> {
    const root=this.workspace.requireWorkspace(true).path;
    if(this.child)throw new Error('Stop the current debug session before starting another.');
    const choices=entry?[entry]:['src/server.js','src/index.js','server.js','index.js','main.js'];
    let chosen: string | null=null;
    for(const candidate of choices) {
      if(!/\.(?:js|mjs|cjs)$/.test(candidate))continue;
      try {const file=await this.workspace.resolve(candidate);if((await fs.stat(file)).isFile()){chosen=candidate;break}}catch { /* try next candidate */ }
    }
    if(!chosen)throw new Error('Node debugger needs an existing .js, .mjs or .cjs entry file inside a trusted workspace.');
    const file=await this.workspace.resolve(chosen);
    this.state={id:randomUUID(),entry:chosen,status:'starting',frames:[],variables:[]};
    this.frameId=null;this.scripts.clear();this.breakpointIds.clear();
    const child=spawn('node',['--inspect-brk=127.0.0.1:0',file],{cwd:root,stdio:'pipe',detached:process.platform!=='win32',windowsHide:true});
    this.child=child;
    let buffer='';
    child.stderr.on('data',data=>{buffer+=String(data);const found=buffer.match(/ws:\/\/127\.0\.0\.1:\d+\/[a-f0-9-]+/i);if(found&&!this.socket)void this.connect(found[0]);if(buffer.length>3000)buffer=buffer.slice(-3000)});
    child.stdout.on('data', data=>this.emit({ output: (this.state?.output||'')+String(data).slice(0,5000) }));
    child.on('error',error=>this.emit({status:'error',error:error.message}));
    child.on('close',code=>{this.child=null;this.socket?.close();this.socket=null;this.failPending('Debug process exited.');this.emit({status:this.state?.status==='error'?'error':'stopped',reason:`Process exited (${code??'unknown'})`,frames:[],variables:[]})});
    return this.state;
  }
  private async connect(url: string){const socket=new WebSocket(url,{perMessageDeflate:false,handshakeTimeout:6000});this.socket=socket;
    socket.on('message',data=>this.onMessage(String(data)));
    socket.on('error',error=>this.emit({status:'error',error:`Inspector connection: ${error.message}`}));
    socket.on('close',()=>{this.failPending('Inspector disconnected.');if(this.child)this.emit({status:'error',error:'Inspector disconnected while process is running.'})});
    socket.on('open',async()=>{try{this.emit({status:'running'});await this.send('Runtime.enable');await this.send('Debugger.enable');await this.send('Runtime.runIfWaitingForDebugger');}catch(error){this.emit({status:'error',error:(error as Error).message})}});
  }
  private failPending(reason:string){for(const [,p] of this.pending){clearTimeout(p.timer);p.reject(new Error(reason))}this.pending.clear()}
  async action(action:DebugAction){if(!['resume','pause','stepOver','stepInto','stepOut'].includes(action))throw new Error('Unknown debugger action.');await this.send(`Debugger.${action}`)}
  async breakpoint(relative:string,line:number,condition?:string){this.workspace.requireWorkspace(true);if(!Number.isInteger(line)||line<1||line>100000)throw new Error('Breakpoint line must be a positive integer.');const file=await this.workspace.resolve(relative);if(!/\.(?:js|mjs|cjs)$/.test(file))throw new Error('Node breakpoints require a JavaScript file.');if(condition!==undefined&&(typeof condition!=='string'||condition.length>500))throw new Error('Breakpoint condition must be under 500 characters.');const result=await this.send('Debugger.setBreakpointByUrl',{lineNumber:line-1,url:pathToFileURL(file).href,condition:condition||''});const id=String(result.breakpointId||'');if(!id)throw new Error('Debugger did not accept the breakpoint.');this.breakpointIds.add(id);return {id,file:relative,line,condition:condition||undefined}}
  async removeBreakpoint(id:string){if(!this.breakpointIds.has(id))throw new Error('Unknown breakpoint.');await this.send('Debugger.removeBreakpoint',{breakpointId:id});this.breakpointIds.delete(id)}
  async evaluate(expression:string):Promise<string>{this.workspace.requireWorkspace(true);if(!this.frameId||this.state?.status!=='paused')throw new Error('Pause on a breakpoint before evaluating an expression.');if(typeof expression!=='string'||!expression.trim()||expression.length>2000)throw new Error('Enter a watch expression under 2,000 characters.');const result=await this.send('Debugger.evaluateOnCallFrame',{callFrameId:this.frameId,expression,returnByValue:true,throwOnSideEffect:false});if(result.exceptionDetails)throw new Error('Expression threw an exception.');const value=result.result as {value?:unknown;description?:string;type?:string}|undefined;return String(value?.value??value?.description??value?.type??'undefined').slice(0,2000)}
  stop(){const child=this.child;this.child=null;this.socket?.close();this.socket=null;this.frameId=null;this.breakpointIds.clear();this.failPending('Debugger stopped.');if(child){try{if(process.platform==='win32'&&child.pid)spawn('taskkill',['/PID',String(child.pid),'/T','/F']);else if(child.pid)process.kill(-child.pid,'SIGTERM');else child.kill('SIGTERM')}catch{child.kill('SIGTERM')}}this.emit({status:'stopped',reason:'Stopped by user',frames:[],variables:[]})}
}
