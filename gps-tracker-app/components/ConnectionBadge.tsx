import { StyleSheet, Text, View } from 'react-native'
import { useTrackerStore } from '../store/tracker'
import { ConnectionStatus } from '../types'

const STATUS_COLOR: Record<ConnectionStatus, string> = {
  connected: '#00a651',
  connecting: '#f59e0b',
  disconnected: '#ef4444',
}

const STATUS_LABEL: Record<ConnectionStatus, string> = {
  connected: 'Connesso',
  connecting: 'Connessione...',
  disconnected: 'Disconnesso',
}

export default function ConnectionBadge() {
  const status = useTrackerStore((s) => s.status)
  const color = STATUS_COLOR[status]

  return (
    <View style={[styles.badge, { backgroundColor: color + '18' }]}>
      <View style={[styles.dot, { backgroundColor: color }]} />
      <Text style={[styles.label, { color }]}>{STATUS_LABEL[status]}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
    gap: 6,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
  },
})
