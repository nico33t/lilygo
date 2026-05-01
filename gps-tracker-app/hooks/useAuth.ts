import { useEffect, useState } from 'react'
import { getAuth, onAuthStateChanged } from '@react-native-firebase/auth'
import type { FirebaseAuthTypes } from '@react-native-firebase/auth'
import { ensureFirebaseApp } from '../services/firebaseApp'
import { hydrateCurrentUserProfileFromProvider } from '../services/authService'
import { saveUserProfileCache } from '../services/userProfileCache'

// undefined = loading, null = not logged in, User = logged in
export type AuthState = FirebaseAuthTypes.User | null | undefined

export function useAuth(): AuthState {
  const [user, setUser] = useState<AuthState>(undefined)

  useEffect(() => {
    if (!ensureFirebaseApp()) {
      setUser(null)
      return
    }
    const unsub = onAuthStateChanged(getAuth(), async (u) => {
      setUser(u ?? null)
      if (u) {
        try {
          await hydrateCurrentUserProfileFromProvider()
          const resolved = getAuth().currentUser ?? u
          setUser(resolved)
          await saveUserProfileCache(resolved)
        } catch {}
      }
    })
    return unsub
  }, [])

  return user
}
