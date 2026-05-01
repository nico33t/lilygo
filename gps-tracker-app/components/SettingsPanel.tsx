import Slider from '@react-native-community/slider'
import { useEffect, useRef, useState } from 'react'
import {
  Animated, Pressable, ScrollView, StyleSheet,
  Switch, Text, TextInput, View,
} from 'react-native'
import * as Haptics from 'expo-haptics'
import { router } from 'expo-router'
import { getAuth, onAuthStateChanged } from '@react-native-firebase/auth'
import { bleSendCommand } from '../services/bleService'
import { sendCommand as wsSendCommand } from '../services/wsService'
import { useTrackerStore } from '../store/tracker'
import { signOut } from '../services/authService'
import { listUserDevices, getTrialStatus, claimDevice, DeviceInfo } from '../services/deviceService'
import { C, R, S } from '../constants/design'
import { ensureFirebaseApp } from '../services/firebaseApp'

const IP_RE = /^\d{1,3}(\.\d{1,3}){3}$/

const GNSS_MODES = [
  { value: 0, label: 'GPS' },
  { value: 1, label: 'GPS + BeiDou' },
]

// ─── Shared layout primitives ────────────────────────────────────────────────

function SectionLabel({ title }: { title: string }) {
  return <Text style={styles.sectionLabel}>{title}</Text>
}

function Card({ children }: { children: React.ReactNode }) {
  return <View style={styles.card}>{children}</View>
}

function Sep() {
  return <View style={styles.sep} />
}

function InfoRow({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      {accent ? (
        <View style={styles.pill}>
          <Text style={styles.pillText}>{value}</Text>
        </View>
      ) : (
        <Text style={styles.rowValue}>{value}</Text>
      )}
    </View>
  )
}

// ─── Main component ──────────────────────────────────────────────────────────

export default function SettingsPanel() {
  const status           = useTrackerStore((s) => s.status)
  const config           = useTrackerStore((s) => s.config)
  const deviceId         = useTrackerStore((s) => s.deviceId)
  const ota              = useTrackerStore((s) => s.ota)
  const power            = useTrackerStore((s) => s.power)
  const proximityEnabled = useTrackerStore((s) => s.proximityAlarmEnabled)
  const setConfig        = useTrackerStore((s) => s.setConfig)
  const setProximity     = useTrackerStore((s) => s.setProximityAlarm)

  const connected = status === 'connected'
  const isWifi    = deviceId ? IP_RE.test(deviceId) : false
  const send      = isWifi ? wsSendCommand : bleSendCommand

  const toastOpacity = useRef(new Animated.Value(0)).current
  const [toastVisible, setToastVisible] = useState(false)
  const [restarting, setRestarting]     = useState(false)
  const [apn, setApn]                   = useState('em')
  const [apnSent, setApnSent]           = useState(false)

  const [userEmail, setUserEmail]   = useState<string | null>(null)
  const [deviceInfo, setDeviceInfo] = useState<DeviceInfo | null>(null)
  const [claimName, setClaimName]   = useState('Il mio tracker')
  const [claiming, setClaiming]     = useState(false)
  const [claimDone, setClaimDone]   = useState(false)

  useEffect(() => {
    if (!ensureFirebaseApp()) {
      setUserEmail(null)
      setDeviceInfo(null)
      return
    }
    const unsub = onAuthStateChanged(getAuth(), async (user) => {
      setUserEmail(user?.email ?? null)
      if (user && deviceId) {
        try {
          const devices = await listUserDevices()
          setDeviceInfo(devices.find((d) => d.id === deviceId) ?? null)
        } catch {}
      } else {
        setDeviceInfo(null)
      }
    })
    return unsub
  }, [deviceId])

  const showToast = () => {
    setToastVisible(true)
    Animated.sequence([
      Animated.timing(toastOpacity, { toValue: 1, duration: 200, useNativeDriver: true }),
      Animated.delay(1400),
      Animated.timing(toastOpacity, { toValue: 0, duration: 300, useNativeDriver: true }),
    ]).start(() => setToastVisible(false))
  }

  const handleApply = () => {
    if (!connected) return
    send({ cmd: 'set_interval', value: config.interval_ms })
    send({ cmd: 'set_gnss_mode', value: config.gnss_mode })
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
    showToast()
  }

  const handleRestartGPS = () => {
    if (!connected || restarting) return
    setRestarting(true)
    send({ cmd: 'restart_gps' })
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)
    setTimeout(() => setRestarting(false), 6000)
  }

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.container}
      showsVerticalScrollIndicator={false}
    >
      {/* ─── Not-connected banner ─────────────────────────────────────────── */}
      {!connected && (
        <View style={styles.banner}>
          <Text style={styles.bannerText}>
            Connetti il dispositivo per applicare le impostazioni
          </Text>
        </View>
      )}

      {/* ─── Dispositivo ──────────────────────────────────────────────────── */}
      <SectionLabel title="DISPOSITIVO" />
      <Card>
        <InfoRow
          label="Firmware"
          value={config.fw_version ? `v${config.fw_version}` : '—'}
          accent
        />
        {power && (
          <>
            <Sep />
            <InfoRow
              label="Batteria"
              value={`${(power.bat_mv / 1000).toFixed(2)} V`}
            />
          </>
        )}
      </Card>

      {/* ─── Tracciamento GPS ─────────────────────────────────────────────── */}
      <SectionLabel title="TRACCIAMENTO GPS" />
      <Card>
        {/* Interval slider */}
        <View style={styles.sliderBlock}>
          <View style={styles.sliderHeader}>
            <Text style={styles.rowLabel}>Intervallo aggiornamento</Text>
            <View style={styles.pill}>
              <Text style={styles.pillText}>{config.interval_ms} ms</Text>
            </View>
          </View>
          <Slider
            style={styles.slider}
            minimumValue={500}
            maximumValue={5000}
            step={100}
            value={config.interval_ms}
            onValueChange={(v) => setConfig({ ...config, interval_ms: v })}
            minimumTrackTintColor={C.accent}
            maximumTrackTintColor={C.sep}
            thumbTintColor={C.accent}
            disabled={!connected}
          />
          <View style={styles.sliderEdges}>
            <Text style={styles.edgeLabel}>500 ms</Text>
            <Text style={styles.edgeLabel}>5000 ms</Text>
          </View>
        </View>

        <Sep />

        {/* GNSS mode */}
        <View style={styles.gnssBlock}>
          <Text style={styles.rowLabel}>Modalità GNSS</Text>
          <View style={styles.segmented}>
            {GNSS_MODES.map((mode, i) => {
              const active = config.gnss_mode === mode.value
              return (
                <Pressable
                  key={mode.value}
                  style={[
                    styles.segBtn,
                    i === 0 && styles.segBtnFirst,
                    i === GNSS_MODES.length - 1 && styles.segBtnLast,
                    active && styles.segBtnActive,
                    !connected && styles.dimmed,
                  ]}
                  onPress={() => connected && setConfig({ ...config, gnss_mode: mode.value })}
                >
                  <Text style={[styles.segBtnText, active && styles.segBtnTextActive]}>
                    {mode.label}
                  </Text>
                </Pressable>
              )
            })}
          </View>
        </View>
      </Card>

      {/* Apply button + toast */}
      <Pressable
        style={[styles.applyBtn, !connected && styles.dimmed]}
        onPress={handleApply}
        disabled={!connected}
      >
        <Text style={styles.applyBtnText}>Applica impostazioni</Text>
      </Pressable>
      {toastVisible && (
        <Animated.View style={[styles.toast, { opacity: toastOpacity }]}>
          <Text style={styles.toastText}>✓ Impostazioni applicate</Text>
        </Animated.View>
      )}

      {/* ─── Sicurezza ────────────────────────────────────────────────────── */}
      <SectionLabel title="SICUREZZA" />
      <Card>
        <View style={styles.toggleRow}>
          <View style={styles.toggleInfo}>
            <Text style={styles.rowLabel}>Allarme distanza BLE</Text>
            <Text style={styles.rowHint}>Avvisa quando il tracker si allontana</Text>
          </View>
          <Switch
            value={proximityEnabled}
            onValueChange={setProximity}
            trackColor={{ true: C.accent, false: undefined }}
          />
        </View>
      </Card>

      {/* ─── Connettività ─────────────────────────────────────────────────── */}
      <SectionLabel title="CONNETTIVITÀ" />
      <Card>
        <View style={styles.apnBlock}>
          <Text style={styles.rowLabel}>APN SIM</Text>
          <Text style={styles.rowHint}>Access point per la connessione dati LTE-M</Text>
          <View style={styles.apnRow}>
            <TextInput
              style={[styles.apnInput, !connected && styles.dimmed]}
              value={apn}
              onChangeText={(t) => { setApn(t); setApnSent(false) }}
              placeholder="es. em"
              placeholderTextColor={C.text3}
              autoCapitalize="none"
              autoCorrect={false}
              editable={connected}
            />
            <Pressable
              style={[styles.apnBtn, (!connected || apn.trim().length === 0) && styles.dimmed]}
              onPress={() => {
                if (!connected || apn.trim().length === 0) return
                send({ cmd: 'set_apn', value: apn.trim() })
                setApnSent(true)
                Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
              }}
              disabled={!connected || apn.trim().length === 0}
            >
              <Text style={styles.apnBtnText}>{apnSent ? '✓ Inviato' : 'Imposta'}</Text>
            </Pressable>
          </View>
        </View>
      </Card>

      {/* ─── Manutenzione ─────────────────────────────────────────────────── */}
      <SectionLabel title="MANUTENZIONE" />
      <Card>
        <Pressable
          style={[styles.actionRow, (!connected || restarting) && styles.dimmed]}
          onPress={handleRestartGPS}
          disabled={!connected || restarting}
        >
          <Text style={styles.actionLabel}>
            {restarting ? 'Riavvio GPS in corso…' : 'Riavvia GPS'}
          </Text>
        </Pressable>
      </Card>

      {/* ─── OTA ──────────────────────────────────────────────────────────── */}
      {ota?.available && (
        <>
          <SectionLabel title="AGGIORNAMENTO FIRMWARE" />
          <Card>
            <View style={styles.otaBlock}>
              <Text style={styles.otaVersion}>Versione {ota.version} disponibile</Text>
              {ota.changelog ? (
                <Text style={styles.otaChangelog}>{ota.changelog}</Text>
              ) : null}
              {ota.progress != null ? (
                <View style={styles.otaBarBg}>
                  <View style={[styles.otaBarFill, { width: `${ota.progress}%` as any }]} />
                </View>
              ) : (
                <Pressable
                  style={[styles.applyBtn, styles.otaBtn, !connected && styles.dimmed]}
                  onPress={() => connected && send({ cmd: 'start_ota' })}
                  disabled={!connected}
                >
                  <Text style={styles.applyBtnText}>Installa aggiornamento</Text>
                </Pressable>
              )}
            </View>
          </Card>
        </>
      )}

      {/* ─── Account ──────────────────────────────────────────────────────── */}
      <SectionLabel title="ACCOUNT" />
      {userEmail ? (
        <Card>
          <InfoRow label="Email" value={userEmail} />

          {deviceInfo ? (() => {
            const sub = getTrialStatus(deviceInfo)
            return (
              <>
                <Sep />
                <InfoRow
                  label="Piano tracker"
                  value={
                    sub.isProActive    ? 'Pro attivo' :
                    sub.isTrialActive  ? `Trial · ${sub.daysLeft} giorni rimasti` :
                    'Abbonamento scaduto'
                  }
                  accent={sub.isProActive || sub.isTrialActive}
                />
                {sub.needsSubscription && (
                  <>
                    <Sep />
                    <View style={styles.row}>
                      <Text style={[styles.rowLabel, { color: C.orange }]}>
                        Attiva il piano Pro per continuare il tracking cloud
                      </Text>
                    </View>
                  </>
                )}
              </>
            )
          })() : (
            connected && !claimDone ? (
              <>
                <Sep />
                <View style={styles.claimBlock}>
                  <Text style={styles.rowLabel}>Associa questo tracker</Text>
                  <Text style={styles.rowHint}>
                    14 giorni di trial gratuito, poi €5.99/mese
                  </Text>
                  <View style={styles.apnRow}>
                    <TextInput
                      style={styles.apnInput}
                      value={claimName}
                      onChangeText={setClaimName}
                      placeholder="Nome del tracker"
                      placeholderTextColor={C.text3}
                      autoCorrect={false}
                    />
                    <Pressable
                      style={[styles.apnBtn, (claiming || !claimName.trim()) && styles.dimmed]}
                      disabled={claiming || !claimName.trim()}
                      onPress={async () => {
                        if (!deviceId) return
                        setClaiming(true)
                        try {
                          await claimDevice(deviceId, claimName.trim())
                          const devices = await listUserDevices()
                          setDeviceInfo(devices.find((d) => d.id === deviceId) ?? null)
                          setClaimDone(true)
                          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
                        } catch { /* ignore */ } finally {
                          setClaiming(false)
                        }
                      }}
                    >
                      <Text style={styles.apnBtnText}>{claiming ? '…' : 'Associa'}</Text>
                    </Pressable>
                  </View>
                </View>
              </>
            ) : null
          )}

          <Sep />
          <Pressable
            style={styles.actionRow}
            onPress={async () => {
              await signOut()
              router.replace('/login')
            }}
          >
            <Text style={[styles.actionLabel, { color: C.red }]}>Esci dall'account</Text>
          </Pressable>
        </Card>
      ) : (
        <Pressable
          style={[styles.applyBtn, { backgroundColor: C.text1, marginTop: 0 }]}
          onPress={() => router.push('/login')}
        >
          <Text style={styles.applyBtnText}>Accedi per il tracking cloud</Text>
        </Pressable>
      )}

      <View style={{ height: S.xl }} />
    </ScrollView>
  )
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  scroll: {
    flex: 1,
    backgroundColor: C.bg,
  },
  container: {
    paddingHorizontal: S.md,
    paddingTop: S.md,
  },

  // Banner
  banner: {
    backgroundColor: '#FFF7ED',
    borderRadius: R.md,
    paddingVertical: 12,
    paddingHorizontal: S.md,
    marginBottom: S.md,
  },
  bannerText: {
    fontSize: 14,
    color: '#92400E',
    textAlign: 'center',
    lineHeight: 20,
  },

  // Section label
  sectionLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: C.text3,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    marginTop: S.lg,
    marginBottom: S.sm,
    paddingHorizontal: S.xs,
  },

  // Card
  card: {
    backgroundColor: C.card,
    borderRadius: R.lg,
    overflow: 'hidden',
  },

  // Separator
  sep: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: C.sep,
    marginLeft: S.md,
  },

  // Generic row
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: S.md,
    paddingVertical: 14,
  },
  rowLabel: {
    fontSize: 15,
    fontWeight: '500',
    color: C.text1,
  },
  rowValue: {
    fontSize: 15,
    color: C.text2,
  },
  rowHint: {
    fontSize: 12,
    color: C.text3,
    marginTop: 2,
  },

  // Pill badge
  pill: {
    backgroundColor: C.accentMid,
    borderRadius: R.full,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  pillText: {
    fontSize: 13,
    fontWeight: '700',
    color: C.accent,
  },

  // Slider block
  sliderBlock: {
    paddingHorizontal: S.md,
    paddingTop: 14,
    paddingBottom: 6,
  },
  sliderHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  slider: {
    width: '100%',
    height: 40,
    marginHorizontal: -S.sm,
  },
  sliderEdges: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: -6,
    marginBottom: 4,
  },
  edgeLabel: {
    fontSize: 11,
    color: C.text3,
  },

  // GNSS segmented control
  gnssBlock: {
    paddingHorizontal: S.md,
    paddingVertical: 14,
    gap: 10,
  },
  segmented: {
    flexDirection: 'row',
    borderRadius: R.md,
    borderWidth: 1.5,
    borderColor: C.sep,
    overflow: 'hidden',
  },
  segBtn: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    backgroundColor: C.card,
  },
  segBtnFirst: {},
  segBtnLast: {},
  segBtnActive: {
    backgroundColor: C.accentMid,
  },
  segBtnText: {
    fontSize: 14,
    fontWeight: '500',
    color: C.text2,
  },
  segBtnTextActive: {
    color: C.accent,
    fontWeight: '700',
  },

  // Apply button
  applyBtn: {
    backgroundColor: C.accent,
    borderRadius: R.lg,
    paddingVertical: 15,
    alignItems: 'center',
    marginTop: S.sm,
  },
  applyBtnText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
  },

  // Toast
  toast: {
    backgroundColor: C.text1,
    borderRadius: R.md,
    paddingVertical: 12,
    paddingHorizontal: S.md,
    alignItems: 'center',
    marginTop: S.sm,
  },
  toastText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FFFFFF',
  },

  // Toggle row
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: S.md,
    paddingVertical: 14,
    gap: S.md,
  },
  toggleInfo: {
    flex: 1,
  },

  // Claim block (same layout as apnBlock)
  claimBlock: {
    paddingHorizontal: S.md,
    paddingVertical: 14,
    gap: 10,
  },

  // APN block
  apnBlock: {
    paddingHorizontal: S.md,
    paddingVertical: 14,
    gap: 10,
  },
  apnRow: {
    flexDirection: 'row',
    gap: S.sm,
  },
  apnInput: {
    flex: 1,
    height: 44,
    borderRadius: R.md,
    borderWidth: 1.5,
    borderColor: C.sep,
    paddingHorizontal: 12,
    fontSize: 15,
    color: C.text1,
    backgroundColor: C.bg,
  },
  apnBtn: {
    backgroundColor: C.accent,
    borderRadius: R.md,
    paddingHorizontal: S.md,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  apnBtnText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFFFFF',
  },

  // Action row (restart)
  actionRow: {
    paddingHorizontal: S.md,
    paddingVertical: 15,
    alignItems: 'center',
  },
  actionLabel: {
    fontSize: 15,
    fontWeight: '600',
    color: C.text1,
  },

  // OTA
  otaBlock: {
    paddingHorizontal: S.md,
    paddingVertical: 14,
    gap: 10,
  },
  otaBtn: {
    backgroundColor: C.blue,
    marginTop: 4,
  },
  otaVersion: {
    fontSize: 15,
    fontWeight: '700',
    color: C.blue,
  },
  otaChangelog: {
    fontSize: 13,
    color: C.text2,
    lineHeight: 18,
  },
  otaBarBg: {
    height: 8,
    backgroundColor: C.bg,
    borderRadius: R.full,
    overflow: 'hidden',
  },
  otaBarFill: {
    height: '100%' as any,
    backgroundColor: C.blue,
    borderRadius: R.full,
  },

  // Utility
  dimmed: {
    opacity: 0.4,
  },
})
