import { useTrackerStore } from '../store/tracker'
import { GPSData, TrackerConfig, WSCommand, WSConfigMessage } from '../types'
import { RECONNECT_DELAY_MS, WS_URL } from '../constants/tracker'

let ws: WebSocket | null = null
let reconnectTimer: ReturnType<typeof setTimeout> | null = null
let isManualDisconnect = false

function scheduleReconnect() {
  if (isManualDisconnect) return
  if (reconnectTimer) clearTimeout(reconnectTimer)
  reconnectTimer = setTimeout(connect, RECONNECT_DELAY_MS)
}

export function connect() {
  if (
    ws?.readyState === WebSocket.OPEN ||
    ws?.readyState === WebSocket.CONNECTING
  ) {
    return
  }

  isManualDisconnect = false
  useTrackerStore.getState().setStatus('connecting')

  ws = new WebSocket(WS_URL)

  ws.onopen = () => {
    useTrackerStore.getState().setStatus('connected')
    sendCommand({ cmd: 'get_config' })
  }

  ws.onmessage = (e) => {
    try {
      const msg = JSON.parse(e.data as string) as
        | GPSData
        | WSConfigMessage

      if ('type' in msg && msg.type === 'config') {
        const cfg = msg as WSConfigMessage
        useTrackerStore.getState().setConfig({
          interval_ms: cfg.interval_ms,
          gnss_mode: cfg.gnss_mode,
        } as TrackerConfig)
      } else {
        useTrackerStore.getState().setGPS(msg as GPSData)
      }
    } catch {
      // malformed message, ignore
    }
  }

  ws.onclose = () => {
    useTrackerStore.getState().setStatus('disconnected')
    scheduleReconnect()
  }

  ws.onerror = () => {
    ws?.close()
  }
}

export function sendCommand(cmd: WSCommand) {
  if (ws?.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(cmd))
  }
}

export function disconnect() {
  isManualDisconnect = true
  if (reconnectTimer) {
    clearTimeout(reconnectTimer)
    reconnectTimer = null
  }
  ws?.close()
  ws = null
}
