export const WS_PORT = 81
export const HTTP_PORT = 80
export const APP_VERSION = '0.0.2'
export const MAX_TRACK_POINTS = 500
export const RECONNECT_DELAY_MS = 3000
export const DEFAULT_CONFIG = {
  interval_ms: 2000,
  gnss_mode: 1,
} as const

export const buildWsUrl = (ip: string) => `ws://${ip}:${WS_PORT}`
export const buildHttpUrl = (ip: string) => `http://${ip}:${HTTP_PORT}`

// BLE — Nordic UART Service
export const BLE_SERVICE_UUID = '6E400001-B5A3-F393-E0A9-E50E24DCCA9E'
export const BLE_RX_UUID      = '6E400002-B5A3-F393-E0A9-E50E24DCCA9E'
export const BLE_TX_UUID      = '6E400003-B5A3-F393-E0A9-E50E24DCCA9E'
export const BLE_DEVICE_NAME  = 'GPS-Tracker'
