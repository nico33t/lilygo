import { useEffect } from 'react'
import { bleConnect, bleDisconnect } from '../services/bleService'
import { connect as wsConnect, disconnect as wsDisconnect } from '../services/wsService'

const IP_RE = /^\d{1,3}(\.\d{1,3}){3}$/

export function useTracker(deviceId: string) {
  const isWifi = IP_RE.test(deviceId)

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
}
