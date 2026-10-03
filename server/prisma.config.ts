import { defineConfig, env } from 'prisma/config'

// Load server/.env for Prisma CLI commands (migrate, studio, generate)
try {
  process.loadEnvFile()
} catch {
  // No .env file: rely on the environment
}

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: {
    url: env('DATABASE_URL'),
  },
})
