import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import type { SecurityFinding, SecurityReport } from '../shared/contracts';
import { WorkspaceService } from './workspace';

const ignored = new Set(['.git', 'node_modules', 'dist', 'dist-electron', 'build', 'coverage', '.venv', 'vendor', 'release']);
const extensions = new Set(['.ts','.tsx','.js','.jsx','.json','.py','.go','.rs','.java','.cs','.cpp','.c','.h','.php','.sh','.ps1','.yaml','.yml','.env','.txt','.md','.toml','.ini','.properties']);
const rules = [
  { id: 'private-key', label: 'Private key material', severity: 'high' as const, pattern: /-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/ },
  { id: 'aws-access-key', label: 'Potential AWS access key ID', severity: 'high' as const, pattern: /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/ },
  { id: 'github-token', label: 'Potential GitHub token', severity: 'high' as const, pattern: /\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{30,}\b/ },
  { id: 'generic-secret', label: 'Potential hard-coded secret', severity: 'medium' as const, pattern: /\b(?:api[_-]?key|secret|password|token)\s*[:=]\s*['"][^'"\s]{16,}['"]/i }
];
const redact = (value: string) => value.length < 8 ? '[redacted]' : `${value.slice(0, 4)}…${value.slice(-4)}`;
export async function scanSourceSecrets(root: string): Promise<{ findings: SecurityFinding[]; errors: string[]; checked: number }> {
  const findings: SecurityFinding[] = []; const errors: string[] = [];
  let checked = 0, skippedLarge = 0, skippedLimit = 0;
  async function walk(folder: string, depth: number): Promise<void> {
    if (depth > 16) { errors.push('Directory depth limit reached; source scan incomplete.'); return; }
    for (const entry of await fs.readdir(folder, { withFileTypes: true })) {
      if (ignored.has(entry.name) || entry.isSymbolicLink()) continue;
      const full = path.join(folder, entry.name);
      if (entry.isDirectory()) { await walk(full, depth + 1); continue; }
      if (!entry.isFile() || !(extensions.has(path.extname(entry.name).toLowerCase()) || entry.name.startsWith('.env'))) continue;
      if (checked >= 1500) { skippedLimit++; continue; }
      const stat = await fs.stat(full);
      if (stat.size > 1024 * 1024) { skippedLarge++; continue; }
      checked++;
      const content = await fs.readFile(full, 'utf8');
      if (content.includes('\0')) continue;
      const relative = path.relative(root, full).split(path.sep).join('/');
      content.split(/\r?\n/).forEach((line, i) => {
        for (const rule of rules) {
          const match = line.match(rule.pattern);
          if (match) findings.push({ id: `${relative}:${i + 1}:${rule.id}`, source: 'Local source heuristic', category: 'secret', severity: rule.severity, title: rule.label, location: `${relative}:${i + 1}`, evidence: redact(match[0]) });
        }
      });
    }
  }
  await walk(root, 0);
  if (skippedLimit) errors.push(`Skipped ${skippedLimit} files after the 1,500-file safety limit; scan incomplete.`);
  if (skippedLarge) errors.push(`Skipped ${skippedLarge} files above 1 MB; scan incomplete.`);
  return { findings, errors, checked };
}
async function npmAudit(root: string): Promise<{ findings: SecurityFinding[]; error?: string }> {
  return new Promise(resolve => {
    const child = spawn(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['audit', '--omit=dev', '--json'], { cwd: root, stdio: ['ignore','pipe','pipe'], windowsHide: true, shell: process.platform === 'win32' });
    let stdout = '', stderr = '', done = false;
    const finish = (result: { findings: SecurityFinding[]; error?: string }) => { if (done) return; done = true; clearTimeout(timer); resolve(result); };
    const timer = setTimeout(() => { child.kill('SIGKILL'); finish({ findings: [], error: 'npm audit timed out after 90 seconds.' }); }, 90000);
    child.stdout.on('data', chunk => { stdout += String(chunk); if (stdout.length > 8_000_000) { child.kill('SIGKILL'); finish({ findings: [], error: 'npm audit output exceeded 8 MB.' }); } });
    child.stderr.on('data', chunk => { stderr += String(chunk).slice(0, 2000); });
    child.on('error', err => finish({ findings: [], error: `npm audit unavailable: ${err.message}` }));
    child.on('close', () => {
      if (done) return;
      try {
        const data = JSON.parse(stdout) as { error?: { summary?: string; detail?: string }; vulnerabilities?: Record<string,{ severity?: string; range?: string; via?: (string|{title?:string})[] }> };
        if (data.error) return finish({ findings: [], error: `npm audit: ${data.error.summary || data.error.detail || 'scanner error'}` });
        if (!data.vulnerabilities) return finish({ findings: [], error: `npm audit returned no vulnerability report. ${stderr.slice(0, 200)}` });
        const findings: SecurityFinding[] = Object.entries(data.vulnerabilities).map(([name, vulnerability]) => ({
          id: `npm:${name}`, source: 'npm audit (production dependencies)', category: 'dependency',
          severity: ['critical','high','moderate','low'].includes(vulnerability.severity || '') ? vulnerability.severity as SecurityFinding['severity'] : 'unknown',
          title: `${name}: ${vulnerability.via?.flatMap(v => typeof v === 'object' && v.title ? [v.title] : [])[0] || 'vulnerability reported'}`,
          location: name, evidence: `Affected range: ${vulnerability.range || 'not specified'}`
        }));
        finish({ findings });
      } catch { finish({ findings: [], error: `Could not parse npm audit results. ${stderr.slice(0, 200)}` }); }
    });
  });
}
export async function scanWorkspaceSecurity(workspace: WorkspaceService): Promise<SecurityReport> {
  const root = workspace.requireWorkspace(true).path;
  const report: SecurityReport = { scannedAt: Date.now(), scanners: [], findings: [], errors: [], scope: 'Local source heuristics and npm production dependencies' };
  try { const source = await scanSourceSecrets(root); report.scanners.push(`Local secret heuristics (${source.checked} files)`); report.findings.push(...source.findings); report.errors.push(...source.errors); }
  catch (error) { report.errors.push(`Source scan failed: ${(error as Error).message}`); }
  try {
    await fs.access(path.join(root,'package-lock.json'));
    const result = await npmAudit(root);
    if (result.error) report.errors.push(result.error);
    else { report.scanners.push('npm audit --omit=dev'); report.findings.push(...result.findings); }
  } catch { report.errors.push('npm audit not run: no package-lock.json. Dependency safety not assessed.'); }
  return report;
}
