import { Loader } from '@googlemaps/js-api-loader'
import { useEffect, useRef } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { useTrackerStore } from '../../store/tracker'

const API_KEY = process.env.EXPO_PUBLIC_GOOGLE_MAPS_KEY ?? ''

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
            path: google.maps.SymbolPath.CIRCLE,
            scale: 9,
            fillColor: '#ff385c',
            fillOpacity: 1,
            strokeColor: '#ffffff',
            strokeWeight: 3,
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
