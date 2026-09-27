import { describe, it, expect } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { DebugService } from '../electron/debug';
import { WorkspaceService } from '../electron/workspace';
import type { DebugSession } from '../shared/contracts';
import type { WebContents } from 'electron';

describe('Node inspector debugger',()=>{
 it('starts a real process, pauses on a breakpoint and evaluates the call frame',async()=>{
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'ryven-debug-'));
  const workspace=new WorkspaceService();
  let latest:DebugSession|null=null;
  const listeners=new Set<(state:DebugSession)=>void>();
  const web={isDestroyed:()=>false,send:(_channel:string,event:DebugSession)=>{latest=event;listeners.forEach(fn=>fn(event))}} as unknown as WebContents;
  const service=new DebugService(workspace,()=>web);
  const until=(predicate:(s:DebugSession)=>boolean):Promise<DebugSession>=>new Promise((resolve,reject)=>{
    if(latest&&predicate(latest))return resolve(latest);
    const listener=(s:DebugSession)=>{if(predicate(s)){listeners.delete(listener);clearTimeout(timer);resolve(s)}else if(s.status==='error'||s.status==='stopped'){listeners.delete(listener);clearTimeout(timer);reject(new Error(s.error||s.reason||'Debugger stopped'))}};
    const timer=setTimeout(()=>{listeners.delete(listener);reject(new Error(`Timed out waiting for debugger; state: ${JSON.stringify(latest)}`))},10000);
    listeners.add(listener);
  });
  try{
    await fs.writeFile(path.join(root,'main.js'),'let value = 41;\nvalue += 1;\nsetInterval(() => {}, 1000);\n');
    await workspace.open(root,true);
    await service.start('main.js');
    const first=await until(s=>s.status==='paused');
    expect(first.frames.length).toBeGreaterThan(0);
    const breakpoint=await service.breakpoint('main.js',2);
    expect(breakpoint.id).toBeTruthy();
    await service.action('resume');
    const stopped=await until(s=>s.status==='paused'&&s.frames[0]?.line===2);
    expect(stopped.frames[0].file).toContain('main.js');
    expect(await service.evaluate('value')).toBe('41');
  }finally{service.stop();if(process.platform==='win32')await new Promise(resolve=>setTimeout(resolve,400));await fs.rm(root,{recursive:true,force:true,maxRetries:5,retryDelay:100})}
 },20000);
});
