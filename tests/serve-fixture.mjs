// LOCAL VERIFICATION ONLY. Never used by the Cloudflare entrypoint.
// Data lives only in memory; no Neon connection or credentials are used.
import { createServer } from 'node:http';
import { Readable } from 'node:stream';
import { createHandler } from '../backend/src/handler.ts';
import { repositoryFromQuery } from '../backend/src/repository.ts';
import { memorySql } from './helpers.mjs';
const db = memorySql();
const handler = createHandler(() => repositoryFromQuery(db.sql));
createServer(async (req, res) => {
  try {
    const input = new Request('http://localhost:8787' + req.url, { method: req.method, headers: req.headers, ...(['GET', 'HEAD'].includes(req.method) ? {} : { body: Readable.toWeb(req), duplex: 'half' }) });
    const response = await handler(input, { DATABASE_URL: 'in-memory-test-only', FRONTEND_URL: 'http://localhost:5173,http://127.0.0.1:5173' });
    res.writeHead(response.status, Object.fromEntries(response.headers)); res.end(Buffer.from(await response.arrayBuffer()));
  } catch { res.writeHead(500); res.end('Test fixture error'); }
}).listen(8787, '127.0.0.1', () => console.log('In-memory test API on http://localhost:8787 (NOT Neon)'));
