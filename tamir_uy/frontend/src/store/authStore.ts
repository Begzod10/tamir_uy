import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface AuthUser {
  id: string
  phone: string
  name: string
}

interface AuthStore {
  token: string | null
  user: AuthUser | null

  // Derived
  isAuthenticated: boolean

  // Actions
  setToken(token: string): void
  setUser(user: AuthUser): void
  logout(): void
}

// ─── Store ────────────────────────────────────────────────────────────────────

export const useAuthStore = create<AuthStore>()(
  persist(
    (set) => ({
      token: null,
      user: null,
      isAuthenticated: false,

      setToken(token) {
        set({ token, isAuthenticated: true })
      },

      setUser(user) {
        set({ user })
      },

      logout() {
        set({ token: null, user: null, isAuthenticated: false })
      },
    }),
    {
      name: 'uy-tamir-auth',
      storage: createJSONStorage(() => localStorage),
      // Only persist token; user is re-fetched on app boot if needed
      partialize: (state) => ({
        token: state.token,
        user: state.user,
        isAuthenticated: state.isAuthenticated,
      }),
      // Rehydrate isAuthenticated from persisted token
      onRehydrateStorage: () => (state) => {
        if (state) {
          state.isAuthenticated = state.token !== null
        }
      },
    },
  ),
)

// ─── Selectors ────────────────────────────────────────────────────────────────

/** Typed selector — avoids re-renders when unrelated slice changes. */
export const selectToken = (s: AuthStore) => s.token
export const selectUser = (s: AuthStore) => s.user
export const selectIsAuthenticated = (s: AuthStore) => s.isAuthenticated
