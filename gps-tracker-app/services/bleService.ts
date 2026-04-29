import { BleManager, Device, State } from 'react-native-ble-plx'
import { useTrackerStore } from '../store/tracker'
import { GPSData, OtaStatus, PowerData, SimData, TrackerConfig, WSCommand, WSConfigMessage } from '../types'
import { BLE_SERVICE_UUID, BLE_RX_UUID, BLE_TX_UUID, RECONNECT_DELAY_MS } from '../constants/tracker'
import { saveLastDevice } from './bleCache'

export { State as BleState }

let _bleManager: BleManager | null = null
try { _bleManager = new BleManager() } catch { /* BLE not available (Expo Go) */ }
export const bleManager = _bleManager as BleManager

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
        const msg = JSON.parse(json) as any
        const type = msg?.type as string | undefined
        console.log('[BLE] msg type:', type ?? 'gps', 'lat:', msg?.lat)
        useTrackerStore.getState().setLastRx(Date.now())
        if (type === 'config') {
          const cfg = msg as WSConfigMessage
          useTrackerStore.getState().setConfig({
            interval_ms: cfg.interval_ms,
            gnss_mode: cfg.gnss_mode,
            fw_version: cfg.fw_version,
          } as TrackerConfig)
        } else if (type === 'sim') {
          useTrackerStore.getState().setSim(msg as SimData)
        } else if (type === 'power') {
          useTrackerStore.getState().setPower(msg as unknown as PowerData)
        } else if (type === 'ota') {
          useTrackerStore.getState().setOta(msg as unknown as OtaStatus)
        } else if (type === 'ota_progress') {
          const current = useTrackerStore.getState().ota
          if (current) useTrackerStore.getState().setOta({ ...current, progress: (msg as any).pct })
        } else {
          useTrackerStore.getState().setGPS(msg as GPSData)
        }
      } catch (e) { console.warn('[BLE] JSON parse error:', e) }
    }
  } catch (e) { console.warn('[BLE] base64 decode error:', e) }
}

function startMonitor() {
  if (!connectedDevice) return
  txSubscription?.remove()
  txSubscription = connectedDevice.monitorCharacteristicForService(
    BLE_SERVICE_UUID,
    BLE_TX_UUID,
    (error, characteristic) => {
      if (error) {
        // 201 = device disconnected — onDisconnected will handle reconnect
        if (error.errorCode === 201) return
        console.log('[BLE] Monitor error code', error.errorCode, '—', error.message, '— restarting in 500ms')
        setTimeout(() => { if (connectedDevice) startMonitor() }, 500)
        return
      }
      if (!characteristic?.value) return
      parseNotification(characteristic.value)
    }
  )
}

export async function bleConnect(deviceId: string) {
  if (connectedDevice) {
    const connected = await connectedDevice.isConnected().catch(() => false)
    if (connected) {
      startMonitor()
      return
    }
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

    startMonitor()

    saveLastDevice(deviceId).catch(() => {})
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

let _simTimer: ReturnType<typeof setInterval> | null = null
export function startSimulation() {
  if (_simTimer) return
  let t = 0
  const store = useTrackerStore.getState()
  store.setStatus('connected')
  _simTimer = setInterval(() => {
    t++
    store.setLastRx(Date.now())
    store.setGPS({
      valid: true, stored: false,
      lat: 45.4642 + Math.sin(t * 0.1) * 0.002,
      lon: 9.1900  + Math.cos(t * 0.1) * 0.002,
      speed: 12 + Math.random() * 5,
      alt: 150 + Math.random() * 10,
      vsat: 8, usat: 6,
      acc: 3.5, hdop: 1.2,
      time: new Date().toISOString().replace('T', ' ').slice(0, 19),
    })
    store.setPower({ mode: 'MOVING', bat_mv: 4100 })
    store.setSim({ rssi: -72, iccid: '12345678', op: 'SIM (sim)', net: 'LTE-M', reg: true })
  }, 2000)
}
export function stopSimulation() {
  if (_simTimer) { clearInterval(_simTimer); _simTimer = null }
}
