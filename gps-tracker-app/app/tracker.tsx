import { Ionicons } from '@expo/vector-icons'
import { router, useLocalSearchParams } from 'expo-router'
import { useEffect, useRef } from 'react'
import {
  Animated,
  Dimensions,
  PanResponder,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import ConnectionBadge from '../components/ConnectionBadge'
import GPSMap from '../components/GPSMap'
import StatusPanel from '../components/StatusPanel'
import { useTracker } from '../hooks/useTracker'
import { useRemote } from '../hooks/useRemote'
import { useTrackerStore } from '../store/tracker'
import { onBleDisconnectedUnexpectedly, cancelDisconnectAlarm } from '../services/proximityService'
import { C, R } from '../constants/design'

const IP_RE = /^\d{1,3}(\.\d{1,3}){3}/
const SCREEN_H   = Dimensions.get('window').height
const SHEET_H    = SCREEN_H * 0.72   // total sheet height
const HANDLE_H   = 32                // visible collapsed height
const SNAP_FULL  = 0                 // translateY: fully open
const SNAP_MID   = SHEET_H * 0.48   // translateY: mid — default
const SNAP_MINI  = SHEET_H - HANDLE_H  // translateY: only handle visible

const SNAPS = [SNAP_FULL, SNAP_MID, SNAP_MINI]

function nearest(value: number): number {
  return SNAPS.reduce((a, b) => Math.abs(b - value) < Math.abs(a - value) ? b : a)
}

export default function TrackerScreen() {
  const { ip, id } = useLocalSearchParams<{ ip?: string; id?: string }>()
  const deviceId = id ?? ip ?? ''
  const insets   = useSafeAreaInsets()
  const isWifi   = IP_RE.test(deviceId)

  useTracker(deviceId)
  const status           = useTrackerStore((s) => s.status)
  const proximityEnabled = useTrackerStore((s) => s.proximityAlarmEnabled)
  useRemote(deviceId, status === 'disconnected')

  useEffect(() => {
    if (status === 'disconnected') onBleDisconnectedUnexpectedly(proximityEnabled)
    else cancelDisconnectAlarm()
  }, [status, proximityEnabled])

  // ── Bottom sheet animation ────────────────────────────────────────────────
  const pan      = useRef(new Animated.Value(SNAP_MID)).current
  const panStart = useRef(SNAP_MID)

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, { dy }) => Math.abs(dy) > 4,
      onPanResponderGrant: () => {
        pan.stopAnimation((v) => { panStart.current = v })
      },
      onPanResponderMove: (_, { dy }) => {
        const next = Math.max(SNAP_FULL, Math.min(SNAP_MINI, panStart.current + dy))
        pan.setValue(next)
      },
      onPanResponderRelease: (_, { dy, vy }) => {
        const cur = Math.max(SNAP_FULL, Math.min(SNAP_MINI, panStart.current + dy))
        let dest: number

        if (vy < -0.6) {
          // flick up — go one level up
          dest = cur < SNAP_MID - 20 ? SNAP_FULL : SNAP_MID
        } else if (vy > 0.6) {
          // flick down — go one level down
          dest = cur > SNAP_MID + 20 ? SNAP_MINI : SNAP_MID
        } else {
          dest = nearest(cur)
        }

        panStart.current = dest
        Animated.spring(pan, {
          toValue: dest,
          useNativeDriver: true,
          bounciness: 3,
          speed: 18,
        }).start()
      },
    })
  ).current

  const deviceSub = isWifi ? deviceId : deviceId.slice(0, 17)

  return (
    <View style={styles.root}>

      {/* Map — full screen background */}
      <GPSMap />

      {/* Header overlay */}
      <View style={[styles.header, { paddingTop: insets.top + 4 }]}>
        <Pressable onPress={() => router.back()} style={styles.iconBtn} hitSlop={10}>
          <Ionicons name="arrow-back" size={20} color={C.text1} />
        </Pressable>

        <View style={styles.titleBlock}>
          <Text style={styles.deviceName} numberOfLines={1}>GPS Tracker</Text>
          <Text style={styles.deviceSub} numberOfLines={1}>{deviceSub}</Text>
        </View>

        <ConnectionBadge />

        <Pressable
          onPress={() => router.push(`/history?id=${encodeURIComponent(deviceId)}`)}
          style={styles.iconBtn}
          hitSlop={10}
        >
          <Ionicons name="time-outline" size={20} color={C.text1} />
        </Pressable>
        <Pressable
          onPress={() => router.push(`/settings?id=${encodeURIComponent(deviceId)}`)}
          style={styles.iconBtn}
          hitSlop={10}
        >
          <Ionicons name="settings-outline" size={20} color={C.text1} />
        </Pressable>
      </View>

      {/* Bottom sheet */}
      <Animated.View
        style={[
          styles.sheet,
          { height: SHEET_H, transform: [{ translateY: pan }] },
        ]}
      >
        {/* Drag handle */}
        <View style={styles.handleArea} {...panResponder.panHandlers}>
          <View style={styles.handleBar} />
        </View>

        {/* Scrollable data */}
        <ScrollView
          style={styles.sheetScroll}
          showsVerticalScrollIndicator={false}
          bounces={false}
          contentContainerStyle={{ paddingBottom: insets.bottom + 16 }}
        >
          <StatusPanel />
        </ScrollView>
      </Animated.View>

    </View>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1 },

  // Header — floating over the map
  header: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingBottom: 10,
    gap: 8,
    backgroundColor: 'rgba(255,255,255,0.92)',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(0,0,0,0.08)',
    zIndex: 10,
  },
  iconBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
  titleBlock: { flex: 1 },
  deviceName: { fontSize: 15, fontWeight: '700', color: C.text1, letterSpacing: -0.2 },
  deviceSub:  { fontSize: 11, color: C.text3, fontVariant: ['tabular-nums'] },

  // Bottom sheet
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: C.card,
    borderTopLeftRadius: R.xl,
    borderTopRightRadius: R.xl,
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: -4 },
    elevation: 12,
    zIndex: 10,
  },

  handleArea: {
    alignItems: 'center',
    justifyContent: 'center',
    height: 32,
    borderTopLeftRadius: R.xl,
    borderTopRightRadius: R.xl,
  },
  handleBar: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(0,0,0,0.15)',
  },

  sheetScroll: { flex: 1 },
})
