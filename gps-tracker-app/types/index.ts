export interface SimData {
  rssi: number | null   // dBm, null = unknown
  iccid: string | null  // last 8 digits shown in UI
  op: string | null     // operator name
  net: string | null    // LTE-M | NB-IoT | GSM | NO SERVICE
  reg: boolean
}

export interface GPSData {
  valid: boolean
  stored?: boolean   // true = last known position from NVS, not live
  lat: number
  lon: number
  speed: number
  alt: number
  vsat: number
  usat: number
  acc: number
  hdop: number
  last_fix_age_s?: number
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

export interface PowerData {
  mode: 'VEHICLE' | 'MOVING' | 'IDLE' | 'PARKED'
  bat_mv: number
}

export interface OtaStatus {
  available: boolean
  version: string
  changelog: string
  progress?: number
}

export interface WSCommand {
  cmd: 'set_interval' | 'set_gnss_mode' | 'get_config' | 'restart_gps'
      | 'set_backend_url' | 'set_backend_token' | 'set_ota_url' | 'start_ota'
      | 'set_power_mode' | 'set_apn'
  value?: number | string
}

export interface WSConfigMessage {
  type: 'config'
  interval_ms: number
  gnss_mode: number
}
