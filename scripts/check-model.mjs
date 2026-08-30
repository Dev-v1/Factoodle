import { readFileSync, copyFileSync } from 'node:fs';
const backend = new URL('../backend/src/model.ts', import.meta.url);
const frontend = new URL('../frontend/src/domain/model.ts', import.meta.url);
if (process.argv.includes('--sync')) copyFileSync(backend, frontend);
if (readFileSync(backend, 'utf8') !== readFileSync(frontend, 'utf8')) throw new Error('Sync models differ. Run node scripts/check-model.mjs --sync');
console.log('Frontend/backend sync contract matches.');
