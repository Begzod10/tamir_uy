import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import type { AuthUser } from '@/lib/api'

export type { AuthUser }

interface AuthStore {
  user: AuthUser | null
  isAuthenticated: boolean

  setAuthenticated(user: AuthUser): void
  setUser(user: AuthUser): void
  logout(): void
}

export const useAuthStore = create<AuthStore>()(
  persist(
    (set) => ({
      user: null,
      isAuthenticated: false,

      setAuthenticated(user) {
        set({ user, isAuthenticated: true })
      },

      setUser(user) {
        set({ user })
      },

      logout() {
        set({ user: null, isAuthenticated: false })
      },
    }),
    {
      name: 'uy-tamir-auth',
      storage: createJSONStorage(() => localStorage),
      // Only persist the flag and user profile — the JWT stays in the HttpOnly cookie
      partialize: (state) => ({
        user: state.user,
        isAuthenticated: state.isAuthenticated,
      }),
    },
  ),
)

export const selectUser = (s: AuthStore) => s.user
export const selectIsAuthenticated = (s: AuthStore) => s.isAuthenticated
