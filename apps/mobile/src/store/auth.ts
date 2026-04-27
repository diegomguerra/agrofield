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
}

interface JwtPayload {
  sub?: string
  tenant_id?: string
  role?: string
}

/**
 * Garante que user.tenant_id (e id/role) estão presentes — mesmo que a API
 * não tenha retornado, extraímos do JWT (que já contém esses claims).
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
    (set) => ({
      token: null,
      user: null,
      login: (token, user) =>
        set({ token, user: ensureUserClaimsFromToken(token, user) }),
      logout: () => set({ token: null, user: null }),
    }),
    {
      name: 'agrofield-auth',
      storage: createJSONStorage(() => AsyncStorage),
      // Quando o estado persistido é re-hidratado no boot, patcha o user
      // com claims do JWT — corrige perfis antigos sem tenant_id.
      onRehydrateStorage: () => (state) => {
        if (state?.token && state.user) {
          state.user = ensureUserClaimsFromToken(state.token, state.user)
        }
      },
    }
  )
)
