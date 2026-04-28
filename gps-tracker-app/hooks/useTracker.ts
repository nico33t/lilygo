import { useEffect } from 'react'
import { connect, disconnect } from '../services/wsService'

export function useTracker() {
  useEffect(() => {
    connect()
    return disconnect
  }, [])
}
