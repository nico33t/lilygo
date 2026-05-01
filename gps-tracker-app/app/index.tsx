import { useCallback, useEffect, useRef, useState } from 'react'
import {
  ActivityIndicator,
  FlatList,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { router } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { Device } from 'react-native-ble-plx'
import { bleManager, BleState } from '../services/bleService'
import { getLastDevice } from '../services/bleCache'
import { BLE_DEVICE_NAME, APP_VERSION } from '../constants/tracker'
import { DiscoveredDevice, scanSubnet } from '../services/discovery'
import { listUserDevices, getTrialStatus, DeviceInfo } from '../services/deviceService'
import { useAuth } from '../hooks/useAuth'
import DeviceCard from '../components/DeviceCard'
import { C, R, S } from '../constants/design'

type ScanMode  = 'ble' | 'wifi'
type ScanState = 'idle' | 'scanning' | 'done'

// ─── Signal bars ──────────────────────────────────────────────────────────────
function rssiLevel(rssi: number | null): number {
  if (rssi == null) return 0
  if (rssi > -60) return 4
  if (rssi > -70) return 3
  if (rssi > -80) return 2
  return 1
}

function SignalBars({ rssi }: { rssi: number | null }) {
  const level = rssiLevel(rssi)
  return (
    <View style={sig.wrap}>
      {[1, 2, 3, 4].map((i) => (
        <View
          key={i}
          style={[sig.bar, { height: 4 + i * 3 }, i <= level ? sig.on : sig.off]}
        />
      ))}
    </View>
  )
}
const sig = StyleSheet.create({
  wrap: { flexDirection: 'row', alignItems: 'flex-end', gap: 2 },
  bar:  { width: 4, borderRadius: 2 },
  on:   { backgroundColor: C.accent },
  off:  { backgroundColor: C.sep },
})

// ─── Electron BLE bridge ──────────────────────────────────────────────────────
const IS_ELECTRON = typeof window !== 'undefined' && !!(window as any).electronInfo?.isElectron

// ─── Main screen ─────────────────────────────────────────────────────────────
export default function DiscoveryScreen() {
  const [mode, setMode]           = useState<ScanMode>('ble')
  const [scanState, setScanState] = useState<ScanState>('idle')
  const [bleDevices, setBleDevices] = useState<Device[]>([])
  const [wifiDevices, setWifiDevices] = useState<DiscoveredDevice[]>([])
  const [bleOff, setBleOff]         = useState(false)
  const [lastDevice, setLastDevice] = useState<string | null>(null)

  const wifiAbortRef    = useRef<AbortController | null>(null)
  const bleScanTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const [cloudDevices, setCloudDevices] = useState<DeviceInfo[]>([])
  const user = useAuth()

  useEffect(() => { getLastDevice().then(setLastDevice).catch(() => {}) }, [])

  useEffect(() => {
    if (user === undefined) return
    if (!user) {
      setCloudDevices([])
      return
    }
    listUserDevices().then(setCloudDevices).catch(() => setCloudDevices([]))
  }, [user])

  useEffect(() => {
    if (!bleManager) return
    const sub = bleManager.onStateChange((s) => {
      setBleOff(s === BleState.PoweredOff || s === BleState.Unauthorized)
    }, true)
    return () => sub.remove()
  }, [])

  const startBleScan = useCallback(() => {
    setBleDevices([])
    setScanState('scanning')
    if (bleScanTimerRef.current) clearTimeout(bleScanTimerRef.current)
    bleManager.startDeviceScan(null, { allowDuplicates: false }, (err, device) => {
      if (err) { setScanState('done'); return }
      if (device && (device.name === BLE_DEVICE_NAME || device.localName === BLE_DEVICE_NAME)) {
        setBleDevices((prev) => prev.find((d) => d.id === device.id) ? prev : [...prev, device])
      }
    })
    bleScanTimerRef.current = setTimeout(() => {
      bleManager.stopDeviceScan()
      setScanState('done')
    }, 15000)
  }, [])

  const startWifiScan = useCallback(async () => {
    wifiAbortRef.current?.abort()
    const ctrl = new AbortController()
    wifiAbortRef.current = ctrl
    setWifiDevices([])
    setScanState('scanning')
    await scanSubnet(
      (d) => setWifiDevices((prev) => prev.find((x) => x.ip === d.ip) ? prev : [...prev, d]),
      ctrl.signal
    )
    if (!ctrl.signal.aborted) setScanState('done')
  }, [])

  const startScan = useCallback(() => {
    if (mode === 'ble') startBleScan()
    else startWifiScan()
  }, [mode, startBleScan, startWifiScan])

  useEffect(() => {
    startScan()
    return () => {
      bleManager?.stopDeviceScan()
      if (bleScanTimerRef.current) clearTimeout(bleScanTimerRef.current)
      wifiAbortRef.current?.abort()
    }
  }, [mode])

  const handleSelectBle = (device: Device) => {
    bleManager.stopDeviceScan()
    if (bleScanTimerRef.current) clearTimeout(bleScanTimerRef.current)
    router.push(`/tracker?id=${encodeURIComponent(device.id)}`)
  }

  const devices = mode === 'ble' ? bleDevices : wifiDevices

  // ── Cloud devices section ─────────────────────────────────────────────────
  const CloudSection = cloudDevices.length > 0 ? (
    <>
      <Text style={st.sectionLabel}>I MIEI TRACKER · {cloudDevices.length}</Text>
      {cloudDevices.map((device, index) => {
        const sub     = getTrialStatus(device)
        const isFirst = index === 0
        const isLast  = index === cloudDevices.length - 1
        return (
          <Pressable
            key={device.id}
            style={({ pressed }) => [
              st.deviceRow,
              isFirst && st.rowFirst,
              isLast  && st.rowLast,
              pressed && st.pressed,
            ]}
            onPress={() => router.push(`/tracker?id=${encodeURIComponent(device.id)}`)}
          >
            <View style={[st.iconCircle, { backgroundColor: `${C.accent}12` }]}>
              <Ionicons name="navigate-circle-outline" size={20} color={C.accent} />
            </View>
            <View style={st.rowInfo}>
              <Text style={st.rowTitle}>{device.name}</Text>
              <Text style={st.rowSub} numberOfLines={1}>
                {device.lastSeen
                  ? `Visto ${new Date(device.lastSeen).toLocaleDateString('it-IT')}`
                  : 'Mai connesso via cloud'}
              </Text>
            </View>
            {sub.isTrialActive && (
              <View style={[st.connectPill, { backgroundColor: C.green }]}>
                <Text style={st.connectPillText}>Trial {sub.daysLeft}g</Text>
              </View>
            )}
            {sub.needsSubscription && (
              <View style={[st.connectPill, { backgroundColor: C.orange }]}>
                <Text style={st.connectPillText}>Scaduto</Text>
              </View>
            )}
            <Ionicons name="chevron-forward" size={16} color={C.text3} style={{ marginLeft: 4 }} />
          </Pressable>
        )
      })}
    </>
  ) : null

  // ── List header (pinned above items) ──────────────────────────────────────
  const ListHeader = (
    <>
      {CloudSection}
      {/* Electron bridge shortcut */}
      {IS_ELECTRON && (
        <Pressable
          style={({ pressed }) => [st.rowCard, { marginBottom: 8 }, pressed && st.pressed]}
          onPress={() => router.push(`/tracker?ip=${encodeURIComponent('localhost:8765')}`)}
        >
          <View style={[st.iconCircle, { backgroundColor: '#5856D615' }]}>
            <Ionicons name="bluetooth" size={18} color="#5856D6" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={st.rowTitle}>BLE Bridge locale</Text>
            <Text style={st.rowSub}>Connetti via bridge Python</Text>
          </View>
          <Ionicons name="chevron-forward" size={16} color={C.text3} />
        </Pressable>
      )}

      {/* Last device quick-connect */}
      {mode === 'ble' && !bleOff && lastDevice && (
        <Pressable
          style={({ pressed }) => [st.rowCard, { marginBottom: 8 }, pressed && st.pressed]}
          onPress={() => {
            bleManager.stopDeviceScan()
            router.push(`/tracker?id=${encodeURIComponent(lastDevice)}`)
          }}
        >
          <View style={[st.iconCircle, { backgroundColor: `${C.blue}15` }]}>
            <Ionicons name="time-outline" size={18} color={C.blue} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={st.rowTitle}>Riconnetti</Text>
            <Text style={st.rowSub} numberOfLines={1}>{lastDevice.slice(0, 22)}</Text>
          </View>
          <View style={st.connectPill}>
            <Text style={st.connectPillText}>Connetti</Text>
          </View>
        </Pressable>
      )}

      {/* BLE off warning */}
      {mode === 'ble' && bleOff && (
        <View style={st.warning}>
          <Ionicons name="warning-outline" size={15} color="#92400E" />
          <Text style={st.warningText}>Attiva il Bluetooth per cercare il tracker</Text>
        </View>
      )}

      {/* Section label */}
      {devices.length > 0 && (
        <Text style={st.sectionLabel}>
          {mode === 'ble' ? 'BLUETOOTH' : 'RETE LOCALE'} · {devices.length}
        </Text>
      )}
    </>
  )

  return (
    <SafeAreaView style={st.root} edges={['top']}>

      {/* ── Large title row ────────────────────────────────────────── */}
      <View style={st.header}>
        <Text style={st.title}>Dispositivi</Text>
        <Pressable
          style={({ pressed }) => [st.iconBtn, pressed && { opacity: 0.6 }]}
          onPress={() => user ? router.push('/settings') : router.push('/login')}
          hitSlop={10}
        >
          <Ionicons
            name={user ? 'person-circle' : 'person-circle-outline'}
            size={22}
            color={user ? C.accent : C.text2}
          />
        </Pressable>
      </View>

      {/* ── Mode toggle + scan status ──────────────────────────────── */}
      <View style={st.controlRow}>
        <View style={st.toggle}>
          {(['ble', 'wifi'] as ScanMode[]).map((m) => (
            <Pressable
              key={m}
              style={[st.toggleBtn, mode === m && st.toggleBtnOn]}
              onPress={() => { if (mode !== m) setMode(m) }}
            >
              <Ionicons
                name={m === 'ble' ? 'bluetooth' : 'wifi'}
                size={13}
                color={mode === m ? '#fff' : C.text2}
              />
              <Text style={[st.toggleText, mode === m && st.toggleTextOn]}>
                {m === 'ble' ? 'Bluetooth' : 'WiFi'}
              </Text>
            </Pressable>
          ))}
        </View>

        <View style={st.scanInfo}>
          {scanState === 'scanning' ? (
            <>
              <ActivityIndicator size="small" color={C.accent} style={{ marginRight: 6 }} />
              <Text style={st.scanLabel}>Ricerca…</Text>
            </>
          ) : (
            <Pressable
              style={({ pressed }) => [st.refreshBtn, pressed && { opacity: 0.6 }]}
              onPress={startScan}
              hitSlop={10}
            >
              <Ionicons name="refresh" size={17} color={C.text2} />
              <Text style={st.scanLabel}>
                {scanState === 'done' && devices.length === 0
                  ? 'Nessuno trovato'
                  : scanState === 'done'
                  ? `${devices.length} trovato`
                  : 'Pronto'}
              </Text>
            </Pressable>
          )}
        </View>
      </View>

      {/* ── Device list ────────────────────────────────────────────── */}
      <FlatList
        data={devices}
        keyExtractor={(item: any) => item.id ?? item.ip}
        contentContainerStyle={st.listContent}
        ListHeaderComponent={ListHeader}
        renderItem={({ item, index }) => {
          if (mode === 'ble') {
            const d = item as Device
            const isLast = index === bleDevices.length - 1
            return (
              <Pressable
                style={({ pressed }) => [
                  st.deviceRow,
                  index === 0 && st.rowFirst,
                  isLast && st.rowLast,
                  pressed && st.pressed,
                ]}
                onPress={() => handleSelectBle(d)}
              >
                <View style={[st.iconCircle, { backgroundColor: `${C.blue}12` }]}>
                  <Ionicons name="bluetooth" size={18} color={C.blue} />
                </View>
                <View style={st.rowInfo}>
                  <Text style={st.rowTitle}>{d.name ?? d.localName ?? BLE_DEVICE_NAME}</Text>
                  <Text style={st.rowSub} numberOfLines={1}>{d.id}</Text>
                </View>
                <SignalBars rssi={d.rssi} />
                <Ionicons name="chevron-forward" size={16} color={C.text3} style={{ marginLeft: 6 }} />
              </Pressable>
            )
          }
          const w = item as DiscoveredDevice
          return <DeviceCard device={w} onPress={() => router.push(`/tracker?ip=${w.ip}`)} />
        }}
        ListEmptyComponent={
          scanState !== 'scanning' ? (
            <View style={st.empty}>
              <View style={st.emptyIcon}>
                <Ionicons
                  name={mode === 'ble' ? 'bluetooth-outline' : 'wifi-outline'}
                  size={32}
                  color={C.text3}
                />
              </View>
              <Text style={st.emptyTitle}>Nessun dispositivo trovato</Text>
              <Text style={st.emptyDesc}>
                {mode === 'ble'
                  ? 'Assicurati che il dispositivo sia acceso e vicino'
                  : 'Connettiti alla rete WiFi del tracker'}
              </Text>
            </View>
          ) : null
        }
      />


    </SafeAreaView>
  )
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const st = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: S.lg,
    paddingTop: S.md,
    paddingBottom: S.sm,
  },
  title: {
    fontSize: 34,
    fontWeight: '700',
    color: C.text1,
    letterSpacing: -0.5,
  },
  iconBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: C.card,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 },
  },

  // Toggle + scan row
  controlRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: S.lg,
    paddingBottom: S.md,
    gap: S.md,
  },
  toggle: {
    flexDirection: 'row',
    backgroundColor: C.card,
    borderRadius: R.xl ?? 24,
    padding: 3,
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
  },
  toggleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 7,
    paddingHorizontal: 14,
    borderRadius: 20,
    gap: 5,
  },
  toggleBtnOn: { backgroundColor: C.accent },
  toggleText: { fontSize: 13, fontWeight: '600', color: C.text2 },
  toggleTextOn: { color: '#fff' },

  scanInfo: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  refreshBtn: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  scanLabel: { fontSize: 13, color: C.text2 },

  // List
  listContent: { paddingHorizontal: S.lg, paddingBottom: S.xl },

  sectionLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: C.text3,
    letterSpacing: 0.5,
    marginTop: S.md,
    marginBottom: S.xs ?? 4,
    paddingHorizontal: 4,
  },

  // Device rows — grouped iOS-style
  deviceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: C.card,
    paddingHorizontal: S.md,
    paddingVertical: 13,
    gap: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: C.sep,
  },
  rowFirst: { borderTopLeftRadius: R.lg, borderTopRightRadius: R.lg },
  rowLast:  {
    borderBottomLeftRadius: R.lg,
    borderBottomRightRadius: R.lg,
    borderBottomWidth: 0,
  },

  // Shared row card (last device, electron banner)
  rowCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: C.card,
    borderRadius: R.lg,
    paddingHorizontal: S.md,
    paddingVertical: 13,
    gap: 12,
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 },
  },
  pressed: { opacity: 0.7 },

  iconCircle: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowInfo: { flex: 1 },
  rowTitle: { fontSize: 15, fontWeight: '600', color: C.text1 },
  rowSub: {
    fontSize: 12,
    color: C.text2,
    marginTop: 1,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },

  connectPill: {
    backgroundColor: C.accent,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 5,
  },
  connectPillText: { fontSize: 12, fontWeight: '700', color: '#fff' },

  // Warning
  warning: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FEF3C7',
    borderRadius: R.md,
    padding: 11,
    gap: 8,
    marginBottom: S.sm,
  },
  warningText: { flex: 1, fontSize: 13, color: '#92400E' },

  // Empty
  empty: {
    alignItems: 'center',
    paddingTop: 60,
    paddingHorizontal: S.xl,
    gap: S.sm,
  },
  emptyIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: C.card,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: S.sm,
  },
  emptyTitle: { fontSize: 16, fontWeight: '700', color: C.text1 },
  emptyDesc: { fontSize: 14, color: C.text3, textAlign: 'center', lineHeight: 20 },

})
