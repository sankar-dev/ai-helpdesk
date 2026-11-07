import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { Button } from '@/components/ui/button'
import { DialogClose, DialogFooter } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { apiPost } from '@/lib/api'
import { apiErrorMessage, apiErrorStatus } from '@/lib/api-error'

const createUserSchema = z.object({
  name: z.string().trim().min(3, 'Name must be at least 3 characters'),
  email: z.email('Enter a valid email address'),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .max(128, 'Password must be at most 128 characters'),
})

type CreateUserValues = z.infer<typeof createUserSchema>

// Render inside a <Dialog>: the Cancel button closes the surrounding dialog.
export default function CreateUserForm({ onCreated }: { onCreated: () => void }) {
  const queryClient = useQueryClient()
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<CreateUserValues>({
    resolver: zodResolver(createUserSchema),
    defaultValues: { name: '', email: '', password: '' },
  })

  const createUser = useMutation({
    mutationFn: (values: CreateUserValues) => apiPost('/api/users', values),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['users'] })
      onCreated()
    },
    onError: (error) => {
      if (apiErrorStatus(error) === 409) {
        // The server says whether the email belongs to an active or a deleted user
        setError('email', {
          message: apiErrorMessage(error) ?? 'A user with this email already exists',
        })
        return
      }
      setError('root.server', { message: "Couldn't create the user. Try again." })
    },
  })

  return (
    <form
      onSubmit={handleSubmit((values) => createUser.mutate(values))}
      noValidate
      className="flex flex-col gap-4"
    >
      <div className="flex flex-col gap-2">
        <Label htmlFor="create-user-name">Name</Label>
        <Input
          id="create-user-name"
          autoComplete="off"
          aria-invalid={!!errors.name}
          {...register('name')}
        />
        {errors.name && <p className="text-sm text-destructive">{errors.name.message}</p>}
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="create-user-email">Email</Label>
        <Input
          id="create-user-email"
          type="email"
          autoComplete="off"
          aria-invalid={!!errors.email}
          {...register('email')}
        />
        {errors.email && <p className="text-sm text-destructive">{errors.email.message}</p>}
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="create-user-password">Password</Label>
        <Input
          id="create-user-password"
          type="password"
          autoComplete="new-password"
          aria-invalid={!!errors.password}
          {...register('password')}
        />
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
        <Button type="submit" disabled={createUser.isPending}>
          {createUser.isPending ? 'Creating…' : 'Create user'}
        </Button>
      </DialogFooter>
    </form>
  )
}
