import { neon } from '@neondatabase/serverless';
import { mergeDocuments, parseDocument, type Document } from './model.ts';

export interface Repository {
  get(code: string): Promise<Document | null>;
  sync(code: string, incoming: Document): Promise<Document>;
  ready(): Promise<void>;
}
export class ConflictError extends Error { name = 'ConflictError'; }
// Compare-and-swap prevents concurrent requests from losing other browsers' work.
export function createRepository(connection: string): Repository {
  const sql = neon(connection, { fetchOptions: { signal: AbortSignal.timeout(15_000) } });
  return repositoryFromQuery(sql);
}
export type Query = (parts: TemplateStringsArray, ...values: unknown[]) => Promise<{ progress?: unknown }[]>;
// Injecting the SQL transport lets regression tests exercise real CAS logic.
export function repositoryFromQuery(sql: Query): Repository {
  async function readRaw(code: string): Promise<unknown | null> {
    const rows = await sql`SELECT progress FROM learner_progress WHERE progress_code = ${code}`;
    return rows.length ? rows[0].progress : null;
  }
  return {
    async ready() { await sql`SELECT progress_code FROM learner_progress LIMIT 0`; },
    async get(code) { const row = await readRaw(code); return row === null ? null : parseDocument(row); },
    async sync(code, incoming) {
      for (let attempt = 0; attempt < 6; attempt++) {
        const raw = await readRaw(code);
        const merged = raw === null ? incoming : mergeDocuments(parseDocument(raw), incoming);
        const encoded = JSON.stringify(merged);
        if (raw === null) {
          const rows = await sql`INSERT INTO learner_progress (progress_code, progress)
            VALUES (${code}, ${encoded}::jsonb) ON CONFLICT (progress_code) DO NOTHING RETURNING progress`;
          if (rows.length) return parseDocument(rows[0].progress);
        } else {
          const rows = await sql`UPDATE learner_progress SET progress = ${encoded}::jsonb, updated_at = NOW()
            WHERE progress_code = ${code} AND progress = ${JSON.stringify(raw)}::jsonb RETURNING progress`;
          if (rows.length) return parseDocument(rows[0].progress);
        }
      }
      throw new ConflictError('Sync busy. Retry the same document.');
    },
  };
}
