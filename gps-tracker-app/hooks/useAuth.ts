import { useEffect, useState } from 'react'
import { getAuth, onAuthStateChanged } from '@react-native-firebase/auth'
import type { FirebaseAuthTypes } from '@react-native-firebase/auth'
import { ensureFirebaseApp } from '../services/firebaseApp'

// undefined = loading, null = not logged in, User = logged in
export type AuthState = FirebaseAuthTypes.User | null | undefined

export function useAuth(): AuthState {
  const [user, setUser] = useState<AuthState>(undefined)

  useEffect(() => {
    if (!ensureFirebaseApp()) {
      setUser(null)
      return
    }
    const unsub = onAuthStateChanged(getAuth(), (u) => setUser(u ?? null))
    return unsub
  }, [])

  return user
}
