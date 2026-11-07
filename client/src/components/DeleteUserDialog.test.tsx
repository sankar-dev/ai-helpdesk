import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { AxiosError, AxiosHeaders } from 'axios'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { apiDelete } from '@/lib/api'
import type { User } from '@/types/user'
import DeleteUserDialog from './DeleteUserDialog'

vi.mock('@/lib/api', () => ({ apiDelete: vi.fn() }))

const mockApiDelete = vi.mocked(apiDelete)

const user: User = {
  id: 'u2',
  name: 'Sam Agent',
  email: 'sam@example.com',
  role: 'agent',
  createdAt: '2026-03-20T12:00:00.000Z',
}

function httpError(status: number) {
  return new AxiosError('Request failed', 'ERR_BAD_REQUEST', undefined, undefined, {
    status,
    statusText: '',
    data: {},
    headers: {},
    config: { headers: new AxiosHeaders() },
  })
}

function renderDialog() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  render(
    <QueryClientProvider client={queryClient}>
      <DeleteUserDialog user={user} />
    </QueryClientProvider>,
  )
}

function openDialog() {
  fireEvent.click(screen.getByRole('button', { name: `Delete ${user.name}` }))
  return within(screen.getByRole('dialog', { name: 'Delete user' }))
}

function confirm(dialog: ReturnType<typeof openDialog>) {
  fireEvent.click(dialog.getByRole('button', { name: 'Delete' }))
}

describe('DeleteUserDialog', () => {
  beforeEach(() => {
    mockApiDelete.mockReset()
  })

  it('keeps the modal closed until the delete button is clicked', () => {
    renderDialog()

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('asks for confirmation, naming the user', () => {
    renderDialog()

    const dialog = openDialog()

    expect(
      dialog.getByText(
        `${user.name} (${user.email}) will be signed out and won't be able to sign in again.`,
      ),
    ).toBeInTheDocument()
    expect(dialog.getByRole('button', { name: 'Delete' })).toHaveAttribute(
      'data-variant',
      'destructive',
    )
    expect(mockApiDelete).not.toHaveBeenCalled()
  })

  it.each(['Cancel', 'Close'])('closes without deleting when %s is clicked', (name) => {
    renderDialog()
    const dialog = openDialog()

    fireEvent.click(dialog.getByRole('button', { name }))

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(mockApiDelete).not.toHaveBeenCalled()
  })

  it('deletes the user and closes the modal when confirmed', async () => {
    mockApiDelete.mockResolvedValue(undefined)
    renderDialog()

    confirm(openDialog())

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(mockApiDelete).toHaveBeenCalledTimes(1)
    expect(mockApiDelete).toHaveBeenCalledWith('/api/users/u2')
  })

  it('disables the delete button while deleting', async () => {
    mockApiDelete.mockReturnValue(new Promise(() => {}))
    renderDialog()
    const dialog = openDialog()

    confirm(dialog)

    expect(await dialog.findByRole('button', { name: 'Deleting…' })).toBeDisabled()
  })

  it.each([
    [404, 'This user has already been deleted.'],
    [403, "Admins can't be deleted."],
    [500, "Couldn't delete the user. Try again."],
  ])('shows an error for a %i and stays open', async (status, message) => {
    mockApiDelete.mockRejectedValue(httpError(status))
    renderDialog()
    const dialog = openDialog()

    confirm(dialog)

    expect(await dialog.findByRole('alert')).toHaveTextContent(message)
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(dialog.getByRole('button', { name: 'Delete' })).toBeEnabled()
  })

  it('shows a generic error for a network failure', async () => {
    mockApiDelete.mockRejectedValue(new Error('Network Error'))
    renderDialog()
    const dialog = openDialog()

    confirm(dialog)

    expect(await dialog.findByRole('alert')).toHaveTextContent(
      "Couldn't delete the user. Try again.",
    )
  })

  it('clears the error when closed and reopened', async () => {
    mockApiDelete.mockRejectedValue(httpError(500))
    renderDialog()
    const dialog = openDialog()
    confirm(dialog)
    await dialog.findByRole('alert')

    fireEvent.click(dialog.getByRole('button', { name: 'Cancel' }))
    const reopened = openDialog()

    expect(reopened.queryByRole('alert')).not.toBeInTheDocument()
  })
})
