import { useState } from 'react'
import { Navigate, NavLink, Outlet, useNavigate } from 'react-router'
import { Button } from '@/components/ui/button'
import { signOut, useSession } from '@/lib/auth-client'
import { queryClient } from '@/lib/query-client'
import { cn } from '@/lib/utils'

const navItems = [
  { to: '/dashboard', label: 'Dashboard' },
  { to: '/tickets', label: 'Tickets' },
  { to: '/users', label: 'Users', adminOnly: true },
]

export default function AppLayout() {
  const navigate = useNavigate()
  const { data: session, isPending } = useSession()
  const [signOutError, setSignOutError] = useState(false)

  if (isPending) {
    return (
      <div className="flex min-h-svh items-center justify-center text-sm text-muted-foreground">
        Loading…
      </div>
    )
  }

  if (!session) {
    return <Navigate to="/login" replace />
  }

  async function handleSignOut() {
    const { error } = await signOut()
    if (error) {
      setSignOutError(true)
      return
    }
    // Drop cached API data so the next user to sign in on this tab can't see it
    queryClient.clear()
    navigate('/login', { replace: true })
  }

  return (
    <div className="flex min-h-svh">
      <aside className="w-56 shrink-0 border-r bg-sidebar p-4">
        <div className="mb-6 px-2 text-lg font-semibold">Helpdesk</div>
        <nav className="flex flex-col gap-1">
          {navItems
            .filter((item) => !item.adminOnly || session.user.role === 'admin')
            .map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  cn(
                    'rounded-md px-2 py-1.5 text-sm text-sidebar-foreground hover:bg-sidebar-accent',
                    isActive && 'bg-sidebar-accent font-medium',
                  )
                }
              >
                {item.label}
              </NavLink>
            ))}
        </nav>
      </aside>
      <div className="flex flex-1 flex-col">
        <header className="flex items-center justify-end gap-3 border-b px-8 py-3">
          {signOutError && (
            <span className="text-sm text-destructive">Sign out failed. Try again.</span>
          )}
          <span className="text-sm font-medium">{session.user.name}</span>
          <Button variant="outline" size="sm" onClick={handleSignOut}>
            Sign out
          </Button>
        </header>
        <main className="flex-1 p-8">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
