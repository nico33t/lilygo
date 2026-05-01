import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Animated, Platform, StyleSheet, Text, View } from 'react-native'
import MapView, { Marker, PROVIDER_GOOGLE, Polyline, Region } from 'react-native-maps'
import { useTrackerStore } from '../../store/tracker'

const DEFAULT_REGION: Region = {
  latitude: 44.5,
  longitude: 11.5,
  latitudeDelta: 8,
  longitudeDelta: 8,
}

const STILL_SPEED_KMH = 1
const SHOW_DELAY_MS   = 1000
const LABEL_UPDATE_MS = 30_000
const MAP_SETTLE_MS   = 250   // delay after onRegionChangeComplete before re-showing
const MAP_PROVIDER =
  Platform.OS === 'android' && process.env.EXPO_PUBLIC_GOOGLE_MAPS_ANDROID_KEY
    ? PROVIDER_GOOGLE
    : undefined

function formatDuration(ms: number): string {
  const s = Math.floor(ms / 1000)
  if (s < 60)  return 'pochi secondi'
  const m = Math.floor(s / 60)
  if (m < 60)  return `${m} min`
  const h = Math.floor(m / 60)
  if (h < 24)  return `${h} ${h === 1 ? 'ora' : 'ore'}`
  const d = Math.floor(h / 24)
  return `${d} ${d === 1 ? 'giorno' : 'giorni'}`
}

export default function GPSMap() {
  const lat     = useTrackerStore((s) => s.gps?.lat)
  const lon     = useTrackerStore((s) => s.gps?.lon)
  const speed   = useTrackerStore((s) => s.gps?.speed)
  const heading = useTrackerStore((s) => s.gps?.heading)
  const valid   = useTrackerStore((s) => s.gps?.valid)
  const stored  = useTrackerStore((s) => s.gps?.stored)
  const track   = useTrackerStore((s) => s.track)
  const mode    = useTrackerStore((s) => s.power?.mode)

  const mapRef = useRef<MapView>(null)

  // Always-fresh refs so async/callback closures never go stale
  const latRef          = useRef(lat)
  const lonRef          = useRef(lon)
  latRef.current        = lat
  lonRef.current        = lon

  const centeredRef      = useRef(false)
  const stoppedAtRef     = useRef<number | null>(null)
  const showTimerRef     = useRef<ReturnType<typeof setTimeout> | null>(null)
  const settleTimerRef   = useRef<ReturnType<typeof setTimeout> | null>(null)
  const isMapMovingRef   = useRef(false)   // true while user is panning/rotating
  const isDeviceStillRef = useRef(false)   // mirrors deviceStill for callbacks
  const calloutSize      = useRef({ w: 0, h: 0 })

  const [markerPx, setMarkerPx]       = useState<{ x: number; y: number } | null>(null)
  const [showCallout, setShowCallout]  = useState(false)
  const [labelText, setLabelText]      = useState('')
  const [mapReady, setMapReady]        = useState(false)

  const calloutAnim = useRef(new Animated.Value(0)).current

  const hasCoords =
    typeof lat === 'number' &&
    typeof lon === 'number' &&
    Number.isFinite(lat) &&
    Number.isFinite(lon) &&
    lat !== 0 &&
    lon !== 0
  const hasPosition = Boolean((valid || stored) && hasCoords)

  // ── Animate callout in / out ──────────────────────────────────────────────
  useEffect(() => {
    Animated.spring(calloutAnim, {
      toValue: showCallout ? 1 : 0,
      useNativeDriver: true,
      tension: 160,
      friction: 9,
    }).start()
  }, [showCallout, calloutAnim])

  // ── pointForCoordinate — correct for any bearing/tilt ────────────────────
  const updatePosition = useCallback(async () => {
    if (!mapRef.current || latRef.current == null || lonRef.current == null) return
    try {
      const pt = await mapRef.current.pointForCoordinate({
        latitude:  latRef.current,
        longitude: lonRef.current,
      })
      setMarkerPx(pt)
    } catch { /* map not ready */ }
  }, [])

  // ── Auto-center on first fix ──────────────────────────────────────────────
  useEffect(() => {
    if (!hasPosition || centeredRef.current || !mapReady || !mapRef.current || lat == null || lon == null) return
    centeredRef.current = true
    mapRef.current.animateToRegion(
      { latitude: lat, longitude: lon, latitudeDelta: 0.008, longitudeDelta: 0.008 },
      600,
    )
  }, [hasPosition, lat, lon, mapReady])

  // ── Detect stationary device ──────────────────────────────────────────────
  useEffect(() => {
    const isStill =
      mode === 'PARKED' ||
      mode === 'IDLE'   ||
      (speed != null && speed < STILL_SPEED_KMH)

    isDeviceStillRef.current = isStill

    if (isStill) {
      if (stoppedAtRef.current === null) {
        stoppedAtRef.current = Date.now()
        if (showTimerRef.current) clearTimeout(showTimerRef.current)
        showTimerRef.current = setTimeout(() => {
          // show only if the map isn't being moved right now
          if (!isMapMovingRef.current) setShowCallout(true)
        }, SHOW_DELAY_MS)
      }
    } else {
      stoppedAtRef.current = null
      setShowCallout(false)
      if (showTimerRef.current) clearTimeout(showTimerRef.current)
    }
  }, [speed, mode])

  // ── Label refresh ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (!showCallout || !stoppedAtRef.current) return
    const refresh = () => {
      const elapsed = Date.now() - (stoppedAtRef.current ?? Date.now())
      setLabelText(`Qui da ${formatDuration(elapsed)}`)
    }
    refresh()
    const id = setInterval(refresh, LABEL_UPDATE_MS)
    return () => clearInterval(id)
  }, [showCallout])

  // ── Map interaction: pan/rotate starts → dissolve ─────────────────────────
  const handleRegionChange = useCallback(() => {
    if (!isMapMovingRef.current) {
      isMapMovingRef.current = true
      setShowCallout(false)        // immediate dissolve
    }
    if (settleTimerRef.current) clearTimeout(settleTimerRef.current)
  }, [])

  // ── Map settled → recompute position (accounts for rotation), re-show ─────
  const handleRegionChangeComplete = useCallback(() => {
    if (settleTimerRef.current) clearTimeout(settleTimerRef.current)
    settleTimerRef.current = setTimeout(async () => {
      isMapMovingRef.current = false
      await updatePosition()                    // pointForCoordinate is accurate now
      if (isDeviceStillRef.current) {
        setShowCallout(true)
      }
    }, MAP_SETTLE_MS)
  }, [updatePosition])

  // ── Update position when GPS coords change (only when map is still) ───────
  useEffect(() => {
    if (!isMapMovingRef.current) updatePosition()
  }, [lat, lon, updatePosition])

  // ── Polyline coords (memoised) ────────────────────────────────────────────
  const polylineCoords = useMemo(
    () => track.map((p) => ({ latitude: p.lat, longitude: p.lon })),
    [track],
  )

  // ── Callout layout: scale from the tip (bottom-center) ───────────────────
  const tipOffset  = calloutSize.current.h / 2
  const calloutLeft = markerPx ? markerPx.x - calloutSize.current.w / 2 : -9999
  const calloutTop  = markerPx ? markerPx.y - calloutSize.current.h - 6 : -9999

  return (
    <View style={styles.container}>
      <MapView
        ref={mapRef}
        style={StyleSheet.absoluteFill}
        initialRegion={DEFAULT_REGION}
        provider={MAP_PROVIDER}
        onMapReady={() => {
          setMapReady(true)
          updatePosition()
        }}
        onRegionChange={handleRegionChange}
        onRegionChangeComplete={handleRegionChangeComplete}
      >
        {hasPosition && (
          <Marker
            coordinate={{ latitude: lat!, longitude: lon! }}
            image={require('../../assets/marker.png')}
            anchor={{ x: 0.5, y: 0.5 }}
            rotation={heading ?? 0}
            flat
            opacity={stored && !valid ? 0.5 : 1}
          />
        )}
        {polylineCoords.length > 1 && (
          <Polyline coordinates={polylineCoords} strokeColor="#ff385c" strokeWidth={3} />
        )}
      </MapView>

      {/* Callout — mounted as soon as markerPx exists so onLayout can measure it before it's shown */}
      {markerPx && (
        <Animated.View
          pointerEvents="none"
          style={{
            position: 'absolute',
            left: calloutLeft,
            top:  calloutTop,
            opacity: calloutAnim,
            transform: [
              { translateY:  tipOffset },
              { scale: calloutAnim.interpolate({ inputRange: [0, 1], outputRange: [0.7, 1] }) },
              { translateY: -tipOffset },
            ],
          }}
          onLayout={(e) => {
            const { width, height } = e.nativeEvent.layout
            calloutSize.current = { w: width, h: height }
          }}
        >
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{labelText || ' '}</Text>
          </View>
          <View style={styles.tip} />
        </Animated.View>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1 },

  badge: {
    backgroundColor: 'rgba(28,28,30,0.88)',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 7,
    shadowColor: '#000',
    shadowOpacity: 0.22,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },
  badgeText: {
    color: '#ffffff',
    fontSize: 13,
    fontFamily: Platform.OS === 'ios' ? 'Helvetica Neue' : 'sans-serif',
    fontWeight: '500',
  },
  tip: {
    width: 0,
    height: 0,
    borderLeftWidth: 8,
    borderRightWidth: 8,
    borderTopWidth: 7,
    borderStyle: 'solid',
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderTopColor: 'rgba(28,28,30,0.88)',
    alignSelf: 'center',
  },
})
