import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { AxiosError, type AxiosResponse } from 'axios'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { apiPost } from '@/lib/api'
import CreateUserDialog from './CreateUserDialog'

vi.mock('@/lib/api', () => ({ apiPost: vi.fn() }))

const mockApiPost = vi.mocked(apiPost)

const valid = { name: 'Sam Agent', email: 'sam@example.com', password: 'correct-horse' }

function renderDialog() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  const invalidate = vi.spyOn(queryClient, 'invalidateQueries')
  render(
    <QueryClientProvider client={queryClient}>
      <CreateUserDialog />
    </QueryClientProvider>,
  )
  return { invalidate }
}

function openDialog() {
  fireEvent.click(screen.getByRole('button', { name: 'New user' }))
  return within(screen.getByRole('dialog', { name: 'New user' }))
}

function fillForm(dialog: ReturnType<typeof openDialog>, values: typeof valid) {
  fireEvent.change(dialog.getByLabelText('Name'), { target: { value: values.name } })
  fireEvent.change(dialog.getByLabelText('Email'), { target: { value: values.email } })
  fireEvent.change(dialog.getByLabelText('Password'), { target: { value: values.password } })
}

function submit(dialog: ReturnType<typeof openDialog>) {
  fireEvent.click(dialog.getByRole('button', { name: 'Create user' }))
}

describe('CreateUserDialog', () => {
  beforeEach(() => {
    mockApiPost.mockReset()
  })

  it('keeps the modal closed until the button is clicked', () => {
    renderDialog()

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('shows name, email and password fields when opened', () => {
    renderDialog()

    const dialog = openDialog()

    expect(dialog.getByLabelText('Name')).toBeInTheDocument()
    expect(dialog.getByLabelText('Email')).toHaveAttribute('type', 'email')
    expect(dialog.getByLabelText('Password')).toHaveAttribute('type', 'password')
  })

  it('rejects a name shorter than 3 characters', async () => {
    renderDialog()
    const dialog = openDialog()
    fillForm(dialog, { ...valid, name: 'Al' })

    submit(dialog)

    expect(await dialog.findByText('Name must be at least 3 characters')).toBeInTheDocument()
    expect(mockApiPost).not.toHaveBeenCalled()
  })

  it('rejects a password shorter than 8 characters', async () => {
    renderDialog()
    const dialog = openDialog()
    fillForm(dialog, { ...valid, password: 'short12' })

    submit(dialog)

    expect(await dialog.findByText('Password must be at least 8 characters')).toBeInTheDocument()
    expect(mockApiPost).not.toHaveBeenCalled()
  })

  it('rejects an invalid email', async () => {
    renderDialog()
    const dialog = openDialog()
    fillForm(dialog, { ...valid, email: 'not-an-email' })

    submit(dialog)

    expect(await dialog.findByText('Enter a valid email address')).toBeInTheDocument()
    expect(mockApiPost).not.toHaveBeenCalled()
  })

  it('accepts a name and password of exactly the minimum length', async () => {
    mockApiPost.mockResolvedValue({})
    renderDialog()
    const dialog = openDialog()
    fillForm(dialog, { ...valid, name: 'Ali', password: '12345678' })

    submit(dialog)

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(mockApiPost).toHaveBeenCalledWith('/api/users', {
      name: 'Ali',
      email: valid.email,
      password: '12345678',
    })
  })

  it('creates the user, closes the modal and refreshes the user list', async () => {
    mockApiPost.mockResolvedValue({})
    const { invalidate } = renderDialog()
    const dialog = openDialog()
    fillForm(dialog, valid)

    submit(dialog)

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(mockApiPost).toHaveBeenCalledTimes(1)
    expect(mockApiPost).toHaveBeenCalledWith('/api/users', valid)
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['users'] })
  })

  it('disables the submit button while the request is pending', async () => {
    mockApiPost.mockReturnValue(new Promise(() => {}))
    renderDialog()
    const dialog = openDialog()
    fillForm(dialog, valid)

    submit(dialog)

    expect(await dialog.findByRole('button', { name: 'Creating…' })).toBeDisabled()
  })

  it('keeps the modal open and marks the email when it is already taken', async () => {
    mockApiPost.mockRejectedValue(
      new AxiosError('Conflict', undefined, undefined, undefined, {
        status: 409,
      } as AxiosResponse),
    )
    const { invalidate } = renderDialog()
    const dialog = openDialog()
    fillForm(dialog, valid)

    submit(dialog)

    expect(await dialog.findByText('A user with this email already exists')).toBeInTheDocument()
    expect(dialog.getByLabelText('Email')).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(invalidate).not.toHaveBeenCalled()
  })

  it('keeps the modal open and shows an error when the request fails', async () => {
    mockApiPost.mockRejectedValue(new Error('Request failed'))
    renderDialog()
    const dialog = openDialog()
    fillForm(dialog, valid)

    submit(dialog)

    expect(await dialog.findByRole('alert')).toHaveTextContent(
      "Couldn't create the user. Try again.",
    )
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it('clears the form when cancelled and reopened', () => {
    renderDialog()
    const dialog = openDialog()
    fillForm(dialog, valid)

    fireEvent.click(dialog.getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()

    const reopened = openDialog()
    expect(reopened.getByLabelText('Name')).toHaveValue('')
    expect(reopened.getByLabelText('Password')).toHaveValue('')
  })
})
