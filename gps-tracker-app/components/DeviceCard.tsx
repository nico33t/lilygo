import { Pressable, StyleSheet, Text, View } from 'react-native'
import { DiscoveredDevice } from '../services/discovery'

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
  const fixColor = device.gps_valid ? '#00a651' : '#f59e0b'
  const fixLabel = device.gps_valid ? 'Fix GPS' : 'Ricerca fix...'

  return (
    <Pressable
      style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
      onPress={onPress}
    >
      <View style={styles.left}>
        <View style={[styles.fixDot, { backgroundColor: fixColor }]} />
        <View>
          <Text style={styles.ip}>{device.ip}</Text>
          <Text style={[styles.fixLabel, { color: fixColor }]}>{fixLabel}</Text>
        </View>
      </View>

      <View style={styles.right}>
        <View style={styles.stat}>
          <Text style={styles.statValue}>{device.sat_used}/{device.sat_view}</Text>
          <Text style={styles.statLabel}>SAT</Text>
        </View>
        <View style={styles.stat}>
          <Text style={styles.statValue}>{formatUptime(device.uptime_s)}</Text>
          <Text style={styles.statLabel}>Uptime</Text>
        </View>
        <View style={styles.arrow}>
          <Text style={styles.arrowText}>›</Text>
        </View>
      </View>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 16,
    marginHorizontal: 20,
    marginVertical: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.07,
    shadowRadius: 6,
    elevation: 2,
    borderWidth: 1,
    borderColor: '#ebebeb',
  },
  cardPressed: {
    opacity: 0.75,
    transform: [{ scale: 0.98 }],
  },
  left: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  fixDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  ip: {
    fontSize: 16,
    fontWeight: '700',
    color: '#222222',
    marginBottom: 2,
  },
  fixLabel: {
    fontSize: 12,
    fontWeight: '500',
  },
  right: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  stat: {
    alignItems: 'center',
  },
  statValue: {
    fontSize: 13,
    fontWeight: '700',
    color: '#222222',
  },
  statLabel: {
    fontSize: 10,
    color: '#9b9b9b',
    textTransform: 'uppercase',
  },
  arrow: {
    marginLeft: 4,
  },
  arrowText: {
    fontSize: 24,
    color: '#cccccc',
    lineHeight: 24,
  },
})
