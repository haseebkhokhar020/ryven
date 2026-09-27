import { describe, it, expect, vi, afterEach } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { scanSourceSecrets } from '../electron/security';
import { requestAI, validateEndpoint } from '../electron/ai';
import { WorkspaceService } from '../electron/workspace';
import type { AIRequest } from '../shared/contracts';
const config: AIRequest = {provider:'openai-compatible',endpoint:'http://127.0.0.1:11434/v1/chat/completions',model:'local-model',apiKey:'',question:'Explain this',fileName:'src/code.ts',code:'export const x = 1',authorized:false};
afterEach(()=>vi.unstubAllGlobals());
describe('RYVEN Shield',()=>{
 it('reports actual patterns with a location, and redacts the full secret',async()=>{const root=await fs.mkdtemp(path.join(os.tmpdir(),'ryven-shield-'));try{const secret='AKIA1234567890ABCDEF';await fs.writeFile(path.join(root,'config.ts'),`const secret = "${secret}";\n`);await fs.mkdir(path.join(root,'node_modules'));await fs.writeFile(path.join(root,'node_modules','ignored.ts'),`const secret = "${secret}";`);const report=await scanSourceSecrets(root);expect(report.checked).toBe(1);expect(report.findings.length).toBeGreaterThan(0);expect(report.findings[0].location).toBe('config.ts:1');expect(report.findings.map(f=>f.evidence).join(' ')).not.toContain(secret);}finally{await fs.rm(root,{recursive:true,force:true})}});
 it('does not mistake an unscanned dependency tree for a clean scan',async()=>{const root=await fs.mkdtemp(path.join(os.tmpdir(),'ryven-shield-empty-'));try{const report=await scanSourceSecrets(root);expect(report.checked).toBe(0);expect(report.findings).toEqual([])}finally{await fs.rm(root,{recursive:true,force:true})}});
});
describe('AI consent and provider boundary',()=>{
 it('blocks HTTP cloud endpoints and embedded URL credentials',()=>{expect(()=>validateEndpoint('http://example.com/v1/messages')).toThrow(/HTTPS/);expect(()=>validateEndpoint('https://user:pass@example.com')).toThrow(/credentials/);expect(validateEndpoint('https://api.example.com/v1/messages').hostname).toBe('api.example.com')});
 it('cannot send a request without explicit approval',async()=>{const workspace=new WorkspaceService();const fetcher=vi.fn();vi.stubGlobal('fetch',fetcher);await expect(requestAI(config,workspace)).rejects.toThrow(/approval/);expect(fetcher).not.toHaveBeenCalled()});
 it('sends only the reviewed file context and prompt when approved',async()=>{const root=await fs.mkdtemp(path.join(os.tmpdir(),'ryven-ai-'));try{const workspace=new WorkspaceService();await workspace.open(root,true);const fetcher=vi.fn(async()=>new Response(JSON.stringify({choices:[{message:{content:'Suggestion only.'}}]}),{status:200,headers:{'content-type':'application/json'}}));vi.stubGlobal('fetch',fetcher);const answer=await requestAI({...config,authorized:true},workspace);expect(answer).toBe('Suggestion only.');const [,settings]=fetcher.mock.calls[0];expect(settings.redirect).toBe('error');expect(JSON.stringify(settings.body)).toContain('export const x = 1');expect(JSON.stringify(settings.body)).not.toContain(root);}finally{await fs.rm(root,{recursive:true,force:true})}});
});
