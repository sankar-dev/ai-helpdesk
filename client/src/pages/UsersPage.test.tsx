import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { apiGet, apiPatch, apiPost } from '@/lib/api'
import UsersPage from './UsersPage'

vi.mock('@/lib/api', () => ({ apiGet: vi.fn(), apiPost: vi.fn(), apiPatch: vi.fn() }))
// The edit dialog reads the session to refresh it after a self-edit
vi.mock('@/lib/auth-client', () => ({
  useSession: () => ({ data: { user: { id: 'current-admin' } }, refetch: vi.fn() }),
}))

const mockApiGet = vi.mocked(apiGet)
const mockApiPost = vi.mocked(apiPost)
const mockApiPatch = vi.mocked(apiPatch)

const admin = {
  id: '1',
  name: 'Ada Admin',
  email: 'ada@example.com',
  role: 'admin',
  createdAt: '2026-01-15T12:00:00.000Z',
}
const agent = {
  id: '2',
  name: 'Sam Agent',
  email: 'sam@example.com',
  role: 'agent',
  createdAt: '2026-03-20T12:00:00.000Z',
}

function renderPage() {
  // A fresh client per test keeps the cache isolated. The app's client retries, which would delay the error state.
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return render(
    <QueryClientProvider client={queryClient}>
      <UsersPage />
    </QueryClientProvider>,
  )
}

function expectTableHeaders() {
  for (const name of ['Name', 'Email', 'Role', 'Created']) {
    expect(screen.getByRole('columnheader', { name })).toBeInTheDocument()
  }
}

describe('UsersPage', () => {
  beforeEach(() => {
    mockApiGet.mockReset()
    mockApiPost.mockReset()
    mockApiPatch.mockReset()
  })

  it('requests the user list from the API', async () => {
    mockApiGet.mockResolvedValue({ users: [admin] })

    renderPage()

    await screen.findByRole('cell', { name: admin.name })
    expect(mockApiGet).toHaveBeenCalledTimes(1)
    expect(mockApiGet).toHaveBeenCalledWith('/api/users')
  })

  it('shows the page heading', async () => {
    mockApiGet.mockResolvedValue({ users: [] })

    renderPage()

    expect(screen.getByRole('heading', { level: 1, name: 'Users' })).toBeInTheDocument()
    await screen.findByText('No users yet.')
  })

  it('shows a skeleton table while loading', () => {
    mockApiGet.mockReturnValue(new Promise(() => {}))

    renderPage()

    const loading = screen.getByRole('status', { name: 'Loading users' })
    expectTableHeaders()
    // Five placeholder rows plus the header row
    expect(within(loading).getAllByRole('row')).toHaveLength(6)
    expect(screen.queryByText('No users yet.')).not.toBeInTheDocument()
    expect(screen.queryByText("Couldn't load users.")).not.toBeInTheDocument()
  })

  it('shows a row with the details of each user', async () => {
    mockApiGet.mockResolvedValue({ users: [admin, agent] })

    renderPage()

    const adminCell = await screen.findByRole('cell', { name: admin.name })
    expectTableHeaders()
    expect(screen.getAllByRole('row')).toHaveLength(3)

    const adminRow = within(adminCell.closest('tr')!)
    expect(adminRow.getByRole('cell', { name: admin.email })).toBeInTheDocument()
    expect(adminRow.getByRole('cell', { name: 'admin' })).toBeInTheDocument()
    expect(
      adminRow.getByRole('cell', { name: new Date(admin.createdAt).toLocaleDateString() }),
    ).toBeInTheDocument()

    const agentRow = within(screen.getByRole('cell', { name: agent.name }).closest('tr')!)
    expect(agentRow.getByRole('cell', { name: agent.email })).toBeInTheDocument()
    expect(agentRow.getByRole('cell', { name: 'agent' })).toBeInTheDocument()
    expect(
      agentRow.getByRole('cell', { name: new Date(agent.createdAt).toLocaleDateString() }),
    ).toBeInTheDocument()
  })

  it('removes the skeleton once users have loaded', async () => {
    mockApiGet.mockResolvedValue({ users: [admin] })

    renderPage()

    await screen.findByRole('cell', { name: admin.name })
    expect(screen.queryByRole('status', { name: 'Loading users' })).not.toBeInTheDocument()
  })

  it('gives admins and agents different role badges', async () => {
    mockApiGet.mockResolvedValue({ users: [admin, agent] })

    renderPage()

    expect(await screen.findByText('admin')).toHaveAttribute('data-variant', 'default')
    expect(screen.getByText('agent')).toHaveAttribute('data-variant', 'secondary')
  })

  it('shows an empty state instead of a table when there are no users', async () => {
    mockApiGet.mockResolvedValue({ users: [] })

    renderPage()

    expect(await screen.findByText('No users yet.')).toBeInTheDocument()
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
    expect(screen.queryByRole('status', { name: 'Loading users' })).not.toBeInTheDocument()
  })

  it('shows an error message instead of a table when the request fails', async () => {
    mockApiGet.mockRejectedValue(new Error('Request failed'))

    renderPage()

    expect(await screen.findByText("Couldn't load users.")).toBeInTheDocument()
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
    expect(screen.queryByText('No users yet.')).not.toBeInTheDocument()
    expect(screen.queryByRole('status', { name: 'Loading users' })).not.toBeInTheDocument()
  })

  describe('editing a user', () => {
    it('shows an edit button on each row', async () => {
      mockApiGet.mockResolvedValue({ users: [admin, agent] })

      renderPage()

      const adminRow = within(
        (await screen.findByRole('cell', { name: admin.name })).closest('tr')!,
      )
      expect(adminRow.getByRole('button', { name: `Edit ${admin.name}` })).toBeInTheDocument()
      const agentRow = within(screen.getByRole('cell', { name: agent.name }).closest('tr')!)
      expect(agentRow.getByRole('button', { name: `Edit ${agent.name}` })).toBeInTheDocument()
    })

    it('saves the changes and shows them in the list', async () => {
      const renamed = { ...agent, name: 'Samantha Agent' }
      mockApiGet.mockResolvedValueOnce({ users: [admin, agent] })
      mockApiGet.mockResolvedValueOnce({ users: [admin, renamed] })
      mockApiPatch.mockResolvedValue({})
      renderPage()

      fireEvent.click(await screen.findByRole('button', { name: `Edit ${agent.name}` }))
      const dialog = within(screen.getByRole('dialog', { name: 'Edit user' }))
      expect(dialog.getByLabelText('Email')).toHaveValue(agent.email)
      fireEvent.change(dialog.getByLabelText('Name'), { target: { value: renamed.name } })
      fireEvent.click(dialog.getByRole('button', { name: 'Save changes' }))

      expect(await screen.findByRole('cell', { name: renamed.name })).toBeInTheDocument()
      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
      expect(mockApiPatch).toHaveBeenCalledWith(`/api/users/${agent.id}`, {
        name: renamed.name,
        email: agent.email,
      })
      expect(mockApiGet).toHaveBeenCalledTimes(2)
    })
  })

  describe('creating a user', () => {
    function newUserButton() {
      return screen.getByRole('button', { name: 'New user' })
    }

    it('shows the New user button while the list is loading', () => {
      mockApiGet.mockReturnValue(new Promise(() => {}))

      renderPage()

      expect(newUserButton()).toBeInTheDocument()
    })

    it('shows the New user button above the user list', async () => {
      mockApiGet.mockResolvedValue({ users: [admin] })

      renderPage()

      const table = (await screen.findByRole('cell', { name: admin.name })).closest('table')!
      expect(
        newUserButton().compareDocumentPosition(table) & Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy()
    })

    it('shows the New user button when there are no users', async () => {
      mockApiGet.mockResolvedValue({ users: [] })

      renderPage()

      await screen.findByText('No users yet.')
      expect(newUserButton()).toBeInTheDocument()
    })

    it('shows the New user button when the list fails to load', async () => {
      mockApiGet.mockRejectedValue(new Error('Request failed'))

      renderPage()

      await screen.findByText("Couldn't load users.")
      expect(newUserButton()).toBeInTheDocument()
    })

    it('closes the modal and shows the new user in the list', async () => {
      mockApiGet.mockResolvedValueOnce({ users: [admin] })
      mockApiGet.mockResolvedValueOnce({ users: [admin, agent] })
      mockApiPost.mockResolvedValue({})
      renderPage()
      await screen.findByRole('cell', { name: admin.name })
      expect(screen.queryByRole('cell', { name: agent.name })).not.toBeInTheDocument()

      fireEvent.click(newUserButton())
      const dialog = within(screen.getByRole('dialog', { name: 'New user' }))
      fireEvent.change(dialog.getByLabelText('Name'), { target: { value: agent.name } })
      fireEvent.change(dialog.getByLabelText('Email'), { target: { value: agent.email } })
      fireEvent.change(dialog.getByLabelText('Password'), { target: { value: 'correct-horse' } })
      fireEvent.click(dialog.getByRole('button', { name: 'Create user' }))

      expect(await screen.findByRole('cell', { name: agent.name })).toBeInTheDocument()
      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
      expect(mockApiPost).toHaveBeenCalledWith('/api/users', {
        name: agent.name,
        email: agent.email,
        password: 'correct-horse',
      })
      expect(mockApiGet).toHaveBeenCalledTimes(2)
    })

    it('does not reload the list when creating the user fails', async () => {
      mockApiGet.mockResolvedValue({ users: [admin] })
      mockApiPost.mockRejectedValue(new Error('Request failed'))
      renderPage()
      await screen.findByRole('cell', { name: admin.name })

      fireEvent.click(newUserButton())
      const dialog = within(screen.getByRole('dialog', { name: 'New user' }))
      fireEvent.change(dialog.getByLabelText('Name'), { target: { value: agent.name } })
      fireEvent.change(dialog.getByLabelText('Email'), { target: { value: agent.email } })
      fireEvent.change(dialog.getByLabelText('Password'), { target: { value: 'correct-horse' } })
      fireEvent.click(dialog.getByRole('button', { name: 'Create user' }))

      await dialog.findByRole('alert')
      expect(mockApiGet).toHaveBeenCalledTimes(1)
    })
  })
})
