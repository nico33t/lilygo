import { getApp, getApps } from '@react-native-firebase/app'

export function hasFirebaseApp(): boolean {
  return getApps().length > 0
}

export function ensureFirebaseApp(): boolean {
  if (!hasFirebaseApp()) return false
  getApp()
  return true
}

