import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import * as Network from 'expo-network'

type NetworkContextValue = {
  isConnected: boolean
  isInternetReachable: boolean
  isOffline: boolean
  type: Network.NetworkStateType
  ipAddress: string | null
  refresh: () => Promise<void>
}

const NetworkContext = createContext<NetworkContextValue | null>(null)

async function readNetworkSnapshot(): Promise<{
  isConnected: boolean
  isInternetReachable: boolean
  type: Network.NetworkStateType
  ipAddress: string | null
}> {
  const [state, ip] = await Promise.all([
    Network.getNetworkStateAsync(),
    Network.getIpAddressAsync().catch(() => null),
  ])

  return {
    isConnected: state.isConnected ?? false,
    isInternetReachable: state.isInternetReachable ?? false,
    type: state.type,
    ipAddress: ip,
  }
}

export function NetworkProvider({ children }: { children: ReactNode }) {
  const [isConnected, setIsConnected] = useState(false)
  const [isInternetReachable, setIsInternetReachable] = useState(false)
  const [type, setType] = useState<Network.NetworkStateType>(Network.NetworkStateType.UNKNOWN)
  const [ipAddress, setIpAddress] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    const snapshot = await readNetworkSnapshot()
    setIsConnected(snapshot.isConnected)
    setIsInternetReachable(snapshot.isInternetReachable)
    setType(snapshot.type)
    setIpAddress(snapshot.ipAddress)
  }, [])

  useEffect(() => {
    refresh().catch(() => {})
    const sub = Network.addNetworkStateListener((state) => {
      setIsConnected(state.isConnected ?? false)
      setIsInternetReachable(state.isInternetReachable ?? false)
      setType(state.type)
    })
    return () => sub.remove()
  }, [refresh])

  const value = useMemo<NetworkContextValue>(
    () => ({
      isConnected,
      isInternetReachable,
      isOffline: !isConnected || !isInternetReachable,
      type,
      ipAddress,
      refresh,
    }),
    [isConnected, isInternetReachable, type, ipAddress, refresh]
  )

  return <NetworkContext.Provider value={value}>{children}</NetworkContext.Provider>
}

export function useNetwork() {
  const ctx = useContext(NetworkContext)
  if (!ctx) {
    throw new Error('useNetwork must be used within NetworkProvider')
  }
  return ctx
}
