import type { FirebaseAuthTypes } from '@react-native-firebase/auth'

export type CachedUserProfile = {
  displayName: string | null
  photoURL: string | null
  email: string | null
}

const KEY_PREFIX = 'user_profile_cache_'

async function safeStorage() {
  try {
    const AS = require('@react-native-async-storage/async-storage').default
    if (AS && typeof AS.getItem === 'function') return AS as typeof import('@react-native-async-storage/async-storage').default
  } catch {}
  return null
}

function pickProfileFromUser(user: FirebaseAuthTypes.User): CachedUserProfile {
  const providerName = user.providerData.find((p) => !!p.displayName)?.displayName ?? null
  const providerPhoto = user.providerData.find((p) => !!p.photoURL)?.photoURL ?? null
  const providerEmail = user.providerData.find((p) => !!p.email)?.email ?? null
  return {
    displayName: user.displayName ?? providerName,
    photoURL: user.photoURL ?? providerPhoto,
    email: user.email ?? providerEmail,
  }
}

export async function saveUserProfileCache(user: FirebaseAuthTypes.User): Promise<void> {
  const AS = await safeStorage()
  if (!AS) return
  const payload = pickProfileFromUser(user)
  await AS.setItem(`${KEY_PREFIX}${user.uid}`, JSON.stringify(payload))
}

export async function loadUserProfileCache(uid: string): Promise<CachedUserProfile | null> {
  const AS = await safeStorage()
  if (!AS) return null
  const raw = await AS.getItem(`${KEY_PREFIX}${uid}`)
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw)
    return {
      displayName: typeof parsed?.displayName === 'string' ? parsed.displayName : null,
      photoURL: typeof parsed?.photoURL === 'string' ? parsed.photoURL : null,
      email: typeof parsed?.email === 'string' ? parsed.email : null,
    }
  } catch {
    return null
  }
}

