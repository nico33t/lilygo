import { useEffect } from 'react'
import { getBackend } from '../services/backendService'
import { useTrackerStore } from '../store/tracker'

export function useRemote(deviceId: string, enabled: boolean) {
  const setGPS    = useTrackerStore((s) => s.setGPS)
  const setRemote = useTrackerStore((s) => s.setRemoteConnected)

  useEffect(() => {
    if (!enabled || !deviceId) return
    let unsub: (() => void) | null = null

    getBackend().then((backend) => {
      setRemote(true)
      unsub = backend.subscribeToLive(deviceId, (live) => {
        setGPS({
          valid: true,
          lat: live.lat,
          lon: live.lon,
          speed: live.speed,
          alt: live.alt,
          vsat: 0,
          usat: 0,
          acc: 0,
          hdop: 0,
          time: new Date(live.ts * 1000).toISOString(),
        })
      })
    }).catch(() => setRemote(false))

    return () => {
      unsub?.()
      setRemote(false)
    }
  }, [enabled, deviceId])
}
