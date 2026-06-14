import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from 'pg';

const connectionString = process.env.DATABASE_URL?.trim();

if (!connectionString) {
  console.error('DATABASE_URL is required to run migrations');
  process.exit(1);
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const migrationsDir = path.resolve(__dirname, '../src/sql/migrations');

function getMigrationFiles() {
  return readdirSync(migrationsDir)
    .filter((name) => name.endsWith('.sql'))
    .sort();
}

async function ensureMigrationsTable(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS public.schema_migrations (
      name TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
}

async function getAppliedMigrations(client) {
  const result = await client.query('SELECT name FROM public.schema_migrations');
  return new Set(result.rows.map((row) => row.name));
}

async function applyMigration(client, fileName) {
  const migrationPath = path.join(migrationsDir, fileName);
  const sql = readFileSync(migrationPath, 'utf8');

  await client.query('BEGIN');

  try {
    await client.query(sql);
    await client.query('INSERT INTO public.schema_migrations(name) VALUES($1)', [fileName]);
    await client.query('COMMIT');
    console.log(`Applied migration ${fileName}`);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
}

async function main() {
  const client = new Client({ connectionString });
  await client.connect();

  try {
    await ensureMigrationsTable(client);
    const files = getMigrationFiles();
    const applied = await getAppliedMigrations(client);

    for (const fileName of files) {
      if (applied.has(fileName)) {
        continue;
      }

      await applyMigration(client, fileName);
    }

    console.log('Migrations complete');
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
