import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Platform, StyleSheet, View } from 'react-native'
import MapView, { Circle, Marker, PROVIDER_DEFAULT, PROVIDER_GOOGLE, Polyline, Region } from 'react-native-maps'
import { Canvas, Group, Path, RoundedRect, Shadow, Skia, Text, useFont } from '@shopify/react-native-skia'
import Animated, { createAnimatedComponent, useAnimatedProps, useDerivedValue, useSharedValue, withSpring, withDelay } from 'react-native-reanimated'
import { useTrackerStore } from '../../store/tracker'
import { C } from '../../constants/design'
import { getSharedMarkerImageSource } from '../../services/mapMarkerImage'

const DEFAULT_REGION: Region = {
  latitude: 44.5,
  longitude: 11.5,
  latitudeDelta: 8,
  longitudeDelta: 8,
}

const STILL_SPEED_KMH = 1
const SHOW_DELAY_MS = 1000
const LABEL_UPDATE_MS = 30_000
const MAP_SETTLE_MS = 250   // delay after onRegionChangeComplete before re-showing
const POSITION_CIRCLE_RADIUS_M = 18
const MAP_PROVIDER = PROVIDER_GOOGLE;
const SHARED_MARKER_IMAGE = getSharedMarkerImageSource()

const AnimatedCircle = createAnimatedComponent(Circle)
const AnimatedMarker = createAnimatedComponent(Marker)

function formatDuration(ms: number): string {
  const s = Math.floor(ms / 1000)
  if (s < 60) return 'pochi secondi'
  const m = Math.floor(s / 60)
  if (m < 60) return `${m} min`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h} ${h === 1 ? 'ora' : 'ore'}`
  const d = Math.floor(h / 24)
  return `${d} ${d === 1 ? 'giorno' : 'giorni'}`
}

type GPSMapProps = {
  bottomPadding?: number
  topPadding?: number
  onMapDrag?: () => void
  isFollowing?: boolean
}

export default function GPSMap({ bottomPadding = 0, topPadding = 0, onMapDrag, isFollowing = true }: GPSMapProps) {
  const lat = useTrackerStore((s) => s.gps?.lat)
  const lon = useTrackerStore((s) => s.gps?.lon)
  const speed = useTrackerStore((s) => s.gps?.speed)
  const heading = useTrackerStore((s) => s.gps?.heading)
  const valid = useTrackerStore((s) => s.gps?.valid)
  const stored = useTrackerStore((s) => s.gps?.stored)
  const track = useTrackerStore((s) => s.track)
  const mode = useTrackerStore((s) => s.power?.mode)
  const address = useTrackerStore((s) => s.address)

  const mapRef = useRef<MapView>(null)

  // Always-fresh refs so async/callback closures never go stale
  const latRef = useRef(lat)
  const lonRef = useRef(lon)
  latRef.current = lat
  lonRef.current = lon

  const centeredRef = useRef(false)
  const stoppedAtRef = useRef<number | null>(null)
  const showTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const settleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const isMapMovingRef = useRef(false)
  const isDeviceStillRef = useRef(false)
  const deltaRef = useRef({ latitudeDelta: 0.008, longitudeDelta: 0.008 })

  const [markerPx, setMarkerPx] = useState<{ x: number; y: number } | null>(null)
  const [showCallout, setShowCallout] = useState(false)
  const [labelText, setLabelText] = useState('')
  const [mapReady, setMapReady] = useState(false)

  // ── Animated Position ───────────────────────────────────────────────────
  const animLat = useSharedValue(lat ?? 0)
  const animLon = useSharedValue(lon ?? 0)

  // "Follower" values for circle (delayed)
  const followLat = useSharedValue(lat ?? 0)
  const followLon = useSharedValue(lon ?? 0)

  useEffect(() => {
    if (lat != null && lon != null) {
      if (animLat.value === 0) {
        animLat.value = lat; animLon.value = lon
        followLat.value = lat; followLon.value = lon
      } else {
        // Arrow: faster spring to stay on track
        animLat.value = withSpring(lat, { damping: 20, stiffness: 200 })
        animLon.value = withSpring(lon, { damping: 20, stiffness: 200 })

        // Circle: delayed for premium feel
        const followConfig = { damping: 30, stiffness: 80 }
        followLat.value = withDelay(100, withSpring(lat, followConfig))
        followLon.value = withDelay(100, withSpring(lon, followConfig))
      }
    }
  }, [lat, lon])

  const animatedMarkerProps = useAnimatedProps(() => ({
    coordinate: { latitude: animLat.value, longitude: animLon.value }
  }))

  const animatedCircleProps = useAnimatedProps(() => ({
    center: { latitude: followLat.value, longitude: followLon.value }
  }))


  const calloutAnim = useSharedValue(0)

  const font = useFont(null, 13)

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
    calloutAnim.value = withSpring(showCallout ? 1 : 0, {
      mass: 0.6,
      damping: 12,
      stiffness: 100,
    })
  }, [showCallout, calloutAnim])

  // ── pointForCoordinate — correct for any bearing/tilt ────────────────────
  const updatePosition = useCallback(async () => {
    // No longer needed for callout, but kept for any other pixel-space logic if necessary.
    // However, we can remove it if it's truly redundant.
  }, [])

  // ── Auto-center / Follow tracker ──────────────────────────────────────────
  useEffect(() => {
    if (!hasPosition || !mapReady || !mapRef.current || lat == null || lon == null) return
    if (!isFollowing) return

    // We only center if the device is not still OR if it's the first fix
    // To avoid too many animations, we can also check if the point is within the current view
    // but simple follow is often preferred for tracking.
    mapRef.current.animateToRegion(
      {
        latitude: lat,
        longitude: lon,
        latitudeDelta: deltaRef.current.latitudeDelta,
        longitudeDelta: deltaRef.current.longitudeDelta
      },
      600,
    )
  }, [hasPosition, lat, lon, mapReady, isFollowing])

  // ── Detect stationary device ──────────────────────────────────────────────
  useEffect(() => {
    const isStill =
      mode === 'PARKED' ||
      mode === 'IDLE' ||
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
    isMapMovingRef.current = true
    if (settleTimerRef.current) clearTimeout(settleTimerRef.current)
  }, [])

  // ── Map settled → recompute position (accounts for rotation), re-show ─────
  const handleRegionChangeComplete = useCallback((region: Region) => {
    deltaRef.current = {
      latitudeDelta: region.latitudeDelta,
      longitudeDelta: region.longitudeDelta
    }

    if (settleTimerRef.current) clearTimeout(settleTimerRef.current)
    settleTimerRef.current = setTimeout(async () => {
      isMapMovingRef.current = false
      if (isDeviceStillRef.current) {
        setShowCallout(true)
      }
    }, MAP_SETTLE_MS)
  }, [])

  // ── Position updates no longer needed for callout ─────────────────────────
  useEffect(() => {
    // We don't hide the callout on move anymore, the Marker handles it
  }, [lat, lon])

  useEffect(() => {
    console.log('[GPSMap] finalHeading:', finalHeading, 'showCallout:', showCallout, 'fontReady:', !!font)
  }, [finalHeading, showCallout, font])

  // ── Final Heading (GPS or Calculated) ───────────────────────────────────
  const finalHeading = useMemo(() => {
    // 1. If moving and GPS heading is valid, use it
    if (heading != null && heading !== 0 && speed != null && speed > STILL_SPEED_KMH) {
      return heading
    }
    // 2. Fallback: calculate from last two track points
    if (track.length >= 2) {
      const p1 = track[track.length - 2]
      const p2 = track[track.length - 1]
      const dy = p2.lat - p1.lat
      const dx = Math.cos((Math.PI / 180) * p1.lat) * (p2.lon - p1.lon)
      const angle = (Math.atan2(dx, dy) * 180) / Math.PI
      // Only update if there is significant movement to avoid jitter
      if (Math.abs(dx) > 0.000001 || Math.abs(dy) > 0.000001) {
        return angle
      }
    }
    return heading ?? 0
  }, [heading, track, speed])

  // ── Polyline coords (memoised) ────────────────────────────────────────────
  const polylineCoords = useMemo(() => {
    const coords = track.map((p) => ({ latitude: p.lat, longitude: p.lon }))
    // For polyline, we use the raw lat/lon to avoid complex line animation 
    // but ensure it's synced with the marker's goal position
    if (lat != null && lon != null) {
      const last = coords[coords.length - 1]
      if (!last || last.latitude !== lat || last.longitude !== lon) {
        coords.push({ latitude: lat, longitude: lon })
      }
    }
    return coords
  }, [track, lat, lon])

  // ── Callout Metrics & Transform ──────────────────────────────────────────
  const subLabelText = useMemo(() => {
    if (speed != null && speed > STILL_SPEED_KMH) {
      return `${speed.toFixed(1)} km/h`
    }
    return address || ''
  }, [speed, address])

  const badgeMetrics = useMemo(() => {
    const text = labelText || ' '
    const subText = subLabelText || ''
    const textWidth = font ? font.measureText(text).width : 80
    const subWidth = font ? font.measureText(subText).width : 0
    const w = Math.max(textWidth, subWidth) + 24
    const h = subText ? 44 : 28
    return { w, h }
  }, [font, labelText, subLabelText])

  const calloutTransform = useDerivedValue(() => {
    const scale = 0.7 + calloutAnim.value * 0.3
    const w = badgeMetrics.w
    const h = badgeMetrics.h + 7

    const pivotX = w / 2
    const pivotY = h

    return [
      { translateX: pivotX },
      { translateY: pivotY },
      { scale },
      { translateX: -pivotX },
      { translateY: -pivotY },
    ]
  }, [badgeMetrics])

  const padding = useMemo(() => {
    if (!mapReady) return { top: 0, right: 0, bottom: 0, left: 0 }
    return {
      top: Math.max(0, topPadding),
      right: 0,
      bottom: Math.max(0, bottomPadding),
      left: 0,
    }
  }, [mapReady, topPadding, bottomPadding])

  return (
    <View style={styles.container}>
      <MapView
        ref={mapRef}
        style={StyleSheet.absoluteFill}
        initialRegion={DEFAULT_REGION}
        provider={MAP_PROVIDER}
        mapPadding={padding}
        onMapReady={() => {
          setMapReady(true)
          updatePosition()
        }}
        onRegionChange={handleRegionChange}
        onRegionChangeComplete={handleRegionChangeComplete}
        onPanDrag={onMapDrag}
      >
        {polylineCoords.length > 1 && (
          <Polyline
            coordinates={polylineCoords}
            strokeColor={C.accent}
            strokeWidth={3}
          />
        )}

        {hasPosition && (
          <>
            <AnimatedCircle
              animatedProps={animatedCircleProps}
              radius={POSITION_CIRCLE_RADIUS_M}
              strokeWidth={1}
              strokeColor={`${C.accent}72`} // ~0.45 opacity
              fillColor={`${C.accent}2d`}   // ~0.18 opacity
            />
            <AnimatedMarker
              animatedProps={animatedMarkerProps}
              image={SHARED_MARKER_IMAGE as any}
              anchor={{ x: 0.5, y: 0.5 }}
              rotation={finalHeading}
              flat
              opacity={stored && !valid ? 0.5 : 1}
            />

            {/* Skia Callout Marker */}
            <AnimatedMarker
              animatedProps={animatedMarkerProps}
              anchor={{ x: 0.5, y: 1.0 }}
              centerOffset={{ x: 0, y: -20 }}
              pointerEvents="none"
              tracksViewChanges={true}
            >
              <View style={{ width: badgeMetrics.w, height: badgeMetrics.h + 8 }}>
                <Canvas style={StyleSheet.absoluteFill}>
                  <Group
                    opacity={calloutAnim}
                    transform={calloutTransform}
                  >
                    {/* Shadow + Badge */}
                    <RoundedRect
                      x={0}
                      y={0}
                      width={badgeMetrics.w}
                      height={badgeMetrics.h}
                      r={10}
                      color="rgba(28,28,30,0.88)"
                    >
                      <Shadow dx={0} dy={2} blur={6} color="rgba(0,0,0,0.22)" />
                    </RoundedRect>

                    {/* Tip */}
                    <Path
                      path={`M ${badgeMetrics.w / 2 - 8} ${badgeMetrics.h} L ${badgeMetrics.w / 2 + 8} ${badgeMetrics.h} L ${badgeMetrics.w / 2} ${badgeMetrics.h + 7} Z`}
                      color="rgba(28,28,30,0.88)"
                    />

                    {/* Text */}
                    {font && (
                      <>
                        <Text
                          x={12}
                          y={19}
                          text={labelText || ' '}
                          font={font}
                          color="#ffffff"
                        />
                        {subLabelText ? (
                          <Text
                            x={12}
                            y={35}
                            text={subLabelText}
                            font={font}
                            color="rgba(255,255,255,0.7)"
                          />
                        ) : null}
                      </>
                    )}
                  </Group>
                </Canvas>
              </View>
            </AnimatedMarker>
          </>
        )}
      </MapView>

    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1 },
})
