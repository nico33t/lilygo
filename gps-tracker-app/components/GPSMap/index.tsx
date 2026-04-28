import { useEffect, useRef } from 'react'
import { StyleSheet, View } from 'react-native'
import { useTrackerStore } from '../../store/tracker'

declare const L: typeof import('leaflet')

const INITIAL_CENTER: [number, number] = [44.5, 11.5]
const INITIAL_ZOOM = 6

export default function GPSMap() {
  const divRef = useRef<HTMLDivElement | null>(null)
  const mapRef = useRef<ReturnType<typeof L.map> | null>(null)
  const markerRef = useRef<ReturnType<typeof L.marker> | null>(null)
  const polylineRef = useRef<ReturnType<typeof L.polyline> | null>(null)
  const centeredRef = useRef(false)

  const gps = useTrackerStore((s) => s.gps)
  const track = useTrackerStore((s) => s.track)

  useEffect(() => {
    if (mapRef.current || !divRef.current) return
    if (typeof L === 'undefined') return

    const map = L.map(divRef.current, {
      zoomControl: true,
      attributionControl: true,
    }).setView(INITIAL_CENTER, INITIAL_ZOOM)

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '© OpenStreetMap contributors',
    }).addTo(map)

    const icon = L.divIcon({
      html: '<div style="width:16px;height:16px;background:#ff385c;border:3px solid #ffffff;border-radius:50%;box-shadow:0 2px 8px rgba(0,0,0,0.35)"></div>',
      iconSize: [16, 16],
      iconAnchor: [8, 8],
      className: '',
    })

    markerRef.current = L.marker(INITIAL_CENTER, { icon }).addTo(map)
    polylineRef.current = L.polyline([], {
      color: '#ff385c',
      weight: 3,
      opacity: 0.85,
    }).addTo(map)

    mapRef.current = map
  }, [])

  useEffect(() => {
    if (!mapRef.current || !markerRef.current || !gps?.valid) return

    const pos: [number, number] = [gps.lat, gps.lon]
    markerRef.current.setLatLng(pos)
    polylineRef.current?.setLatLngs(
      track.map((p) => [p.lat, p.lon] as [number, number])
    )

    if (!centeredRef.current) {
      mapRef.current.setView(pos, 15)
      centeredRef.current = true
    } else {
      mapRef.current.panTo(pos)
    }
  }, [gps, track])

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
})
