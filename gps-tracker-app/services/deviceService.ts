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

const TRIAL_DAYS = 14
const MS_PER_DAY = 86_400_000
const STORAGE_KEY_PREFIX = 'local_devices_'

async function safeStorage() {
  try {
    const AS = require('@react-native-async-storage/async-storage').default
    if (AS && typeof AS.getItem === 'function') return AS as typeof import('@react-native-async-storage/async-storage').default
  } catch {}
  return null
}

function requireUid(): string {
  if (!ensureFirebaseApp()) throw new Error('Firebase auth non configurato')
  const uid = getAuth().currentUser?.uid
  if (!uid) throw new Error('Not authenticated')
  return uid
}

async function loadOwnedDevices(uid: string): Promise<DeviceInfo[]> {
  const AS = await safeStorage()
  const raw = await AS?.getItem(`${STORAGE_KEY_PREFIX}${uid}`)
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed as DeviceInfo[] : []
  } catch {
    return []
  }
}

async function saveOwnedDevices(uid: string, devices: DeviceInfo[]): Promise<void> {
  const AS = await safeStorage()
  await AS?.setItem(`${STORAGE_KEY_PREFIX}${uid}`, JSON.stringify(devices))
}

export async function claimDevice(deviceId: string, name: string): Promise<void> {
  const uid = requireUid()
  const devices = await loadOwnedDevices(uid)
  const existing = devices.find((d) => d.id === deviceId)
  if (existing) return

  const now = Date.now()
  devices.unshift({
    id: deviceId,
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
  await saveOwnedDevices(uid, devices)
}

export async function isDeviceClaimed(deviceId: string): Promise<{ claimed: boolean; isOwner: boolean }> {
  if (!ensureFirebaseApp()) return { claimed: false, isOwner: false }
  const uid = getAuth().currentUser?.uid
  if (!uid) return { claimed: false, isOwner: false }
  const devices = await loadOwnedDevices(uid)
  const found = devices.some((d) => d.id === deviceId)
  return { claimed: found, isOwner: found }
}

export async function listUserDevices(): Promise<DeviceInfo[]> {
  if (!ensureFirebaseApp()) return []
  const uid = getAuth().currentUser?.uid
  if (!uid) return []
  const devices = await loadOwnedDevices(uid)
  return devices.sort((a, b) => b.createdAt - a.createdAt)
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
  const uid = requireUid()
  const devices = await loadOwnedDevices(uid)
  const idx = devices.findIndex((d) => d.id === deviceId)
  if (idx === -1) throw new Error('Device non trovato')
  devices[idx] = { ...devices[idx], name }
  await saveOwnedDevices(uid, devices)
}

export async function touchLastSeen(deviceId: string): Promise<void> {
  const uid = getAuth().currentUser?.uid
  if (!uid) return
  const devices = await loadOwnedDevices(uid)
  const idx = devices.findIndex((d) => d.id === deviceId)
  if (idx === -1) return
  devices[idx] = { ...devices[idx], lastSeen: Date.now() }
  await saveOwnedDevices(uid, devices)
}
