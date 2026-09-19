// Local-only React DOM acceptance. No Next server, environment files, or services.
// Local-only React DOM acceptance. No Next server, environment files, or services.
import { readFileSync, existsSync, statSync, mkdtempSync, rmSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { createRequire } from 'node:module';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { freemem } from 'node:os';
import ts from 'typescript';
import { Script } from 'node:vm';
const cwd = process.cwd();
const req = createRequire(import.meta.url);
const modules = [], ids = new Map();
function bundle(file) {
  file = resolve(file);
  if (ids.has(file)) return ids.get(file);
  const id = modules.length; ids.set(file, id); modules.push('');
  let source = readFileSync(file, 'utf8');
  if (file === resolve('app/lib/supabase.ts')) {
    source = 'export const getBrowserSupabase = () => window.fixture.db; const friendlyDatabaseError = (e) => Error(e.message);\n' + source.slice(source.indexOf('export async function loadDogProfileWithMemoriesForUser('), source.indexOf('export async function deleteDogProfileForUser('));
  }
  if (/\.(?:[mt]sx?|mjs)$/.test(file) || ['tests/fixtures/ask-memory-browser.js', 'tests/fixtures/ask-conversation-browser.js', 'tests/fixtures/ask-presentation-browser.js', 'tests/fixtures/ask-presentation-snapshots.js'].some(f => file === resolve(f))) source = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  source = source.replace(/require\(["']([^"']+)["']\)/g, (_, name) => {
    const mock = name === 'next/link' ? 'link' : name === 'next/navigation' ? 'navigation' : /\/auth-session$/.test(name) ? 'auth' : /\/app-data-freshness$/.test(name) ? 'freshness' : /\/components\/(app-page|product-primitives)$/.test(name) ? 'ui' : /\/lib\/petwise$/.test(name) ? 'petwise' : null;
    if (mock) return `window.fixture.mocks[${JSON.stringify(mock)}]`;
    let next;
    if (name.startsWith('.')) {
      const base = resolve(dirname(file), name);
      next = [base, base + '.ts', base + '.tsx', base + '.js', join(base, 'index.ts'), join(base, 'index.js')].find(p => existsSync(p) && statSync(p).isFile());
      if (!next) throw Error(`Cannot resolve ${name} from ${file}`);
    } else next = req.resolve(name);
    return `require(${bundle(next)})`;
  });
  modules[id] = `function(module,exports,require){${source}\n}`;
  return id;
}
const entry = bundle(process.argv.includes('--ask-presentation') ? 'tests/fixtures/ask-presentation-browser.js' : process.argv.includes('--ask-conversation') ? 'tests/fixtures/ask-conversation-browser.js' : 'tests/fixtures/ask-memory-browser.js');
const script = `const process={env:{NODE_ENV:'development'}};const M=[${modules.join(',')}],C={};function require(i){if(C[i])return C[i].exports;const m=C[i]={exports:{}};M[i](m,m.exports,require);return m.exports;}require(${entry});`;
new Script(script); // Parse without executing browser code or substituting a hook harness.
if (process.argv.includes('--check-bundle')) {
  console.log(`Parsed ${ids.size} bundled modules; browser behavior remains unvalidated.`);
  process.exit(0);
}
let minimum = freemem(), browser, socket, timer, diagnostics = '';
const profile = mkdtempSync(join(cwd, 'tests', '.memory-browser-'));
const server = createServer((request, response) => {
  if (request.url === '/fixture.js') { response.setHeader('Content-Type', 'text/javascript'); response.end(script); }
  else { response.setHeader('Content-Security-Policy', "default-src 'none'; script-src 'self'; connect-src 'self'; style-src 'unsafe-inline'"); response.end('<!doctype html><title>Local memory acceptance</title><div id="root"></div><script src="/fixture.js"></script>'); }
});
const pending = new Map(); let serial = 0;
function command(method, params = {}) {
  return new Promise((resolve, reject) => { const id = ++serial; const deadline = setTimeout(() => { pending.delete(id); reject(Error('CDP timeout: ' + method)); }, 5000); pending.set(id, { resolve: v => { clearTimeout(deadline); resolve(v); }, reject: e => { clearTimeout(deadline); reject(e); } }); socket.send(JSON.stringify({ id, method, params })); });
}
const pause = ms => new Promise(r => setTimeout(r, ms));
try {
  if (minimum < 2 * 1024 ** 3) throw Error('Free RAM below 2 GB before startup');
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const port = server.address().port;
  const chrome = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
  browser = spawn(chrome, ['--headless=new', '--disable-gpu', '--in-process-gpu', '--no-first-run', '--no-default-browser-check', '--disable-background-networking', '--disable-component-update', '--disable-sync', '--disable-default-apps', '--disable-extensions', '--metrics-recording-only', '--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1', '--remote-debugging-address=127.0.0.1', '--remote-debugging-port=0', `--user-data-dir=${profile}`, 'about:blank'], { cwd, windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] });
  browser.stderr.on('data', chunk => { diagnostics = (diagnostics + chunk).slice(-4000); });
  let launchError; browser.on('error', e => { launchError = e; });
  timer = setInterval(() => { minimum = Math.min(minimum, freemem()); if (minimum < 2 * 1024 ** 3) { browser.kill(); server.close(); } }, 500);
  const active = join(profile, 'DevToolsActivePort');
  for (let i = 0; i < 100 && !existsSync(active); i++) { if (launchError) throw launchError; await pause(100); }
  if (!existsSync(active)) throw Error(`Chrome did not expose CDP within 10 seconds (exit ${browser.exitCode})`);
  const debugPort = readFileSync(active, 'utf8').split('\n')[0];
  const targets = await (await fetch(`http://127.0.0.1:${debugPort}/json/list`, { signal: AbortSignal.timeout(5000) })).json();
  socket = new WebSocket(targets.find(t => t.type === 'page').webSocketDebuggerUrl);
  await new Promise((r, j) => { const deadline = setTimeout(() => j(Error('CDP WebSocket startup timeout')), 5000); socket.onopen = () => { clearTimeout(deadline); r(); }; socket.onerror = e => { clearTimeout(deadline); j(e); }; });
  socket.onmessage = event => { const data = JSON.parse(event.data); if (pending.has(data.id)) { const p = pending.get(data.id); pending.delete(data.id); if (data.error) p.reject(Error(JSON.stringify(data.error))); else p.resolve(data.result); } };
  await command('Runtime.evaluate', { expression: '1 + 1', returnByValue: true });
  console.log('Chrome JavaScript startup probe passed');
  await command('Page.navigate', { url: `http://127.0.0.1:${port}/pets/11111111-1111-4111-8111-111111111111/memories` });
  let result;
  for (let i = 0; i < 300; i++) {
    const evaluation = await command('Runtime.evaluate', { expression: 'window.acceptanceResult', returnByValue: true });
    result = evaluation.result?.value;
    if (result) break;
    await pause(100);
  }
  if (!result) { const state = await command('Runtime.evaluate', { expression: 'document.body.innerText', returnByValue: true }); throw Error(`Browser fixture timed out: ${state.result?.value}`); }
  console.log(JSON.stringify({ ...result, minimumFreeGB: minimum / 1024 ** 3, modules: ids.size }, null, 2));
  if (result.status !== 'passed') process.exitCode = 1;
} catch (error) { console.error('BLOCKED/FAILED:', error.message, '\nChrome exit:', browser?.exitCode, '\n', diagnostics, '\nMinimum free GB:', minimum / 1024 ** 3); process.exitCode = 1; }
finally {
  clearInterval(timer);
  if (socket?.readyState === WebSocket.OPEN) { await Promise.race([command('Browser.close').catch(() => {}), pause(1000)]); socket.close(); }
  if (browser && browser.exitCode === null) { browser.kill(); await pause(500); }
  await new Promise(r => server.close(r));
  // Only this run's generated profile under the assigned worktree is removed.
  if (resolve(profile).startsWith(resolve(cwd, 'tests') + '\\')) {
    try { rmSync(profile, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 }); } catch { console.error('Owned profile cleanup incomplete:', profile); process.exitCode = 1; }
  }
}
