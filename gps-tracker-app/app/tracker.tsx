import { Ionicons } from '@expo/vector-icons'
import { router, useLocalSearchParams } from 'expo-router'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import ConnectionBadge from '../components/ConnectionBadge'
import GPSMap from '../components/GPSMap'
import StatusPanel from '../components/StatusPanel'
import { useTracker } from '../hooks/useTracker'

export default function TrackerScreen() {
  const { ip, id } = useLocalSearchParams<{ ip?: string; id?: string }>()
  const deviceId = id ?? ip ?? ''
  const insets = useSafeAreaInsets()
  useTracker(deviceId)

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <Pressable onPress={() => router.back()} style={styles.backBtn} hitSlop={8}>
          <Ionicons name="arrow-back" size={22} color="#222222" />
        </Pressable>
        <Text style={styles.headerTitle} numberOfLines={1}>{deviceId}</Text>
        <View style={styles.headerRight}>
          <ConnectionBadge />
          <Pressable
            onPress={() => router.push(`/settings?id=${encodeURIComponent(deviceId)}`)}
            style={styles.settingsBtn}
            hitSlop={8}
          >
            <Ionicons name="settings-outline" size={22} color="#222222" />
          </Pressable>
        </View>
      </View>

      <GPSMap />

      <StatusPanel />
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#ebebeb',
    gap: 8,
  },
  backBtn: {
    padding: 4,
  },
  headerTitle: {
    flex: 1,
    fontSize: 15,
    fontWeight: '600',
    color: '#222222',
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  settingsBtn: {
    padding: 4,
  },
})
