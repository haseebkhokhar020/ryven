import fs from 'node:fs/promises';
import path from 'node:path';
import type { Entry, Workspace, ProjectInfo } from '../shared/contracts';

export class WorkspaceService {
  current: Workspace | null = null;
  async open(folder: string, trusted: boolean): Promise<Workspace> {
    const real = await fs.realpath(folder);
    if (!(await fs.stat(real)).isDirectory()) throw new Error('Workspace path must be a directory.');
    this.current = { path: real, name: path.basename(real), trusted };
    return this.current;
  }
  requireWorkspace(write = false): Workspace {
    if (!this.current) throw new Error('Open a workspace first.');
    if (write && !this.current.trusted) throw new Error('Restricted workspace: trust this folder before writing or running commands.');
    return this.current;
  }
  // Filesystem boundaries are checked against real paths; symlinks outside the root are not followed.
  async resolve(relative: string, forCreation = false): Promise<string> {
    const root = this.requireWorkspace().path;
    if (typeof relative !== 'string' || relative.includes('\0') || path.isAbsolute(relative)) throw new Error('Invalid workspace path.');
    const candidate = path.resolve(root, relative);
    const within = (target: string) => target === root || (!path.relative(root, target).startsWith('..') && !path.isAbsolute(path.relative(root, target)));
    if (!within(candidate)) throw new Error('Path escapes the workspace.');
    const actual = await fs.realpath(forCreation ? path.dirname(candidate) : candidate);
    if (!within(actual)) throw new Error('Symlink escapes the workspace.');
    return candidate;
  }
  async list(relative = ''): Promise<Entry[]> {
    const target = await this.resolve(relative);
    const dir = await fs.readdir(target, { withFileTypes: true });
    return dir.filter(d => !d.isSymbolicLink() && d.name !== 'node_modules' && d.name !== '.git' && d.name !== 'dist' && d.name !== 'dist-electron')
      .slice(0, 500).map(d => ({ name: d.name, path: path.posix.join(relative.replaceAll('\\', '/'), d.name), kind: d.isDirectory() ? 'folder' as const : 'file' as const }))
      .sort((a,b) => Number(b.kind === 'folder') - Number(a.kind === 'folder') || a.name.localeCompare(b.name));
  }
  async read(relative: string): Promise<string> {
    const file = await this.resolve(relative);
    const stat = await fs.stat(file);
    if (!stat.isFile() || stat.size > 2 * 1024 * 1024) throw new Error('Only text files under 2 MB can be opened.');
    const content = await fs.readFile(file);
    if (content.includes(0)) throw new Error('Binary files cannot be opened in the text editor.');
    return content.toString('utf8');
  }
  async write(relative: string, content: string) {
    this.requireWorkspace(true);
    if (typeof content !== 'string' || Buffer.byteLength(content) > 2 * 1024 * 1024) throw new Error('File exceeds the 2 MB text editor limit.');
    const file = await this.resolve(relative, true);
    // Existing symlinks must also be checked.
    try { await this.resolve(relative); } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
    await fs.writeFile(file, content, 'utf8');
  }
  async create(relative: string, kind: 'file' | 'folder') {
    this.requireWorkspace(true);
    if (kind !== 'file' && kind !== 'folder') throw new Error('Unknown entry type.');
    const target = await this.resolve(relative, true);
    if (kind === 'folder') await fs.mkdir(target);
    else await fs.writeFile(target, '', { flag: 'wx' });
  }
  async info(): Promise<ProjectInfo> {
    const root = this.requireWorkspace().path;
    const exists = async (name: string) => !!(await fs.stat(path.join(root, name)).catch(() => false));
    const git = await exists('.git');
    if (await exists('package.json')) {
      try {
        const pkg = JSON.parse(await this.read('package.json')) as { scripts?: Record<string,string> };
        const scripts = pkg.scripts || {};
        return { kind: 'Node.js', scripts, git, run: scripts.dev ? 'dev' : scripts.start ? 'start' : undefined, test: scripts.test ? 'test' : undefined, build: scripts.build ? 'build' : undefined };
      } catch { return { kind: 'Node.js (invalid package.json)', scripts: {}, git }; }
    }
    if (await exists('main.py')) return { kind: 'Python', scripts: {}, git, run: 'main.py', test: await exists('tests') ? 'pytest' : undefined };
    if (await exists('Cargo.toml')) return { kind: 'Rust', scripts: {}, git, run: 'cargo run', test: 'cargo test', build: 'cargo build' };
    if (await exists('go.mod')) return { kind: 'Go', scripts: {}, git, run: 'go run .', test: 'go test ./...', build: 'go build ./...' };
    return { kind: 'Workspace', scripts: {}, git };
  }
}
