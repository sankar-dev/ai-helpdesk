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

// Sessions are signed with this, so refuse short values and the .env.example placeholder
function authSecret(): string {
  const value = required('BETTER_AUTH_SECRET')
  if (value.length < 32 || value === 'change-me-to-a-long-random-string') {
    throw new Error(
      'BETTER_AUTH_SECRET must be a random string of at least 32 characters (try `openssl rand -base64 32`)',
    )
  }
  return value
}

export const config = {
  port: Number(process.env.PORT ?? 3000),
  nodeEnv: process.env.NODE_ENV ?? 'development',
  databaseUrl: required('DATABASE_URL'),
  clientUrl: process.env.CLIENT_URL ?? 'http://localhost:5173',
  betterAuthSecret: authSecret(),
  betterAuthUrl: required('BETTER_AUTH_URL'),
}
