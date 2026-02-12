import { Pool } from 'pg';
import { readdir, readFile } from 'fs/promises';
import { join } from 'path';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

interface Migration {
  id: number;
  filename: string;
  sql: string;
}

async function createMigrationsTable(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id INTEGER PRIMARY KEY,
      filename TEXT NOT NULL,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
}

async function getAppliedMigrations(): Promise<Set<number>> {
  const result = await pool.query(
    'SELECT id FROM schema_migrations ORDER BY id'
  );
  return new Set(result.rows.map(row => row.id));
}

async function loadMigrations(): Promise<Migration[]> {
  const migrationsDir = join(import.meta.dir, 'migrations');
  const files = await readdir(migrationsDir);

  const migrations: Migration[] = [];

  for (const file of files.sort()) {
    if (!file.endsWith('.sql')) continue;

    const match = file.match(/^(\d+)_(.+)\.sql$/);
    if (!match) continue;

    const id = parseInt(match[1], 10);
    const filepath = join(migrationsDir, file);
    const sql = await readFile(filepath, 'utf-8');

    migrations.push({ id, filename: file, sql });
  }

  return migrations;
}

async function applyMigration(migration: Migration): Promise<void> {
  console.log(`Applying migration ${migration.id}: ${migration.filename}`);

  await pool.query('BEGIN');

  try {
    // マイグレーションSQLを実行
    await pool.query(migration.sql);

    // マイグレーション記録を保存
    await pool.query(
      'INSERT INTO schema_migrations (id, filename) VALUES ($1, $2)',
      [migration.id, migration.filename]
    );

    await pool.query('COMMIT');
    console.log(`✓ Migration ${migration.id} applied successfully`);
  } catch (error) {
    await pool.query('ROLLBACK');
    console.error(`✗ Migration ${migration.id} failed:`, error);
    throw error;
  }
}

async function runMigrations(): Promise<void> {
  console.log('Starting database migrations...\n');

  // マイグレーションテーブルを作成
  await createMigrationsTable();

  // すでに適用されたマイグレーションを取得
  const appliedMigrations = await getAppliedMigrations();

  // マイグレーションファイルを読み込み
  const migrations = await loadMigrations();

  // 未適用のマイグレーションを実行
  let appliedCount = 0;
  for (const migration of migrations) {
    if (!appliedMigrations.has(migration.id)) {
      await applyMigration(migration);
      appliedCount++;
    } else {
      console.log(`- Migration ${migration.id} already applied, skipping`);
    }
  }

  if (appliedCount === 0) {
    console.log('\n✓ All migrations are up to date');
  } else {
    console.log(`\n✓ Applied ${appliedCount} migration(s) successfully`);
  }
}

async function main() {
  try {
    await runMigrations();
  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
