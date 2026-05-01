import {
  AppleAuthProvider,
  GoogleAuthProvider,
  getAuth,
  signInWithCredential,
  signOut as firebaseSignOut,
} from '@react-native-firebase/auth'
import { GoogleSignin } from '@react-native-google-signin/google-signin'
import * as AppleAuthentication from 'expo-apple-authentication'
import { Platform } from 'react-native'
import { ensureFirebaseApp } from './firebaseApp'

const WEB_CLIENT_ID = process.env.GOOGLE_WEB_CLIENT_ID ?? ''

GoogleSignin.configure({ webClientId: WEB_CLIENT_ID })

export async function signInWithGoogle(): Promise<void> {
  if (!ensureFirebaseApp()) throw new Error('Firebase non configurato: manca google-services.json su Android o GoogleService-Info.plist su iOS')
  if (Platform.OS === 'android') {
    await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true })
  }
  const { data } = await GoogleSignin.signIn()
  const credential = GoogleAuthProvider.credential(data?.idToken ?? null)
  const credUser = await signInWithCredential(getAuth(), credential)

  // Persist profile fields when provider returns them (useful for header/avatar rendering).
  const googleUser = (data as any)?.user
  const displayName = googleUser?.name as string | undefined
  const photoURL = googleUser?.photo as string | undefined
  if (displayName || photoURL) {
    await credUser.user.updateProfile({
      displayName: displayName ?? credUser.user.displayName ?? undefined,
      photoURL: photoURL ?? credUser.user.photoURL ?? undefined,
    })
  }
}

export async function signInWithApple(): Promise<void> {
  if (!ensureFirebaseApp()) throw new Error('Firebase non configurato: manca google-services.json su Android o GoogleService-Info.plist su iOS')
  const credential = await AppleAuthentication.signInAsync({
    requestedScopes: [
      AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
      AppleAuthentication.AppleAuthenticationScope.EMAIL,
    ],
  })
  const appleCredential = AppleAuthProvider.credential(
    credential.identityToken!,
    credential.authorizationCode!,
  )
  const credUser = await signInWithCredential(getAuth(), appleCredential)

  // Apple returns full name only on first authorization. Persist it when available.
  const parts = [credential.fullName?.givenName, credential.fullName?.familyName].filter(Boolean)
  const fullName = parts.join(' ').trim()
  if (fullName.length > 0 && !credUser.user.displayName) {
    await credUser.user.updateProfile({ displayName: fullName })
  }
}

export async function signOut(): Promise<void> {
  try { await GoogleSignin.signOut() } catch {}
  if (!ensureFirebaseApp()) return
  await firebaseSignOut(getAuth())
}

export function currentUser() {
  if (!ensureFirebaseApp()) return null
  return getAuth().currentUser
}

export function isAppleAvailable(): boolean {
  return Platform.OS === 'ios'
}

export function formatAuthError(e: any): string {
  const code = typeof e?.code === 'string' ? e.code : 'unknown_error'
  const message = typeof e?.message === 'string' ? e.message : 'Errore sconosciuto'
  return `${code}: ${message}`
}

export async function hydrateCurrentUserProfileFromProvider(): Promise<void> {
  if (!ensureFirebaseApp()) return
  const auth = getAuth()
  const user = auth.currentUser
  if (!user) return

  const providerIds = user.providerData.map((p) => p.providerId)
  const hasGoogle = providerIds.includes('google.com')

  // If profile is already complete, do nothing.
  if (user.displayName && user.photoURL) return

  if (hasGoogle) {
    // RN Google Sign-In can still expose name/photo even when Firebase user lacks them.
    const googleCurrent = GoogleSignin.getCurrentUser() as any
    const gUser = googleCurrent?.user
    const displayName =
      user.displayName ??
      gUser?.name ??
      (([gUser?.givenName, gUser?.familyName].filter(Boolean).join(' ').trim()) || undefined)
    const photoURL = user.photoURL ?? gUser?.photo ?? undefined

    if (displayName || photoURL) {
      await user.updateProfile({
        displayName,
        photoURL,
      })
      await user.reload()
    }
  }
}
