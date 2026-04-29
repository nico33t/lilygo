import { useCallback, useEffect, useRef, useState } from 'react'
import {
  ActivityIndicator,
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
import { Device } from 'react-native-ble-plx'
import { bleManager, BleState } from '../services/bleService'
import { BLE_SERVICE_UUID, BLE_DEVICE_NAME } from '../constants/tracker'
import { DiscoveredDevice, scanSubnet } from '../services/discovery'
import DeviceCard from '../components/DeviceCard'

type ScanMode = 'ble' | 'wifi'
type ScanState = 'idle' | 'scanning' | 'done'

export default function DiscoveryScreen() {
  const [mode, setMode] = useState<ScanMode>('ble')
  const [scanState, setScanState] = useState<ScanState>('idle')
  const [bleDevices, setBleDevices] = useState<Device[]>([])
  const [wifiDevices, setWifiDevices] = useState<DiscoveredDevice[]>([])
  const [showManual, setShowManual] = useState(false)
  const [manualIp, setManualIp] = useState('')
  const [bleOff, setBleOff] = useState(false)

  const pulseAnim = useRef(new Animated.Value(1)).current
  const wifiAbortRef = useRef<AbortController | null>(null)

  // Monitor BLE state
  useEffect(() => {
    const sub = bleManager.onStateChange((state) => {
      setBleOff(state === BleState.PoweredOff || state === BleState.Unauthorized)
    }, true)
    return () => sub.remove()
  }, [])

  const pulse = useCallback(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.15, duration: 700, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 700, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ])
    ).start()
  }, [pulseAnim])

  const stopPulse = useCallback(() => {
    pulseAnim.stopAnimation()
    Animated.timing(pulseAnim, { toValue: 1, duration: 200, useNativeDriver: true }).start()
  }, [pulseAnim])

  const startBleScan = useCallback(() => {
    setBleDevices([])
    setScanState('scanning')
    pulse()

    bleManager.startDeviceScan(
      [BLE_SERVICE_UUID],
      { allowDuplicates: false },
      (error, device) => {
        if (error) {
          setScanState('done')
          stopPulse()
          return
        }
        if (device && (device.name === BLE_DEVICE_NAME || device.localName === BLE_DEVICE_NAME)) {
          setBleDevices((prev) =>
            prev.find((d) => d.id === device.id) ? prev : [...prev, device]
          )
        }
      }
    )

    // Stop scan after 10 seconds
    const timer = setTimeout(() => {
      bleManager.stopDeviceScan()
      setScanState('done')
      stopPulse()
    }, 10000)

    return () => {
      clearTimeout(timer)
      bleManager.stopDeviceScan()
    }
  }, [pulse, stopPulse])

  const startWifiScan = useCallback(async () => {
    wifiAbortRef.current?.abort()
    const controller = new AbortController()
    wifiAbortRef.current = controller

    setWifiDevices([])
    setScanState('scanning')
    pulse()

    await scanSubnet(
      (device) => setWifiDevices((prev) =>
        prev.find((d) => d.ip === device.ip) ? prev : [...prev, device]
      ),
      controller.signal
    )

    if (!controller.signal.aborted) {
      setScanState('done')
      stopPulse()
    }
  }, [pulse, stopPulse])

  const startScan = useCallback(() => {
    setScanState('idle')
    if (mode === 'ble') return startBleScan()
    return startWifiScan()
  }, [mode, startBleScan, startWifiScan])

  useEffect(() => {
    const cleanup = startScan()
    return () => {
      cleanup?.()
      wifiAbortRef.current?.abort()
      bleManager.stopDeviceScan()
    }
  }, [mode])

  const handleSelectBle = (device: Device) => {
    bleManager.stopDeviceScan()
    router.push(`/tracker?id=${encodeURIComponent(device.id)}`)
  }

  const handleSelectWifi = (ip: string) => {
    wifiAbortRef.current?.abort()
    router.push(`/tracker?ip=${ip}`)
  }

  const handleManualConnect = () => {
    const val = manualIp.trim()
    if (!val) return
    // IP address → WiFi, anything else → BLE
    const isIp = /^\d{1,3}(\.\d{1,3}){3}$/.test(val)
    if (isIp) {
      router.push(`/tracker?ip=${val}`)
    } else {
      router.push(`/tracker?id=${encodeURIComponent(val)}`)
    }
  }

  const devicesCount = mode === 'ble' ? bleDevices.length : wifiDevices.length

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>GPS Tracker</Text>
        <View style={styles.modeRow}>
          <Pressable
            style={[styles.modeBtn, mode === 'ble' && styles.modeBtnActive]}
            onPress={() => { setMode('ble'); setScanState('idle') }}
          >
            <Text style={[styles.modeBtnText, mode === 'ble' && styles.modeBtnTextActive]}>
              Bluetooth
            </Text>
          </Pressable>
          <Pressable
            style={[styles.modeBtn, mode === 'wifi' && styles.modeBtnActive]}
            onPress={() => { setMode('wifi'); setScanState('idle') }}
          >
            <Text style={[styles.modeBtnText, mode === 'wifi' && styles.modeBtnTextActive]}>
              WiFi
            </Text>
          </Pressable>
        </View>
      </View>

      {mode === 'ble' && bleOff && (
        <View style={styles.banner}>
          <Text style={styles.bannerText}>
            Bluetooth disabilitato. Attivalo nelle impostazioni per cercare il tracker.
          </Text>
        </View>
      )}

      <View style={styles.scanArea}>
        <Animated.View style={[styles.radarOuter, { transform: [{ scale: pulseAnim }] }]}>
          <View style={styles.radarInner}>
            {scanState === 'scanning' ? (
              <ActivityIndicator size="large" color="#ff385c" />
            ) : (
              <Text style={styles.radarIcon}>{mode === 'ble' ? '📶' : '📡'}</Text>
            )}
          </View>
        </Animated.View>
        <Text style={styles.scanStatus}>
          {scanState === 'idle' && 'Pronto'}
          {scanState === 'scanning' && `Ricerca ${mode === 'ble' ? 'Bluetooth' : 'WiFi'}...`}
          {scanState === 'done' && (devicesCount === 0
            ? 'Nessun dispositivo trovato'
            : `${devicesCount} dispositivo${devicesCount > 1 ? 'i' : ''} trovato${devicesCount > 1 ? 'i' : ''}`)}
        </Text>
      </View>

      {mode === 'ble' ? (
        <FlatList
          data={bleDevices}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <Pressable style={styles.bleCard} onPress={() => handleSelectBle(item)}>
              <View style={styles.bleCardLeft}>
                <Text style={styles.bleCardName}>{item.name ?? item.localName ?? BLE_DEVICE_NAME}</Text>
                <Text style={styles.bleCardId} numberOfLines={1}>{item.id}</Text>
              </View>
              <View style={styles.bleCardRight}>
                {item.rssi != null && (
                  <Text style={styles.bleRssi}>{item.rssi} dBm</Text>
                )}
                <Text style={styles.bleArrow}>›</Text>
              </View>
            </Pressable>
          )}
          contentContainerStyle={styles.list}
          ListEmptyComponent={
            scanState === 'done' ? (
              <Text style={styles.emptyText}>
                Assicurati che il tracker sia acceso e nelle vicinanze
              </Text>
            ) : null
          }
        />
      ) : (
        <FlatList
          data={wifiDevices}
          keyExtractor={(item) => item.ip}
          renderItem={({ item }) => (
            <DeviceCard device={item} onPress={() => handleSelectWifi(item.ip)} />
          )}
          contentContainerStyle={styles.list}
          ListEmptyComponent={
            scanState === 'done' ? (
              <Text style={styles.emptyText}>
                Connettiti alla rete WiFi del tracker e riprova
              </Text>
            ) : null
          }
        />
      )}

      <View style={styles.footer}>
        {scanState !== 'scanning' && (
          <Pressable style={styles.scanBtn} onPress={startScan}>
            <Text style={styles.scanBtnText}>Scansiona di nuovo</Text>
          </Pressable>
        )}

        <Pressable style={styles.manualBtn} onPress={() => setShowManual((v) => !v)}>
          <Text style={styles.manualBtnText}>
            {showManual ? 'Annulla' : 'Connessione manuale'}
          </Text>
        </Pressable>

        {showManual && (
          <View style={styles.manualRow}>
            <TextInput
              style={styles.ipInput}
              value={manualIp}
              onChangeText={setManualIp}
              placeholder={mode === 'ble' ? 'Device ID BLE' : '192.168.4.1'}
              placeholderTextColor="#c0c0c0"
              keyboardType="numbers-and-punctuation"
              autoCapitalize="none"
              autoCorrect={false}
            />
            <Pressable style={styles.connectBtn} onPress={handleManualConnect}>
              <Text style={styles.connectBtnText}>Connetti</Text>
            </Pressable>
          </View>
        )}
      </View>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f7f7f7' },
  header: { paddingHorizontal: 24, paddingTop: 20, paddingBottom: 8, gap: 12 },
  title: { fontSize: 28, fontWeight: '800', color: '#222222' },
  modeRow: { flexDirection: 'row', gap: 8 },
  modeBtn: {
    paddingVertical: 6, paddingHorizontal: 16, borderRadius: 20,
    backgroundColor: '#ebebeb',
  },
  modeBtnActive: { backgroundColor: '#ff385c' },
  modeBtnText: { fontSize: 13, fontWeight: '600', color: '#6a6a6a' },
  modeBtnTextActive: { color: '#ffffff' },
  banner: {
    marginHorizontal: 16, marginBottom: 4, backgroundColor: '#fff3cd',
    borderRadius: 10, padding: 12,
  },
  bannerText: { fontSize: 13, color: '#7a5c00', textAlign: 'center' },
  scanArea: { alignItems: 'center', paddingVertical: 24 },
  radarOuter: {
    width: 100, height: 100, borderRadius: 50,
    backgroundColor: '#ff385c18', alignItems: 'center', justifyContent: 'center',
  },
  radarInner: {
    width: 72, height: 72, borderRadius: 36,
    backgroundColor: '#ff385c12', alignItems: 'center', justifyContent: 'center',
  },
  radarIcon: { fontSize: 32 },
  scanStatus: { marginTop: 14, fontSize: 14, color: '#6a6a6a', fontWeight: '500' },
  list: { paddingBottom: 8, flexGrow: 1 },
  bleCard: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: '#ffffff', marginHorizontal: 16, marginVertical: 5,
    borderRadius: 14, paddingHorizontal: 16, paddingVertical: 14,
    shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 6, shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  bleCardLeft: { flex: 1, gap: 2 },
  bleCardName: { fontSize: 15, fontWeight: '700', color: '#222222' },
  bleCardId: { fontSize: 11, color: '#9b9b9b', fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' },
  bleCardRight: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  bleRssi: { fontSize: 12, color: '#6a6a6a' },
  bleArrow: { fontSize: 22, color: '#cccccc', fontWeight: '300' },
  emptyText: { textAlign: 'center', color: '#9b9b9b', fontSize: 14, paddingHorizontal: 40, paddingTop: 8 },
  footer: { padding: 20, gap: 10 },
  scanBtn: { backgroundColor: '#ff385c', borderRadius: 14, paddingVertical: 14, alignItems: 'center' },
  scanBtnText: { color: '#ffffff', fontWeight: '700', fontSize: 15 },
  manualBtn: { borderRadius: 14, paddingVertical: 12, alignItems: 'center' },
  manualBtnText: { color: '#6a6a6a', fontWeight: '600', fontSize: 14 },
  manualRow: { flexDirection: 'row', gap: 10 },
  ipInput: {
    flex: 1, backgroundColor: '#ffffff', borderRadius: 12,
    borderWidth: 1, borderColor: '#dddddd',
    paddingHorizontal: 14, paddingVertical: 12,
    fontSize: 15, color: '#222222',
  },
  connectBtn: { backgroundColor: '#222222', borderRadius: 12, paddingHorizontal: 18, justifyContent: 'center' },
  connectBtnText: { color: '#ffffff', fontWeight: '700', fontSize: 14 },
})
