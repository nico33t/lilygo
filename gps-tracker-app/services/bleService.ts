import { BleManager, Device, State } from 'react-native-ble-plx'
import { useTrackerStore } from '../store/tracker'
import { GPSData, TrackerConfig, WSCommand, WSConfigMessage } from '../types'
import { BLE_SERVICE_UUID, BLE_RX_UUID, BLE_TX_UUID, RECONNECT_DELAY_MS } from '../constants/tracker'

export { State as BleState }
export const bleManager = new BleManager()

let connectedDevice: Device | null = null
let txSubscription: { remove: () => void } | null = null
let reconnectTimer: ReturnType<typeof setTimeout> | null = null
let isManualDisconnect = false
let currentDeviceId: string | null = null
let msgBuffer = ''

function scheduleReconnect() {
  if (isManualDisconnect || !currentDeviceId) return
  if (reconnectTimer) clearTimeout(reconnectTimer)
  reconnectTimer = setTimeout(() => bleConnect(currentDeviceId!), RECONNECT_DELAY_MS)
}

function parseNotification(raw: string) {
  try {
    const text = atob(raw)
    msgBuffer += text

    // Extract all complete top-level JSON objects from the buffer
    let i = 0
    while (i < msgBuffer.length) {
      const start = msgBuffer.indexOf('{', i)
      if (start === -1) { msgBuffer = ''; break }

      let depth = 0
      let end = -1
      for (let j = start; j < msgBuffer.length; j++) {
        if (msgBuffer[j] === '{') depth++
        else if (msgBuffer[j] === '}') {
          depth--
          if (depth === 0) { end = j; break }
        }
      }

      if (end === -1) {
        // incomplete — keep from start
        msgBuffer = msgBuffer.slice(start)
        break
      }

      const json = msgBuffer.slice(start, end + 1)
      msgBuffer = msgBuffer.slice(end + 1)
      i = 0

      try {
        const msg = JSON.parse(json) as GPSData | WSConfigMessage
        if ('type' in msg && (msg as WSConfigMessage).type === 'config') {
          const cfg = msg as WSConfigMessage
          useTrackerStore.getState().setConfig({
            interval_ms: cfg.interval_ms,
            gnss_mode: cfg.gnss_mode,
          } as TrackerConfig)
        } else {
          useTrackerStore.getState().setGPS(msg as GPSData)
        }
      } catch { /* malformed */ }
    }
  } catch { /* bad base64 */ }
}

export async function bleConnect(deviceId: string) {
  if (connectedDevice) {
    const connected = await connectedDevice.isConnected().catch(() => false)
    if (connected) return
  }

  isManualDisconnect = false
  currentDeviceId = deviceId
  msgBuffer = ''

  const store = useTrackerStore.getState()
  store.setDeviceId(deviceId)
  store.setStatus('connecting')

  try {
    connectedDevice = await bleManager.connectToDevice(deviceId, { requestMTU: 512 })
    await connectedDevice.discoverAllServicesAndCharacteristics()

    connectedDevice.onDisconnected(() => {
      txSubscription?.remove()
      txSubscription = null
      connectedDevice = null
      useTrackerStore.getState().setStatus('disconnected')
      scheduleReconnect()
    })

    txSubscription = connectedDevice.monitorCharacteristicForService(
      BLE_SERVICE_UUID,
      BLE_TX_UUID,
      (error, characteristic) => {
        if (error || !characteristic?.value) return
        parseNotification(characteristic.value)
      }
    )

    useTrackerStore.getState().setStatus('connected')
    bleSendCommand({ cmd: 'get_config' })
  } catch {
    useTrackerStore.getState().setStatus('disconnected')
    scheduleReconnect()
  }
}

export async function bleSendCommand(cmd: WSCommand) {
  if (!connectedDevice) return
  try {
    const connected = await connectedDevice.isConnected()
    if (!connected) return
    const b64 = btoa(JSON.stringify(cmd))
    await connectedDevice.writeCharacteristicWithResponseForService(
      BLE_SERVICE_UUID, BLE_RX_UUID, b64
    )
  } catch { /* write failed */ }
}

export function bleDisconnect() {
  isManualDisconnect = true
  currentDeviceId = null
  if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null }
  txSubscription?.remove()
  txSubscription = null
  connectedDevice?.cancelConnection()
  connectedDevice = null
  useTrackerStore.getState().setDeviceId(null)
  useTrackerStore.getState().setStatus('disconnected')
}

export function getBleState(): Promise<State> {
  return bleManager.state()
}
