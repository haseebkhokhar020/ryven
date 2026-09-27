import { contextBridge, ipcRenderer } from 'electron';
import type { RyvenBridge, ProcessEvent } from '../shared/contracts';
const invoke = (channel: string, ...args: unknown[]) => ipcRenderer.invoke(channel, ...args);
const bridge: RyvenBridge = {
  platform: process.platform,
  selectWorkspace: () => invoke('workspace:select'), openWorkspace: path => invoke('workspace:open', path),
  setTrust: trusted => invoke('workspace:trust', trusted), recent: () => invoke('workspace:recent'),
  selectProjectParent: () => invoke('project:parent'), createProject: options => invoke('project:create', options),
  list: path => invoke('files:list', path), read: path => invoke('files:read', path),
  write: (path, content) => invoke('files:write', path, content), createEntry: (path, kind) => invoke('files:create', path, kind),
  projectInfo: () => invoke('project:info'), detectTools: () => invoke('tools:detect'), gitStatus: () => invoke('git:status'), scanSecurity: () => invoke('security:scan'), askAI: request => invoke('ai:ask', request),
  startTerminal: () => invoke('process:terminal'), runTask: task => invoke('process:task', task),
  sendInput: (id, data) => invoke('process:input', id, data), stopJob: id => invoke('process:stop', id),
  listExtensions: () => invoke('extensions:list'), selectExtension: () => invoke('extensions:select'), installExtension: () => invoke('extensions:install'), removeExtension: id => invoke('extensions:remove',id),
  startDebug: entry => invoke('debug:start',entry), debugAction: action => invoke('debug:action',action),
  debugBreakpoint: (file,line,condition) => invoke('debug:breakpoint',file,line,condition), removeDebugBreakpoint: id => invoke('debug:remove-breakpoint',id), debugEvaluate: expression => invoke('debug:evaluate',expression), stopDebug: () => invoke('debug:stop'),
  openExternalPreview: url => invoke('preview:external', url),
  onProcess: callback => { const listener = (_: Electron.IpcRendererEvent, event: ProcessEvent) => callback(event); ipcRenderer.on('process:event', listener); return () => ipcRenderer.removeListener('process:event', listener); },
  onDebug: callback => { const listener = (_: Electron.IpcRendererEvent, event: import('../shared/contracts').DebugSession) => callback(event); ipcRenderer.on('debug:event', listener); return () => ipcRenderer.removeListener('debug:event', listener); },
  onProject: callback => { const listener = (_: Electron.IpcRendererEvent, step: string) => callback(step); ipcRenderer.on('project:event', listener); return () => ipcRenderer.removeListener('project:event', listener); }
};
contextBridge.exposeInMainWorld('ryven', bridge);
