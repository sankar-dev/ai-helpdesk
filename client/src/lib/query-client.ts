import { QueryClient } from '@tanstack/react-query'
import { isAxiosError } from 'axios'

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Retrying won't fix a missing session or role, so fail fast on 401/403
      retry: (failureCount, error) => {
        const status = isAxiosError(error) ? error.response?.status : undefined
        return status !== 401 && status !== 403 && failureCount < 3
      },
    },
  },
})
