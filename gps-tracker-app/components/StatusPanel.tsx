import { Pressable, StyleSheet, Text, View } from 'react-native'
import { useTrackerStore } from '../store/tracker'
import { C, S } from '../constants/design'
import { useEffect, useRef, useState } from 'react'
import { startSimulation, stopSimulation } from '../services/bleService'

function signalColor(rssi: number | null): string {
  if (rssi == null) return C.text3
  if (rssi >= -70) return C.green
  if (rssi >= -85) return C.orange
  return C.red
}

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
  const gps    = useTrackerStore((s) => s.gps)
  const sim    = useTrackerStore((s) => s.sim)
  const power  = useTrackerStore((s) => s.power)
  const status = useTrackerStore((s) => s.status)
  const lastRx   = useTrackerStore((s) => s.lastRx)
  const bleError = useTrackerStore((s) => s.bleError)
  const [rxAge, setRxAge] = useState<string>('—')
  const [simRunning, setSimRunning] = useState(false)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    if (timerRef.current) clearInterval(timerRef.current)
    timerRef.current = setInterval(() => {
      if (!lastRx) { setRxAge('—'); return }
      const s = Math.floor((Date.now() - lastRx) / 1000)
      setRxAge(s < 60 ? `${s}s fa` : `${Math.floor(s / 60)}m fa`)
    }, 1000)
    return () => { if (timerRef.current) clearInterval(timerRef.current) }
  }, [lastRx])

  const dash = '—'
  const f = (n: number, d: number) => n.toFixed(d)
  const hasData   = gps != null
  const hasFix    = gps?.valid === true && gps?.stored !== true
  const isStored  = hasData && !hasFix && gps!.stored === true && gps!.lat !== 0
  const hasCoords = hasFix || isStored

  const fixColor = hasFix ? C.green : isStored ? C.orange : hasData ? C.orange : C.text3
  const fixLabel = hasFix
    ? 'Fix GPS attivo'
    : isStored
    ? 'Ultima posizione nota'
    : status === 'disconnected'
    ? 'Non connesso'
    : 'Ricerca fix GPS…'

  return (
    <View style={styles.container}>
      {/* Power mode row */}
      {power && (
        <View style={styles.powerRow}>
          <Text style={styles.powerMode}>{
            power.mode === 'VEHICLE' ? '⚡ Veicolo' :
            power.mode === 'MOVING'  ? '▶ In movimento' :
            power.mode === 'IDLE'    ? '⏸ Fermo' : '💤 Parcheggiato'
          }</Text>
          <Text style={styles.powerBat}>{(power.bat_mv / 1000).toFixed(2)} V</Text>
        </View>
      )}
      {/* Debug: last BLE rx + simulation */}
      <View style={styles.debugRow}>
        <Text style={styles.debugText}>
          BLE RX: {rxAge}{bleError ? `  ⚠ ${bleError}` : ''}
        </Text>
        <Pressable
          onPress={() => {
            if (simRunning) { stopSimulation(); setSimRunning(false) }
            else { startSimulation(); setSimRunning(true) }
          }}
          style={[styles.simBtn, simRunning && styles.simBtnActive]}
        >
          <Text style={styles.simBtnText}>{simRunning ? 'Stop SIM' : 'Simula'}</Text>
        </Pressable>
      </View>

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
          value={hasCoords ? f(gps!.lat, 5) : dash}
          unit="°N"
          accent={hasFix}
        />
        <Cell
          label="Longitudine"
          value={hasCoords ? f(gps!.lon, 5) : dash}
          unit="°E"
          accent={hasFix}
        />
        <Cell
          label="Velocità"
          value={hasFix ? f(gps!.speed, 1) : dash}
          unit="km/h"
        />
        <Cell
          label="Altitudine"
          value={hasCoords ? f(gps!.alt, 0) : dash}
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

      {/* SIM section */}
      <View style={styles.simSep} />
      <View style={styles.fixRow}>
        <View style={[styles.fixDot, { backgroundColor: sim ? (sim.reg ? C.green : C.orange) : C.text3 }]} />
        <Text style={[styles.fixLabel, { color: sim ? (sim.reg ? C.green : C.orange) : C.text3 }]}>
          {sim ? (sim.reg ? 'SIM registrata' : 'SIM non registrata') : 'Nessun dato SIM'}
        </Text>
        {sim?.net ? (
          <View style={[styles.netBadge, { backgroundColor: sim.reg ? C.green + '22' : C.orange + '22' }]}>
            <Text style={[styles.netBadgeText, { color: sim.reg ? C.green : C.orange }]}>{sim.net}</Text>
          </View>
        ) : null}
      </View>
      <View style={styles.grid}>
        <Cell
          label="Gestore"
          value={sim?.op ?? dash}
        />
        <Cell
          label="Segnale"
          value={sim?.rssi != null ? `${sim.rssi}` : dash}
          unit={sim?.rssi != null ? 'dBm' : undefined}
        />
        <Cell
          label="ICCID"
          value={sim?.iccid ? `…${sim.iccid.slice(-8)}` : dash}
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
  powerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: S.md,
    paddingTop: 8,
    paddingBottom: 6,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: C.sep,
  },
  powerMode: {
    fontSize: 12,
    fontWeight: '600',
    color: C.text2,
  },
  powerBat: {
    fontSize: 12,
    fontWeight: '700',
    color: C.text1,
    fontVariant: ['tabular-nums'],
  },
  debugRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: S.md,
    paddingTop: 4,
    paddingBottom: 2,
    gap: 8,
  },
  debugText: {
    flex: 1,
    fontSize: 10,
    color: C.text3,
    fontVariant: ['tabular-nums'],
  },
  simBtn: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    backgroundColor: '#f2f2f7',
    borderWidth: 1,
    borderColor: '#d1d1d6',
  },
  simBtnActive: {
    backgroundColor: '#fff0f3',
    borderColor: '#ff385c',
  },
  simBtnText: {
    fontSize: 10,
    fontWeight: '600',
    color: C.text2,
  },
  simSep: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: C.sep,
    marginHorizontal: S.md,
    marginTop: S.xs,
  },
  netBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  netBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
})
