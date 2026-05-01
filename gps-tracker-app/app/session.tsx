import { useEffect, useState } from 'react'
import { ActivityIndicator, Platform, Pressable, StyleSheet, Text, View } from 'react-native'
import MapView, { Circle, Marker, PROVIDER_GOOGLE, Polyline } from 'react-native-maps'
import Slider from '@react-native-community/slider'
import { router, useLocalSearchParams } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { getSessionPoints } from '../services/historyService'
import type { TrackPoint } from '../types'
import { C, S } from '../constants/design'

const MAP_PROVIDER =
  (Platform.OS === 'android' && process.env.EXPO_PUBLIC_GOOGLE_MAPS_ANDROID_KEY) ||
  (Platform.OS === 'ios' && process.env.EXPO_PUBLIC_GOOGLE_MAPS_IOS_KEY)
    ? PROVIDER_GOOGLE
    : undefined
const POSITION_CIRCLE_RADIUS_M = 18

export default function SessionScreen() {
  const { id, device } = useLocalSearchParams<{ id: string; device: string }>()
  const insets = useSafeAreaInsets()
  const [points, setPoints] = useState<TrackPoint[]>([])
  const [loading, setLoading] = useState(true)
  const [scrubIndex, setScrubIndex] = useState(0)
  const [panelHeight, setPanelHeight] = useState(0)

  useEffect(() => {
    getSessionPoints(id, device).then((pts) => {
      setPoints(pts)
      setScrubIndex(pts.length - 1)
      setLoading(false)
    })
  }, [id, device])

  const coords = points.map((p) => ({ latitude: p.lat, longitude: p.lon }))
  const current = points[scrubIndex]

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
          >
            {coords.length > 1 && (
              <Polyline coordinates={coords} strokeColor={C.accent} strokeWidth={3} />
            )}
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
})
