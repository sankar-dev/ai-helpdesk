import { Navigate, Outlet } from 'react-router'
import { useSession } from '@/lib/auth-client'

// UX only: hides admin pages from agents. The server must still enforce
// access with requireAdmin on every admin API route.
export default function RequireAdmin() {
  const { data: session, isPending } = useSession()

  if (isPending) {
    return null
  }

  if (session?.user.role !== 'admin') {
    return <Navigate to="/dashboard" replace />
  }

  return <Outlet />
}
