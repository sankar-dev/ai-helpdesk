import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Trash2 } from 'lucide-react'
import { useState } from 'react'
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
import { apiDelete } from '@/lib/api'
import { apiErrorStatus } from '@/lib/api-error'
import type { User } from '@/types/user'

function errorMessage(status: number | undefined) {
  if (status === 404) return 'This user has already been deleted.'
  if (status === 403) return "Admins can't be deleted."
  return "Couldn't delete the user. Try again."
}

// Confirmation modal for soft-deleting a user. Only render it for agents: the server refuses admins.
export default function DeleteUserDialog({ user }: { user: User }) {
  const [open, setOpen] = useState(false)
  const queryClient = useQueryClient()

  const deleteUser = useMutation({
    mutationFn: () => apiDelete(`/api/users/${user.id}`),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['users'] })
      setOpen(false)
    },  })

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (next) return
        // The user was already deleted: refresh the list now so the stale row disappears.
        // Not in onError, because this dialog lives in that row and would unmount with the message.
        if (apiErrorStatus(deleteUser.error) === 404) {
          void queryClient.invalidateQueries({ queryKey: ['users'] })
        }
        // Clear a previous error so reopening starts fresh
        deleteUser.reset()
      }}
    >
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon" aria-label={`Delete ${user.name}`}>
          <Trash2 />
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete user</DialogTitle>
          <DialogDescription>
            {user.name} ({user.email}) will be signed out and won't be able to sign in again.
          </DialogDescription>
        </DialogHeader>
        {deleteUser.isError && (
          <p role="alert" className="text-sm text-destructive">
            {errorMessage(apiErrorStatus(deleteUser.error))}
          </p>
        )}
        <DialogFooter>
          <DialogClose asChild>
            <Button type="button" variant="outline">
              Cancel
            </Button>
          </DialogClose>
          <Button
            type="button"
            variant="destructive"
            disabled={deleteUser.isPending}
            onClick={() => deleteUser.mutate()}
          >
            {deleteUser.isPending ? 'Deleting…' : 'Delete'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
