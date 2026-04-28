import { Ionicons } from '@expo/vector-icons'
import { router, useLocalSearchParams } from 'expo-router'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import ConnectionBadge from '../components/ConnectionBadge'
import GPSMap from '../components/GPSMap'
import StatusPanel from '../components/StatusPanel'
import { useTracker } from '../hooks/useTracker'

export default function TrackerScreen() {
  const { ip } = useLocalSearchParams<{ ip: string }>()
  useTracker(ip ?? '192.168.4.1')

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backBtn} hitSlop={8}>
          <Ionicons name="arrow-back" size={22} color="#222222" />
        </Pressable>
        <Text style={styles.headerTitle} numberOfLines={1}>{ip}</Text>
        <View style={styles.headerRight}>
          <ConnectionBadge />
          <Pressable
            onPress={() => router.push(`/settings?ip=${ip}`)}
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
    paddingVertical: 12,
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
