import type { TrackPoint } from '../types'

export interface LiveData {
  lat: number
  lon: number
  speed: number
  alt: number
  ts: number
  bat_mv: number
  power_mode: string
}

export interface Session {
  id: string
  deviceId: string
  startTime: number
  endTime?: number
  distance_km?: number
  maxSpeed_kmh?: number
  avgSpeed_kmh?: number
  pointCount?: number
}

export interface TrackerBackend {
  subscribeToLive(deviceId: string, cb: (data: LiveData) => void): () => void
  listSessions(deviceId: string, limit: number): Promise<Session[]>
  getSessionPoints(sessionId: string, deviceId: string): Promise<TrackPoint[]>
}

let _instance: TrackerBackend | null = null
let _url = ''
let _firebaseMode = false

export function setFirebaseMode(enabled: boolean): void {
  if (_firebaseMode === enabled) return
  _firebaseMode = enabled
  _instance = null
}

export async function getBackend(): Promise<TrackerBackend> {
  if (_instance) return _instance
  if (_firebaseMode) {
    const { FirebaseBackend } = await import('./firebaseBackend')
    _instance = new FirebaseBackend()
  } else {
    const { HttpBackend } = await import('./httpBackend')
    _instance = new HttpBackend(_url)
  }
  return _instance
}

export async function setBackendUrl(url: string): Promise<void> {
  _url = url
  _instance = null
  try {
    const AS = require('@react-native-async-storage/async-storage').default
    await AS?.setItem('BACKEND_URL', url)
  } catch {}
}

export async function loadBackendUrl(): Promise<void> {
  try {
    const AS = require('@react-native-async-storage/async-storage').default
    const saved = await AS?.getItem('BACKEND_URL')
    if (saved) _url = saved
  } catch {}
}
