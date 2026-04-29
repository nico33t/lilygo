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
  console.log('[BLE] Scheduling reconnect in', RECONNECT_DELAY_MS, 'ms')
  reconnectTimer = setTimeout(() => bleConnect(currentDeviceId!), RECONNECT_DELAY_MS)
}

function parseNotification(raw: string) {
  console.log('[BLE] parseNotification: raw b64 length =', raw.length)
  try {
    const text = atob(raw)
    console.log('[BLE] decoded text (first 120):', text.slice(0, 120))
    msgBuffer += text

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
        console.log('[BLE] Incomplete JSON, buffering', msgBuffer.length, 'bytes')
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
        useTrackerStore.getState().setBleError(null)
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
      } catch (e) {
        console.warn('[BLE] JSON parse error:', e, 'raw json:', json.slice(0, 80))
      }
    }
  } catch (e) {
    console.warn('[BLE] base64 decode error:', e, 'raw:', raw.slice(0, 40))
  }
}

function onMonitorError(error: { errorCode: number; message: string }) {
  if (error.errorCode === 201) {
    console.log('[BLE] Monitor got 201 (device disconnected) — onDisconnected will handle')
    return
  }
  const msg = `err ${error.errorCode}: ${error.message}`
  useTrackerStore.getState().setBleError(msg)
  console.log('[BLE] Monitor error →', msg, '— restarting in 500ms')
  setTimeout(() => {
    if (connectedDevice) {
      console.log('[BLE] Retrying startMonitor after error', error.errorCode)
      startMonitor()
    } else {
      console.log('[BLE] Not retrying — connectedDevice is null')
    }
  }, 500)
}

function monitorCallback(
  error: { errorCode: number; message: string } | null,
  characteristic: { value?: string | null } | null
) {
  console.log('[BLE] monitorCallback fired — error:', error?.errorCode ?? 'none', 'hasValue:', !!characteristic?.value)
  if (error) { onMonitorError(error); return }
  if (!characteristic?.value) {
    console.log('[BLE] monitorCallback: characteristic.value is null/empty')
    return
  }
  parseNotification(characteristic.value)
}

function startMonitor() {
  if (!connectedDevice) {
    console.log('[BLE] startMonitor: connectedDevice is null, aborting')
    return
  }
  console.log('[BLE] startMonitor: removing old subscription, setting up new one')
  console.log('[BLE]   SERVICE:', BLE_SERVICE_UUID)
  console.log('[BLE]   TX CHAR:', BLE_TX_UUID)
  txSubscription?.remove()
  txSubscription = connectedDevice.monitorCharacteristicForService(
    BLE_SERVICE_UUID,
    BLE_TX_UUID,
    monitorCallback as any
  )
  console.log('[BLE] startMonitor: subscription object =', txSubscription ? 'set' : 'null')
}

export async function bleConnect(deviceId: string) {
  console.log('[BLE] bleConnect called for', deviceId)

  if (connectedDevice) {
    console.log('[BLE] connectedDevice already exists, checking isConnected...')
    const connected = await connectedDevice.isConnected().catch((e) => {
      console.log('[BLE] isConnected threw:', e)
      return false
    })
    console.log('[BLE] isConnected =', connected)
    if (connected) {
      console.log('[BLE] Already connected — calling startMonitor to ensure subscription active')
      startMonitor()
      return
    }
    console.log('[BLE] Was set but not connected — proceeding with fresh connect')
  }

  isManualDisconnect = false
  currentDeviceId = deviceId
  msgBuffer = ''

  const store = useTrackerStore.getState()
  store.setDeviceId(deviceId)
  store.setStatus('connecting')
  store.setBleError(null)

  console.log('[BLE] Connecting with MTU=512...')
  try {
    connectedDevice = await bleManager.connectToDevice(deviceId, { requestMTU: 512 })
    console.log('[BLE] connectToDevice OK, MTU =', (connectedDevice as any).mtu ?? 'unknown')

    console.log('[BLE] Discovering services and characteristics...')
    await connectedDevice.discoverAllServicesAndCharacteristics()
    console.log('[BLE] Discovery complete')

    // Log all discovered services/characteristics for diagnosis
    try {
      const services = await connectedDevice.services()
      console.log('[BLE] Services found:', services.length)
      for (const svc of services) {
        console.log('[BLE]   service:', svc.uuid)
        const chars = await connectedDevice.characteristicsForService(svc.uuid)
        for (const c of chars) {
          console.log('[BLE]     char:', c.uuid, 'isNotifiable:', c.isNotifiable, 'isReadable:', c.isReadable, 'isWritable:', c.isWritableWithResponse)
        }
      }
    } catch (e) {
      console.log('[BLE] Service enumeration error:', e)
    }

    connectedDevice.onDisconnected(() => {
      console.log('[BLE] onDisconnected fired')
      txSubscription?.remove()
      txSubscription = null
      connectedDevice = null
      useTrackerStore.getState().setStatus('disconnected')
      scheduleReconnect()
    })

    console.log('[BLE] Scheduling startMonitor in 500ms...')
    setTimeout(() => {
      console.log('[BLE] 500ms elapsed — calling startMonitor')
      startMonitor()
    }, 500)

    saveLastDevice(deviceId).catch(() => {})
    store.setStatus('connected')
    console.log('[BLE] Status set to connected, sending get_config')
    bleSendCommand({ cmd: 'get_config' })
  } catch (e) {
    console.log('[BLE] bleConnect error:', e)
    useTrackerStore.getState().setStatus('disconnected')
    scheduleReconnect()
  }
}

export async function bleSendCommand(cmd: WSCommand) {
  if (!connectedDevice) {
    console.log('[BLE] bleSendCommand: no connectedDevice')
    return
  }
  try {
    const connected = await connectedDevice.isConnected()
    if (!connected) {
      console.log('[BLE] bleSendCommand: device not connected')
      return
    }
    const json = JSON.stringify(cmd)
    const b64 = btoa(json)
    console.log('[BLE] bleSendCommand:', json)
    await connectedDevice.writeCharacteristicWithResponseForService(
      BLE_SERVICE_UUID, BLE_RX_UUID, b64
    )
    console.log('[BLE] bleSendCommand: write OK')
  } catch (e) {
    console.log('[BLE] bleSendCommand error:', e)
  }
}

export function bleDisconnect() {
  console.log('[BLE] bleDisconnect called')
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
