import auth from '@react-native-firebase/auth'
import { GoogleSignin } from '@react-native-google-signin/google-signin'
import * as AppleAuthentication from 'expo-apple-authentication'
import { Platform } from 'react-native'

const WEB_CLIENT_ID = process.env.GOOGLE_WEB_CLIENT_ID ?? ''

GoogleSignin.configure({ webClientId: WEB_CLIENT_ID })

export async function signInWithGoogle(): Promise<void> {
  await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true })
  const { data } = await GoogleSignin.signIn()
  const credential = auth.GoogleAuthProvider.credential(data?.idToken ?? null)
  await auth().signInWithCredential(credential)
}

export async function signInWithApple(): Promise<void> {
  const credential = await AppleAuthentication.signInAsync({
    requestedScopes: [
      AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
      AppleAuthentication.AppleAuthenticationScope.EMAIL,
    ],
  })
  const appleCredential = auth.AppleAuthProvider.credential(
    credential.identityToken!,
    credential.authorizationCode!,
  )
  await auth().signInWithCredential(appleCredential)
}

export async function signOut(): Promise<void> {
  try { await GoogleSignin.signOut() } catch {}
  await auth().signOut()
}

export function currentUser() {
  return auth().currentUser
}

export function isAppleAvailable(): boolean {
  return Platform.OS === 'ios'
}
