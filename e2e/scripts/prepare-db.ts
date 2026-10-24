// Gets the test database ready: creates it if missing, applies migrations, empties every
// table, and seeds the admin. Called from global-setup.ts on every run; can also be run
// on its own with `npm run db:prepare`.
import { execSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import pg from 'pg'
import { serverTestEnv, testDatabaseName, testDatabaseUrl } from '../test-env.ts'

const serverDir = fileURLToPath(new URL('../../server', import.meta.url))
const env = { ...process.env, ...serverTestEnv }

async function createDatabaseIfMissing() {
  const adminUrl = new URL(testDatabaseUrl)
  adminUrl.pathname = '/postgres'
  const client = new pg.Client({ connectionString: adminUrl.toString() })
  await client.connect()
  try {
    const { rowCount } = await client.query('SELECT 1 FROM pg_database WHERE datname = $1', [
      testDatabaseName,
    ])
    if (!rowCount) {
      await client.query(`CREATE DATABASE ${client.escapeIdentifier(testDatabaseName)}`)
      console.log(`Created database ${testDatabaseName}`)
    }
  } finally {
    await client.end()
  }
}

async function truncateAllTables() {
  const client = new pg.Client({ connectionString: testDatabaseUrl })
  await client.connect()
  try {
    const { rows } = await client.query<{ tablename: string }>(
      "SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'",
    )
    if (rows.length) {
      const tables = rows.map((row) => client.escapeIdentifier(row.tablename)).join(', ')
      await client.query(`TRUNCATE ${tables} RESTART IDENTITY CASCADE`)
    }
  } finally {
    await client.end()
  }
}

export async function prepareTestDatabase() {
  await createDatabaseIfMissing()
  execSync('npx prisma migrate deploy', { cwd: serverDir, env, stdio: 'inherit' })
  await truncateAllTables()
  execSync('npx prisma db seed', { cwd: serverDir, env, stdio: 'inherit' })
  console.log(`Test database ${testDatabaseName} is ready`)
}

if (import.meta.main) {
  await prepareTestDatabase()
}
