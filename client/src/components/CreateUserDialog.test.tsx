import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
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
  render(
    <QueryClientProvider client={queryClient}>
      <CreateUserDialog />
    </QueryClientProvider>,
  )
}

function openDialog() {
  fireEvent.click(screen.getByRole('button', { name: 'New user' }))
  return within(screen.getByRole('dialog', { name: 'New user' }))
}

function fillForm(dialog: ReturnType<typeof openDialog>) {
  fireEvent.change(dialog.getByLabelText('Name'), { target: { value: valid.name } })
  fireEvent.change(dialog.getByLabelText('Email'), { target: { value: valid.email } })
  fireEvent.change(dialog.getByLabelText('Password'), { target: { value: valid.password } })
}

describe('CreateUserDialog', () => {
  beforeEach(() => {
    mockApiPost.mockReset()
  })

  it('keeps the modal closed until the button is clicked', () => {
    renderDialog()

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('opens the modal with the form and explains the role', () => {
    renderDialog()

    const dialog = openDialog()

    expect(dialog.getByText('New users are created with the agent role.')).toBeInTheDocument()
    expect(dialog.getByLabelText('Name')).toBeInTheDocument()
    expect(dialog.getByLabelText('Email')).toBeInTheDocument()
    expect(dialog.getByLabelText('Password')).toBeInTheDocument()
  })

  it('closes the modal after the user is created', async () => {
    mockApiPost.mockResolvedValue({})
    renderDialog()
    const dialog = openDialog()
    fillForm(dialog)

    fireEvent.click(dialog.getByRole('button', { name: 'Create user' }))

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(mockApiPost).toHaveBeenCalledTimes(1)
  })

  it('keeps the modal open when creating the user fails', async () => {
    mockApiPost.mockRejectedValue(new Error('Request failed'))
    renderDialog()
    const dialog = openDialog()
    fillForm(dialog)

    fireEvent.click(dialog.getByRole('button', { name: 'Create user' }))

    await dialog.findByRole('alert')
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it('keeps the modal open when validation fails', async () => {
    renderDialog()
    const dialog = openDialog()

    fireEvent.click(dialog.getByRole('button', { name: 'Create user' }))

    await dialog.findByText('Name must be at least 3 characters')
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(mockApiPost).not.toHaveBeenCalled()
  })

  it.each(['Cancel', 'Close'])('closes without saving when %s is clicked', (name) => {
    renderDialog()
    const dialog = openDialog()
    fillForm(dialog)

    fireEvent.click(dialog.getByRole('button', { name }))

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(mockApiPost).not.toHaveBeenCalled()
  })

  it('clears the form and any errors when closed and reopened', async () => {
    renderDialog()
    const dialog = openDialog()
    fillForm(dialog)
    fireEvent.change(dialog.getByLabelText('Name'), { target: { value: 'Al' } })
    fireEvent.click(dialog.getByRole('button', { name: 'Create user' }))
    await dialog.findByText('Name must be at least 3 characters')

    fireEvent.click(dialog.getByRole('button', { name: 'Cancel' }))
    const reopened = openDialog()

    expect(reopened.getByLabelText('Name')).toHaveValue('')
    expect(reopened.getByLabelText('Email')).toHaveValue('')
    expect(reopened.getByLabelText('Password')).toHaveValue('')
    expect(reopened.queryByText('Name must be at least 3 characters')).not.toBeInTheDocument()
  })
})
