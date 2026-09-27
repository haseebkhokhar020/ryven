import fs from 'node:fs/promises';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import type { CreateOptions, CreateResult } from '../shared/contracts';
import { WorkspaceService } from './workspace';

function filesFor(name: string, template: CreateOptions['template']): Record<string,string> {
  const baseReadme = `# ${name}\n\nCreated with RYVEN. Review the generated files before installing dependencies or running commands.\n`;
  const gitignore = 'node_modules/\ndist/\n.env\n*.log\n';
  if (template === 'web-react') return {
    'package.json': JSON.stringify({ name, version: '0.1.0', private: true, type: 'module', scripts: { dev: 'vite --host 127.0.0.1', build: 'tsc --noEmit && vite build', preview: 'vite preview --host 127.0.0.1' }, dependencies: { react: '^19.0.0', 'react-dom': '^19.0.0' }, devDependencies: { '@types/react': '^19.0.0', '@types/react-dom': '^19.0.0', typescript: '^5.7.3', vite: '^6.0.5' } }, null, 2) + '\n',
    'index.html': `<!doctype html><html lang="en"><head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>${name}</title></head><body><div id="root"></div><script type="module" src="/src/main.tsx"></script></body></html>\n`,
    'tsconfig.json': JSON.stringify({ compilerOptions: { target: 'ES2022', lib: ['ES2022','DOM'], module: 'ESNext', moduleResolution: 'Bundler', jsx: 'react-jsx', strict: true, noEmit: true, skipLibCheck: true }, include: ['src'] }, null, 2) + '\n',
    'src/main.tsx': `import React from 'react';\nimport { createRoot } from 'react-dom/client';\nimport './style.css';\n\nfunction App() {\n  return <main><span className="eyebrow">BUILT WITH RYVEN</span><h1>${name}</h1><p>Your application starts here.</p></main>;\n}\n\ncreateRoot(document.getElementById('root')!).render(<App />);\n`,
    'src/style.css': 'body{margin:0;background:#141719;color:#eee;font:16px system-ui}main{max-width:720px;margin:20vh auto;padding:32px}.eyebrow{letter-spacing:.18em;color:#a9ca80;font-size:12px}h1{font-size:48px;margin:16px 0}p{color:#9ba5a3}\n', '.gitignore': gitignore, 'README.md': baseReadme + '\nRun `npm install`, then `npm run dev`.\n'
  };
  if (template === 'web-vanilla') return {
    'package.json': JSON.stringify({ name, version: '0.1.0', private: true, type: 'module', scripts: { dev: 'vite --host 127.0.0.1', build: 'tsc --noEmit && vite build' }, devDependencies: { typescript: '^5.7.3', vite: '^6.0.5' } }, null, 2) + '\n',
    'index.html': `<!doctype html><html lang="en"><head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>${name}</title></head><body><div id="app"></div><script type="module" src="/src/main.ts"></script></body></html>\n`,
    'tsconfig.json': JSON.stringify({ compilerOptions: { target: 'ES2022', lib: ['ES2022','DOM'], module: 'ESNext', moduleResolution: 'Bundler', strict: true, noEmit: true, skipLibCheck: true }, include: ['src'] }, null, 2) + '\n',
    'src/main.ts': `import './style.css';\nconst app = document.querySelector<HTMLDivElement>('#app');\nif (app) app.innerHTML = '<main><h1>${name}</h1><p>Your application starts here.</p></main>';\n`,
    'src/style.css': 'body{background:#141719;color:#eee;font:16px system-ui}main{max-width:720px;margin:20vh auto}\n', '.gitignore': gitignore, 'README.md': baseReadme + '\nRun `npm install`, then `npm run dev`.\n'
  };
  if (template === 'node-api') return {
    'package.json': JSON.stringify({ name, version: '0.1.0', private: true, type: 'module', scripts: { start: 'node src/server.js', dev: 'node --watch src/server.js', test: 'node --test' }, engines: { node: '>=20' } }, null, 2) + '\n',
    'src/app.js': "export function handler(req, res) {\n  res.setHeader('Content-Type', 'application/json');\n  if (req.url === '/health') { res.end(JSON.stringify({ status: 'ok' })); return; }\n  res.statusCode = 404; res.end(JSON.stringify({ error: 'Not found' }));\n}\n",
    'src/server.js': "import { createServer } from 'node:http';\nimport { handler } from './app.js';\n\nconst port = Number(process.env.PORT || 3000);\ncreateServer(handler).listen(port, '127.0.0.1', () => console.log(`Listening on http://localhost:${port}`));\n",
    'test/server.test.js': "import test from 'node:test';\nimport assert from 'node:assert/strict';\nimport { createServer } from 'node:http';\nimport { handler } from '../src/app.js';\n\ntest('health endpoint returns success; unknown path returns 404', async () => {\n  const server = createServer(handler).listen(0, '127.0.0.1');\n  await new Promise(resolve => server.once('listening', resolve));\n  try {\n    const { port } = server.address();\n    const health = await fetch(`http://127.0.0.1:${port}/health`);\n    assert.equal(health.status, 200);\n    assert.deepEqual(await health.json(), { status: 'ok' });\n    const missing = await fetch(`http://127.0.0.1:${port}/missing`);\n    assert.equal(missing.status, 404);\n    assert.deepEqual(await missing.json(), { error: 'Not found' });\n  } finally { server.close(); }\n});\n",
    '.gitignore': gitignore, 'README.md': baseReadme + '\nRun `npm run dev` and visit `/health`.\n'
  };
  if (template === 'python-cli') return { 'main.py': 'def main() -> None:\n    print("Hello from RYVEN")\n\n\nif __name__ == "__main__":\n    main()\n', '.gitignore': '__pycache__/\n.venv/\n.env\n', 'README.md': baseReadme + '\nRun `python3 main.py`.\n' };
  return { 'README.md': baseReadme, '.gitignore': gitignore };
}
export async function createProject(options: CreateOptions, workspace: WorkspaceService, report?: (step: string) => void): Promise<CreateResult> {
  if (!options || typeof options.initializeGit !== 'boolean' || typeof options.name !== 'string' || !/^[a-z][a-z0-9-]{1,39}$/.test(options.name)) throw new Error('Use a lowercase project name (2–40 characters, letters, numbers and hyphens).');
  if (!['web-react','web-vanilla','node-api','python-cli','blank'].includes(options.template)) throw new Error('Unsupported project template.');
  if (typeof options.parent !== 'string' || !path.isAbsolute(options.parent)) throw new Error('Choose a valid parent folder.');
  const parent = await fs.realpath(options.parent);
  const folder = path.join(parent, options.name);
  await fs.mkdir(folder); // exclusive: never overwrite an existing project
  const files = filesFor(options.name, options.template);
  const steps: string[] = [];
  const record = (step: string) => { steps.push(step); report?.(step); };
  try {
    for (const [relative, content] of Object.entries(files)) {
      const dest = path.join(folder, relative);
      await fs.mkdir(path.dirname(dest), { recursive: true });
      await fs.writeFile(dest, content, { flag: 'wx' });
      record(`Created ${relative}`);
    }
    if (options.initializeGit) {
      const result = spawnSync('git', ['init', '-q', folder], { encoding: 'utf8', timeout: 10000 });
      if (result.error || result.status !== 0) record(`Git init failed: ${result.error?.message || result.stderr}`);
      else record('Initialized Git repository');
    }
    record('Dependencies not installed. Run npm install explicitly if needed.');
    return { workspace: await workspace.open(folder, true), files: Object.keys(files), steps };
  } catch (error) {
    record(`Generation stopped: ${(error as Error).message}. Partial files remain in ${folder}.`);
    throw new Error(steps.join('\n'));
  }
}
