import { Navigate, NavLink, Outlet, useNavigate } from 'react-router'
import { Button } from '@/components/ui/button'
import { signOut, useSession } from '@/lib/auth-client'
import { cn } from '@/lib/utils'

const navItems = [
  { to: '/dashboard', label: 'Dashboard' },
  { to: '/tickets', label: 'Tickets' },
  { to: '/users', label: 'Users' },
]

export default function AppLayout() {
  const navigate = useNavigate()
  const { data: session, isPending } = useSession()

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
    await signOut()
    navigate('/login', { replace: true })
  }

  return (
    <div className="flex min-h-svh">
      <aside className="w-56 shrink-0 border-r bg-sidebar p-4">
        <div className="mb-6 px-2 text-lg font-semibold">Helpdesk</div>
        <nav className="flex flex-col gap-1">
          {navItems.map((item) => (
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
