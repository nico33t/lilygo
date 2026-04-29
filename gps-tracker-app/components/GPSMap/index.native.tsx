import { Platform, StyleSheet } from 'react-native'
import MapView, { Marker, PROVIDER_GOOGLE, Polyline, Region } from 'react-native-maps'
import { useTrackerStore } from '../../store/tracker'

const DEFAULT_REGION: Region = {
  latitude: 44.5,
  longitude: 11.5,
  latitudeDelta: 8,
  longitudeDelta: 8,
}

export default function GPSMap() {
  const gps = useTrackerStore((s) => s.gps)
  const track = useTrackerStore((s) => s.track)

  const region: Region = gps?.valid
    ? {
        latitude: gps.lat,
        longitude: gps.lon,
        latitudeDelta: 0.008,
        longitudeDelta: 0.008,
      }
    : DEFAULT_REGION

  return (
    <MapView
      style={styles.map}
      region={region}
      provider={Platform.OS === 'ios' ? PROVIDER_GOOGLE : PROVIDER_GOOGLE}
    >
      {gps?.valid && (
        <Marker
          coordinate={{ latitude: gps.lat, longitude: gps.lon }}
          image={require('../../assets/marker.png')}
        />
      )}
      {track.length > 1 && (
        <Polyline
          coordinates={track.map((p) => ({
            latitude: p.lat,
            longitude: p.lon,
          }))}
          strokeColor="#ff385c"
          strokeWidth={3}
        />
      )}
    </MapView>
  )
}

const styles = StyleSheet.create({
  map: {
    flex: 1,
  },
})
