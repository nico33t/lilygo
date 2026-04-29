import AsyncStorage from '@react-native-async-storage/async-storage'
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

const BACKEND_TYPE_KEY = 'BACKEND_TYPE'
const BACKEND_URL_KEY  = 'BACKEND_URL'

let _instance: TrackerBackend | null = null

export async function getBackend(): Promise<TrackerBackend> {
  if (_instance) return _instance
  const type = (await AsyncStorage.getItem(BACKEND_TYPE_KEY)) ?? 'firebase'
  if (type === 'http') {
    const { HttpBackend } = await import('./httpBackend')
    const url = (await AsyncStorage.getItem(BACKEND_URL_KEY)) ?? ''
    _instance = new HttpBackend(url)
  } else {
    const { FirebaseBackend } = await import('./firebaseBackend')
    _instance = new FirebaseBackend()
  }
  return _instance
}

export async function setBackendUrl(url: string): Promise<void> {
  await AsyncStorage.multiSet([[BACKEND_URL_KEY, url], [BACKEND_TYPE_KEY, 'http']])
  _instance = null
}

export async function resetToFirebase(): Promise<void> {
  await AsyncStorage.setItem(BACKEND_TYPE_KEY, 'firebase')
  _instance = null
}
