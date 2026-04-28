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
