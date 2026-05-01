import { useEffect } from 'react'
import { bleConnect, bleDisconnect } from '../services/bleService'
import { connect as wsConnect, disconnect as wsDisconnect } from '../services/wsService'
import { getBackend } from '../services/backendService'
import { useTrackerStore } from '../store/tracker'
import type { LiveData } from '../services/backendService'

const IP_RE = /^\d{1,3}(\.\d{1,3}){3}/

export function useTracker(deviceId: string) {
  const isWifi = IP_RE.test(deviceId) || deviceId.startsWith('localhost')
  const status = useTrackerStore((s) => s.status)

  // Connessione BLE / WiFi (canale primario)
  useEffect(() => {
    if (!deviceId) return
    if (isWifi) {
      wsConnect(deviceId)
      return wsDisconnect
    } else {
      bleConnect(deviceId)
      return bleDisconnect
    }
  }, [deviceId])

  // Fallback remoto: attivo quando BLE è disconnesso
  useEffect(() => {
    if (isWifi || status !== 'disconnected') return

    let cancelled = false
    let unsub: (() => void) | null = null

    ;(async () => {
      try {
        const backend = await getBackend()
        if (cancelled) return
        unsub = backend.subscribeToLive(deviceId, applyLiveData)
        useTrackerStore.getState().setRemoteConnected(true)
      } catch {}
    })()

    return () => {
      cancelled = true
      unsub?.()
      useTrackerStore.getState().setRemoteConnected(false)
    }
  }, [deviceId, status, isWifi])
}

function applyLiveData(data: LiveData) {
  const store = useTrackerStore.getState()
  store.setGPS({
    valid: true,
    lat: data.lat,
    lon: data.lon,
    speed: data.speed,
    alt: data.alt,
    heading: 0,
    vsat: 0,
    usat: 0,
    acc: 0,
    hdop: 0,
    time: new Date(data.ts * 1000).toISOString(),
  })
  store.setPower({ mode: data.power_mode as any, bat_mv: data.bat_mv })
}
