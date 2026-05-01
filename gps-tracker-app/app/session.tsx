import { useEffect, useMemo, useRef, useState } from 'react'
import { ActivityIndicator, Platform, Pressable, StyleSheet, Text, View } from 'react-native'
import MapView, { Circle, Marker, PROVIDER_GOOGLE, Polyline, Region } from 'react-native-maps'
import Slider from '@react-native-community/slider'
import { router, useLocalSearchParams } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { getSessionPoints } from '../services/historyService'
import type { TrackPoint } from '../types'
import { C, S } from '../constants/design'
import {
  buildNativeClusters,
  getClusterProviderTuning,
  isNativeClusteringAvailable,
} from '../services/nativeClustering'
import type { ClusterFeature } from '../types/clustering'

const MAP_PROVIDER =
  (Platform.OS === 'android' && process.env.EXPO_PUBLIC_GOOGLE_MAPS_ANDROID_KEY) ||
  (Platform.OS === 'ios' && process.env.EXPO_PUBLIC_GOOGLE_MAPS_IOS_KEY)
    ? PROVIDER_GOOGLE
    : undefined
const POSITION_CIRCLE_RADIUS_M = 18
const CLUSTER_RADIUS = 56
const CLUSTER_MIN_POINTS = 3
const CLUSTER_MAX_ZOOM = 18
const CLUSTER_POINT_THRESHOLD = 80

export default function SessionScreen() {
  const { id, device } = useLocalSearchParams<{ id: string; device: string }>()
  const insets = useSafeAreaInsets()
  const [points, setPoints] = useState<TrackPoint[]>([])
  const [loading, setLoading] = useState(true)
  const [scrubIndex, setScrubIndex] = useState(0)
  const [panelHeight, setPanelHeight] = useState(0)
  const [region, setRegion] = useState<Region | null>(null)
  const [clusters, setClusters] = useState<ClusterFeature[]>([])
  const clusterRunId = useRef(0)
  const clusterTuning = useMemo(() => getClusterProviderTuning(MAP_PROVIDER), [])

  useEffect(() => {
    getSessionPoints(id, device).then((pts) => {
      setPoints(pts)
      setScrubIndex(pts.length - 1)
      setLoading(false)
    })
  }, [id, device])

  const coords = points.map((p) => ({ latitude: p.lat, longitude: p.lon }))
  const current = points[scrubIndex]
  const canCluster = isNativeClusteringAvailable() && points.length >= CLUSTER_POINT_THRESHOLD

  const clusterInput = useMemo(
    () => points.map((p, idx) => ({ id: `pt_${idx}`, latitude: p.lat, longitude: p.lon })),
    [points]
  )

  useEffect(() => {
    if (!canCluster || !region) {
      setClusters([])
      return
    }

    const runId = ++clusterRunId.current
    const zoom = Math.max(0, Math.min(22, Math.round(Math.log2(360 / region.longitudeDelta))))
    const bounds = {
      north: region.latitude + region.latitudeDelta / 2,
      south: region.latitude - region.latitudeDelta / 2,
      east: region.longitude + region.longitudeDelta / 2,
      west: region.longitude - region.longitudeDelta / 2,
    }

    buildNativeClusters(clusterInput, zoom, bounds, {
      ...clusterTuning,
      radius: clusterTuning.radius ?? CLUSTER_RADIUS,
      minPoints: clusterTuning.minPoints ?? CLUSTER_MIN_POINTS,
      maxZoom: clusterTuning.maxZoom ?? CLUSTER_MAX_ZOOM,
    })
      .then((result) => {
        if (clusterRunId.current !== runId) return
        setClusters(result)
      })
      .catch(() => {
        if (clusterRunId.current !== runId) return
        setClusters([])
      })
  }, [canCluster, clusterInput, region, clusterTuning])

  return (
    <View style={{ flex: 1, backgroundColor: C.card }}>
      <View style={[styles.header, { paddingTop: insets.top + 6 }]}>
        <Pressable onPress={() => router.back()} style={styles.iconBtn} hitSlop={8}>
          <Ionicons name="arrow-back" size={22} color={C.text1} />
        </Pressable>
        <Text style={styles.title}>Dettaglio percorso</Text>
      </View>

      {loading ? (
        <ActivityIndicator style={{ marginTop: 60 }} color={C.accent} />
      ) : (
        <>
          <MapView
            style={{ flex: 1 }}
            provider={MAP_PROVIDER}
            mapPadding={{ top: 0, right: 0, bottom: panelHeight, left: 0 }}
            initialRegion={coords.length > 0 ? {
              latitude: coords[0].latitude,
              longitude: coords[0].longitude,
              latitudeDelta: 0.05,
              longitudeDelta: 0.05,
            } : undefined}
            onRegionChangeComplete={(r) => setRegion(r)}
          >
            {coords.length > 1 && (
              <Polyline coordinates={coords} strokeColor={C.accent} strokeWidth={3} />
            )}

            {canCluster && clusters.map((feature) => {
              const isCluster = feature.type === 'cluster' && feature.count > 1
              return (
                <Marker
                  key={`cluster-${feature.id}`}
                  coordinate={{ latitude: feature.latitude, longitude: feature.longitude }}
                  tracksViewChanges={false}
                >
                  <View style={isCluster ? styles.clusterBubble : styles.pointDot}>
                    {isCluster ? <Text style={styles.clusterText}>{feature.count}</Text> : null}
                  </View>
                </Marker>
              )
            })}

            {current && (
              <>
                <Circle
                  center={{ latitude: current.lat, longitude: current.lon }}
                  radius={POSITION_CIRCLE_RADIUS_M}
                  strokeWidth={1}
                  strokeColor="rgba(255,56,92,0.45)"
                  fillColor="rgba(255,56,92,0.18)"
                />
                <Marker
                  coordinate={{ latitude: current.lat, longitude: current.lon }}
                  image={require('../assets/marker.png')}
                />
              </>
            )}
          </MapView>

          <View
            style={[styles.panel, { paddingBottom: insets.bottom + S.md }]}
            onLayout={(e) => setPanelHeight(e.nativeEvent.layout.height)}
          >
            <Text style={styles.pointInfo}>
              Punto {scrubIndex + 1} / {points.length}
            </Text>
            <Slider
              style={{ width: '100%' }}
              minimumValue={0}
              maximumValue={Math.max(points.length - 1, 1)}
              step={1}
              value={scrubIndex}
              onValueChange={(v) => setScrubIndex(Math.round(v))}
              minimumTrackTintColor={C.accent}
              maximumTrackTintColor={C.sep}
              thumbTintColor={C.accent}
            />
          </View>
        </>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingBottom: 10,
    gap: 8,
    backgroundColor: C.card,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: C.sep,
  },
  iconBtn: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 16, fontWeight: '700', color: C.text1 },
  panel: { backgroundColor: C.card, paddingHorizontal: S.md, paddingTop: S.sm },
  pointInfo: { fontSize: 12, color: C.text3, textAlign: 'center', marginBottom: 4 },
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
  pointDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: 'rgba(255,56,92,0.75)',
    borderWidth: 1,
    borderColor: '#fff',
  },
})
