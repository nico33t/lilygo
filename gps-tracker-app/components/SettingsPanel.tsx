import Slider from '@react-native-community/slider'
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { sendCommand } from '../services/wsService'
import { useTrackerStore } from '../store/tracker'

const GNSS_MODES = [
  { value: 0, label: 'GPS' },
  { value: 1, label: 'GPS + BeiDou' },
]

export default function SettingsPanel() {
  const status = useTrackerStore((s) => s.status)
  const config = useTrackerStore((s) => s.config)
  const setConfig = useTrackerStore((s) => s.setConfig)
  const connected = status === 'connected'

  const handleApply = () => {
    sendCommand({ cmd: 'set_interval', value: config.interval_ms })
    sendCommand({ cmd: 'set_gnss_mode', value: config.gnss_mode })
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

      <Pressable
        style={[styles.applyBtn, !connected && styles.applyBtnDisabled]}
        onPress={handleApply}
        disabled={!connected}
      >
        <Text style={styles.applyBtnText}>Applica</Text>
      </Pressable>
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
})
