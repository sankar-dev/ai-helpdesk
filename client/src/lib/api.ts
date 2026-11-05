import axios, { type AxiosRequestConfig } from 'axios'

// Same-origin requests, so the session cookie is sent by default. Axios rejects non-2xx with an AxiosError, so TanStack Query sees the error.
// silentJSONParsing is off so a 2xx non-JSON body (e.g. an HTML page) rejects instead of resolving as a string.
export const api = axios.create({
  responseType: 'json',
  transitional: { silentJSONParsing: false },
})

export async function apiGet<T>(path: string, config?: AxiosRequestConfig): Promise<T> {
  const res = await api.get<T>(path, config)
  return res.data
}

export async function apiPost<T>(
  path: string,
  data: unknown,
  config?: AxiosRequestConfig,
): Promise<T> {
  const res = await api.post<T>(path, data, config)
  return res.data
}
