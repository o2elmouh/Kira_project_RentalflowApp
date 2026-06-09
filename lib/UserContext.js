import { createContext, useContext } from 'react'

export const UserContext = createContext({
  user: null,
  profile: null,
  role: null,
  isAdmin: false,
})

export function useUser() {
  return useContext(UserContext)
}

/** Returns true if the current user is an admin */
export function useIsAdmin() {
  const { isAdmin } = useContext(UserContext)
  return isAdmin
}
