import { useEffect, useState } from 'react'
import auth from '@react-native-firebase/auth'
import type { FirebaseAuthTypes } from '@react-native-firebase/auth'

// undefined = loading, null = not logged in, User = logged in
export type AuthState = FirebaseAuthTypes.User | null | undefined

export function useAuth(): AuthState {
  const [user, setUser] = useState<AuthState>(undefined)

  useEffect(() => {
    const unsub = auth().onAuthStateChanged((u) => setUser(u ?? null))
    return unsub
  }, [])

  return user
}
