import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { isAxiosError } from 'axios'
import { Pencil } from 'lucide-react'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { apiPatch } from '@/lib/api'
import { useSession } from '@/lib/auth-client'
import type { User } from '@/types/user'

const editUserSchema = z.object({
  name: z.string().trim().min(3, 'Name must be at least 3 characters'),
  email: z.string().trim().pipe(z.email('Enter a valid email address')),
  // Blank keeps the current password
  password: z.union([
    z.literal(''),
    z
      .string()
      .min(8, 'Password must be at least 8 characters')
      .max(128, 'Password must be at most 128 characters'),
  ]),
})

type EditUserValues = z.infer<typeof editUserSchema>

function EditUserForm({ user, onSaved }: { user: User; onSaved: () => void }) {
  const queryClient = useQueryClient()
  const { data: session, refetch: refetchSession } = useSession()
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<EditUserValues>({
    resolver: zodResolver(editUserSchema),
    defaultValues: { name: user.name, email: user.email, password: '' },
  })

  const updateUser = useMutation({
    mutationFn: ({ name, email, password }: EditUserValues) =>
      apiPatch(`/api/users/${user.id}`, { name, email, ...(password ? { password } : {}) }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['users'] })
      // An admin editing themselves: refresh the name and email shown in the layout
      if (session?.user.id === user.id) void refetchSession()
      onSaved()
    },
    onError: (error) => {
      const status = isAxiosError(error) ? error.response?.status : undefined
      if (status === 409) {
        setError('email', { message: 'A user with this email already exists' })
        return
      }
      setError('root.server', {
        message:
          status === 404 ? 'This user no longer exists.' : "Couldn't save the user. Try again.",
      })
    },
  })

  return (
    <form
      onSubmit={handleSubmit((values) => updateUser.mutate(values))}
      noValidate
      className="flex flex-col gap-4"
    >
      <div className="flex flex-col gap-2">
        <Label htmlFor="edit-user-name">Name</Label>
        <Input
          id="edit-user-name"
          autoComplete="off"
          aria-invalid={!!errors.name}
          {...register('name')}
        />
        {errors.name && <p className="text-sm text-destructive">{errors.name.message}</p>}
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="edit-user-email">Email</Label>
        <Input
          id="edit-user-email"
          type="email"
          autoComplete="off"
          aria-invalid={!!errors.email}
          {...register('email')}
        />
        {errors.email && <p className="text-sm text-destructive">{errors.email.message}</p>}
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="edit-user-password">New password</Label>
        <Input
          id="edit-user-password"
          type="password"
          autoComplete="new-password"
          aria-invalid={!!errors.password}
          aria-describedby="edit-user-password-hint"
          {...register('password')}
        />
        <p id="edit-user-password-hint" className="text-sm text-muted-foreground">
          Leave blank to keep the current password.
        </p>
        {errors.password && <p className="text-sm text-destructive">{errors.password.message}</p>}
      </div>
      {errors.root?.server && (
        <p role="alert" className="text-sm text-destructive">
          {errors.root.server.message}
        </p>
      )}
      <DialogFooter>
        <DialogClose asChild>
          <Button type="button" variant="outline">
            Cancel
          </Button>
        </DialogClose>
        <Button type="submit" disabled={updateUser.isPending}>
          {updateUser.isPending ? 'Saving…' : 'Save changes'}
        </Button>
      </DialogFooter>
    </form>
  )
}

export default function EditUserDialog({ user }: { user: User }) {
  const [open, setOpen] = useState(false)

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon" aria-label={`Edit ${user.name}`}>
          <Pencil />
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit user</DialogTitle>
          <DialogDescription>Update {user.name}'s details.</DialogDescription>
        </DialogHeader>
        {/* The dialog unmounts its content on close, so the form reloads the latest data each time */}
        <EditUserForm user={user} onSaved={() => setOpen(false)} />
      </DialogContent>
    </Dialog>
  )
}
