import { createContext, useContext } from 'react'

export const UserContext = createContext({ user: null, profile: null, role: null })

export function useUser() {
  return useContext(UserContext)
}

/** Returns true if the current user is an admin */
export function useIsAdmin() {
  const { role } = useContext(UserContext)
  return role === 'admin'
}
