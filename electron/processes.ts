import { spawn, spawnSync, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import type { WebContents } from 'electron';
import type { Job, ProcessEvent, Tool } from '../shared/contracts';
import { WorkspaceService } from './workspace';

export class ProcessService {
  private jobs = new Map<string, ChildProcessWithoutNullStreams>();
  constructor(private workspace: WorkspaceService, private webContents: () => WebContents | undefined) {}
  private emit(event: ProcessEvent) { const web = this.webContents(); if (web && !web.isDestroyed()) web.send('process:event', event); }
  private spawnJob(label: string, executable: string, args: string[], terminal = false): Job {
    const cwd = this.workspace.requireWorkspace(true).path;
    const id = randomUUID();
    const windowsNpm = process.platform === 'win32' && executable === 'npm';
    const proc = spawn(windowsNpm ? 'npm.cmd' : executable, args, { cwd, stdio: 'pipe', shell: windowsNpm, detached: process.platform !== 'win32', windowsHide: true, env: { ...process.env, FORCE_COLOR: '1', TERM: 'xterm-256color' } });
    const job = { id, label, command: [executable, ...args].join(' ') };
    this.jobs.set(id, proc);
    proc.stdout.on('data', data => this.emit({ id, kind: 'data', data: String(data) }));
    proc.stderr.on('data', data => this.emit({ id, kind: 'data', data: String(data) }));
    proc.on('error', err => this.emit({ id, kind: 'data', data: `\r\nProcess error: ${err.message}\r\n` }));
    proc.on('close', exitCode => { this.jobs.delete(id); this.emit({ id, kind: 'exit', exitCode, data: terminal ? '' : `\r\nProcess exited with code ${exitCode ?? 'unknown'}.\r\n` }); });
    return job;
  }
  terminal(): Job {
    if (process.platform === 'win32') return this.spawnJob('Terminal', 'powershell.exe', ['-NoLogo'], true);
    // util-linux script allocates a real PTY for interactive tools without a native Node addon.
    const shell = process.env.SHELL || '/bin/bash';
    return process.platform === 'darwin' ? this.spawnJob('Terminal', 'script', ['-q', '/dev/null', shell, '-i'], true) : this.spawnJob('Terminal', 'script', ['-qefc', `${shell} -i`, '/dev/null'], true);
  }
  async task(task: 'run' | 'test' | 'build' | 'git-status'): Promise<Job> {
    const info = await this.workspace.info();
    if (task === 'git-status') {
      if (!info.git) throw new Error('This workspace is not a Git repository.');
      return this.spawnJob('Git status', 'git', ['status', '--short', '--branch']);
    }
    const script = info[task];
    if (!script) throw new Error(`No ${task} configuration detected. Add a package.json script or supported project manifest.`);
    if (info.kind === 'Node.js') return this.spawnJob(`${task}: ${script}`, 'npm', ['run', script]);
    if (info.kind === 'Python') return task === 'run' ? this.spawnJob('Run Python', process.platform === 'win32' ? 'python' : 'python3', ['main.py']) : this.spawnJob('pytest', process.platform === 'win32' ? 'python' : 'python3', ['-m', 'pytest']);
    if (info.kind === 'Rust') return this.spawnJob(script, 'cargo', [task]);
    if (info.kind === 'Go') return this.spawnJob(script, 'go', task === 'run' ? ['run', '.'] : task === 'test' ? ['test', './...'] : ['build', './...']);
    throw new Error('No supported task adapter was found.');
  }
  input(id: string, data: string) { const job = this.jobs.get(id); if (!job) throw new Error('Process no longer running.'); if (typeof data !== 'string' || data.length > 16384) throw new Error('Invalid terminal input.'); job.stdin.write(data); }
  stop(id: string) { const job = this.jobs.get(id); if (!job) return; const terminate = (signal: NodeJS.Signals) => { try { if (process.platform === 'win32') { if (job.pid) spawnSync('taskkill', ['/PID', String(job.pid), '/T', '/F'], { timeout: 3000 }); } else if (job.pid) process.kill(-job.pid, signal); else job.kill(signal); } catch { job.kill(signal); } }; terminate('SIGTERM'); setTimeout(() => { if (this.jobs.has(id)) terminate('SIGKILL'); }, 3000).unref(); }
  stopAll() { for (const id of this.jobs.keys()) this.stop(id); }
  static detectTools(): Tool[] {
    const binaries: [string,string][] = [['Node.js','node'],['npm','npm'],['pnpm','pnpm'],['yarn','yarn'],['Python','python3'],['Java','java'],['Maven','mvn'],['Gradle','gradle'],['GCC','gcc'],['Clang','clang'],['CMake','cmake'],['.NET','dotnet'],['Go','go'],['Rust','rustc'],['Cargo','cargo'],['PHP','php'],['Git','git'],['Docker','docker']];
    return binaries.map(([name, bin]) => {
      const windowsNpm = process.platform === 'win32' && ['npm','pnpm','yarn'].includes(bin);
      const result = spawnSync(windowsNpm ? `${bin}.cmd` : bin, [bin === 'java' ? '-version' : '--version'], { encoding: 'utf8', timeout: 1800, windowsHide: true, shell: windowsNpm });
      return { name, available: !result.error && result.status === 0, version: (!result.error && result.status === 0) ? (result.stdout || result.stderr).split('\n')[0].slice(0, 100) : undefined };
    });
  }
}
