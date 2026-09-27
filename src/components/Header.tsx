import { Play, FlaskConical, Hammer, Search, ChevronDown, PanelRightClose, PanelBottomClose, PanelBottomOpen, Command, FolderOpen, LockKeyhole } from './Icons';
import { useApp } from '../lib/store';
export default function Header() {
  const s = useApp(); const disabled = !s.workspace?.trusted;
  return <header className="header">
    <div className="brand" onClick={()=>s.set({ activePath: null })} title="RYVEN / The Development Engine"><span className="brand-mark">R<span>.</span></span><div className="brand-name">RYVEN<span className="brand-sub">THE DEVELOPMENT ENGINE</span></div></div>
    <div className="header-divider"/>
    <button className="workspace-picker" onClick={s.selectWorkspace} title="Open a workspace"><FolderOpen size={15}/><span>{s.workspace?.name || 'Open workspace'}</span><ChevronDown size={12}/></button>
    {!s.workspace?.trusted && s.workspace && <span className="untrusted-label"><LockKeyhole size={12}/> RESTRICTED</span>}
    <button className="command-search" onClick={()=>s.set({ palette: true })}><Search size={15}/><span>Search files, commands & actions</span><kbd>Ctrl Shift P</kbd></button>
    <div className="header-actions">
      <button className="header-action primary-action" disabled={disabled || !s.info?.run} onClick={()=>s.runTask('run')} title="Run project"><Play size={14} fill="currentColor"/><span>Run</span></button>
      <button className="header-action" disabled={disabled || !s.info?.test} onClick={()=>s.runTask('test')} title="Run configured tests"><FlaskConical size={15}/><span>Test</span></button>
      <button className="header-action" disabled={disabled || !s.info?.build} onClick={()=>s.runTask('build')} title="Build project"><Hammer size={15}/><span>Build</span></button>
      <div className="header-divider small"/>
      <button className="icon-btn" onClick={()=>s.set({ rightOpen: !s.rightOpen })} title="Toggle right panel"><PanelRightClose size={17}/></button>
      <button className="icon-btn" onClick={()=>s.set({ bottomOpen: !s.bottomOpen })} title="Toggle bottom panel">{s.bottomOpen ? <PanelBottomClose size={17}/> : <PanelBottomOpen size={17}/>}</button>
      <button className="avatar-btn" title="Command Center" onClick={()=>s.set({ palette: true })}><Command size={15}/></button>
    </div>
  </header>;
}
