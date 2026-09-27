import fs from 'node:fs/promises';
import { app, type BrowserWindow } from 'electron';

/** CI-only packaged-app smoke check: verifies renderer mounting and a real preload/SQLite IPC call.
 * Never enabled in normal builds unless the launching process explicitly sets RYVEN_SMOKE_TEST=1.
 */
export async function runSmoke(window: BrowserWindow): Promise<void> {
  if (process.env.RYVEN_SMOKE_TEST !== '1') return;
  const reportPath = process.env.RYVEN_SMOKE_REPORT;
  const write = async (payload: Record<string, unknown>) => {
    if (!reportPath) return;
    await fs.writeFile(reportPath, JSON.stringify(payload, null, 2) + '\n', { mode: 0o600 });
  };
  try {
    if (!app.isPackaged) throw new Error('Smoke test must run against a packaged executable.');
    const result = await window.webContents.executeJavaScript(`(async () => {
      await new Promise((resolve, reject) => {
        if (document.querySelector('.app-shell')) return resolve(true);
        const observer = new MutationObserver(() => {
          if (document.querySelector('.app-shell')) { observer.disconnect(); resolve(true); }
        });
        observer.observe(document.documentElement, {childList:true,subtree:true});
        setTimeout(() => { observer.disconnect(); reject(new Error('Renderer did not mount within 20 seconds.')); }, 20000);
      });
      if (typeof window.ryven?.recent !== 'function') throw new Error('Secure preload API unavailable.');
      const recent = await window.ryven.recent();
      if (!Array.isArray(recent)) throw new Error('SQLite recent-workspace IPC did not return an array.');
      return { mounted: true, preload: true, recentCount: recent.length, title: document.title };
    })()`);
    await write({ ok: true, platform: process.platform, ...result });
    console.log('RYVEN packaged smoke test passed:', JSON.stringify(result));
    app.exit(0);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    console.error('RYVEN packaged smoke test FAILED:', reason);
    try { await write({ ok: false, platform: process.platform, reason }); }
    catch (writeError) { console.error('Could not write smoke report:', writeError); }
    app.exit(1);
  }
}
