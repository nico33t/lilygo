import { Ionicons } from '@expo/vector-icons'
import { router, useLocalSearchParams } from 'expo-router'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import ConnectionBadge from '../components/ConnectionBadge'
import GPSMap from '../components/GPSMap'
import StatusPanel from '../components/StatusPanel'
import { useTracker } from '../hooks/useTracker'
import { C } from '../constants/design'

const IP_RE = /^\d{1,3}(\.\d{1,3}){3}$/

export default function TrackerScreen() {
  const { ip, id } = useLocalSearchParams<{ ip?: string; id?: string }>()
  const deviceId = id ?? ip ?? ''
  const insets = useSafeAreaInsets()
  const isWifi = IP_RE.test(deviceId)
  useTracker(deviceId)

  const deviceName = 'GPS Tracker'
  const deviceSub  = isWifi ? deviceId : deviceId.slice(0, 17)

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + 6 }]}>
        <Pressable onPress={() => router.back()} style={styles.iconBtn} hitSlop={8}>
          <Ionicons name="arrow-back" size={22} color={C.text1} />
        </Pressable>

        <View style={styles.titleBlock}>
          <Text style={styles.deviceName} numberOfLines={1}>{deviceName}</Text>
          <Text style={styles.deviceSub} numberOfLines={1}>{deviceSub}</Text>
        </View>

        <ConnectionBadge />

        <Pressable
          onPress={() => router.push(`/settings?id=${encodeURIComponent(deviceId)}`)}
          style={styles.iconBtn}
          hitSlop={8}
        >
          <Ionicons name="settings-outline" size={22} color={C.text1} />
        </Pressable>
      </View>

      <GPSMap />

      <StatusPanel />
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: C.card,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingBottom: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: C.sep,
    gap: 8,
    backgroundColor: C.card,
  },
  iconBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  titleBlock: {
    flex: 1,
    gap: 1,
  },
  deviceName: {
    fontSize: 15,
    fontWeight: '700',
    color: C.text1,
    letterSpacing: -0.2,
  },
  deviceSub: {
    fontSize: 11,
    color: C.text3,
    fontVariant: ['tabular-nums'],
  },
})
