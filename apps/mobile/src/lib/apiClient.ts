import axios, { AxiosInstance } from 'axios'
import { API_URL } from './config'
import { useAuthStore } from '../store/auth'
import { decodeJwt } from './jwt'

export const apiClient: AxiosInstance = axios.create({ baseURL: API_URL })

apiClient.interceptors.request.use((config) => {
  const token = useAuthStore.getState().token
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

let refreshPromise: Promise<string | null> | null = null

async function refreshToken(): Promise<string | null> {
  const token = useAuthStore.getState().token
  if (!token) return null
  try {
    const { data } = await axios.post(
      `${API_URL}/auth/refresh`,
      {},
      { headers: { Authorization: `Bearer ${token}` } }
    )
    useAuthStore.getState().setToken(data.token)
    return data.token
  } catch {
    return null
  }
}

apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    if (error.response?.status === 401 && !error.config?._retry) {
      error.config._retry = true
      if (!refreshPromise) {
        refreshPromise = refreshToken().finally(() => {
          refreshPromise = null
        })
      }
      const newToken = await refreshPromise
      if (newToken) {
        error.config.headers.Authorization = `Bearer ${newToken}`
        return apiClient(error.config)
      }
      useAuthStore.getState().logout()
      error.isAuthFailure = true
      return Promise.reject(error)
    }
    return Promise.reject(error)
  }
)

export async function maybeRefreshToken(): Promise<void> {
  const token = useAuthStore.getState().token
  if (!token) return
  const payload = decodeJwt<{ exp?: number }>(token)
  if (!payload?.exp) return
  const TWO_DAYS_MS = 2 * 24 * 60 * 60 * 1000
  if (payload.exp * 1000 - Date.now() < TWO_DAYS_MS) {
    await refreshToken()
  }
}
