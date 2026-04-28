import { useCallback, useEffect, useRef, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  Animated,
  Easing,
  FlatList,
  Platform,
  Pressable,
  SafeAreaView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'
import { router } from 'expo-router'
import DeviceCard from '../components/DeviceCard'
import { DiscoveredDevice, scanSubnet } from '../services/discovery'

type ScanState = 'idle' | 'scanning' | 'done'

export default function DiscoveryScreen() {
  const [scanState, setScanState] = useState<ScanState>('idle')
  const [devices, setDevices] = useState<DiscoveredDevice[]>([])
  const [showManual, setShowManual] = useState(false)
  const [manualIp, setManualIp] = useState('')
  const pulseAnim = useRef(new Animated.Value(1)).current
  const abortRef = useRef<AbortController | null>(null)

  const pulse = useCallback(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1.15,
          duration: 700,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 700,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ])
    ).start()
  }, [pulseAnim])

  const stopPulse = useCallback(() => {
    pulseAnim.stopAnimation()
    Animated.timing(pulseAnim, {
      toValue: 1,
      duration: 200,
      useNativeDriver: true,
    }).start()
  }, [pulseAnim])

  const startScan = useCallback(async () => {
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller

    setDevices([])
    setScanState('scanning')
    pulse()

    await scanSubnet(
      (device) => setDevices((prev) => {
        const exists = prev.find((d) => d.ip === device.ip)
        return exists ? prev : [...prev, device]
      }),
      controller.signal
    )

    if (!controller.signal.aborted) {
      setScanState('done')
      stopPulse()
    }
  }, [pulse, stopPulse])

  useEffect(() => {
    startScan()
    return () => abortRef.current?.abort()
  }, [])

  const handleSelect = (ip: string) => {
    abortRef.current?.abort()
    router.push(`/tracker?ip=${ip}`)
  }

  const handleManualConnect = () => {
    const ip = manualIp.trim()
    if (!ip) return
    handleSelect(ip)
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>GPS Tracker</Text>
        <Text style={styles.subtitle}>Dispositivi nella rete</Text>
      </View>

      <View style={styles.scanArea}>
        <Animated.View style={[styles.radarOuter, { transform: [{ scale: pulseAnim }] }]}>
          <View style={styles.radarInner}>
            {scanState === 'scanning' ? (
              <ActivityIndicator size="large" color="#ff385c" />
            ) : (
              <Text style={styles.radarIcon}>📡</Text>
            )}
          </View>
        </Animated.View>

        <Text style={styles.scanStatus}>
          {scanState === 'idle' && 'Pronto'}
          {scanState === 'scanning' && 'Ricerca in corso...'}
          {scanState === 'done' &&
            (devices.length === 0
              ? 'Nessun dispositivo trovato'
              : `${devices.length} dispositivo${devices.length > 1 ? 'i' : ''} trovato${devices.length > 1 ? 'i' : ''}`)}
        </Text>
      </View>

      <FlatList
        data={devices}
        keyExtractor={(item) => item.ip}
        renderItem={({ item }) => (
          <DeviceCard device={item} onPress={() => handleSelect(item.ip)} />
        )}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          scanState === 'done' ? (
            <Text style={styles.emptyText}>
              Assicurati di essere connesso alla rete WiFi del tracker
            </Text>
          ) : null
        }
      />

      <View style={styles.footer}>
        {scanState !== 'scanning' && (
          <Pressable style={styles.scanBtn} onPress={startScan}>
            <Text style={styles.scanBtnText}>Scansiona di nuovo</Text>
          </Pressable>
        )}

        <Pressable
          style={styles.manualBtn}
          onPress={() => setShowManual((v) => !v)}
        >
          <Text style={styles.manualBtnText}>
            {showManual ? 'Annulla' : 'Connetti a IP manuale'}
          </Text>
        </Pressable>

        {showManual && (
          <View style={styles.manualRow}>
            <TextInput
              style={styles.ipInput}
              value={manualIp}
              onChangeText={setManualIp}
              placeholder="192.168.4.1"
              placeholderTextColor="#c0c0c0"
              keyboardType="decimal-pad"
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
  container: {
    flex: 1,
    backgroundColor: '#f7f7f7',
  },
  header: {
    paddingHorizontal: 24,
    paddingTop: 24,
    paddingBottom: 8,
  },
  title: {
    fontSize: 28,
    fontWeight: '800',
    color: '#222222',
  },
  subtitle: {
    fontSize: 15,
    color: '#9b9b9b',
    marginTop: 2,
  },
  scanArea: {
    alignItems: 'center',
    paddingVertical: 28,
  },
  radarOuter: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: '#ff385c18',
    alignItems: 'center',
    justifyContent: 'center',
  },
  radarInner: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: '#ff385c12',
    alignItems: 'center',
    justifyContent: 'center',
  },
  radarIcon: {
    fontSize: 32,
  },
  scanStatus: {
    marginTop: 14,
    fontSize: 14,
    color: '#6a6a6a',
    fontWeight: '500',
  },
  list: {
    paddingBottom: 8,
    flexGrow: 1,
  },
  emptyText: {
    textAlign: 'center',
    color: '#9b9b9b',
    fontSize: 14,
    paddingHorizontal: 40,
    paddingTop: 8,
  },
  footer: {
    padding: 20,
    gap: 10,
  },
  scanBtn: {
    backgroundColor: '#ff385c',
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
  },
  scanBtnText: {
    color: '#ffffff',
    fontWeight: '700',
    fontSize: 15,
  },
  manualBtn: {
    borderRadius: 14,
    paddingVertical: 12,
    alignItems: 'center',
  },
  manualBtnText: {
    color: '#6a6a6a',
    fontWeight: '600',
    fontSize: 14,
  },
  manualRow: {
    flexDirection: 'row',
    gap: 10,
  },
  ipInput: {
    flex: 1,
    backgroundColor: '#ffffff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#dddddd',
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: '#222222',
  },
  connectBtn: {
    backgroundColor: '#222222',
    borderRadius: 12,
    paddingHorizontal: 18,
    justifyContent: 'center',
  },
  connectBtnText: {
    color: '#ffffff',
    fontWeight: '700',
    fontSize: 14,
  },
})
