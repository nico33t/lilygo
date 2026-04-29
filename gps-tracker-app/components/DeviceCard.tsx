import { Ionicons } from '@expo/vector-icons'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { DiscoveredDevice } from '../services/discovery'
import { C, R, S } from '../constants/design'

interface Props {
  device: DiscoveredDevice
  onPress: () => void
}

function formatUptime(s: number) {
  if (s < 60) return `${s}s`
  if (s < 3600) return `${Math.floor(s / 60)}m`
  return `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`
}

export default function DeviceCard({ device, onPress }: Props) {
  const hasFix = device.gps_valid
  const fixColor = hasFix ? C.green : C.orange
  const fixLabel = hasFix ? 'Fix GPS' : 'Ricerca fix…'

  return (
    <Pressable
      style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
      onPress={onPress}
    >
      <View style={[styles.iconWrap, { backgroundColor: C.accent + '12' }]}>
        <Ionicons name="wifi" size={20} color={C.accent} />
      </View>

      <View style={styles.info}>
        <Text style={styles.ip}>{device.ip}</Text>
        <View style={styles.subtitleRow}>
          <View style={[styles.dot, { backgroundColor: fixColor }]} />
          <Text style={[styles.fixLabel, { color: fixColor }]}>{fixLabel}</Text>
          <Text style={styles.uptime}>· {formatUptime(device.uptime_s)}</Text>
        </View>
      </View>

      <View style={styles.right}>
        <Text style={styles.satValue}>{device.sat_used}/{device.sat_view}</Text>
        <Text style={styles.satLabel}>SAT</Text>
      </View>

      <Ionicons name="chevron-forward" size={18} color={C.text3} style={styles.chevron} />
    </Pressable>
  )
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: C.card,
    borderRadius: R.lg,
    padding: S.md,
    marginHorizontal: S.md,
    marginVertical: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
    gap: S.sm + 4,
  },
  cardPressed: {
    opacity: 0.75,
    transform: [{ scale: 0.985 }],
  },
  iconWrap: {
    width: 40,
    height: 40,
    borderRadius: R.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  info: {
    flex: 1,
    gap: 3,
  },
  ip: {
    fontSize: 15,
    fontWeight: '700',
    color: C.text1,
  },
  subtitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  fixLabel: {
    fontSize: 12,
    fontWeight: '500',
  },
  uptime: {
    fontSize: 12,
    color: C.text3,
  },
  right: {
    alignItems: 'center',
    gap: 1,
  },
  satValue: {
    fontSize: 14,
    fontWeight: '700',
    color: C.text1,
    fontVariant: ['tabular-nums'],
  },
  satLabel: {
    fontSize: 10,
    fontWeight: '500',
    color: C.text3,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  chevron: {
    marginLeft: -4,
  },
})
