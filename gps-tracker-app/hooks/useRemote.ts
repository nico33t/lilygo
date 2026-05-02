import { useEffect } from 'react'
import { getBackend } from '../services/backendService'
import { useTrackerStore } from '../store/tracker'
import { normalizeLiveDataToGPS } from '../services/gpsNormalizer'

export function useRemote(deviceId: string, enabled: boolean) {
  const setGPS    = useTrackerStore((s) => s.setGPS)
  const setRemote = useTrackerStore((s) => s.setRemoteConnected)

  useEffect(() => {
    if (!enabled || !deviceId) return
    let unsub: (() => void) | null = null

    getBackend().then((backend) => {
      setRemote(true)
      unsub = backend.subscribeToLive(deviceId, (live) => {
        setGPS(normalizeLiveDataToGPS(live))
      })
    }).catch(() => setRemote(false))

    return () => {
      unsub?.()
      setRemote(false)
    }
  }, [enabled, deviceId])
}
