import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { apiGet } from '@/lib/api'
import UsersPage from './UsersPage'

vi.mock('@/lib/api', () => ({ apiGet: vi.fn(), apiPost: vi.fn() }))

const mockApiGet = vi.mocked(apiGet)

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
})
