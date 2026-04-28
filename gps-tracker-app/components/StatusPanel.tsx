import { ScrollView, StyleSheet, Text, View } from 'react-native'
import { useTrackerStore } from '../store/tracker'

interface StatProps {
  label: string
  value: string
  unit?: string
}

function Stat({ label, value, unit }: StatProps) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={styles.statValue} numberOfLines={1}>
        {value}
        {unit ? <Text style={styles.statUnit}> {unit}</Text> : null}
      </Text>
    </View>
  )
}

export default function StatusPanel() {
  const gps = useTrackerStore((s) => s.gps)

  const dash = '—'
  const f = (n: number, d: number) => n.toFixed(d)

  return (
    <View style={styles.container}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.row}
      >
        <Stat label="Lat" value={gps?.valid ? f(gps.lat, 6) : dash} unit="°N" />
        <Stat label="Lon" value={gps?.valid ? f(gps.lon, 6) : dash} unit="°E" />
        <Stat label="Velocità" value={gps?.valid ? f(gps.speed, 1) : dash} unit="km/h" />
        <Stat label="Altitudine" value={gps?.valid ? f(gps.alt, 0) : dash} unit="m" />
        <Stat
          label="Satelliti"
          value={gps ? `${gps.usat}/${gps.vsat}` : dash}
        />
        <Stat label="HDOP" value={gps ? f(gps.hdop, 1) : dash} />
        <Stat
          label="Fix age"
          value={
            gps && gps.last_fix_age_s >= 0
              ? String(gps.last_fix_age_s)
              : dash
          }
          unit="s"
        />
      </ScrollView>
      {gps?.time && gps.time !== 'no-time' && (
        <Text style={styles.time}>{gps.time} UTC</Text>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#ffffff',
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: '#ebebeb',
  },
  row: {
    paddingHorizontal: 16,
    gap: 10,
  },
  stat: {
    alignItems: 'center',
    backgroundColor: '#f7f7f7',
    borderRadius: 12,
    paddingVertical: 8,
    paddingHorizontal: 14,
    minWidth: 84,
  },
  statLabel: {
    fontSize: 10,
    color: '#9b9b9b',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 3,
  },
  statValue: {
    fontSize: 15,
    fontWeight: '700',
    color: '#222222',
  },
  statUnit: {
    fontSize: 11,
    fontWeight: '400',
    color: '#6a6a6a',
  },
  time: {
    fontSize: 11,
    color: '#9b9b9b',
    textAlign: 'center',
    marginTop: 6,
  },
})
