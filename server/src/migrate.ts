import { readdir, readFile } from 'node:fs/promises';
import pg from 'pg';
import { db, tx } from './db.js';

const migrations = new URL('../db/migrations/', import.meta.url);

export async function migrate() {
 const directUrl = process.env.DATABASE_URL_UNPOOLED?.trim();
 const direct = directUrl ? new pg.Pool({ connectionString: directUrl, connectionTimeoutMillis: 15000, max: 1 }) : undefined;
 try {
  const files = (await readdir(migrations)).filter(name => name.endsWith('.sql')).sort();
  if (!files.length) throw new Error('Nenhuma migração encontrada.');
  const applied = await tx(async c => {
   await c.query('select pg_advisory_xact_lock(71234)');
   await c.query('create table if not exists migrations(name text primary key)');
   const executed: string[] = [];
   for (const name of files) {
    if ((await c.query('select 1 from migrations where name=$1', [name])).rowCount) continue;
    await c.query(await readFile(new URL(name, migrations), 'utf8'));
    await c.query('insert into migrations values($1)', [name]);
    executed.push(name);
   }
   return executed;
  }, direct ?? db);
  for (const name of applied) console.log('Aplicada:', name);
 } finally {
  await direct?.end();
 }
}
