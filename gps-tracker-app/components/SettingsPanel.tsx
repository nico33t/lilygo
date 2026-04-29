import Slider from '@react-native-community/slider'
import { useRef, useState } from 'react'
import { Animated, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native'
import * as Haptics from 'expo-haptics'
import { bleSendCommand } from '../services/bleService'
import { sendCommand as wsSendCommand } from '../services/wsService'
import { useTrackerStore } from '../store/tracker'

const IP_RE = /^\d{1,3}(\.\d{1,3}){3}$/

const GNSS_MODES = [
  { value: 0, label: 'GPS' },
  { value: 1, label: 'GPS + BeiDou' },
]

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
  const isWifi = deviceId ? IP_RE.test(deviceId) : false
  const sendCommand = isWifi ? wsSendCommand : bleSendCommand

  const toastOpacity = useRef(new Animated.Value(0)).current
  const [toastVisible, setToastVisible] = useState(false)
  const [restarting, setRestarting] = useState(false)

  const showToast = () => {
    setToastVisible(true)
    Animated.sequence([
      Animated.timing(toastOpacity, { toValue: 1, duration: 200, useNativeDriver: true }),
      Animated.delay(1400),
      Animated.timing(toastOpacity, { toValue: 0, duration: 300, useNativeDriver: true }),
    ]).start(() => setToastVisible(false))
  }

  const handleApply = () => {
    sendCommand({ cmd: 'set_interval', value: config.interval_ms })
    sendCommand({ cmd: 'set_gnss_mode', value: config.gnss_mode })
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
    showToast()
  }

  const handleRestartGPS = () => {
    if (!connected || restarting) return
    setRestarting(true)
    sendCommand({ cmd: 'restart_gps' })
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)
    setTimeout(() => setRestarting(false), 6000)
  }

  return (
    <ScrollView
      contentContainerStyle={styles.container}
      showsVerticalScrollIndicator={false}
    >
      {!connected && (
        <View style={styles.banner}>
          <Text style={styles.bannerText}>
            Connetti il dispositivo per applicare le impostazioni
          </Text>
        </View>
      )}

      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Frequenza aggiornamento GPS</Text>
          <Text style={styles.sectionBadge}>{config.interval_ms} ms</Text>
        </View>
        <Slider
          style={styles.slider}
          minimumValue={500}
          maximumValue={5000}
          step={100}
          value={config.interval_ms}
          onValueChange={(v) => setConfig({ ...config, interval_ms: v })}
          minimumTrackTintColor="#ff385c"
          maximumTrackTintColor="#dddddd"
          thumbTintColor="#ff385c"
          disabled={!connected}
        />
        <View style={styles.sliderLabels}>
          <Text style={styles.sliderEdge}>500 ms</Text>
          <Text style={styles.sliderEdge}>5000 ms</Text>
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Modalità GNSS</Text>
        <View style={styles.modeRow}>
          {GNSS_MODES.map((mode) => {
            const active = config.gnss_mode === mode.value
            return (
              <Pressable
                key={mode.value}
                style={[
                  styles.modeBtn,
                  active && styles.modeBtnActive,
                  !connected && styles.modeBtnDisabled,
                ]}
                onPress={() =>
                  connected && setConfig({ ...config, gnss_mode: mode.value })
                }
              >
                <Text
                  style={[
                    styles.modeBtnText,
                    active && styles.modeBtnTextActive,
                  ]}
                >
                  {mode.label}
                </Text>
              </Pressable>
            )
          })}
        </View>
      </View>

      <View style={styles.applyWrap}>
        <Pressable
          style={[styles.applyBtn, !connected && styles.applyBtnDisabled]}
          onPress={handleApply}
          disabled={!connected}
        >
          <Text style={styles.applyBtnText}>Applica</Text>
        </Pressable>
        {toastVisible && (
          <Animated.View style={[styles.toast, { opacity: toastOpacity }]}>
            <Text style={styles.toastText}>✓ Impostazioni applicate</Text>
          </Animated.View>
        )}
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Manutenzione</Text>
        <Pressable
          style={[styles.restartBtn, (!connected || restarting) && styles.applyBtnDisabled]}
          onPress={handleRestartGPS}
          disabled={!connected || restarting}
        >
          <Text style={styles.restartBtnText}>
            {restarting ? 'Riavvio in corso…' : 'Riavvia GPS'}
          </Text>
        </Pressable>
        <View style={styles.toggleRow}>
          <Text style={styles.toggleLabel}>Allarme distanza BLE</Text>
          <Switch
            value={proximityEnabled}
            onValueChange={setProximity}
            trackColor={{ true: '#ff385c', false: undefined }}
          />
        </View>
      </View>

      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Firmware</Text>
          <Text style={styles.sectionBadge}>
            {power ? `${(power.bat_mv / 1000).toFixed(2)}V · ` : ''}v0.1.0
          </Text>
        </View>
        {ota?.available && (
          <View style={styles.otaCard}>
            <Text style={styles.otaTitle}>Aggiornamento disponibile: {ota.version}</Text>
            {ota.changelog ? <Text style={styles.otaChangelog}>{ota.changelog}</Text> : null}
            {ota.progress != null ? (
              <View style={styles.otaProgressBar}>
                <View style={[styles.otaProgressFill, { width: `${ota.progress}%` as any }]} />
              </View>
            ) : (
              <Pressable
                style={[styles.applyBtn, !connected && styles.applyBtnDisabled]}
                onPress={() => connected && sendCommand({ cmd: 'start_ota' })}
                disabled={!connected}
              >
                <Text style={styles.applyBtnText}>Aggiorna firmware</Text>
              </Pressable>
            )}
          </View>
        )}
      </View>
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  container: {
    padding: 24,
    gap: 28,
  },
  banner: {
    backgroundColor: '#fff7ed',
    borderRadius: 12,
    padding: 14,
  },
  bannerText: {
    fontSize: 14,
    color: '#92400e',
    textAlign: 'center',
  },
  section: {
    gap: 12,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#222222',
  },
  sectionBadge: {
    fontSize: 14,
    fontWeight: '700',
    color: '#ff385c',
    backgroundColor: '#fff0f3',
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 20,
    overflow: 'hidden',
  },
  slider: {
    width: '100%',
    height: 40,
  },
  sliderLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: -4,
  },
  sliderEdge: {
    fontSize: 12,
    color: '#9b9b9b',
  },
  modeRow: {
    flexDirection: 'row',
    gap: 10,
  },
  modeBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: '#f7f7f7',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  modeBtnActive: {
    borderColor: '#ff385c',
    backgroundColor: '#fff0f3',
  },
  modeBtnDisabled: {
    opacity: 0.45,
  },
  modeBtnText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#6a6a6a',
  },
  modeBtnTextActive: {
    color: '#ff385c',
    fontWeight: '700',
  },
  applyWrap: {
    gap: 10,
  },
  applyBtn: {
    backgroundColor: '#ff385c',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  applyBtnDisabled: {
    opacity: 0.35,
  },
  applyBtnText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#ffffff',
  },
  toast: {
    backgroundColor: '#1c1c1e',
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 16,
    alignItems: 'center',
  },
  toastText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#ffffff',
  },
  restartBtn: {
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    backgroundColor: '#f2f2f7',
    borderWidth: 1.5,
    borderColor: '#d1d1d6',
  },
  restartBtnText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#3c3c43',
  },
  toggleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 4,
  },
  toggleLabel: { fontSize: 15, color: '#3c3c43', fontWeight: '500' },
  otaCard: {
    backgroundColor: '#f0f7ff',
    borderRadius: 12,
    padding: 14,
    gap: 10,
    borderWidth: 1,
    borderColor: '#b3d4f5',
  },
  otaTitle: { fontSize: 14, fontWeight: '700', color: '#1a56a0' },
  otaChangelog: { fontSize: 13, color: '#444', lineHeight: 18 },
  otaProgressBar: { height: 8, backgroundColor: '#ddd', borderRadius: 4, overflow: 'hidden' },
  otaProgressFill: { height: '100%' as any, backgroundColor: '#007AFF', borderRadius: 4 },
})
