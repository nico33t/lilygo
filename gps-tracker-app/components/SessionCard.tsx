import { Pressable, StyleSheet, Text, View } from 'react-native'
import { C, R, S } from '../constants/design'
import { Session } from '../services/backendService'
import { formatDate, formatDuration } from '../services/historyService'

interface Props {
  session: Session
  onPress: () => void
}

export default function SessionCard({ session, onPress }: Props) {
  const isToday = session.startTime > (Date.now() / 1000 - 86400)

  return (
    <Pressable style={styles.card} onPress={onPress}>
      <View style={styles.left}>
        <View style={[styles.dot, { backgroundColor: isToday ? C.green : C.text3 }]} />
        <View style={styles.info}>
          <Text style={styles.date}>{formatDate(session.startTime)}</Text>
          <Text style={styles.duration}>{formatDuration(session.startTime, session.endTime)}</Text>
        </View>
      </View>
      <View style={styles.right}>
        <Text style={styles.distance}>
          {session.distance_km != null ? session.distance_km.toFixed(1) : '—'}
          <Text style={styles.unit}> km</Text>
        </Text>
        {session.maxSpeed_kmh != null && (
          <Text style={styles.speed}>max {Math.round(session.maxSpeed_kmh)} km/h</Text>
        )}
      </View>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: C.card,
    borderRadius: R.lg,
    padding: S.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginHorizontal: S.md,
    marginBottom: S.sm,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  left: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  info: { gap: 2 },
  date: { fontSize: 14, fontWeight: '600', color: C.text1 },
  duration: { fontSize: 12, color: C.text3 },
  right: { alignItems: 'flex-end', gap: 2 },
  distance: { fontSize: 22, fontWeight: '700', color: C.text1 },
  unit: { fontSize: 13, fontWeight: '400', color: C.text2 },
  speed: { fontSize: 12, color: C.text3 },
})
