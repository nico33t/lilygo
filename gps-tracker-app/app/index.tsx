import { useCallback, useEffect, useRef, useState } from 'react'
import {
  Animated,
  Easing,
  FlatList,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { router } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { Device } from 'react-native-ble-plx'
import { bleManager, BleState } from '../services/bleService'
import { BLE_SERVICE_UUID, BLE_DEVICE_NAME, APP_VERSION } from '../constants/tracker'
import { DiscoveredDevice, scanSubnet } from '../services/discovery'
import DeviceCard from '../components/DeviceCard'
import { C, R, S } from '../constants/design'

type ScanMode  = 'ble' | 'wifi'
type ScanState = 'idle' | 'scanning' | 'done'

// Signal strength → 0–4 bars
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
          style={[
            sig.bar,
            { height: 4 + i * 3 },
            i <= level ? sig.barOn : sig.barOff,
          ]}
        />
      ))}
    </View>
  )
}

const sig = StyleSheet.create({
  wrap: { flexDirection: 'row', alignItems: 'flex-end', gap: 2 },
  bar:  { width: 4, borderRadius: 2 },
  barOn: { backgroundColor: C.blue },
  barOff: { backgroundColor: C.sep },
})

// Radar ring animation
function RadarRings({ scanning }: { scanning: boolean }) {
  const rings = [useRef(new Animated.Value(0)).current, useRef(new Animated.Value(0)).current, useRef(new Animated.Value(0)).current]

  useEffect(() => {
    if (!scanning) {
      rings.forEach((r) => { r.stopAnimation(); r.setValue(0) })
      return
    }
    const anims = rings.map((r, i) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(i * 400),
          Animated.timing(r, { toValue: 1, duration: 1600, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
          Animated.timing(r, { toValue: 0, duration: 0, useNativeDriver: true }),
        ])
      )
    )
    anims.forEach((a) => a.start())
    return () => anims.forEach((a) => a.stop())
  }, [scanning])

  return (
    <View style={radar.wrap}>
      {rings.map((r, i) => (
        <Animated.View
          key={i}
          style={[
            radar.ring,
            {
              opacity: r.interpolate({ inputRange: [0, 0.3, 1], outputRange: [0, 0.35, 0] }),
              transform: [{ scale: r.interpolate({ inputRange: [0, 1], outputRange: [0.6, 2.2] }) }],
            },
          ]}
        />
      ))}
      <View style={radar.center}>
        <Ionicons
          name={scanning ? 'radio-outline' : 'radio'}
          size={28}
          color={C.accent}
        />
      </View>
    </View>
  )
}

const radar = StyleSheet.create({
  wrap: { width: 88, height: 88, alignItems: 'center', justifyContent: 'center' },
  ring: {
    position: 'absolute',
    width: 88,
    height: 88,
    borderRadius: 44,
    borderWidth: 1.5,
    borderColor: C.accent,
  },
  center: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: C.accentMid,
    alignItems: 'center',
    justifyContent: 'center',
  },
})

export default function DiscoveryScreen() {
  const [mode, setMode] = useState<ScanMode>('ble')
  const [scanState, setScanState] = useState<ScanState>('idle')
  const [bleDevices, setBleDevices] = useState<Device[]>([])
  const [wifiDevices, setWifiDevices] = useState<DiscoveredDevice[]>([])
  const [showManual, setShowManual] = useState(false)
  const [manualVal, setManualVal] = useState('')
  const [bleOff, setBleOff] = useState(false)

  const wifiAbortRef = useRef<AbortController | null>(null)
  const bleScanTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    const sub = bleManager.onStateChange((state) => {
      setBleOff(state === BleState.PoweredOff || state === BleState.Unauthorized)
    }, true)
    return () => sub.remove()
  }, [])

  const startBleScan = useCallback(() => {
    setBleDevices([])
    setScanState('scanning')
    if (bleScanTimerRef.current) clearTimeout(bleScanTimerRef.current)

    bleManager.startDeviceScan(
      [BLE_SERVICE_UUID],
      { allowDuplicates: false },
      (error, device) => {
        if (error) { setScanState('done'); return }
        if (device && (device.name === BLE_DEVICE_NAME || device.localName === BLE_DEVICE_NAME)) {
          setBleDevices((prev) =>
            prev.find((d) => d.id === device.id) ? prev : [...prev, device]
          )
        }
      }
    )

    bleScanTimerRef.current = setTimeout(() => {
      bleManager.stopDeviceScan()
      setScanState('done')
    }, 10000)
  }, [])

  const startWifiScan = useCallback(async () => {
    wifiAbortRef.current?.abort()
    const ctrl = new AbortController()
    wifiAbortRef.current = ctrl

    setWifiDevices([])
    setScanState('scanning')

    await scanSubnet(
      (device) => setWifiDevices((prev) =>
        prev.find((d) => d.ip === device.ip) ? prev : [...prev, device]
      ),
      ctrl.signal
    )

    if (!ctrl.signal.aborted) setScanState('done')
  }, [])

  const startScan = useCallback(() => {
    setScanState('idle')
    if (mode === 'ble') startBleScan()
    else startWifiScan()
  }, [mode, startBleScan, startWifiScan])

  useEffect(() => {
    startScan()
    return () => {
      bleManager.stopDeviceScan()
      if (bleScanTimerRef.current) clearTimeout(bleScanTimerRef.current)
      wifiAbortRef.current?.abort()
    }
  }, [mode])

  const handleSelectBle = (device: Device) => {
    bleManager.stopDeviceScan()
    if (bleScanTimerRef.current) clearTimeout(bleScanTimerRef.current)
    router.push(`/tracker?id=${encodeURIComponent(device.id)}`)
  }

  const handleSelectWifi = (ip: string) => {
    wifiAbortRef.current?.abort()
    router.push(`/tracker?ip=${ip}`)
  }

  const handleManualConnect = () => {
    const val = manualVal.trim()
    if (!val) return
    const isIp = /^\d{1,3}(\.\d{1,3}){3}$/.test(val)
    router.push(isIp ? `/tracker?ip=${val}` : `/tracker?id=${encodeURIComponent(val)}`)
  }

  const count = mode === 'ble' ? bleDevices.length : wifiDevices.length

  return (
    <SafeAreaView style={styles.root}>

      {/* ── Header ─────────────────────────────────────────────── */}
      <View style={styles.header}>
        <View>
          <Text style={styles.appTitle}>GPS Tracker</Text>
          <Text style={styles.appVersion}>v{APP_VERSION}</Text>
        </View>
        <Pressable
          onPress={() => router.push('/settings')}
          style={styles.headerBtn}
          hitSlop={8}
        >
          <Ionicons name="settings-outline" size={22} color={C.text2} />
        </Pressable>
      </View>

      {/* ── Mode toggle ────────────────────────────────────────── */}
      <View style={styles.segWrap}>
        <View style={styles.seg}>
          {(['ble', 'wifi'] as ScanMode[]).map((m) => (
            <Pressable
              key={m}
              style={[styles.segBtn, mode === m && styles.segBtnActive]}
              onPress={() => { if (mode !== m) setMode(m) }}
            >
              <Ionicons
                name={m === 'ble' ? 'bluetooth' : 'wifi'}
                size={14}
                color={mode === m ? C.card : C.text2}
              />
              <Text style={[styles.segText, mode === m && styles.segTextActive]}>
                {m === 'ble' ? 'Bluetooth' : 'WiFi'}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>

      {/* ── BLE off warning ────────────────────────────────────── */}
      {mode === 'ble' && bleOff && (
        <View style={styles.warningCard}>
          <Ionicons name="warning-outline" size={16} color="#7A4E00" />
          <Text style={styles.warningText}>
            Attiva il Bluetooth per cercare il tracker
          </Text>
        </View>
      )}

      {/* ── Radar + status ─────────────────────────────────────── */}
      <View style={styles.scanZone}>
        <RadarRings scanning={scanState === 'scanning'} />
        <Text style={styles.scanTitle}>
          {scanState === 'scanning'
            ? `Ricerca ${mode === 'ble' ? 'Bluetooth' : 'WiFi'}…`
            : scanState === 'done' && count === 0
            ? 'Nessun dispositivo trovato'
            : scanState === 'done'
            ? `${count} dispositivo${count > 1 ? 'i' : ''} trovato${count > 1 ? 'i' : ''}`
            : 'Pronto'}
        </Text>
      </View>

      {/* ── Device list ────────────────────────────────────────── */}
      {mode === 'ble' ? (
        <FlatList
          data={bleDevices}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => (
            <Pressable
              style={({ pressed }) => [styles.bleCard, pressed && styles.bleCardPressed]}
              onPress={() => handleSelectBle(item)}
            >
              <View style={styles.bleIconWrap}>
                <Ionicons name="bluetooth" size={20} color={C.blue} />
              </View>
              <View style={styles.bleInfo}>
                <Text style={styles.bleName}>
                  {item.name ?? item.localName ?? BLE_DEVICE_NAME}
                </Text>
                <Text style={styles.bleId} numberOfLines={1}>{item.id}</Text>
              </View>
              <SignalBars rssi={item.rssi} />
              <Ionicons name="chevron-forward" size={18} color={C.text3} />
            </Pressable>
          )}
          ListEmptyComponent={
            scanState === 'done' ? (
              <View style={styles.emptyBox}>
                <Ionicons name="bluetooth-outline" size={40} color={C.text3} />
                <Text style={styles.emptyTitle}>Nessun tracker trovato</Text>
                <Text style={styles.emptyDesc}>
                  Assicurati che il dispositivo sia acceso e nelle vicinanze
                </Text>
              </View>
            ) : null
          }
        />
      ) : (
        <FlatList
          data={wifiDevices}
          keyExtractor={(item) => item.ip}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => (
            <DeviceCard device={item} onPress={() => handleSelectWifi(item.ip)} />
          )}
          ListEmptyComponent={
            scanState === 'done' ? (
              <View style={styles.emptyBox}>
                <Ionicons name="wifi-outline" size={40} color={C.text3} />
                <Text style={styles.emptyTitle}>Nessun tracker trovato</Text>
                <Text style={styles.emptyDesc}>
                  Connettiti alla rete WiFi del tracker e riprova
                </Text>
              </View>
            ) : null
          }
        />
      )}

      {/* ── Footer ─────────────────────────────────────────────── */}
      <View style={styles.footer}>
        {scanState !== 'scanning' && (
          <Pressable style={styles.primaryBtn} onPress={startScan}>
            <Ionicons name="search" size={16} color={C.card} />
            <Text style={styles.primaryBtnText}>Scansiona di nuovo</Text>
          </Pressable>
        )}

        <Pressable
          style={styles.ghostBtn}
          onPress={() => setShowManual((v) => !v)}
        >
          <Text style={styles.ghostBtnText}>
            {showManual ? 'Annulla' : 'Connessione manuale'}
          </Text>
        </Pressable>

        {showManual && (
          <View style={styles.manualRow}>
            <TextInput
              style={styles.input}
              value={manualVal}
              onChangeText={setManualVal}
              placeholder={mode === 'ble' ? 'Device ID Bluetooth' : '192.168.4.1'}
              placeholderTextColor={C.text3}
              keyboardType="numbers-and-punctuation"
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="go"
              onSubmitEditing={handleManualConnect}
            />
            <Pressable style={styles.connectBtn} onPress={handleManualConnect}>
              <Ionicons name="arrow-forward" size={18} color={C.card} />
            </Pressable>
          </View>
        )}
      </View>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },

  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingHorizontal: S.lg,
    paddingTop: S.sm,
    paddingBottom: S.md,
  },
  appTitle: {
    fontSize: 28,
    fontWeight: '800',
    color: C.text1,
    letterSpacing: -0.5,
  },
  appVersion: {
    fontSize: 12,
    color: C.text3,
    marginTop: 1,
  },
  headerBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: C.card,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },

  segWrap: { paddingHorizontal: S.lg, marginBottom: S.md },
  seg: {
    flexDirection: 'row',
    backgroundColor: C.card,
    borderRadius: R.lg,
    padding: 3,
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  segBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    borderRadius: R.md,
    gap: 6,
  },
  segBtnActive: { backgroundColor: C.accent },
  segText: { fontSize: 13, fontWeight: '600', color: C.text2 },
  segTextActive: { color: C.card },

  warningCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFF3CD',
    marginHorizontal: S.md,
    marginBottom: S.sm,
    borderRadius: R.md,
    padding: 12,
    gap: 8,
  },
  warningText: { flex: 1, fontSize: 13, color: '#7A4E00' },

  scanZone: {
    alignItems: 'center',
    paddingVertical: S.lg,
    gap: S.md,
  },
  scanTitle: {
    fontSize: 14,
    fontWeight: '500',
    color: C.text2,
  },

  list: { flexGrow: 1, paddingBottom: S.sm },

  bleCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: C.card,
    marginHorizontal: S.md,
    marginVertical: 5,
    borderRadius: R.lg,
    padding: S.md,
    gap: 12,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  bleCardPressed: { opacity: 0.75, transform: [{ scale: 0.985 }] },
  bleIconWrap: {
    width: 40,
    height: 40,
    borderRadius: R.md,
    backgroundColor: '#007AFF12',
    alignItems: 'center',
    justifyContent: 'center',
  },
  bleInfo: { flex: 1, gap: 2 },
  bleName: { fontSize: 15, fontWeight: '700', color: C.text1 },
  bleId: {
    fontSize: 11,
    color: C.text3,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },

  emptyBox: {
    alignItems: 'center',
    paddingVertical: S.xl,
    paddingHorizontal: S.xl,
    gap: S.sm,
  },
  emptyTitle: { fontSize: 16, fontWeight: '700', color: C.text2 },
  emptyDesc: { fontSize: 14, color: C.text3, textAlign: 'center', lineHeight: 20 },

  footer: { paddingHorizontal: S.md, paddingBottom: S.sm, gap: S.sm },

  primaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: C.accent,
    borderRadius: R.lg,
    paddingVertical: 15,
    gap: 8,
  },
  primaryBtnText: { color: C.card, fontWeight: '700', fontSize: 15 },

  ghostBtn: { alignItems: 'center', paddingVertical: 10 },
  ghostBtnText: { color: C.text2, fontWeight: '600', fontSize: 14 },

  manualRow: { flexDirection: 'row', gap: 8 },
  input: {
    flex: 1,
    backgroundColor: C.card,
    borderRadius: R.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: C.sep,
    paddingHorizontal: S.md,
    paddingVertical: 12,
    fontSize: 15,
    color: C.text1,
  },
  connectBtn: {
    backgroundColor: C.text1,
    borderRadius: R.md,
    width: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
})
