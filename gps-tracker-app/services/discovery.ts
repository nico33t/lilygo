import { buildHttpUrl } from '../constants/tracker'

export interface DiscoveredDevice {
  ip: string
  uptime_s: number
  gps_valid: boolean
  sat_used: number
  sat_view: number
  lat: number
  lon: number
  hdop: number
  last_fix_age_s: number
}

async function probeIp(ip: string): Promise<DiscoveredDevice | null> {
  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 1200)

    const res = await fetch(`${buildHttpUrl(ip)}/status`, {
      signal: controller.signal,
    })
    clearTimeout(timeout)

    if (!res.ok) return null
    const data = await res.json()
    if (!data.ok) return null

    return {
      ip,
      uptime_s: data.uptime_s ?? 0,
      gps_valid: data.gps_valid ?? false,
      sat_used: data.sat_used ?? 0,
      sat_view: data.sat_view ?? 0,
      lat: data.lat ?? 0,
      lon: data.lon ?? 0,
      hdop: data.hdop ?? 0,
      last_fix_age_s: data.last_fix_age_s ?? -1,
    }
  } catch {
    return null
  }
}

async function getLocalSubnet(): Promise<string> {
  try {
    if (typeof navigator !== 'undefined' && 'connection' in navigator) {
      // Expo Network
      const { getIpAddressAsync } = await import('expo-network')
      const ip = await getIpAddressAsync()
      if (ip && ip !== '0.0.0.0') {
        return ip.split('.').slice(0, 3).join('.')
      }
    }
  } catch {}
  return '192.168.4'
}

export async function scanSubnet(
  onFound: (device: DiscoveredDevice) => void,
  signal?: AbortSignal
): Promise<void> {
  const subnet = await getLocalSubnet()

  // Priority list: common AP gateway IPs first
  const priorityOctets = [1, 2, 100, 101, 150, 200]
  const otherOctets = Array.from({ length: 20 }, (_, i) => i + 3).filter(
    (n) => !priorityOctets.includes(n)
  )
  const octets = [...priorityOctets, ...otherOctets]

  const BATCH = 5
  for (let i = 0; i < octets.length; i += BATCH) {
    if (signal?.aborted) return

    const batch = octets.slice(i, i + BATCH)
    const results = await Promise.allSettled(
      batch.map((n) => probeIp(`${subnet}.${n}`))
    )

    for (const r of results) {
      if (r.status === 'fulfilled' && r.value) {
        onFound(r.value)
      }
    }
  }
}
