import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { AxiosError, AxiosHeaders } from 'axios'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { apiPatch } from '@/lib/api'
import { useSession } from '@/lib/auth-client'
import type { User } from '@/types/user'
import EditUserDialog from './EditUserDialog'

vi.mock('@/lib/api', () => ({ apiPatch: vi.fn() }))
vi.mock('@/lib/auth-client', () => ({ useSession: vi.fn() }))

const mockApiPatch = vi.mocked(apiPatch)
const mockUseSession = vi.mocked(useSession)
const refetchSession = vi.fn()

function signedInAs(id: string) {
  mockUseSession.mockReturnValue({
    data: { user: { id } },
    refetch: refetchSession,
  } as unknown as ReturnType<typeof useSession>)
}

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
      <EditUserDialog user={user} />
    </QueryClientProvider>,
  )
}

function openDialog() {
  fireEvent.click(screen.getByRole('button', { name: `Edit ${user.name}` }))
  return within(screen.getByRole('dialog', { name: 'Edit user' }))
}

function save(dialog: ReturnType<typeof openDialog>) {
  fireEvent.click(dialog.getByRole('button', { name: 'Save changes' }))
}

describe('EditUserDialog', () => {
  beforeEach(() => {
    mockApiPatch.mockReset()
    refetchSession.mockReset()
    signedInAs('admin-id')
  })

  it('trims the email before validating it', async () => {
    mockApiPatch.mockResolvedValue({})
    renderDialog()
    const dialog = openDialog()
    fireEvent.change(dialog.getByLabelText('Email'), { target: { value: '  new@example.com ' } })

    save(dialog)

    await waitFor(() => expect(mockApiPatch).toHaveBeenCalledTimes(1))
    expect(mockApiPatch).toHaveBeenCalledWith('/api/users/u2', {
      name: user.name,
      email: 'new@example.com',
    })
  })

  it('refreshes the session when admins edit themselves', async () => {
    signedInAs(user.id)
    mockApiPatch.mockResolvedValue({})
    renderDialog()

    save(openDialog())

    await waitFor(() => expect(refetchSession).toHaveBeenCalledTimes(1))
  })

  it('does not refresh the session when editing someone else', async () => {
    mockApiPatch.mockResolvedValue({})
    renderDialog()

    save(openDialog())

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(refetchSession).not.toHaveBeenCalled()
  })

  it('keeps the modal closed until the edit button is clicked', () => {
    renderDialog()

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('opens prefilled with the user and an empty password', () => {
    renderDialog()

    const dialog = openDialog()

    expect(dialog.getByLabelText('Name')).toHaveValue(user.name)
    expect(dialog.getByLabelText('Email')).toHaveValue(user.email)
    expect(dialog.getByLabelText('New password')).toHaveValue('')
    expect(dialog.getByLabelText('New password')).toHaveAccessibleDescription(
      'Leave blank to keep the current password.',
    )
  })

  it('does not send a password when the field is left blank', async () => {
    mockApiPatch.mockResolvedValue({})
    renderDialog()
    const dialog = openDialog()
    fireEvent.change(dialog.getByLabelText('Name'), { target: { value: 'Samantha Agent' } })

    save(dialog)

    await waitFor(() => expect(mockApiPatch).toHaveBeenCalledTimes(1))
    expect(mockApiPatch).toHaveBeenCalledWith('/api/users/u2', {
      name: 'Samantha Agent',
      email: user.email,
    })
  })

  it('sends the new password when one is entered', async () => {
    mockApiPatch.mockResolvedValue({})
    renderDialog()
    const dialog = openDialog()
    fireEvent.change(dialog.getByLabelText('New password'), { target: { value: 'new-password' } })

    save(dialog)

    await waitFor(() => expect(mockApiPatch).toHaveBeenCalledTimes(1))
    expect(mockApiPatch).toHaveBeenCalledWith('/api/users/u2', {
      name: user.name,
      email: user.email,
      password: 'new-password',
    })
  })

  it('closes the modal after saving', async () => {
    mockApiPatch.mockResolvedValue({})
    renderDialog()
    const dialog = openDialog()

    save(dialog)

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })

  it.each([
    ['Name', 'Al', 'Name must be at least 3 characters'],
    ['Email', 'not-an-email', 'Enter a valid email address'],
    ['New password', 'short12', 'Password must be at least 8 characters'],
    ['New password', 'x'.repeat(129), 'Password must be at most 128 characters'],
  ])('rejects an invalid %s without saving', async (label, value, message) => {
    renderDialog()
    const dialog = openDialog()
    fireEvent.change(dialog.getByLabelText(label), { target: { value } })

    save(dialog)

    expect(await dialog.findByText(message)).toBeInTheDocument()
    expect(dialog.getByLabelText(label)).toHaveAttribute('aria-invalid', 'true')
    expect(mockApiPatch).not.toHaveBeenCalled()
  })

  it('disables the save button while saving', async () => {
    mockApiPatch.mockReturnValue(new Promise(() => {}))
    renderDialog()
    const dialog = openDialog()

    save(dialog)

    expect(await dialog.findByRole('button', { name: 'Saving…' })).toBeDisabled()
  })

  it('shows a duplicate email on the email field and stays open', async () => {
    mockApiPatch.mockRejectedValue(httpError(409))
    renderDialog()
    const dialog = openDialog()

    save(dialog)

    expect(await dialog.findByText('A user with this email already exists')).toBeInTheDocument()
    expect(dialog.getByLabelText('Email')).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it('says when the user no longer exists', async () => {
    mockApiPatch.mockRejectedValue(httpError(404))
    renderDialog()
    const dialog = openDialog()

    save(dialog)

    expect(await dialog.findByRole('alert')).toHaveTextContent('This user no longer exists.')
  })

  it('shows a generic error when saving fails', async () => {
    mockApiPatch.mockRejectedValue(new Error('Request failed'))
    renderDialog()
    const dialog = openDialog()

    save(dialog)

    expect(await dialog.findByRole('alert')).toHaveTextContent("Couldn't save the user. Try again.")
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it('discards unsaved edits when closed and reopened', () => {
    renderDialog()
    const dialog = openDialog()
    fireEvent.change(dialog.getByLabelText('Name'), { target: { value: 'Changed' } })
    fireEvent.change(dialog.getByLabelText('New password'), { target: { value: 'new-password' } })

    fireEvent.click(dialog.getByRole('button', { name: 'Cancel' }))
    const reopened = openDialog()

    expect(reopened.getByLabelText('Name')).toHaveValue(user.name)
    expect(reopened.getByLabelText('New password')).toHaveValue('')
    expect(mockApiPatch).not.toHaveBeenCalled()
  })
})
