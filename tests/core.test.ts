import { describe, it, expect } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { WorkspaceService } from '../electron/workspace';
import { LocalStore } from '../electron/store';
import { createProject } from '../electron/projects';
import { ProcessService } from '../electron/processes';
import { detectPreview } from '../src/lib/language';
import type { WebContents } from 'electron';
import type { ProcessEvent } from '../shared/contracts';

async function sandbox(fn: (folder:string)=>Promise<void>) { const folder=await fs.mkdtemp(path.join(os.tmpdir(),'ryven-test-')); try{await fn(folder)} finally{await fs.rm(folder,{recursive:true,force:true})} }
describe('workspace boundary and trust',()=>{
 it('reads in restricted mode but blocks writes, commands and traversal',async()=>sandbox(async folder=>{const workspace=new WorkspaceService();await fs.writeFile(path.join(folder,'file.txt'),'local');await workspace.open(folder,false);expect(await workspace.read('file.txt')).toBe('local');await expect(workspace.write('file.txt','changed')).rejects.toThrow(/Restricted/);await expect(workspace.resolve('../escape')).rejects.toThrow(/escapes/);await expect(workspace.resolve('/etc/passwd')).rejects.toThrow(/Invalid/);workspace.current!.trusted=true;await workspace.write('file.txt','changed');expect(await workspace.read('file.txt')).toBe('changed');}));
 it.skipIf(process.platform === 'win32')('rejects symlinks outside workspace including writes through a linked directory',async()=>sandbox(async folder=>{const outside=await fs.mkdtemp(path.join(os.tmpdir(),'ryven-outside-'));try{await fs.symlink(outside,path.join(folder,'link'));const workspace=new WorkspaceService();await workspace.open(folder,true);await expect(workspace.create('link/escape.txt','file')).rejects.toThrow(/Symlink escapes/);await expect(workspace.list('link')).rejects.toThrow(/Symlink escapes/);expect(await workspace.list()).toEqual([]);}finally{await fs.rm(outside,{recursive:true,force:true})}}));
 it('persists trust and recent projects in SQLite',async()=>sandbox(async folder=>{const store=new LocalStore(folder);await store.initialize();store.remember('/tmp/ryven-demo',true);expect(store.recent()[0].trusted).toBe(true);const reloaded=new LocalStore(folder);await reloaded.initialize();expect(reloaded.isTrusted('/tmp/ryven-demo')).toBe(true)}));
});
describe('project generation',()=>{
 it('creates a real Node API whose tests exercise health and 404 responses',async()=>sandbox(async parent=>{const workspace=new WorkspaceService();const result=await createProject({parent,name:'api-test',template:'node-api',initializeGit:false},workspace);expect(result.files).toContain('src/app.js');expect(result.files).toContain('test/server.test.js');expect(result.workspace.trusted).toBe(true);const run=spawnSync(process.platform==='win32'?'npm.cmd':'npm',['test'],{cwd:result.workspace.path,encoding:'utf8',timeout:15000,shell:process.platform==='win32'});expect(run.status,run.stderr).toBe(0);expect(run.stdout).toContain('pass 1');}));
 it('never overwrites an existing project',async()=>sandbox(async parent=>{const workspace=new WorkspaceService();const options={parent,name:'new-project',template:'blank' as const,initializeGit:false};await createProject(options,workspace);await expect(createProject(options,workspace)).rejects.toThrow();}));
});

describe('runtime wiring',()=>{
 it('runs a project test task through the process adapter and reports real exit output',async()=>sandbox(async parent=>{const workspace=new WorkspaceService();await createProject({parent,name:'runtime-test',template:'node-api',initializeGit:false},workspace);const events:ProcessEvent[]=[];let resolveExit:(event:ProcessEvent)=>void=()=>{};const exit=new Promise<ProcessEvent>(resolve=>{resolveExit=resolve});const web={isDestroyed:()=>false,send:(_channel:string,event:ProcessEvent)=>{events.push(event);if(event.kind==='exit')resolveExit(event)}} as unknown as WebContents;const service=new ProcessService(workspace,()=>web);const job=await service.task('test');expect(job.command).toContain('npm run test');const result=await Promise.race([exit,new Promise<never>((_,reject)=>setTimeout(()=>reject(new Error('Test job timed out')),12000))]);expect(result.exitCode).toBe(0);expect(events.map(e=>e.data||'').join('')).toContain('pass 1');}),15000);
 it('only extracts local preview URLs from run output',()=>{expect(detectPreview('  Local: http://localhost:5173/\n')).toBe('http://localhost:5173/');expect(detectPreview('visit https://example.com')).toBe(null)});
});
