import { StyleSheet, Text, View } from 'react-native'
import { useTrackerStore } from '../store/tracker'
import { C, S } from '../constants/design'

interface CellProps {
  label: string
  value: string
  unit?: string
  accent?: boolean
}

function Cell({ label, value, unit, accent }: CellProps) {
  return (
    <View style={styles.cell}>
      <Text style={styles.cellLabel}>{label}</Text>
      <View style={styles.cellValueRow}>
        <Text style={[styles.cellValue, accent && styles.cellValueAccent]} numberOfLines={1}>
          {value}
        </Text>
        {unit ? <Text style={styles.cellUnit}>{unit}</Text> : null}
      </View>
    </View>
  )
}

export default function StatusPanel() {
  const gps = useTrackerStore((s) => s.gps)
  const status = useTrackerStore((s) => s.status)

  const dash = '—'
  const f = (n: number, d: number) => n.toFixed(d)
  const hasData = gps != null
  const hasFix  = gps?.valid === true

  const fixColor = hasFix ? C.green : hasData ? C.orange : C.text3
  const fixLabel = hasFix
    ? 'Fix GPS attivo'
    : status === 'disconnected'
    ? 'Non connesso'
    : 'Ricerca fix GPS…'

  return (
    <View style={styles.container}>
      {/* Fix banner */}
      <View style={styles.fixRow}>
        <View style={[styles.fixDot, { backgroundColor: fixColor }]} />
        <Text style={[styles.fixLabel, { color: fixColor }]}>{fixLabel}</Text>
        {hasFix && gps.time && gps.time !== 'no-time' && (
          <Text style={styles.timeText}>{gps.time} UTC</Text>
        )}
      </View>

      {/* Stats grid */}
      <View style={styles.grid}>
        <Cell
          label="Latitudine"
          value={hasFix ? f(gps.lat, 5) : dash}
          unit="°N"
          accent={hasFix}
        />
        <Cell
          label="Longitudine"
          value={hasFix ? f(gps.lon, 5) : dash}
          unit="°E"
          accent={hasFix}
        />
        <Cell
          label="Velocità"
          value={hasFix ? f(gps.speed, 1) : dash}
          unit="km/h"
        />
        <Cell
          label="Altitudine"
          value={hasFix ? f(gps.alt, 0) : dash}
          unit="m"
        />
        <Cell
          label="Satelliti"
          value={hasData ? `${gps.usat}/${gps.vsat}` : dash}
        />
        <Cell
          label="HDOP"
          value={hasData ? f(gps.hdop, 1) : dash}
        />
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: C.card,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: C.sep,
    paddingBottom: S.md,
  },
  fixRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: S.md,
    paddingTop: 10,
    paddingBottom: 8,
    gap: 7,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: C.sep,
  },
  fixDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  fixLabel: {
    flex: 1,
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 0.1,
  },
  timeText: {
    fontSize: 11,
    color: C.text3,
    fontVariant: ['tabular-nums'],
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: S.sm,
    paddingTop: S.sm,
  },
  cell: {
    width: '33.33%',
    paddingHorizontal: S.sm,
    paddingVertical: 8,
    gap: 3,
  },
  cellLabel: {
    fontSize: 10,
    fontWeight: '500',
    color: C.text3,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  cellValueRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 2,
  },
  cellValue: {
    fontSize: 18,
    fontWeight: '700',
    color: C.text1,
    fontVariant: ['tabular-nums'],
  },
  cellValueAccent: {
    color: C.text1,
  },
  cellUnit: {
    fontSize: 11,
    fontWeight: '500',
    color: C.text2,
    paddingBottom: 1,
  },
})
