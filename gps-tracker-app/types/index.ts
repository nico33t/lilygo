export interface GPSData {
  valid: boolean
  lat: number
  lon: number
  speed: number
  alt: number
  vsat: number
  usat: number
  acc: number
  hdop: number
  last_fix_age_s: number
  time: string
}

export interface TrackPoint {
  lat: number
  lon: number
}

export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected'

export interface TrackerConfig {
  interval_ms: number
  gnss_mode: number
}

export interface WSCommand {
  cmd: 'set_interval' | 'set_gnss_mode' | 'get_config'
  value?: number
}

export interface WSConfigMessage {
  type: 'config'
  interval_ms: number
  gnss_mode: number
}
