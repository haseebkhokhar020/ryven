import fs from 'node:fs/promises';
import path from 'node:path';
import type { ExtensionManifest } from '../shared/contracts';
const idPattern=/^[a-z][a-z0-9.-]{2,69}$/;
const allowed=new Set(['id','name','version','description','permissions','snippets']);
export function validateManifest(input:unknown):ExtensionManifest {
  if(!input||typeof input!=='object'||Array.isArray(input))throw new Error('Extension must be a JSON object.');
  const data=input as Record<string,unknown>;
  if(Object.keys(data).some(k=>!allowed.has(k)))throw new Error('Unsupported extension fields. Executable code and additional permissions are not accepted.');
  if(typeof data.id!=='string'||!idPattern.test(data.id))throw new Error('Extension id must be 3–70 lowercase letters, digits, dots or hyphens.');
  if(typeof data.name!=='string'||!data.name.trim()||data.name.length>80)throw new Error('Invalid extension name.');
  if(typeof data.version!=='string'||!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(data.version))throw new Error('Use a semantic extension version.');
  if(typeof data.description!=='string'||data.description.length>500)throw new Error('Invalid extension description.');
  if(!Array.isArray(data.permissions)||data.permissions.length!==1||data.permissions[0]!=='snippets')throw new Error('Only the declarative snippets permission is supported.');
  if(!Array.isArray(data.snippets)||data.snippets.length<1||data.snippets.length>30)throw new Error('Provide 1–30 snippets.');
  const snippets=data.snippets.map((value:unknown)=>{
    if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('Invalid snippet entry.');
    const item=value as Record<string,unknown>;
    if(Object.keys(item).some(k=>!['label','language','body'].includes(k)))throw new Error('Unsupported snippet field.');
    if(typeof item.label!=='string'||!item.label.trim()||item.label.length>80||typeof item.language!=='string'||!/^[a-z0-9+#-]{1,30}$/.test(item.language)||typeof item.body!=='string'||!item.body||item.body.length>20000)throw new Error('Snippet requires a label, language and body under 20,000 characters.');
    return {label:item.label,language:item.language,body:item.body};
  });
  return {id:data.id,name:data.name,version:data.version,description:data.description,permissions:['snippets'],snippets};
}
export class ExtensionService {
  private dir:string;
  private logPath:string;
  constructor(userData:string){this.dir=path.join(userData,'ryven-extensions');this.logPath=path.join(userData,'security-events.log')}
  private async record(action:string,id:string){await fs.appendFile(this.logPath,`${new Date().toISOString()} extension.${action} ${id}\n`,{mode:0o600}).catch(()=>{})}
  async list():Promise<ExtensionManifest[]>{await fs.mkdir(this.dir,{recursive:true,mode:0o700});const result:ExtensionManifest[]=[];for(const item of await fs.readdir(this.dir,{withFileTypes:true})){if(!item.isFile()||!item.name.endsWith('.json'))continue;try{const content=await fs.readFile(path.join(this.dir,item.name),'utf8');result.push(validateManifest(JSON.parse(content)))}catch{/* invalid local file is ignored, never executed */}}return result.sort((a,b)=>a.name.localeCompare(b.name))}
  async inspect(file:string):Promise<ExtensionManifest>{const stat=await fs.stat(file);if(!stat.isFile()||stat.size>100000)throw new Error('Extension manifest must be a JSON file under 100 KB.');const data=JSON.parse(await fs.readFile(file,'utf8')) as unknown;return validateManifest(data)}
  async install(manifest:ExtensionManifest):Promise<void>{const safe=validateManifest(manifest);await fs.mkdir(this.dir,{recursive:true,mode:0o700});const dest=path.join(this.dir,`${safe.id}.json`);await fs.writeFile(dest,JSON.stringify(safe,null,2)+'\n',{flag:'wx',mode:0o600});await this.record('installed',safe.id)}
  async remove(id:string):Promise<void>{if(!idPattern.test(id))throw new Error('Invalid extension id.');const dest=path.join(this.dir,`${id}.json`);const stat=await fs.lstat(dest);if(!stat.isFile()||stat.isSymbolicLink())throw new Error('Refusing to remove a linked or non-file extension.');await fs.unlink(dest);await this.record('removed',id)}
}
