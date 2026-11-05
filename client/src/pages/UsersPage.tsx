import { useQuery } from '@tanstack/react-query'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { apiGet } from '@/lib/api'

type User = {
  id: string
  name: string
  email: string
  role: 'admin' | 'agent'
  createdAt: string
}

function UsersTableHeader() {
  return (
    <TableHeader>
      <TableRow>
        <TableHead>Name</TableHead>
        <TableHead>Email</TableHead>
        <TableHead>Role</TableHead>
        <TableHead>Created</TableHead>
      </TableRow>
    </TableHeader>
  )
}

export default function UsersPage() {
  const { data, isPending, isError } = useQuery({
    queryKey: ['users'],
    queryFn: () => apiGet<{ users: User[] }>('/api/users'),
  })

  return (
    <div>
      <h1 className="text-2xl font-semibold">Users</h1>
      <div className="mt-6">
        {isPending ? (
          <div role="status" aria-label="Loading users">
            <Table>
              <UsersTableHeader />
              <TableBody>
                {Array.from({ length: 5 }, (_, i) => (
                  <TableRow key={i}>
                    <TableCell>
                      <Skeleton className="h-4 w-32" />
                    </TableCell>
                    <TableCell>
                      <Skeleton className="h-4 w-48" />
                    </TableCell>
                    <TableCell>
                      <Skeleton className="h-5 w-14 rounded-4xl" />
                    </TableCell>
                    <TableCell>
                      <Skeleton className="h-4 w-20" />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        ) : isError ? (
          <p className="text-sm text-destructive">Couldn't load users.</p>
        ) : data.users.length === 0 ? (
          <p className="text-sm text-muted-foreground">No users yet.</p>
        ) : (
          <Table>
            <UsersTableHeader />
            <TableBody>
              {data.users.map((user) => (
                <TableRow key={user.id}>
                  <TableCell className="font-medium">{user.name}</TableCell>
                  <TableCell>{user.email}</TableCell>
                  <TableCell>
                    <Badge variant={user.role === 'admin' ? 'default' : 'secondary'}>
                      {user.role}
                    </Badge>
                  </TableCell>
                  <TableCell>{new Date(user.createdAt).toLocaleDateString()}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>
    </div>
  )
}
