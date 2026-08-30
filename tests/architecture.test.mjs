import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
const read = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8');
test('production uses the same Worker, frontend origin and schema', () => {
  const worker = JSON.parse(read('backend/wrangler.jsonc'));
  assert.equal(worker.name, 'factoodle-api');
  assert.equal(worker.main, 'src/index.ts');
  assert.ok(worker.vars.FRONTEND_URL.split(',').includes('https://factoodle.vercel.app'));
  assert.ok(!('DATABASE_URL' in worker.vars));
  const schema = read('backend/schema.sql');
  assert.match(schema, /CREATE TABLE IF NOT EXISTS learner_progress/);
  assert.doesNotMatch(schema, /\b(DROP|TRUNCATE|DELETE)\b/i);
});
test('frontend has no database driver or credential configuration access', () => {
  const pkg = JSON.parse(read('frontend/package.json'));
  assert.equal(pkg.dependencies['@neondatabase/serverless'], undefined);
  assert.equal(pkg.dependencies['@clerk/clerk-react'], undefined);
  for (const file of readdirSync(new URL('../frontend/src/', import.meta.url), { recursive: true }).filter(x => /\.tsx?$/.test(x))) {
    const source = read('frontend/src/' + file);
    assert.doesNotMatch(source, /import\.meta\.env\.(?:VITE_)?DATABASE_URL/);
    assert.doesNotMatch(source, /postgres(?:ql)?:\/\//);
    assert.doesNotMatch(source, /localStorage\.(clear|removeItem)\(/);
  }
});
test('both deployment roots remain self-contained and production excludes test storage', () => {
  const entry = read('backend/src/index.ts');
  assert.match(entry, /createRepository/); assert.doesNotMatch(entry, /memorySql|serve-fixture/);
  const vercel = JSON.parse(read('frontend/vercel.json'));
  assert.equal(vercel.framework, 'vite');
  assert.equal(vercel.rewrites[0].destination, '/index.html');
  assert.match(read('.gitignore'), /\.dev\.vars/); assert.match(read('.gitignore'), /\.env/);
  assert.ok(read('DEPLOYMENT.md').includes('Saved online'));
});
