import fs from 'node:fs';
import path from 'node:path';
import initSqlJs, { Database } from 'sql.js';
import type { Recent } from '../shared/contracts';

export class LocalStore {
  private db!: Database;
  private filename: string;
  constructor(userData: string) { this.filename = path.join(userData, 'ryven.sqlite'); }
  async initialize() {
    const SQL = await initSqlJs({ locateFile: () => require.resolve('sql.js/dist/sql-wasm.wasm') });
    this.db = fs.existsSync(this.filename) ? new SQL.Database(fs.readFileSync(this.filename)) : new SQL.Database();
    this.db.run('CREATE TABLE IF NOT EXISTS workspaces (path TEXT PRIMARY KEY, name TEXT NOT NULL, trusted INTEGER NOT NULL DEFAULT 0, opened INTEGER NOT NULL)');
    this.persist();
  }
  private persist() {
    fs.mkdirSync(path.dirname(this.filename), { recursive: true });
    const temp = `${this.filename}.tmp`;
    fs.writeFileSync(temp, Buffer.from(this.db.export()), { mode: 0o600 });
    fs.renameSync(temp, this.filename);
  }
  recent(): Recent[] {
    const stmt = this.db.prepare('SELECT path, name, trusted, opened FROM workspaces ORDER BY opened DESC LIMIT 12');
    const result: Recent[] = [];
    while (stmt.step()) { const row = stmt.getAsObject(); result.push({ path: String(row.path), name: String(row.name), trusted: Boolean(row.trusted), opened: Number(row.opened) }); }
    stmt.free(); return result;
  }
  isTrusted(folder: string): boolean {
    const stmt = this.db.prepare('SELECT trusted FROM workspaces WHERE path = ?');
    stmt.bind([folder]); const found = stmt.step(); const trusted = found && Boolean(stmt.get()[0]); stmt.free(); return trusted;
  }
  remember(folder: string, trusted: boolean) {
    this.db.run('INSERT INTO workspaces(path,name,trusted,opened) VALUES(?,?,?,?) ON CONFLICT(path) DO UPDATE SET name=excluded.name, trusted=excluded.trusted, opened=excluded.opened', [folder, path.basename(folder), Number(trusted), Date.now()]);
    this.persist();
  }
}
