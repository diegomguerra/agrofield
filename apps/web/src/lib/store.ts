import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface User {
  id: string
  name: string
  role: string
}

interface AuthState {
  token: string | null
  user: User | null
  login: (token: string, user: User) => void
  logout: () => void
  isAuthenticated: () => boolean
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      token: null,
      user: null,
      login: (token, user) => {
        if (typeof window !== 'undefined') {
          localStorage.setItem('af_token', token)
        }
        set({ token, user })
      },
      logout: () => {
        if (typeof window !== 'undefined') {
          localStorage.removeItem('af_token')
        }
        set({ token: null, user: null })
      },
      isAuthenticated: () => !!get().token,
    }),
    {
      name: 'agrofield-auth',
      partialize: (state) => ({ token: state.token, user: state.user }),
    }
  )
)
