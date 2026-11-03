// Lokale Entwicklung: API (gleicher Code wie die Netlify Function) mit PGlite auf Port 8787
// plus Angular-Dev-Server, der /api dorthin weiterleitet.
//   node server/dev.mjs            → API + ng serve (Port 4310)
//   node server/dev.mjs --api-only → nur API
import { mkdirSync } from 'node:fs';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { join } from 'node:path';
import { createHandler } from '../netlify/lib/handler.mts';
import { openPglite, pgliteDb } from './pglite-db.mjs';
import { seedIfEmpty } from './seed.mjs';

const API_PORT = 8787;
const dataDir = join(process.cwd(), '.data', 'pglite');
mkdirSync(dataDir, { recursive: true });
const pg = await openPglite(dataDir);
const db = pgliteDb(pg);
const handle = createHandler(db);
await seedIfEmpty(handle);

createServer(async (req, res) => {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const request = new Request(`http://localhost${req.url}`, {
    method: req.method,
    headers: req.headers,
    body: req.method === 'GET' || req.method === 'HEAD' ? undefined : Buffer.concat(chunks),
  });
  const response = await handle(request);
  res.writeHead(response.status, Object.fromEntries(response.headers));
  res.end(Buffer.from(await response.arrayBuffer()));
}).listen(API_PORT, () => console.log(`API läuft auf http://localhost:${API_PORT}/api`));

if (!process.argv.includes('--api-only')) {
  const ng = spawn('npx', ['ng', 'serve', '--port', '4310', '--proxy-config', 'proxy.conf.json'], {
    stdio: 'inherit',
    shell: true,
  });
  ng.on('exit', (code) => process.exit(code ?? 0));
}
