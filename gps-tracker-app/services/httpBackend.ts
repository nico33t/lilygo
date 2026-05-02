import type { TrackerBackend, LiveData, Session } from './backendService'
import type { TrackPoint } from '../types'
import { normalizeTrackPoints } from './gpsNormalizer'

export class HttpBackend implements TrackerBackend {
  constructor(private baseUrl: string) {}

  subscribeToLive(deviceId: string, cb: (data: LiveData) => void): () => void {
    let active = true
    const poll = async () => {
      while (active) {
        try {
          const res = await fetch(`${this.baseUrl}/live?device_id=${deviceId}`)
          if (res.ok) cb(await res.json())
        } catch { /* retry */ }
        await new Promise(r => setTimeout(r, 10000))
      }
    }
    poll()
    return () => { active = false }
  }

  async listSessions(deviceId: string, limit: number): Promise<Session[]> {
    try {
      const res = await fetch(`${this.baseUrl}/sessions?device_id=${deviceId}&limit=${limit}`)
      return res.ok ? res.json() : []
    } catch { return [] }
  }

  async getSessionPoints(sessionId: string, deviceId: string): Promise<TrackPoint[]> {
    try {
      const res = await fetch(`${this.baseUrl}/sessions/${sessionId}/points?device_id=${deviceId}`)
      if (!res.ok) return []
      const raw = await res.json()
      return Array.isArray(raw) ? normalizeTrackPoints(raw) : []
    } catch { return [] }
  }
}
