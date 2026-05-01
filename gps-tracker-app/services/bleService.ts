import { BleManager, Device, State } from 'react-native-ble-plx'
import { useTrackerStore } from '../store/tracker'
import { GPSData, OtaStatus, PowerData, SimData, TrackerConfig, WSCommand, WSConfigMessage } from '../types'
import { BLE_SERVICE_UUID, BLE_RX_UUID, BLE_TX_UUID, RECONNECT_DELAY_MS } from '../constants/tracker'
import { saveLastDevice } from './bleCache'
import { notifyOtaAvailable } from './proximityService'

let _lastOtaNotifiedVersion: string | null = null

export { State as BleState }

// eslint-disable-next-line no-undef
const log = (...args: any[]) => { if (__DEV__) console.log(...args) }

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
  log('[BLE] Scheduling reconnect in', RECONNECT_DELAY_MS, 'ms')
  reconnectTimer = setTimeout(() => bleConnect(currentDeviceId!), RECONNECT_DELAY_MS)
}

function parseNotification(raw: string) {
  log('[BLE] parseNotification: raw b64 =', raw)
  try {
    const text = atob(raw)
    const hex = Array.from(text).map(c => c.charCodeAt(0).toString(16).padStart(2, '0')).join(' ')
    log('[BLE] decoded hex:', hex)
    log('[BLE] decoded utf8:', text)
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
        log('[BLE] Incomplete JSON, buffering', msgBuffer.length, 'bytes')
        msgBuffer = msgBuffer.slice(start)
        break
      }

      const json = msgBuffer.slice(start, end + 1)
      msgBuffer = msgBuffer.slice(end + 1)
      i = 0

      try {
        const msg = JSON.parse(json) as any
        const type = msg?.type as string | undefined
        log('[BLE] msg type:', type ?? 'gps', 'lat:', msg?.lat)
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
          const ota = msg as unknown as OtaStatus
          useTrackerStore.getState().setOta(ota)
          if (ota.available && ota.version && ota.version !== _lastOtaNotifiedVersion) {
            _lastOtaNotifiedVersion = ota.version
            notifyOtaAvailable(ota.version)
          }
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
    log('[BLE] Monitor 201 (device disconnected) — onDisconnected will handle')
    return
  }
  const msg = `err ${error.errorCode}: ${error.message}`
  useTrackerStore.getState().setBleError(msg)
  log('[BLE] Monitor error →', msg, '— restarting in 500ms')
  setTimeout(() => {
    if (connectedDevice) {
      log('[BLE] Retrying startMonitor after error', error.errorCode)
      startMonitor()
    } else {
      log('[BLE] Not retrying — connectedDevice is null')
    }
  }, 500)
}

function monitorCallback(
  error: { errorCode: number; message: string } | null,
  characteristic: { value?: string | null } | null
) {
  log('[BLE] monitorCallback fired — error:', error?.errorCode ?? 'none', 'hasValue:', !!characteristic?.value)
  if (error) { onMonitorError(error); return }
  if (!characteristic?.value) {
    log('[BLE] monitorCallback: value is null/empty')
    return
  }
  parseNotification(characteristic.value)
}

function startMonitor() {
  if (!connectedDevice) {
    log('[BLE] startMonitor: connectedDevice is null, aborting')
    return
  }
  log('[BLE] startMonitor: SERVICE =', BLE_SERVICE_UUID, 'TX =', BLE_TX_UUID)
  txSubscription?.remove()
  txSubscription = connectedDevice.monitorCharacteristicForService(
    BLE_SERVICE_UUID,
    BLE_TX_UUID,
    monitorCallback as any
  )
  log('[BLE] startMonitor: subscription =', txSubscription ? 'set' : 'null')
}

export async function bleConnect(deviceId: string) {
  log('[BLE] bleConnect called for', deviceId)

  if (connectedDevice) {
    log('[BLE] connectedDevice already exists, checking isConnected...')
    const connected = await connectedDevice.isConnected().catch((e) => {
      log('[BLE] isConnected threw:', e)
      return false
    })
    log('[BLE] isConnected =', connected)
    if (connected) {
      log('[BLE] Already connected — restarting monitor to ensure subscription active')
      startMonitor()
      return
    }
    log('[BLE] Was set but not connected — proceeding with fresh connect')
  }

  isManualDisconnect = false
  currentDeviceId = deviceId
  msgBuffer = ''

  const store = useTrackerStore.getState()
  store.setDeviceId(deviceId)
  store.setStatus('connecting')
  store.setBleError(null)

  log('[BLE] Connecting with MTU=512...')
  try {
    connectedDevice = await bleManager.connectToDevice(deviceId, { requestMTU: 512 })
    log('[BLE] connectToDevice OK, MTU =', (connectedDevice as any).mtu ?? 'unknown')

    log('[BLE] Discovering services and characteristics...')
    await connectedDevice.discoverAllServicesAndCharacteristics()
    log('[BLE] Discovery complete')

    try {
      const services = await connectedDevice.services()
      log('[BLE] Services found:', services.length)
      for (const svc of services) {
        log('[BLE]   service:', svc.uuid)
        const chars = await connectedDevice.characteristicsForService(svc.uuid)
        for (const c of chars) {
          log('[BLE]     char:', c.uuid, 'notify:', c.isNotifiable, 'read:', c.isReadable, 'write:', c.isWritableWithResponse)
        }
      }
    } catch (e) {
      log('[BLE] Service enumeration error:', e)
    }

    connectedDevice.onDisconnected(() => {
      log('[BLE] onDisconnected fired')
      txSubscription?.remove()
      txSubscription = null
      connectedDevice = null
      useTrackerStore.getState().setStatus('disconnected')
      scheduleReconnect()
    })

    log('[BLE] Scheduling startMonitor in 500ms...')
    setTimeout(() => {
      log('[BLE] 500ms elapsed — calling startMonitor')
      startMonitor()
    }, 500)

    saveLastDevice(deviceId).catch(() => {})
    store.setStatus('connected')
    log('[BLE] Status = connected, sending get_config')
    bleSendCommand({ cmd: 'get_config' })
  } catch (e) {
    log('[BLE] bleConnect error:', e)
    useTrackerStore.getState().setStatus('disconnected')
    scheduleReconnect()
  }
}

export async function bleSendCommand(cmd: WSCommand) {
  if (!connectedDevice) {
    log('[BLE] bleSendCommand: no connectedDevice')
    return
  }
  try {
    const connected = await connectedDevice.isConnected()
    if (!connected) {
      log('[BLE] bleSendCommand: device not connected')
      return
    }
    const json = JSON.stringify(cmd)
    const b64 = btoa(json)
    log('[BLE] bleSendCommand:', json)
    await connectedDevice.writeCharacteristicWithResponseForService(
      BLE_SERVICE_UUID, BLE_RX_UUID, b64
    )
    log('[BLE] bleSendCommand: write OK')
  } catch (e) {
    log('[BLE] bleSendCommand error:', e)
  }
}

export function bleDisconnect() {
  log('[BLE] bleDisconnect called')
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
      lat: 45.4656 + Math.sin(t * 0.1) * 0.001,
      lon: 9.1860  + Math.cos(t * 0.1) * 0.001,
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
