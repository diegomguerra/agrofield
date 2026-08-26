import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { decodeJwt } from '../lib/jwt'

interface User {
  id: string
  name: string
  role: string
  tenant_id: string
}

interface AuthState {
  token: string | null
  user: User | null
  login: (token: string, user: User) => void
  logout: () => void
  isTokenValid: () => boolean
  setToken: (token: string) => void
}

interface JwtPayload {
  sub?: string
  tenant_id?: string
  role?: string
  exp?: number
}

/**
 * Garante que user.tenant_id (e id/role) estao presentes — mesmo que a API
 * nao tenha retornado, extraimos do JWT (que ja contem esses claims).
 */
function ensureUserClaimsFromToken(token: string, user: User): User {
  const payload = decodeJwt<JwtPayload>(token)
  if (!payload) return user
  return {
    ...user,
    id: user.id || payload.sub || '',
    tenant_id: user.tenant_id || payload.tenant_id || '',
    role: user.role || payload.role || '',
  }
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      token: null,
      user: null,
      login: (token, user) =>
        set({ token, user: ensureUserClaimsFromToken(token, user) }),
      logout: () => set({ token: null, user: null }),
      setToken: (token) => {
        const { user } = get()
        set({ token, user: user ? ensureUserClaimsFromToken(token, user) : user })
      },
      isTokenValid: () => {
        const { token } = get()
        if (!token) return false
        const payload = decodeJwt<JwtPayload>(token)
        if (!payload?.exp) return true // token sem exp = nao expira
        return payload.exp * 1000 > Date.now()
      },
    }),
    {
      name: 'agrofield-auth',
      storage: createJSONStorage(() => AsyncStorage),
      onRehydrateStorage: () => (state) => {
        if (state?.token && state.user) {
          state.user = ensureUserClaimsFromToken(state.token, state.user)
        }
      },
    }
  )
)
