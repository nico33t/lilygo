import { Ionicons } from '@expo/vector-icons'
import { router } from 'expo-router'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native'
import MapView, { Marker, PROVIDER_GOOGLE, Region } from 'react-native-maps'
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context'
import { C, S } from '../constants/design'
import { buildNativeClusters, isNativeClusteringAvailable } from '../services/nativeClustering'
import type { ClusterFeature } from '../types/clustering'

const MAP_PROVIDER =
  (Platform.OS === 'android' && process.env.EXPO_PUBLIC_GOOGLE_MAPS_ANDROID_KEY) ||
  (Platform.OS === 'ios' && process.env.EXPO_PUBLIC_GOOGLE_MAPS_IOS_KEY)
    ? PROVIDER_GOOGLE
    : undefined

const CENTER = { latitude: 45.4642, longitude: 9.19 } // Milano

export default function ClusterTestScreen() {
  const insets = useSafeAreaInsets()
  const [region, setRegion] = useState<Region>({
    latitude: CENTER.latitude,
    longitude: CENTER.longitude,
    latitudeDelta: 0.09,
    longitudeDelta: 0.09,
  })
  const [clusters, setClusters] = useState<ClusterFeature[]>([])
  const runIdRef = useRef(0)

  const markers = useMemo(() => {
    const out: Array<{ id: string; latitude: number; longitude: number; heading: number }> = []
    for (let i = 0; i < 50; i += 1) {
      const latJitter = (Math.random() - 0.5) * 0.06
      const lonJitter = (Math.random() - 0.5) * 0.06
      out.push({
        id: `mk_${i}`,
        latitude: CENTER.latitude + latJitter,
        longitude: CENTER.longitude + lonJitter,
        heading: Math.round(Math.random() * 360),
      })
    }
    return out
  }, [])

  const inputPoints = useMemo(
    () => markers.map((m) => ({ id: m.id, latitude: m.latitude, longitude: m.longitude })),
    [markers]
  )

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
      return
    }
    const runId = ++runIdRef.current
    const zoom = Math.max(0, Math.min(22, Math.round(Math.log2(360 / region.longitudeDelta))))
    const bounds = {
      north: region.latitude + region.latitudeDelta / 2,
      south: region.latitude - region.latitudeDelta / 2,
      east: region.longitude + region.longitudeDelta / 2,
      west: region.longitude - region.longitudeDelta / 2,
    }
    buildNativeClusters(inputPoints, zoom, bounds, { radius: 56, minPoints: 3, maxZoom: 18 })
      .then((res) => {
        if (runId !== runIdRef.current) return
        setClusters(res)
      })
      .catch(() => {
        if (runId !== runIdRef.current) return
        setClusters([])
      })
  }, [inputPoints, region])

  return (
    <SafeAreaView style={styles.root}>
      <View style={[styles.header, { paddingTop: insets.top + 6 }]}>
        <Pressable onPress={() => router.back()} style={styles.iconBtn} hitSlop={8}>
          <Ionicons name="arrow-back" size={20} color={C.text1} />
        </Pressable>
        <Text style={styles.title}>Cluster Test (50)</Text>
        <View style={styles.headerRightSpacer} />
      </View>

      <MapView
        style={styles.map}
        provider={MAP_PROVIDER}
        initialRegion={{
          latitude: CENTER.latitude,
          longitude: CENTER.longitude,
          latitudeDelta: 0.09,
          longitudeDelta: 0.09,
        }}
        onRegionChangeComplete={setRegion}
      >
        {clusters.map((f) => {
          const isCluster = f.type === 'cluster' && f.count > 1
          if (isCluster) {
            return (
              <Marker
                key={f.id}
                coordinate={{ latitude: f.latitude, longitude: f.longitude }}
                tracksViewChanges={false}
              >
                <View style={styles.clusterBubble}>
                  <Text style={styles.clusterText}>{f.count}</Text>
                </View>
              </Marker>
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
              image={require('../assets/marker.png')}
            />
          )
        })}
      </MapView>
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
  title: {
    fontSize: 16,
    fontWeight: '700',
    color: C.text1,
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
})
