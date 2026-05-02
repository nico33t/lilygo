import { Ionicons } from '@expo/vector-icons'
import { router } from 'expo-router'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Modal, Platform, Pressable, StyleSheet, Text, View } from 'react-native'
import MapView, { Marker, PROVIDER_GOOGLE, Region } from 'react-native-maps'
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context'
import { C, S } from '../constants/design'
import {
  buildNativeClusters,
  getClusterExpansionZoom,
  getClusterLeaves,
  getClusterProviderTuning,
  isNativeClusteringAvailable,
} from '../services/nativeClustering'
import { getSharedMarkerImageSource } from '../services/mapMarkerImage'
import type { ClusterFeature } from '../types/clustering'

const MAP_PROVIDER =
  (Platform.OS === 'android' && process.env.EXPO_PUBLIC_GOOGLE_MAPS_ANDROID_KEY) ||
  (Platform.OS === 'ios' && process.env.EXPO_PUBLIC_GOOGLE_MAPS_IOS_KEY)
    ? PROVIDER_GOOGLE
    : undefined

const CENTER = { latitude: 45.4642, longitude: 9.19 } // Milano
const SHARED_MARKER_IMAGE = getSharedMarkerImageSource()
const CLUSTER_COLOR_LOW = process.env.EXPO_PUBLIC_CLUSTER_COLOR_LOW ?? '#2E86DE'
const CLUSTER_COLOR_MEDIUM = process.env.EXPO_PUBLIC_CLUSTER_COLOR_MEDIUM ?? '#F39C12'
const CLUSTER_COLOR_HIGH = process.env.EXPO_PUBLIC_CLUSTER_COLOR_HIGH ?? '#E74C3C'

function computeRawZoom(longitudeDelta: number): number {
  const safeDelta = Math.max(longitudeDelta, 0.000001)
  return Math.max(0, Math.min(22, Math.log2(360 / safeDelta)))
}

function getClusterPinColor(count: number): string {
  if (count >= 50) return CLUSTER_COLOR_HIGH
  if (count >= 10) return CLUSTER_COLOR_MEDIUM
  return CLUSTER_COLOR_LOW
}

function getDatasetTuning(size: 50 | 500 | 5000) {
  if (size === 50) return { radius: 42, minPoints: 2, maxZoom: 22 }
  if (size === 500) return { radius: 44, minPoints: 2, maxZoom: 22 }
  return { radius: 40, minPoints: 2, maxZoom: 22 }
}

export default function ClusterTestScreen() {
  const insets = useSafeAreaInsets()
  const mapRef = useRef<MapView | null>(null)
  const regionDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const clusterComputeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const refreshDelayMsRef = useRef(140)
  const lastClusterRef = useRef<{
    zoom: number
    centerLat: number
    centerLon: number
    clusters: ClusterFeature[]
    at: number
  } | null>(null)
  const [region, setRegion] = useState<Region>({
    latitude: CENTER.latitude,
    longitude: CENTER.longitude,
    latitudeDelta: 0.09,
    longitudeDelta: 0.09,
  })
  const [size, setSize] = useState<50 | 500 | 5000>(50)
  const [clusters, setClusters] = useState<ClusterFeature[]>([])
  const [bench, setBench] = useState<{ ms: number; points: number; clusters: number }>({
    ms: 0,
    points: 0,
    clusters: 0,
  })
  const [leavesModalVisible, setLeavesModalVisible] = useState(false)
  const [leavesCount, setLeavesCount] = useState(0)
  const runIdRef = useRef(0)
  const stableZoomRef = useRef<number | null>(null)
  const clusterTuning = useMemo(() => getClusterProviderTuning(MAP_PROVIDER), [])
  const datasetTuning = useMemo(() => getDatasetTuning(size), [size])

  const markers = useMemo(() => {
    const out: Array<{ id: string; latitude: number; longitude: number; heading: number }> = []
    const spread = size === 50 ? 0.03 : size === 500 ? 0.08 : 0.2
    for (let i = 0; i < size; i += 1) {
      const latJitter = (Math.random() - 0.5) * spread
      const lonJitter = (Math.random() - 0.5) * spread
      out.push({
        id: `mk_${i}`,
        latitude: CENTER.latitude + latJitter,
        longitude: CENTER.longitude + lonJitter,
        heading: Math.round(Math.random() * 360),
      })
    }
    return out
  }, [size])

  const inputPoints = useMemo(
    () => markers.map((m) => ({ id: m.id, latitude: m.latitude, longitude: m.longitude })),
    [markers]
  )

  useEffect(() => {
    if (!mapRef.current || markers.length === 0) return
    const coords = markers.map((m) => ({ latitude: m.latitude, longitude: m.longitude }))
    mapRef.current.fitToCoordinates(coords, {
      animated: true,
      edgePadding: { top: 80, right: 60, bottom: 80, left: 60 },
    })
  }, [markers, size])

  useEffect(() => {
    return () => {
      if (regionDebounceRef.current) clearTimeout(regionDebounceRef.current)
      if (clusterComputeTimerRef.current) clearTimeout(clusterComputeTimerRef.current)
    }
  }, [])

  useEffect(() => {
    if (!isNativeClusteringAvailable()) {
      setClusters(
        inputPoints.map((p) => ({
          id: p.id || `${p.latitude}_${p.longitude}`,
          type: 'point',
          count: 1,
          latitude: p.latitude,
          longitude: p.longitude,
        }))
      )
      lastClusterRef.current = null
      return
    }
    const runId = ++runIdRef.current
    const rawZoom = computeRawZoom(region.longitudeDelta)
    const prevStableZoom = stableZoomRef.current
    const stableZoom =
      prevStableZoom == null || Math.abs(rawZoom - prevStableZoom) >= 0.35
        ? Math.round(rawZoom)
        : prevStableZoom
    stableZoomRef.current = stableZoom
    const now = Date.now()
    const cached = lastClusterRef.current
    if (cached) {
      const sameZoom = cached.zoom === stableZoom
      const centerDriftLat = Math.abs(region.latitude - cached.centerLat)
      const centerDriftLon = Math.abs(region.longitude - cached.centerLon)
      const centerDriftRatioLat = centerDriftLat / Math.max(region.latitudeDelta, 0.000001)
      const centerDriftRatioLon = centerDriftLon / Math.max(region.longitudeDelta, 0.000001)
      const movedLittle = centerDriftRatioLat < 0.08 && centerDriftRatioLon < 0.08
      const stillFresh = now - cached.at < 1800
      if (sameZoom && movedLittle && stillFresh) {
        if (clusters !== cached.clusters) setClusters(cached.clusters)
        return
      }
    }
    const bounds = {
      north: region.latitude + region.latitudeDelta / 2,
      south: region.latitude - region.latitudeDelta / 2,
      east: region.longitude + region.longitudeDelta / 2,
      west: region.longitude - region.longitudeDelta / 2,
    }
    if (clusterComputeTimerRef.current) clearTimeout(clusterComputeTimerRef.current)
    clusterComputeTimerRef.current = setTimeout(() => {
      const startedAt = global.performance?.now?.() ?? Date.now()
      buildNativeClusters(inputPoints, stableZoom, bounds, {
        ...clusterTuning,
        datasetId: `cluster_test_${size}`,
        radius: datasetTuning.radius,
        minPoints: datasetTuning.minPoints,
        maxZoom: datasetTuning.maxZoom,
      })
        .then((res) => {
          if (runId !== runIdRef.current) return
          setClusters(res)
          lastClusterRef.current = {
            zoom: stableZoom,
            centerLat: region.latitude,
            centerLon: region.longitude,
            clusters: res,
            at: Date.now(),
          }
          const finishedAt = global.performance?.now?.() ?? Date.now()
          const clusterCount = res.filter((r) => r.type === 'cluster' && r.count > 1).length
          const ratio = clusterCount / Math.max(1, res.length)
          refreshDelayMsRef.current = ratio > 0.6 ? 320 : ratio > 0.3 ? 220 : 120
          setBench({
            ms: Math.max(0, finishedAt - startedAt),
            points: inputPoints.length,
            clusters: clusterCount,
          })
        })
        .catch(() => {
          // Keep previous valid result to avoid transient flicker on async races/errors.
        })
    }, refreshDelayMsRef.current)
  }, [clusterTuning, datasetTuning, inputPoints, region, size])

  const onClusterPress = async (feature: ClusterFeature) => {
    if (feature.type !== 'cluster' || feature.count <= 1 || !mapRef.current) return
    try {
      const expansionZoom = await getClusterExpansionZoom(feature.id)
      const nextDelta = Math.max(0.0008, 360 / Math.pow(2, Math.max(1, expansionZoom)))
      mapRef.current.animateToRegion(
        {
          latitude: feature.latitude,
          longitude: feature.longitude,
          latitudeDelta: nextDelta,
          longitudeDelta: nextDelta,
        },
        320
      )
      const leaves = await getClusterLeaves(feature.id, 50, 0)
      setLeavesCount(leaves.length)
      setLeavesModalVisible(true)
    } catch {
      // ignore tap errors in demo mode
    }
  }

  return (
    <SafeAreaView style={styles.root}>
      <View style={[styles.header, { paddingTop: insets.top + 6 }]}>
        <Pressable onPress={() => router.back()} style={styles.iconBtn} hitSlop={8}>
          <Ionicons name="arrow-back" size={20} color={C.text1} />
        </Pressable>
        <Text style={styles.title}>Cluster Test</Text>
        <View style={styles.headerRightSpacer} />
      </View>
      <View style={styles.datasetBar}>
        <Text style={styles.datasetLabel}>Dataset: {size}</Text>
        <View style={styles.controlsRow}>
          {[50, 500, 5000].map((n) => (
            <Pressable
              key={n}
              onPress={() => setSize(n as 50 | 500 | 5000)}
              hitSlop={8}
              style={[styles.sizeBtn, size === n && styles.sizeBtnActive]}
            >
              <Text style={[styles.sizeBtnText, size === n && styles.sizeBtnTextActive]}>{n}</Text>
            </Pressable>
          ))}
        </View>
      </View>
      <View style={styles.benchBar}>
        <Text style={styles.benchText}>
          build: {bench.ms.toFixed(1)} ms | points: {bench.points} | clusters: {bench.clusters}
        </Text>
      </View>

      <MapView
        ref={mapRef}
        style={styles.map}
        provider={MAP_PROVIDER}
        googleRenderer={Platform.OS === 'android' ? 'LEGACY' : undefined}
        initialRegion={{
          latitude: CENTER.latitude,
          longitude: CENTER.longitude,
          latitudeDelta: 0.09,
          longitudeDelta: 0.09,
        }}
        onRegionChangeComplete={(next) => {
          if (regionDebounceRef.current) clearTimeout(regionDebounceRef.current)
          regionDebounceRef.current = setTimeout(() => setRegion(next), 120)
        }}
      >
        {clusters.map((f) => {
          const isCluster = f.type === 'cluster' && f.count > 1
          if (isCluster) {
            return (
              <Marker
                key={f.id}
                coordinate={{ latitude: f.latitude, longitude: f.longitude }}
                tracksViewChanges={false}
                onPress={() => onClusterPress(f)}
                pinColor={getClusterPinColor(f.count)}
                title={`${f.count}`}
              />
            )
          }

          const sourceMarker = markers.find((m) => m.id === f.id)
          return (
            <Marker
              key={f.id}
              coordinate={{ latitude: f.latitude, longitude: f.longitude }}
              anchor={{ x: 0.5, y: 0.5 }}
              flat
              rotation={sourceMarker?.heading ?? 0}
              tracksViewChanges={false}
              image={SHARED_MARKER_IMAGE as any}
            />
          )
        })}
      </MapView>

      <Modal
        visible={leavesModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setLeavesModalVisible(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Cluster leaves</Text>
            <Text style={styles.modalText}>Primi leaves caricati: {leavesCount}</Text>
            <Pressable onPress={() => setLeavesModalVisible(false)} style={styles.modalCloseBtn}>
              <Text style={styles.modalCloseBtnText}>Chiudi</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: S.md,
    paddingBottom: S.sm,
    backgroundColor: C.card,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: C.sep,
  },
  iconBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: C.sep,
  },
  headerRightSpacer: {
    width: 36,
    height: 36,
  },
  datasetBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: S.md,
    paddingVertical: 8,
    backgroundColor: '#fff',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: C.sep,
  },
  datasetLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: C.text1,
  },
  controlsRow: {
    flexDirection: 'row',
    gap: 6,
  },
  sizeBtn: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: C.sep,
    backgroundColor: '#fff',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
  },
  sizeBtnActive: {
    backgroundColor: C.text1,
  },
  sizeBtnText: {
    fontSize: 11,
    fontWeight: '600',
    color: C.text1,
  },
  sizeBtnTextActive: {
    color: '#fff',
  },
  title: {
    fontSize: 16,
    fontWeight: '700',
    color: C.text1,
  },
  benchBar: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: C.sep,
    paddingHorizontal: S.md,
    paddingVertical: 6,
    backgroundColor: '#fff',
  },
  benchText: {
    fontSize: 12,
    color: C.text2,
    fontWeight: '600',
  },
  map: {
    flex: 1,
  },
  clusterBubble: {
    minWidth: 34,
    height: 34,
    paddingHorizontal: 8,
    borderRadius: 17,
    backgroundColor: 'rgba(255,56,92,0.92)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#fff',
  },
  clusterText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.36)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: S.md,
  },
  modalCard: {
    width: '100%',
    maxWidth: 320,
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 14,
    gap: 8,
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: C.text1,
  },
  modalText: {
    fontSize: 13,
    color: C.text2,
  },
  modalCloseBtn: {
    alignSelf: 'flex-end',
    backgroundColor: C.text1,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  modalCloseBtnText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 12,
  },
})
