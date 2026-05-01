import firestore from '@react-native-firebase/firestore'
import { getAuth } from '@react-native-firebase/auth'
import { ensureFirebaseApp } from './firebaseApp'

export interface DeviceInfo {
  id: string
  name: string
  ownerId: string
  createdAt: number
  lastSeen: number | null
  subscription: {
    plan: 'free' | 'pro'
    trialEnd: number
    expiresAt: number | null
    stripeSubscriptionId: string | null
  }
}

const TRIAL_DAYS    = 14
const MS_PER_DAY    = 86_400_000

export async function claimDevice(deviceId: string, name: string): Promise<void> {
  if (!ensureFirebaseApp()) throw new Error('Firebase non configurato')
  const uid = getAuth().currentUser?.uid
  if (!uid) throw new Error('Not authenticated')

  const existing = await firestore().collection('devices').doc(deviceId).get()
  if (existing.exists()) {
    if (existing.data()!.ownerId !== uid) throw new Error('Device già associato a un altro account')
    return
  }

  const now = Date.now()
  await firestore().collection('devices').doc(deviceId).set({
    ownerId: uid,
    name,
    createdAt: now,
    lastSeen: null,
    subscription: {
      plan: 'free',
      trialEnd: now + TRIAL_DAYS * MS_PER_DAY,
      expiresAt: null,
      stripeSubscriptionId: null,
    },
  })
}

export async function isDeviceClaimed(deviceId: string): Promise<{ claimed: boolean; isOwner: boolean }> {
  if (!ensureFirebaseApp()) return { claimed: false, isOwner: false }
  const doc = await firestore().collection('devices').doc(deviceId).get()
  if (!doc.exists) return { claimed: false, isOwner: false }
  const uid = getAuth().currentUser?.uid
  return { claimed: true, isOwner: doc.data()!.ownerId === uid }
}

export async function listUserDevices(): Promise<DeviceInfo[]> {
  if (!ensureFirebaseApp()) return []
  const uid = getAuth().currentUser?.uid
  if (!uid) return []
  const snap = await firestore()
    .collection('devices')
    .where('ownerId', '==', uid)
    .orderBy('createdAt', 'desc')
    .get()
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as DeviceInfo))
}

export function getTrialStatus(device: DeviceInfo): {
  isTrialActive: boolean
  isProActive: boolean
  daysLeft: number
  needsSubscription: boolean
} {
  const now = Date.now()
  const isProActive = device.subscription.plan === 'pro' &&
    (device.subscription.expiresAt === null || device.subscription.expiresAt > now)
  const isTrialActive = !isProActive && device.subscription.trialEnd > now
  const daysLeft = Math.max(0, Math.ceil((device.subscription.trialEnd - now) / MS_PER_DAY))
  return { isTrialActive, isProActive, daysLeft, needsSubscription: !isTrialActive && !isProActive }
}

export async function updateDeviceName(deviceId: string, name: string): Promise<void> {
  if (!ensureFirebaseApp()) throw new Error('Firebase non configurato')
  const uid = getAuth().currentUser?.uid
  if (!uid) throw new Error('Not authenticated')
  await firestore().collection('devices').doc(deviceId).update({ name })
}

export async function touchLastSeen(deviceId: string): Promise<void> {
  try {
    await firestore().collection('devices').doc(deviceId).update({ lastSeen: Date.now() })
  } catch {}
}
