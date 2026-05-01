import { useEffect, useMemo, useState } from 'react'
import type { FirebaseAuthTypes } from '@react-native-firebase/auth'
import { loadUserProfileCache, type CachedUserProfile } from '../services/userProfileCache'

export function useCachedUserProfile(user: FirebaseAuthTypes.User | null | undefined) {
  const [cached, setCached] = useState<CachedUserProfile | null>(null)

  useEffect(() => {
    let mounted = true
    ;(async () => {
      const uid = user?.uid
      if (!uid) {
        if (mounted) setCached(null)
        return
      }
      const data = await loadUserProfileCache(uid)
      if (mounted) setCached(data)
    })()
    return () => { mounted = false }
  }, [user?.uid])

  const displayName = useMemo(() => {
    const provider = user?.providerData?.find((p) => !!p?.displayName)?.displayName
    return user?.displayName ?? provider ?? cached?.displayName ?? null
  }, [user, cached])

  const photoURL = useMemo(() => {
    const provider = user?.providerData?.find((p) => !!p?.photoURL)?.photoURL
    return user?.photoURL ?? provider ?? cached?.photoURL ?? null
  }, [user, cached])

  const email = useMemo(() => {
    const provider = user?.providerData?.find((p) => !!p?.email)?.email
    return user?.email ?? provider ?? cached?.email ?? null
  }, [user, cached])

  return { displayName, photoURL, email }
}

