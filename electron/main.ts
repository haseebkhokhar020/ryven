import { app, BrowserWindow, dialog, ipcMain, shell, session } from 'electron';
import path from 'node:path';
import fs from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { LocalStore } from './store';
import { WorkspaceService } from './workspace';
import { ProcessService } from './processes';
import { createProject } from './projects';
import { scanWorkspaceSecurity } from './security';
import { requestAI } from './ai';
import { DebugService } from './debug';
import { ExtensionService } from './extensions';
import type { CreateOptions } from '../shared/contracts';

let window: BrowserWindow | null = null;
const workspace = new WorkspaceService();
let store: LocalStore;
let processes: ProcessService;
let debuggerService: DebugService;
let selectedParent: string | null = null;
let selectedExtension: import('../shared/contracts').ExtensionManifest | null = null;
let extensions: ExtensionService;
const validLoopback = (url: string) => {
  try { const parsed = new URL(url); return parsed.protocol === 'http:' && ['localhost','127.0.0.1'].includes(parsed.hostname) && !!parsed.port; }
  catch { return false; }
};
const handle = (name: string, fn: (...args: any[]) => unknown) => ipcMain.handle(name, async (event, ...args) => {
  if (!window || event.sender !== window.webContents) throw new Error('Invalid IPC origin.');
  try { return await fn(...args); } catch (error) { throw new Error((error as Error).message || 'Operation failed.'); }
});

async function boot() {
  store = new LocalStore(app.getPath('userData'));
  extensions = new ExtensionService(app.getPath('userData'));
  await store.initialize();
  processes = new ProcessService(workspace, () => window?.webContents);
  debuggerService = new DebugService(workspace, () => window?.webContents);
  session.defaultSession.setPermissionRequestHandler((_web, _permission, callback) => callback(false));
  window = new BrowserWindow({
    width: 1510, height: 930, minWidth: 920, minHeight: 640, backgroundColor: '#111416',
    title: 'RYVEN — The Development Engine',
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: true, webSecurity: true }
  });
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', event => event.preventDefault());
  if (app.isPackaged) await window.loadFile(path.join(__dirname, '../../dist/index.html'));
  else await window.loadURL('http://localhost:5173');
  window.on('closed', () => { debuggerService.stop(); processes.stopAll(); window = null; });
}
app.whenReady().then(async () => {
  handle('workspace:select', async () => { const result = await dialog.showOpenDialog(window!, { properties: ['openDirectory'] }); if (result.canceled || !result.filePaths[0]) return null; debuggerService.stop(); processes.stopAll(); const real = await fs.realpath(result.filePaths[0]); const ws = await workspace.open(real, store.isTrusted(real)); store.remember(ws.path, ws.trusted); return ws; });
  handle('workspace:open', async (folder: string) => { if (typeof folder !== 'string') throw new Error('Invalid folder.'); debuggerService.stop(); processes.stopAll(); const real = await fs.realpath(folder); const ws = await workspace.open(real, store.isTrusted(real)); store.remember(ws.path, ws.trusted); return ws; });
  handle('workspace:trust', (trusted: boolean) => { if (typeof trusted !== 'boolean') throw new Error('Invalid trust selection.'); const ws = workspace.requireWorkspace(); if (!trusted) { debuggerService.stop(); processes.stopAll(); } ws.trusted = trusted; store.remember(ws.path, trusted); return { ...ws }; });
  handle('workspace:recent', () => store.recent());
  handle('project:parent', async () => { const result = await dialog.showOpenDialog(window!, { properties: ['openDirectory'], title: 'Choose a folder for the new project' }); selectedParent = result.canceled ? null : await fs.realpath(result.filePaths[0]); return selectedParent; });
  handle('project:create', async (options: CreateOptions) => { if (!selectedParent || options?.parent !== selectedParent) throw new Error('Choose a parent folder in the project wizard.'); selectedParent = null; debuggerService.stop(); processes.stopAll(); const result = await createProject(options, workspace, step => window?.webContents.send('project:event', step)); store.remember(result.workspace.path, true); return result; });
  handle('files:list', (relative?: string) => workspace.list(relative));
  handle('files:read', (relative: string) => workspace.read(relative));
  handle('files:write', (relative: string, content: string) => workspace.write(relative, content));
  handle('files:create', (relative: string, kind: 'file' | 'folder') => workspace.create(relative, kind));
  handle('project:info', () => workspace.info());
  handle('tools:detect', () => ProcessService.detectTools());
  handle('git:status', () => { const ws = workspace.requireWorkspace(true); const git = spawnSync('git', ['status', '--short', '--branch'], { cwd: ws.path, encoding: 'utf8', timeout: 5000 }); return git.error ? `Git unavailable: ${git.error.message}` : git.status ? `Git: ${git.stderr}` : git.stdout; });
  handle('ai:ask', (request: import('../shared/contracts').AIRequest) => requestAI(request,workspace));
  handle('extensions:list', () => extensions.list());
  handle('extensions:select', async () => { selectedExtension=null; const result=await dialog.showOpenDialog(window!,{title:'Choose a RYVEN snippet extension manifest',filters:[{name:'RYVEN JSON extension',extensions:['json']}],properties:['openFile']});if(result.canceled||!result.filePaths[0])return null;selectedExtension=await extensions.inspect(result.filePaths[0]);return selectedExtension; });
  handle('extensions:install', async () => {if(!selectedExtension)throw new Error('Preview an extension before approving installation.');const item=selectedExtension;selectedExtension=null;await extensions.install(item);return extensions.list()});
  handle('extensions:remove', async (id:string) => {await extensions.remove(id);return extensions.list()});
  handle('debug:start', (entry?:string) => debuggerService.start(entry));
  handle('debug:action', (action: import('../shared/contracts').DebugAction) => debuggerService.action(action));
  handle('debug:breakpoint', (file:string,line:number,condition?:string) => debuggerService.breakpoint(file,line,condition));
  handle('debug:remove-breakpoint', (id:string) => debuggerService.removeBreakpoint(id));
  handle('debug:evaluate', (expression:string) => debuggerService.evaluate(expression));
  handle('debug:stop', () => debuggerService.stop());
  handle('security:scan', () => scanWorkspaceSecurity(workspace));
  handle('process:terminal', () => processes.terminal());
  handle('process:task', (task: 'run' | 'test' | 'build' | 'git-status') => { if (!['run','test','build','git-status'].includes(task)) throw new Error('Unknown task.'); workspace.requireWorkspace(true); return processes.task(task); });
  handle('process:input', (id: string, data: string) => processes.input(id, data));
  handle('process:stop', (id: string) => processes.stop(id));
  handle('preview:external', (url: string) => { if (!validLoopback(url)) throw new Error('Only local HTTP preview URLs can be opened.'); return shell.openExternal(url); });
  await boot();
}).catch(console.error);
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.on('activate', () => { if (!window) void boot(); });
