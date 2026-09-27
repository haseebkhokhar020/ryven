import { describe,it,expect } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { ExtensionService,validateManifest } from '../electron/extensions';
import example from '../examples/ryven-snippet-pack.json';
describe('declarative extension boundary',()=>{
 it('installs, lists and removes real snippets, recording security events',async()=>{
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'ryven-ext-'));
  try{const service=new ExtensionService(root);const file=path.join(root,'selected.json');await fs.writeFile(file,JSON.stringify(example));const preview=await service.inspect(file);expect(preview.permissions).toEqual(['snippets']);await service.install(preview);expect((await service.list())[0].snippets).toHaveLength(2);await expect(service.install(preview)).rejects.toThrow();await service.remove(preview.id);expect(await service.list()).toEqual([]);const log=await fs.readFile(path.join(root,'security-events.log'),'utf8');expect(log).toContain('extension.installed');expect(log).toContain('extension.removed');}
  finally{await fs.rm(root,{recursive:true,force:true})}
 });
 it('rejects executable entrypoints, unknown capabilities and oversized code',()=>{
  expect(()=>validateManifest({...example,main:'index.js'})).toThrow(/Unsupported/);
  expect(()=>validateManifest({...example,permissions:['filesystem']})).toThrow(/snippets permission/);
  expect(()=>validateManifest({...example,snippets:[{label:'too big',language:'javascript',body:'x'.repeat(20001)}]})).toThrow(/20,000/);
 });
});
