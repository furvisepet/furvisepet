// Opt-in local SQL transport for environments without a Docker daemon.
// PGlite runs PostgreSQL/WASM, not mocked SQL. It has a single connection;
// this transport cannot validate native server concurrency or PostgREST.
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import { pathToFileURL } from 'node:url';

if (!isMainThread) {
  const base = pathToFileURL(`${workerData.packageDir}/dist/`);
  const { PGlite } = await import(new URL('index.js', base));
  const extensions = {};
  for (const name of ['pgcrypto','pg_trgm','uuid_ossp']) extensions[name] = (await import(new URL(`contrib/${name}.js`,base)))[name];
  const db = new PGlite(workerData.dataDir, {extensions});
  parentPort.on('message', async ({ statement, shared }) => {
    const control = new Int32Array(shared, 0, 2);
    let result;
    try {
      const results = statement === null ? (await db.close(), []) : await db.exec(statement);
      result = { value: results.flatMap(r => r.rows || []).map(row => Object.values(row).map(v => v === null ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v)).join('|')).join('\n') };
    } catch (e) { result = { error: `${e.code}: ${e.message} ${e.where || ''}` }; }
    const bytes = new TextEncoder().encode(JSON.stringify(result));
    if (bytes.length > shared.byteLength - 8) throw new Error('Embedded SQL output exceeds bounded buffer');
    new Uint8Array(shared,8,bytes.length).set(bytes);
    Atomics.store(control,1,bytes.length); Atomics.store(control,0,1); Atomics.notify(control,0);
  });
}

export function embeddedPostgres({packageDir, dataDir}) {
  const worker = new Worker(new URL(import.meta.url), {workerData:{packageDir,dataDir}});
  const shared = new SharedArrayBuffer(4_000_008);
  const control = new Int32Array(shared,0,2);
  const sql = (statement) => {
      Atomics.store(control,0,0);
      worker.postMessage({statement,shared});
      if (Atomics.wait(control,0,0,60_000) === 'timed-out') throw new Error('Embedded SQL transport timed out');
      const result = JSON.parse(new TextDecoder().decode(new Uint8Array(shared,8,Atomics.load(control,1))));
      if (result.error) throw new Error(result.error);
      return result.value;
  };
  return { sql, close: () => { sql(null); return worker.terminate(); } };
}
