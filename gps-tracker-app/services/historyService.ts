import AsyncStorage from '@react-native-async-storage/async-storage'
import { getBackend, Session } from './backendService'
import type { TrackPoint } from '../types'

const CACHE_KEY = (deviceId: string) => `history_cache_${deviceId}`

export async function listSessions(deviceId: string, limit = 20): Promise<Session[]> {
  try {
    const backend = await getBackend()
    const sessions = await backend.listSessions(deviceId, limit)
    await AsyncStorage.setItem(CACHE_KEY(deviceId), JSON.stringify(sessions.slice(0, 10)))
    return sessions
  } catch {
    const cached = await AsyncStorage.getItem(CACHE_KEY(deviceId))
    return cached ? JSON.parse(cached) : []
  }
}

export async function getSessionPoints(sessionId: string, deviceId: string): Promise<TrackPoint[]> {
  try {
    const backend = await getBackend()
    return await backend.getSessionPoints(sessionId, deviceId)
  } catch { return [] }
}

export function formatDuration(startTime: number, endTime?: number): string {
  const secs = ((endTime ?? Date.now() / 1000) - startTime)
  const h = Math.floor(secs / 3600)
  const m = Math.floor((secs % 3600) / 60)
  return h > 0 ? `${h}h ${m}m` : `${m}m`
}

export function formatDate(ts: number): string {
  return new Date(ts * 1000).toLocaleDateString('it-IT', {
    weekday: 'short', day: 'numeric', month: 'short',
  })
}
