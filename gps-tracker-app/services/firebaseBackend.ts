import database from '@react-native-firebase/database'
import firestore from '@react-native-firebase/firestore'
import type { TrackerBackend, LiveData, Session } from './backendService'
import type { TrackPoint } from '../types'

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
      const snap = await firestore()
        .collection('sessions')
        .doc(deviceId)
        .collection('items')
        .orderBy('startTime', 'desc')
        .limit(limit)
        .get()
      return snap.docs.map((d) => ({ id: d.id, deviceId, ...d.data() } as Session))
    } catch { return [] }
  }

  async getSessionPoints(sessionId: string, deviceId: string): Promise<TrackPoint[]> {
    try {
      const snap = await firestore()
        .collection('sessions')
        .doc(deviceId)
        .collection('items')
        .doc(sessionId)
        .collection('points')
        .orderBy('ts', 'asc')
        .get()
      return snap.docs.map((d) => {
        const p = d.data()
        return { lat: p.lat, lon: p.lon }
      })
    } catch { return [] }
  }
}
