import { useEffect, useState } from 'react'

type Health = { status: string; database: string }

export default function DashboardPage() {
  const [health, setHealth] = useState<Health | null>(null)
  const [error, setError] = useState(false)

  // Temporary check that the client can reach the API through the Vite proxy
  useEffect(() => {
    fetch('/api/health')
      .then((res) => res.json())
      .then(setHealth)
      .catch(() => setError(true))
  }, [])

  return (
    <div>
      <h1 className="text-2xl font-semibold">Dashboard</h1>
      <p className="mt-4 text-sm text-muted-foreground">
        API: {error ? 'unreachable' : (health?.status ?? 'checking…')}
        {health && ` · Database: ${health.database}`}
      </p>
    </div>
  )
}
