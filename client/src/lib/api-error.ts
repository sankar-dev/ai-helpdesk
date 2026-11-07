import { isAxiosError } from 'axios'

// Kept apart from api.ts so component tests that mock '@/lib/api' still get the real helpers.

// The HTTP status of a failed API request, or undefined for a network or non-HTTP error
export function apiErrorStatus(error: unknown): number | undefined {
  return isAxiosError(error) ? error.response?.status : undefined
}

// The `error` message from an API error response body, if it has one
export function apiErrorMessage(error: unknown): string | undefined {
  if (!isAxiosError<{ error?: unknown }>(error)) return undefined
  const message = error.response?.data?.error
  return typeof message === 'string' ? message : undefined
}
