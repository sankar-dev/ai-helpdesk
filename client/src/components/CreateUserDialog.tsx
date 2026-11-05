import { useState } from 'react'
import CreateUserForm from '@/components/CreateUserForm'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'

export default function CreateUserDialog() {
  const [open, setOpen] = useState(false)

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>New user</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New user</DialogTitle>
          <DialogDescription>New users are created with the agent role.</DialogDescription>
        </DialogHeader>
        {/* The dialog unmounts its content on close, so the form (and typed password) resets each time */}
        <CreateUserForm onCreated={() => setOpen(false)} />
      </DialogContent>
    </Dialog>
  )
}
