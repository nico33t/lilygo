// Firebase backend — install: npx expo install @react-native-firebase/app @react-native-firebase/database @react-native-firebase/firestore
// This file is loaded lazily by getBackend() only when BACKEND_TYPE='firebase'
import type { TrackerBackend, LiveData, Session } from './backendService'
import type { TrackPoint } from '../types'

export class FirebaseBackend implements TrackerBackend {
  subscribeToLive(deviceId: string, cb: (data: LiveData) => void): () => void {
    // Dynamic import so Firebase doesn't crash when not installed
    let unsub: (() => void) | null = null
    // @ts-ignore — optional dependency, install when using Firebase backend
    import('@react-native-firebase/database').then(({ default: database }: any) => {
      const ref = database().ref(`/devices/${deviceId}/live`)
      const handler = ref.on('value', (snap: any) => {
        const val = snap.val()
        if (val) cb(val as LiveData)
      })
      unsub = () => ref.off('value', handler)
    }).catch(() => {})
    return () => unsub?.()
  }

  async listSessions(deviceId: string, limit: number): Promise<Session[]> {
    try {
      // @ts-ignore — optional dependency
      const { default: firestore } = await import('@react-native-firebase/firestore')
      const snap = await firestore()
        .collection('sessions')
        .doc(deviceId)
        .collection('items')
        .orderBy('startTime', 'desc')
        .limit(limit)
        .get()
      return snap.docs.map((d: any) => ({ id: d.id, deviceId, ...d.data() } as Session))
    } catch { return [] }
  }

  async getSessionPoints(sessionId: string, deviceId: string): Promise<TrackPoint[]> {
    try {
      // @ts-ignore — optional dependency
      const { default: firestore } = await import('@react-native-firebase/firestore')
      const snap = await firestore()
        .collection('sessions')
        .doc(deviceId)
        .collection('items')
        .doc(sessionId)
        .collection('points')
        .orderBy('ts', 'asc')
        .get()
      return snap.docs.map((d: any) => {
        const p = d.data()
        return { lat: p.lat, lon: p.lon }
      })
    } catch { return [] }
  }
}
