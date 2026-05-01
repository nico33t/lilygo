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
  await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true })
  const { data } = await GoogleSignin.signIn()
  const credential = GoogleAuthProvider.credential(data?.idToken ?? null)
  await signInWithCredential(getAuth(), credential)
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
  await signInWithCredential(getAuth(), appleCredential)
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
