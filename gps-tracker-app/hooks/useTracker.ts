import { useEffect } from 'react'
import { connect, disconnect } from '../services/wsService'

export function useTracker(deviceIp: string) {
  useEffect(() => {
    connect(deviceIp)
    return disconnect
  }, [deviceIp])
}
