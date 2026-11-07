import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { AxiosError, type AxiosResponse } from 'axios'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Dialog } from '@/components/ui/dialog'
import { apiPost } from '@/lib/api'
import CreateUserForm from './CreateUserForm'

vi.mock('@/lib/api', () => ({ apiPost: vi.fn() }))

const mockApiPost = vi.mocked(apiPost)

const valid = { name: 'Sam Agent', email: 'sam@example.com', password: 'correct-horse' }

function renderForm() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  const invalidate = vi.spyOn(queryClient, 'invalidateQueries')
  const onCreated = vi.fn()
  render(
    <QueryClientProvider client={queryClient}>
      {/* The Cancel button needs a surrounding dialog */}
      <Dialog open>
        <CreateUserForm onCreated={onCreated} />
      </Dialog>
    </QueryClientProvider>,
  )
  return { invalidate, onCreated }
}

function fillAndSubmit(values: Partial<typeof valid> = {}) {
  const { name, email, password } = { ...valid, ...values }
  fireEvent.change(screen.getByLabelText('Name'), { target: { value: name } })
  fireEvent.change(screen.getByLabelText('Email'), { target: { value: email } })
  fireEvent.change(screen.getByLabelText('Password'), { target: { value: password } })
  fireEvent.click(screen.getByRole('button', { name: 'Create user' }))
}

function conflictError() {
  return new AxiosError('Conflict', undefined, undefined, undefined, {
    status: 409,
  } as AxiosResponse)
}

describe('CreateUserForm', () => {
  beforeEach(() => {
    mockApiPost.mockReset()
  })

  it('shows empty name, email and password fields', () => {
    renderForm()

    expect(screen.getByLabelText('Name')).toHaveValue('')
    expect(screen.getByLabelText('Email')).toHaveValue('')
    expect(screen.getByLabelText('Email')).toHaveAttribute('type', 'email')
    expect(screen.getByLabelText('Password')).toHaveValue('')
    expect(screen.getByLabelText('Password')).toHaveAttribute('type', 'password')
  })

  describe('validation', () => {
    it('shows an error on every field when submitted empty', async () => {
      renderForm()

      fireEvent.click(screen.getByRole('button', { name: 'Create user' }))

      expect(await screen.findByText('Name must be at least 3 characters')).toBeInTheDocument()
      expect(screen.getByText('Enter a valid email address')).toBeInTheDocument()
      expect(screen.getByText('Password must be at least 8 characters')).toBeInTheDocument()
      expect(mockApiPost).not.toHaveBeenCalled()
    })

    it.each([
      ['a name shorter than 3 characters', { name: 'Al' }, 'Name must be at least 3 characters'],
      [
        'a name that is only short once trimmed',
        { name: '   Al   ' },
        'Name must be at least 3 characters',
      ],
      ['an invalid email', { email: 'not-an-email' }, 'Enter a valid email address'],
      [
        'a password shorter than 8 characters',
        { password: '1234567' },
        'Password must be at least 8 characters',
      ],
      [
        'a password longer than 128 characters',
        { password: 'x'.repeat(129) },
        'Password must be at most 128 characters',
      ],
    ])('rejects %s', async (_label, values, message) => {
      const { onCreated } = renderForm()

      fillAndSubmit(values)

      expect(await screen.findByText(message)).toBeInTheDocument()
      expect(mockApiPost).not.toHaveBeenCalled()
      expect(onCreated).not.toHaveBeenCalled()
    })

    it('marks only the invalid field', async () => {
      renderForm()

      fillAndSubmit({ name: 'Al' })

      await screen.findByText('Name must be at least 3 characters')
      expect(screen.getByLabelText('Name')).toHaveAttribute('aria-invalid', 'true')
      expect(screen.getByLabelText('Email')).toHaveAttribute('aria-invalid', 'false')
      expect(screen.getByLabelText('Password')).toHaveAttribute('aria-invalid', 'false')
    })

    it('accepts values of exactly the minimum length', async () => {
      mockApiPost.mockResolvedValue({})
      const { onCreated } = renderForm()

      fillAndSubmit({ name: 'Ali', password: '12345678' })

      await waitFor(() => expect(onCreated).toHaveBeenCalledTimes(1))
      expect(mockApiPost).toHaveBeenCalledWith('/api/users', {
        name: 'Ali',
        email: valid.email,
        password: '12345678',
      })
    })

    it('accepts a password of exactly the maximum length', async () => {
      mockApiPost.mockResolvedValue({})
      const { onCreated } = renderForm()

      fillAndSubmit({ password: 'x'.repeat(128) })

      await waitFor(() => expect(onCreated).toHaveBeenCalledTimes(1))
    })
  })

  describe('submitting', () => {
    it('posts the values, refreshes the user list and reports success', async () => {
      mockApiPost.mockResolvedValue({})
      const { invalidate, onCreated } = renderForm()

      fillAndSubmit()

      await waitFor(() => expect(onCreated).toHaveBeenCalledTimes(1))
      expect(mockApiPost).toHaveBeenCalledTimes(1)
      expect(mockApiPost).toHaveBeenCalledWith('/api/users', valid)
      expect(invalidate).toHaveBeenCalledWith({ queryKey: ['users'] })
    })

    it('trims the name before sending it', async () => {
      mockApiPost.mockResolvedValue({})
      const { onCreated } = renderForm()

      fillAndSubmit({ name: '  Sam Agent  ' })

      await waitFor(() => expect(onCreated).toHaveBeenCalledTimes(1))
      expect(mockApiPost).toHaveBeenCalledWith('/api/users', valid)
    })

    it('disables the submit button while the request is pending', async () => {
      mockApiPost.mockReturnValue(new Promise(() => {}))
      const { onCreated } = renderForm()

      fillAndSubmit()

      expect(await screen.findByRole('button', { name: 'Creating…' })).toBeDisabled()
      expect(onCreated).not.toHaveBeenCalled()
    })
  })

  describe('errors', () => {
    it('marks the email field when the email is already taken', async () => {
      mockApiPost.mockRejectedValue(conflictError())
      const { invalidate, onCreated } = renderForm()

      fillAndSubmit()

      expect(await screen.findByText('A user with this email already exists')).toBeInTheDocument()
      expect(screen.getByLabelText('Email')).toHaveAttribute('aria-invalid', 'true')
      expect(screen.queryByRole('alert')).not.toBeInTheDocument()
      expect(onCreated).not.toHaveBeenCalled()
      expect(invalidate).not.toHaveBeenCalled()
    })

    it('shows a general error when the request fails for another reason', async () => {
      mockApiPost.mockRejectedValue(new Error('Request failed'))
      const { invalidate, onCreated } = renderForm()

      fillAndSubmit()

      expect(await screen.findByRole('alert')).toHaveTextContent(
        "Couldn't create the user. Try again.",
      )
      expect(onCreated).not.toHaveBeenCalled()
      expect(invalidate).not.toHaveBeenCalled()
    })

    it('keeps the typed values and can be retried after a failure', async () => {
      mockApiPost.mockRejectedValueOnce(new Error('Request failed'))
      mockApiPost.mockResolvedValueOnce({})
      const { onCreated } = renderForm()

      fillAndSubmit()
      await screen.findByRole('alert')
      expect(screen.getByLabelText('Name')).toHaveValue(valid.name)
      expect(screen.getByLabelText('Email')).toHaveValue(valid.email)
      expect(screen.getByLabelText('Password')).toHaveValue(valid.password)

      fireEvent.click(screen.getByRole('button', { name: 'Create user' }))

      await waitFor(() => expect(onCreated).toHaveBeenCalledTimes(1))
      expect(mockApiPost).toHaveBeenCalledTimes(2)
      expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    })
  })
})
