// Load server/.env in development. In production, variables come from the host.
try {
  process.loadEnvFile()
} catch {
  // No .env file: rely on the environment
}

function required(name: string): string {
  const value = process.env[name]
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`)
  }
  return value
}

export const config = {
  port: Number(process.env.PORT ?? 3000),
  nodeEnv: process.env.NODE_ENV ?? 'development',
  databaseUrl: required('DATABASE_URL'),
  clientUrl: process.env.CLIENT_URL ?? 'http://localhost:5173',
  betterAuthSecret: required('BETTER_AUTH_SECRET'),
  betterAuthUrl: required('BETTER_AUTH_URL'),
}
