import { Loader } from '@googlemaps/js-api-loader'
import { useEffect, useRef } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { useTrackerStore } from '../../store/tracker'

const API_KEY = process.env.EXPO_PUBLIC_GOOGLE_MAPS_KEY ?? ''

// SVG data URI — no asset bundler dependency, works in all Electron/web contexts
const MARKER_SVG = encodeURIComponent(
  `<svg width="54" height="54" viewBox="0 0 54 54" fill="none" xmlns="http://www.w3.org/2000/svg">` +
  `<path fill-rule="evenodd" clip-rule="evenodd" d="M27.5076 42.3158C26.7881 42.0174 25.9794 42.0174 25.2599 42.3144C22.9784 43.2554 17.6526 45.4518 13.2962 47.25C12.1986 47.7023 10.935 47.4498 10.0953 46.6088C9.25697 45.7691 9.00587 44.5055 9.46082 43.4079C13.1922 34.3993 19.8747 18.2682 23.6102 9.25425C24.0651 8.15535 25.137 7.43985 26.325 7.43985C27.513 7.43985 28.5849 8.15535 29.0399 9.25425C32.7726 18.2614 39.4484 34.375 43.1811 43.3876C43.6361 44.4865 43.385 45.7515 42.5439 46.5912C41.7029 47.4323 40.4379 47.6834 39.3404 47.2271C35.0231 45.4356 29.7689 43.2554 27.5076 42.3158Z" fill="#ff385c" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>` +
  `<path fill-rule="evenodd" clip-rule="evenodd" d="M26.325 7.43985C27.513 7.43985 28.5849 8.15535 29.0398 9.25425L43.1811 43.3876C43.636 44.4865 43.3849 45.7515 42.5439 46.5912C41.7028 47.4323 40.4379 47.6834 39.3403 47.2271L27.5076 42.3158C27.1296 42.1592 26.7259 42.0849 26.325 42.0917V7.43985Z" fill="#cc1a3e"/>` +
  `</svg>`
)
const MARKER_URL = `data:image/svg+xml,${MARKER_SVG}`

let loaderInstance: Loader | null = null
function getLoader() {
  if (!loaderInstance) {
    loaderInstance = new Loader({ apiKey: API_KEY, version: 'weekly' })
  }
  return loaderInstance
}

export default function GPSMap() {
  const divRef = useRef<HTMLDivElement | null>(null)
  const mapRef = useRef<google.maps.Map | null>(null)
  const markerRef = useRef<google.maps.Marker | null>(null)
  const polylineRef = useRef<google.maps.Polyline | null>(null)
  const centeredRef = useRef(false)

  const gps = useTrackerStore((s) => s.gps)
  const track = useTrackerStore((s) => s.track)

  useEffect(() => {
    if (mapRef.current || !divRef.current || !API_KEY) return

    getLoader()
      .load()
      .then(() => {
        if (!divRef.current) return

        const map = new google.maps.Map(divRef.current, {
          center: { lat: 44.5, lng: 11.5 },
          zoom: 6,
          mapTypeId: google.maps.MapTypeId.ROADMAP,
          fullscreenControl: false,
          streetViewControl: false,
          mapTypeControl: false,
        })

        markerRef.current = new google.maps.Marker({
          map,
          position: { lat: 44.5, lng: 11.5 },
          icon: {
            url: MARKER_URL,
            scaledSize: new google.maps.Size(44, 44),
            anchor: new google.maps.Point(22, 44),
          },
        })

        polylineRef.current = new google.maps.Polyline({
          map,
          path: [],
          strokeColor: '#ff385c',
          strokeWeight: 3,
          strokeOpacity: 0.85,
        })

        mapRef.current = map
      })
      .catch(console.error)
  }, [])

  useEffect(() => {
    if (!mapRef.current || !gps?.valid) return

    const pos = { lat: gps.lat, lng: gps.lon }
    markerRef.current?.setPosition(pos)
    polylineRef.current?.setPath(track.map((p) => ({ lat: p.lat, lng: p.lon })))

    if (!centeredRef.current) {
      mapRef.current.setCenter(pos)
      mapRef.current.setZoom(15)
      centeredRef.current = true
    } else {
      mapRef.current.panTo(pos)
    }
  }, [gps, track])

  if (!API_KEY) {
    return (
      <View style={styles.noKey}>
        <Text style={styles.noKeyIcon}>🗺️</Text>
        <Text style={styles.noKeyTitle}>API Key Google Maps mancante</Text>
        <Text style={styles.noKeyDesc}>
          Aggiungi nel file .env:{'\n'}
          <Text style={styles.noKeyCode}>EXPO_PUBLIC_GOOGLE_MAPS_KEY=la_tua_chiave</Text>
        </Text>
      </View>
    )
  }

  return (
    <View style={styles.container}>
      {/* @ts-ignore */}
      <div ref={divRef} style={{ width: '100%', height: '100%' }} />
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  noKey: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f7f7f7',
    padding: 32,
    gap: 12,
  },
  noKeyIcon: {
    fontSize: 48,
  },
  noKeyTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#222222',
    textAlign: 'center',
  },
  noKeyDesc: {
    fontSize: 13,
    color: '#6a6a6a',
    textAlign: 'center',
    lineHeight: 20,
  },
  noKeyCode: {
    fontFamily: 'monospace',
    color: '#ff385c',
    fontSize: 12,
  },
})
