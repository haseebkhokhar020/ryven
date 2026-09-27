import { create } from 'zustand';
import type { Entry, Job, ProcessEvent, ProjectInfo, Recent, Tool, Workspace, SecurityReport, DebugSession, DebugAction } from '../../shared/contracts';
import { bridge, message } from './bridge';
import { detectPreview } from './language';
export type Activity = 'explorer' | 'search' | 'git' | 'run' | 'testing' | 'verification' | 'extensions' | 'ai' | 'projects' | 'security' | 'build';
export type SideTab = 'inspector' | 'preview' | 'ai';
export type BottomTab = 'terminal' | 'tests' | 'problems' | 'output';
type Doc = { path: string; content: string; saved: string };
type JobState = Job & { output: string; running: boolean; exitCode?: number | null; task?: string };
interface State {
  workspace: Workspace | null; recent: Recent[]; entries: Entry[]; expanded: string[];
  docs: Doc[]; activePath: string | null; info: ProjectInfo | null; tools: Tool[];
  jobs: JobState[]; activeJob: string | null; previewUrl: string | null;
  securityReport: SecurityReport | null; scanningSecurity: boolean; scanSecurity: () => Promise<void>;
  debug: DebugSession | null; breakpoints: {id:string;file:string;line:number;condition?:string}[];
  startDebug: () => Promise<void>; debugAction: (action:DebugAction) => Promise<void>;
  addBreakpoint: (file:string,line:number,condition?:string) => Promise<void>; removeBreakpoint: (id:string) => Promise<void>; debugEvaluate: (expression:string) => Promise<string>;
  stopDebug: () => Promise<void>; handleDebug: (event:DebugSession) => void;
  activity: Activity; sideTab: SideTab; bottomTab: BottomTab;
  sidebarOpen: boolean; rightOpen: boolean; bottomOpen: boolean;
  sidebarWidth: number; rightWidth: number; bottomHeight: number;
  palette: boolean; wizard: boolean; trustPrompt: boolean; notice: string | null;
  set: (value: Partial<State>) => void; error: (error: unknown) => void;
  initialize: () => Promise<void>; loadWorkspace: (workspace: Workspace) => Promise<void>;
  selectWorkspace: () => Promise<void>; openRecent: (path: string) => Promise<void>; setTrust: (trusted: boolean) => Promise<void>;
  refreshTree: () => Promise<void>; toggleFolder: (path: string) => Promise<void>; openFile: (path: string) => Promise<void>;
  updateDoc: (path: string, content: string) => void; saveDoc: () => Promise<void>; closeDoc: (path: string) => void;
  createEntry: (path: string, kind: 'file'|'folder') => Promise<void>; refreshInfo: () => Promise<void>;
  startTerminal: () => Promise<void>; runTask: (task: 'run'|'test'|'build'|'git-status') => Promise<void>;
  handleProcess: (event: ProcessEvent) => void; stopJob: (id: string) => Promise<void>;
}
const pendingEvents = new Map<string, ProcessEvent[]>();
export const useApp = create<State>((set,get) => ({
  workspace: null, recent: [], entries: [], expanded: [], docs: [], activePath: null, info: null, tools: [], jobs: [], activeJob: null, previewUrl: null, securityReport: null, scanningSecurity: false, debug: null, breakpoints: [],
  activity: 'explorer', sideTab: 'inspector', bottomTab: 'terminal', sidebarOpen: true, rightOpen: true, bottomOpen: true,
  sidebarWidth: 248, rightWidth: 330, bottomHeight: 228, palette: false, wizard: false, trustPrompt: false, notice: null,
  set: value => set(value), error: error => set({ notice: message(error) }),
  initialize: async () => { if (!bridge) return; try { const [recent, tools] = await Promise.all([bridge.recent(), bridge.detectTools()]); set({ recent, tools }); } catch (e) { get().error(e); } },
  loadWorkspace: async ws => { pendingEvents.clear(); set({ workspace: ws, docs: [], activePath: null, entries: [], expanded: [], info: null, jobs: [], activeJob: null, previewUrl: null, securityReport: null, scanningSecurity: false, debug: null, breakpoints: [], trustPrompt: !ws.trusted, activity: 'explorer', sidebarOpen: true });
    try { const [entries, info, recent] = await Promise.all([bridge!.list(), bridge!.projectInfo(), bridge!.recent()]); set({ entries, info, recent }); } catch(e) { get().error(e); }
  },
  selectWorkspace: async () => { if (get().docs.some(d=>d.content!==d.saved) && !window.confirm('Switch workspaces and discard unsaved changes?')) return; if (!bridge) { get().error('Opening local folders requires the RYVEN desktop app.'); return; } try { const ws = await bridge.selectWorkspace(); if (ws) await get().loadWorkspace(ws); } catch(e) { get().error(e); } },
  openRecent: async path => { if (get().docs.some(d=>d.content!==d.saved) && !window.confirm('Switch workspaces and discard unsaved changes?')) return; if (!bridge) return; try { await get().loadWorkspace(await bridge.openWorkspace(path)); } catch(e) { get().error(e); } },
  setTrust: async trusted => { if (!bridge) return; try { const workspace = await bridge.setTrust(trusted); set({ workspace, trustPrompt: false }); } catch(e) { get().error(e); } },
  refreshTree: async () => { if (!bridge || !get().workspace) return; try { set({ entries: await bridge.list() }); } catch(e) { get().error(e); } },
  toggleFolder: async path => { const { expanded } = get(); if (expanded.includes(path)) { set({ expanded: expanded.filter(x=>x!==path) }); return; } try { const children = await bridge!.list(path); const patch = (nodes: Entry[]): Entry[] => nodes.map(node => node.path === path ? { ...node, children } : node.children ? { ...node, children: patch(node.children) } : node); set({ entries: patch(get().entries), expanded: [...expanded, path] }); } catch(e) { get().error(e); } },
  openFile: async path => { const found = get().docs.find(doc => doc.path === path); if (found) { set({ activePath: path }); return; } try { const content = await bridge!.read(path); set({ docs: [...get().docs, { path, content, saved: content }], activePath: path }); } catch(e) { get().error(e); } },
  updateDoc: (path,content) => set({ docs: get().docs.map(doc=>doc.path === path ? { ...doc, content } : doc) }),
  saveDoc: async () => { const doc = get().docs.find(d=>d.path === get().activePath); if (!doc || doc.content === doc.saved) return; try { await bridge!.write(doc.path,doc.content); set({ docs: get().docs.map(d=>d.path === doc.path ? { ...d, saved: d.content } : d), notice: `Saved ${doc.path}` }); } catch(e) { get().error(e); } },
  closeDoc: path => { const doc = get().docs.find(d=>d.path===path); if (doc && doc.content !== doc.saved && !window.confirm(`Discard unsaved changes in ${path}?`)) return; const docs = get().docs.filter(d=>d.path !== path); set({ docs, activePath: get().activePath === path ? docs.at(-1)?.path || null : get().activePath }); },
  createEntry: async (path,kind) => { try { await bridge!.createEntry(path,kind); await get().refreshTree(); if (kind==='file') await get().openFile(path); } catch(e) { get().error(e); } },
  refreshInfo: async () => { if (!bridge || !get().workspace) return; try { set({ info: await bridge.projectInfo() }); } catch(e) { get().error(e); } },
  scanSecurity: async () => { if (!bridge) { get().error('Security scanning requires the desktop app.'); return; } set({ scanningSecurity: true, securityReport: null }); try { set({ securityReport: await bridge.scanSecurity() }); } catch(e) { get().error(e); } finally { set({ scanningSecurity: false }); } },
  startDebug: async () => { if (!bridge) { get().error('Node debugging requires the desktop app.'); return; } try { const active=get().activePath; const selected=active && /\.(?:js|mjs|cjs)$/.test(active) ? active : undefined; const session=await bridge.startDebug(selected); if (!get().debug || get().debug?.id!==session.id) set({debug:session}); set({activity:'run',sidebarOpen:true}); } catch(e) { get().error(e); } },
  debugAction: async action => { try { await bridge?.debugAction(action); } catch(e) { get().error(e); } },
  addBreakpoint: async (file,line,condition) => { try { const result=await bridge?.debugBreakpoint(file,line,condition); if(result) set({breakpoints:[...get().breakpoints,result]}); } catch(e) { get().error(e); } },
  removeBreakpoint: async id => { try { await bridge?.removeDebugBreakpoint(id); set({breakpoints:get().breakpoints.filter(b=>b.id!==id)}); } catch(e) { get().error(e); } },
  debugEvaluate: async expression => { if(!bridge)throw new Error('Desktop debugger required.'); return bridge.debugEvaluate(expression); },
  stopDebug: async () => { try { await bridge?.stopDebug(); } catch(e) { get().error(e); } },
  handleDebug: event => set({debug:event}),
  startTerminal: async () => { if (!bridge) { get().error('Terminal requires the RYVEN desktop app.'); return; } try { const job = await bridge.startTerminal(); set({ jobs: [...get().jobs,{ ...job, output: '', running: true, task: 'terminal' }], activeJob: job.id, bottomTab: 'terminal', bottomOpen: true }); pendingEvents.get(job.id)?.forEach(get().handleProcess); pendingEvents.delete(job.id); } catch(e) { get().error(e); } },
  runTask: async task => { if (!bridge) { get().error('Running projects requires the RYVEN desktop app.'); return; } try { const job = await bridge.runTask(task); set({ jobs: [...get().jobs,{ ...job, output: `$ ${job.command}\r\n\r\n`, running: true, task }], activeJob: job.id, bottomTab: task==='test' ? 'tests' : 'terminal', bottomOpen: true }); pendingEvents.get(job.id)?.forEach(get().handleProcess); pendingEvents.delete(job.id); } catch(e) { get().error(e); } },
  handleProcess: event => { if (!get().jobs.some(job=>job.id===event.id)) { const queue = pendingEvents.get(event.id) || []; if (queue.length < 100) queue.push(event); pendingEvents.set(event.id,queue); if (pendingEvents.size > 30) pendingEvents.delete(pendingEvents.keys().next().value!); return; } set(state => {
    const jobs = state.jobs.map(job => job.id !== event.id ? job : { ...job, output: (job.output + (event.data || '')).slice(-250000), running: event.kind === 'exit' ? false : job.running, exitCode: event.kind === 'exit' ? event.exitCode : job.exitCode });
    const job = jobs.find(j=>j.id===event.id);
    const url = event.data && job?.task === 'run' ? detectPreview(event.data) : null;
    return { jobs, previewUrl: event.kind === 'exit' && job?.task === 'run' && !jobs.some(j=>j.task==='run'&&j.running) ? null : url || state.previewUrl, sideTab: url ? 'preview' : state.sideTab };
  }); },
  stopJob: async id => { try { await bridge?.stopJob(id); } catch(e) { get().error(e); } }
}));
