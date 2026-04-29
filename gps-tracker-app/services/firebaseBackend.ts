import database from '@react-native-firebase/database'
import type { TrackerBackend, LiveData, Session } from './backendService'
import type { TrackPoint } from '../types'

// Firmware writes to Firebase RTDB (not Firestore) via SIM REST API.
// RTDB layout:
//   /devices/{deviceId}/live           → live GPS (updated every ~5s)
//   /sessions/{deviceId}/{sessionId}/start_time  → unix timestamp
//   /sessions/{deviceId}/{sessionId}/end_time    → unix timestamp
//   /sessions/{deviceId}/{sessionId}/stats       → { distance_km, max/avg_speed_kmh, start_time }
//   /sessions/{deviceId}/{sessionId}/points/{ts} → { lat, lon, speed, alt, ts }

export class FirebaseBackend implements TrackerBackend {
  subscribeToLive(deviceId: string, cb: (data: LiveData) => void): () => void {
    const ref = database().ref(`/devices/${deviceId}/live`)
    const handler = (snap: any) => {
      const val = snap.val()
      if (val) cb(val as LiveData)
    }
    ref.on('value', handler)
    return () => ref.off('value', handler)
  }

  async listSessions(deviceId: string, limit: number): Promise<Session[]> {
    try {
      const snap = await database()
        .ref(`/sessions/${deviceId}`)
        .orderByChild('start_time')
        .limitToLast(limit)
        .once('value')
      if (!snap.exists()) return []
      const sessions: Session[] = []
      snap.forEach((child) => {
        const val = child.val()
        if (!val || !val.start_time) return undefined
        sessions.push({
          id:            child.key!,
          deviceId,
          startTime:     val.start_time,
          endTime:       val.end_time,
          distance_km:   val.stats?.distance_km,
          maxSpeed_kmh:  val.stats?.max_speed_kmh,
          avgSpeed_kmh:  val.stats?.avg_speed_kmh,
        } as Session)
        return undefined
      })
      return sessions.reverse()
    } catch { return [] }
  }

  async getSessionPoints(sessionId: string, deviceId: string): Promise<TrackPoint[]> {
    try {
      const snap = await database()
        .ref(`/sessions/${deviceId}/${sessionId}/points`)
        .orderByChild('ts')
        .once('value')
      if (!snap.exists()) return []
      const points: TrackPoint[] = []
      snap.forEach((child) => {
        const p = child.val()
        if (p?.lat && p?.lon) points.push({ lat: p.lat, lon: p.lon })
        return undefined
      })
      return points
    } catch { return [] }
  }
}
