import { Ionicons } from '@expo/vector-icons'
import { router } from 'expo-router'
import { useCallback, useEffect, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import type { Device as BleDevice } from 'react-native-ble-plx'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { C, R, S } from '../constants/design'
import { useAuth } from '../hooks/useAuth'
import { useCachedUserProfile } from '../hooks/useCachedUserProfile'
import { claimDevice, type DeviceInfo, listUserDevices } from '../services/deviceService'
import { bleManager, BleState } from '../services/bleService'

export default function DevicesScreen() {
  const insets = useSafeAreaInsets()
  const user = useAuth()
  const { photoURL: userPhoto } = useCachedUserProfile(user)
  const [devices, setDevices] = useState<DeviceInfo[]>([])
  const [bleDevices, setBleDevices] = useState<BleDevice[]>([])
  const [bleStatus, setBleStatus] = useState<'unsupported' | 'off' | 'ready' | 'scanning'>('unsupported')
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [isScanning, setIsScanning] = useState(false)
  const [claimingIds, setClaimingIds] = useState<string[]>([])

  const load = useCallback(async (mode: 'initial' | 'refresh' = 'initial') => {
    if (mode === 'refresh') setRefreshing(true)
    if (mode === 'initial') setLoading(true)
    try {
      const data = await listUserDevices()
      setDevices(data)
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  useEffect(() => {
    if (user === undefined) return
    load('initial')
  }, [load, user])

  const handleClaimDevice = useCallback(async (device: BleDevice) => {
    if (!user) {
      router.push('/login')
      return
    }
    const suggestedName = device.name || device.localName || 'GPS Tracker'
    setClaimingIds((prev) => [...prev, device.id])
    try {
      await claimDevice(device.id, suggestedName)
      await load('refresh')
      Alert.alert('Tracker associato', 'Il dispositivo è ora disponibile anche nella sezione Cloud.')
    } catch (e: any) {
      Alert.alert('Associazione non riuscita', e?.message || 'Riprova più tardi.')
    } finally {
      setClaimingIds((prev) => prev.filter((id) => id !== device.id))
    }
  }, [load, user])

  const startBleScan = useCallback(async () => {
    if (!bleManager) {
      setBleStatus('unsupported')
      return
    }

    try {
      const state = await bleManager.state()
      if (state !== BleState.PoweredOn) {
        setBleStatus('off')
        setIsScanning(false)
        return
      }

      setBleStatus('scanning')
      setIsScanning(true)
      setBleDevices([])

      bleManager.startDeviceScan(null, null, (error, device) => {
        if (error) {
          setIsScanning(false)
          setBleStatus('ready')
          return
        }
        if (!device) return
        if (!device.name && !device.localName) return
        if (device.name && !device.name.toLowerCase().includes('gps')) return

        setBleDevices((prev) => {
          const idx = prev.findIndex((d) => d.id === device.id)
          if (idx === -1) return [...prev, device]
          const next = [...prev]
          next[idx] = device
          return next
        })
      })

      setTimeout(() => {
        bleManager.stopDeviceScan()
        setIsScanning(false)
        setBleStatus('ready')
      }, 7000)
    } catch {
      setBleStatus('off')
      setIsScanning(false)
    }
  }, [])

  useEffect(() => {
    if (!bleManager) {
      setBleStatus('unsupported')
      return
    }

    let mounted = true
    bleManager.state().then((state) => {
      if (!mounted) return
      if (state === BleState.PoweredOn) {
        startBleScan()
      } else {
        setBleStatus('off')
      }
    }).catch(() => {
      if (mounted) setBleStatus('off')
    })

    const sub = bleManager.onStateChange((state) => {
      if (state === BleState.PoweredOn) {
        startBleScan()
      } else {
        bleManager.stopDeviceScan()
        setIsScanning(false)
        setBleStatus('off')
      }
    }, false)

    return () => {
      mounted = false
      sub.remove()
      bleManager.stopDeviceScan()
    }
  }, [startBleScan])

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={C.accent} />
      </View>
    )
  }

  return (
    <View style={styles.root}>
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <View style={styles.headerRow}>
          <Text style={styles.title}>Dispositivi</Text>
          <Pressable
            style={styles.profileBtn}
            onPress={() => router.push(user ? '/user-settings' : '/login')}
            hitSlop={10}
          >
            {userPhoto ? (
              <Image source={{ uri: userPhoto }} style={styles.profileImage} />
            ) : (
              <Ionicons name="person-circle-outline" size={24} color={C.text1} />
            )}
          </Pressable>
        </View>
      </View>

      <FlatList
        data={[]}
        keyExtractor={(_, idx) => `section-${idx}`}
        contentContainerStyle={[
          styles.listContent,
          { paddingBottom: insets.bottom + S.lg },
          devices.length === 0 && bleDevices.length === 0 && styles.emptyListContent,
        ]}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={async () => {
              setRefreshing(true)
              await Promise.all([load('refresh'), startBleScan()])
              setRefreshing(false)
            }}
          />
        }
        ListEmptyComponent={
          <View style={styles.emptyBox}>
            <Text style={styles.emptyTitle}>Nessun dispositivo</Text>
            <Text style={styles.emptyDesc}>
              Collega/associa un tracker per vederlo qui.
            </Text>
          </View>
        }
        ListHeaderComponent={
          <View style={styles.section}>
            <View style={styles.sectionHead}>
              <Text style={styles.sectionTitle}>Bluetooth</Text>
              <Pressable
                onPress={startBleScan}
                style={styles.scanBtn}
                disabled={isScanning || bleStatus === 'unsupported'}
              >
                <Ionicons name="scan-outline" size={14} color={C.accent} />
                <Text style={styles.scanBtnText}>{isScanning ? 'Scansione…' : 'Scansiona'}</Text>
              </Pressable>
            </View>
            <Text style={styles.sectionHint}>
              {bleStatus === 'unsupported' ? 'BLE non disponibile in questa build'
                : bleStatus === 'off' ? 'Bluetooth disattivato'
                : bleDevices.length === 0 ? 'Nessun tracker BLE trovato'
                : `${bleDevices.length} tracker BLE trovato/i`}
            </Text>
            {bleDevices.map((item) => (
              <Pressable
                key={`ble-${item.id}`}
                style={styles.card}
                onPress={() => router.push(`/tracker?id=${encodeURIComponent(item.id)}`)}
              >
                <View style={styles.cardLeft}>
                  <Text style={styles.cardName} numberOfLines={1}>
                    {item.name || item.localName || 'GPS Tracker'}
                  </Text>
                  <Text style={styles.cardId} numberOfLines={1}>{item.id}</Text>
                </View>
                <View style={styles.cardRight}>
                  <Text style={styles.rssi}>{item.rssi ?? '—'} dBm</Text>
                  <Pressable
                    onPress={() => handleClaimDevice(item)}
                    style={styles.claimBtn}
                    disabled={claimingIds.includes(item.id)}
                  >
                    {claimingIds.includes(item.id) ? (
                      <ActivityIndicator size="small" color={C.accent} />
                    ) : (
                      <>
                        <Ionicons name="cloud-upload-outline" size={14} color={C.accent} />
                        <Text style={styles.claimText}>Cloud</Text>
                      </>
                    )}
                  </Pressable>
                </View>
              </Pressable>
            ))}
          </View>
        }
        ListFooterComponent={
          <View style={styles.section}>
            <View style={styles.sectionHead}>
              <Text style={styles.sectionTitle}>Cloud</Text>
              {!user && (
                <Pressable onPress={() => router.push('/login')} style={styles.scanBtn}>
                  <Ionicons name="log-in-outline" size={14} color={C.accent} />
                  <Text style={styles.scanBtnText}>Accedi</Text>
                </Pressable>
              )}
            </View>
            {!user ? (
              <Text style={styles.sectionHint}>
                Accedi per sincronizzare i tracker nel cloud e ritrovarli su tutti i dispositivi.
              </Text>
            ) : devices.length === 0 ? (
              <Text style={styles.sectionHint}>
                Nessun tracker cloud associato. Usa il pulsante Cloud sui dispositivi BLE.
              </Text>
            ) : (
              devices.map((item) => (
                <Pressable
                  key={`cloud-item-${item.id}`}
                  style={styles.card}
                  onPress={() => router.push(`/tracker?id=${encodeURIComponent(item.id)}`)}
                >
                  <View style={styles.cardLeft}>
                    <Text style={styles.cardName} numberOfLines={1}>{item.name || 'Tracker'}</Text>
                    <Text style={styles.cardId} numberOfLines={1}>{item.id}</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={18} color={C.text3} />
                </Pressable>
              ))
            )}
          </View>
        }
        renderItem={() => null}
      />
      <View style={[styles.bottomTestWrap, { paddingBottom: insets.bottom + 12 }]}>
        <Pressable style={[styles.bottomTestBtn, { backgroundColor: C.text1 }]} onPress={() => router.push('/cluster-test' as any)}>
          <Ionicons name="flask-outline" size={16} color="#fff" />
          <Text style={styles.bottomTestText}>Cluster Test</Text>
        </Pressable>
        <Pressable style={styles.bottomTestBtn} onPress={() => router.push('/sim-trip-test' as any)}>
          <Ionicons name="car-outline" size={18} color="#fff" />
          <Text style={styles.bottomTestText}>Sim Trip</Text>
        </Pressable>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: C.bg },
  header: {
    paddingHorizontal: S.md,
    paddingBottom: S.sm,
  },
  title: {
    fontSize: 30,
    fontWeight: '800',
    color: C.text1,
    letterSpacing: -0.4,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  profileBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.96)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: C.sep,
    overflow: 'hidden',
  },
  profileImage: {
    width: '100%',
    height: '100%',
  },
  listContent: {
    paddingHorizontal: S.md,
    gap: S.sm,
  },
  section: {
    gap: S.sm,
    marginBottom: S.md,
  },
  sectionHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: C.text1,
  },
  sectionHint: {
    fontSize: 12,
    color: C.text3,
  },
  scanBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#fff',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: C.sep,
    borderRadius: R.full,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  scanBtnText: {
    fontSize: 12,
    color: C.accent,
    fontWeight: '700',
  },
  emptyListContent: {
    flexGrow: 1,
    justifyContent: 'center',
  },
  emptyBox: {
    alignItems: 'center',
    paddingHorizontal: S.lg,
    gap: S.xs,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: C.text1,
  },
  emptyDesc: {
    fontSize: 14,
    color: C.text3,
    textAlign: 'center',
  },
  card: {
    minHeight: 68,
    borderRadius: R.lg,
    backgroundColor: C.card,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: C.sep,
    paddingHorizontal: S.md,
    paddingVertical: S.sm,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  cardLeft: { flex: 1, marginRight: S.sm },
  cardRight: {
    alignItems: 'flex-end',
    gap: 6,
  },
  cardName: {
    fontSize: 16,
    fontWeight: '700',
    color: C.text1,
  },
  cardId: {
    marginTop: 2,
    fontSize: 12,
    color: C.text3,
  },
  rssi: {
    fontSize: 12,
    color: C.text2,
    fontWeight: '600',
  },
  bottomTestWrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 12,
    pointerEvents: 'box-none',
  },
  bottomTestBtn: {
    height: 42,
    borderRadius: R.full,
    backgroundColor: C.accent,
    paddingHorizontal: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    shadowColor: '#000',
    shadowOpacity: 0.16,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 5,
  },
  bottomTestText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
  },
  claimBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: C.sep,
    backgroundColor: '#fff',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: R.full,
    minWidth: 72,
    justifyContent: 'center',
  },
  claimText: {
    fontSize: 12,
    fontWeight: '700',
    color: C.accent,
  },
})
