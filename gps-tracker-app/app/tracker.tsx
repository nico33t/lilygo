import { Ionicons } from '@expo/vector-icons'
import { router, useLocalSearchParams } from 'expo-router'
import { type ComponentType, useEffect, useRef, useState } from 'react'
import {
  Animated,
  Dimensions,
  PanResponder,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
  Modal,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import GPSMap from '../components/GPSMap'
import TrackerLegacyBottomSheet from '../components/TrackerLegacyBottomSheet'
import TrackerSheetContent from '../components/TrackerSheetContent'
import TrackerSwiftBottomSheet from '../components/TrackerSwiftBottomSheet'
import LookAroundView from '../components/LookAroundView'
import { useTracker } from '../hooks/useTracker'
import { useRemote } from '../hooks/useRemote'
import { onBleDisconnectedUnexpectedly, cancelDisconnectAlarm } from '../services/proximityService'
import { useTrackerStore } from '../store/tracker'
import { C } from '../constants/design'

const SCREEN_H = Dimensions.get('window').height
const SHEET_H = SCREEN_H * 0.72
const HANDLE_H = 32
const SNAP_FULL = 0
const SNAP_MID = SHEET_H * 0.48
const SNAP_MINI = SHEET_H - HANDLE_H

const SNAPS = [SNAP_FULL, SNAP_MID, SNAP_MINI]

function nearest(value: number): number {
  return SNAPS.reduce((a, b) => (Math.abs(b - value) < Math.abs(a - value) ? b : a))
}

export default function TrackerScreen() {
  const { ip, id } = useLocalSearchParams<{ ip?: string; id?: string }>()
  const deviceId = id ?? ip ?? ''
  const insets = useSafeAreaInsets()
  const [headerHeight, setHeaderHeight] = useState(0)
  const [mapBottomPadding, setMapBottomPadding] = useState(SHEET_H - SNAP_MID)
  const [swiftSheetOpen, setSwiftSheetOpen] = useState(true)
  const [isFollowing, setIsFollowing] = useState(true)
  const [fullScreenLookAround, setFullScreenLookAround] = useState(false)
  const [lookAroundAvailable, setLookAroundAvailable] = useState(false)

  useTracker(deviceId)
  const status = useTrackerStore((s) => s.status)
  const lat = useTrackerStore((s) => s.gps?.lat)
  const lon = useTrackerStore((s) => s.gps?.lon)
  const proximityEnabled = useTrackerStore((s) => s.proximityAlarmEnabled)
  useRemote(deviceId, status === 'disconnected')

  useEffect(() => {
    if (status === 'disconnected') onBleDisconnectedUnexpectedly(proximityEnabled)
    else cancelDisconnectAlarm()
  }, [status, proximityEnabled])

  const pan = useRef(new Animated.Value(SNAP_MID)).current
  const panStart = useRef(SNAP_MID)

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, { dy }) => Math.abs(dy) > 4,
      onPanResponderGrant: () => {
        pan.stopAnimation((v) => {
          panStart.current = v
        })
      },
      onPanResponderMove: (_, { dy }) => {
        const next = Math.max(SNAP_FULL, Math.min(SNAP_MINI, panStart.current + dy))
        pan.setValue(next)
      },
      onPanResponderRelease: (_, { dy, vy }) => {
        const cur = Math.max(SNAP_FULL, Math.min(SNAP_MINI, panStart.current + dy))
        let dest: number

        if (vy < -0.6) {
          dest = cur < SNAP_MID - 20 ? SNAP_FULL : SNAP_MID
        } else if (vy > 0.6) {
          dest = cur > SNAP_MINI - 20 ? SNAP_MINI : SNAP_MID
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

  const iosVersion =
    typeof Platform.Version === 'string'
      ? Number.parseInt(Platform.Version, 10)
      : Platform.Version

  let swiftUI: null | {
    Host: ComponentType<any>
    BottomSheet: ComponentType<any>
    RNHostView: ComponentType<any>
    Group?: ComponentType<any>
  } = null
  let dragIndicator: null | ((value: 'visible' | 'hidden' | 'automatic') => any) = null

  if (Platform.OS === 'ios' && iosVersion >= 26) {
    try {
      const swiftUIModule = require('@expo/ui/swift-ui')
      const modifiers = require('@expo/ui/swift-ui/modifiers')
      swiftUI = {
        Host: swiftUIModule.Host,
        BottomSheet: swiftUIModule.BottomSheet,
        RNHostView: swiftUIModule.RNHostView,
        Group: swiftUIModule.Group,
      }
      dragIndicator = modifiers.presentationDragIndicator
    } catch {
      swiftUI = null
      dragIndicator = null
    }
  }

  const useSwiftSheet = false
  const isAppleMapsProvider = Platform.OS === 'ios'
  const canUseLookAround = isAppleMapsProvider && lookAroundAvailable
  const hasCoords =
    typeof lat === 'number' &&
    typeof lon === 'number' &&
    Number.isFinite(lat) &&
    Number.isFinite(lon) &&
    lat !== 0 &&
    lon !== 0

  useEffect(() => {
    if (useSwiftSheet) {
      setMapBottomPadding(360)
      return
    }

    const listenerId = pan.addListener(({ value }) => {
      const visibleSheetHeight = Math.max(HANDLE_H, SHEET_H - value)
      setMapBottomPadding(visibleSheetHeight)
    })

    return () => pan.removeListener(listenerId)
  }, [pan, useSwiftSheet])

  return (
    <View style={styles.root}>
      <GPSMap
        bottomPadding={mapBottomPadding}
        topPadding={headerHeight}
        isFollowing={isFollowing}
        onMapDrag={() => setIsFollowing(false)}
      />

      {/* Floating Controls above Bottom Sheet */}
      <Animated.View
        style={[
          styles.floatingControls,
          {
            transform: [
              {
                translateY: pan.interpolate({
                  inputRange: [SNAP_FULL, SNAP_MINI],
                  outputRange: [SNAP_FULL, SNAP_MINI],
                }),
              },
            ],
          },
        ]}
      >
        <View style={styles.floatingRow}>
          {/* Left: Look Around Preview (only if available) */}
          {canUseLookAround && (
            <Pressable
              style={styles.lookAroundPreviewContainer}
              onPress={() => setFullScreenLookAround(true)}
            >
              <LookAroundView
                coordinate={{ latitude: lat!, longitude: lon! }}
                style={styles.lookAroundPreview}
                onSceneChange={(e) => setLookAroundAvailable(e.nativeEvent.available)}
              />
            </Pressable>
          )}

          {/* Invisible LookAroundView to probe availability if the preview is hidden */}
          {!canUseLookAround && isAppleMapsProvider && hasCoords && (
            <LookAroundView
              coordinate={{ latitude: lat!, longitude: lon! }}
              style={{ width: 1, height: 1, opacity: 0, position: 'absolute', left: -100 }}
              onSceneChange={(e) => {
                console.log('[LookAround] Probe response:', e.nativeEvent.available);
                setLookAroundAvailable(e.nativeEvent.available);
              }}
            />
          )}

          <View style={{ flex: 1 }} />

          {/* Right: Recenter Button (only if not following) */}
          {!isFollowing && (
            <Pressable
              style={styles.recenterBtn}
              onPress={() => setIsFollowing(true)}
            >
              <Ionicons name="locate" size={20} color={C.accent} />
              <Text style={styles.recenterText}>Ricentra</Text>
            </Pressable>
          )}
        </View>
      </Animated.View>

      <View
        style={[styles.header, { paddingTop: insets.top + 4 }]}
        onLayout={(e) => setHeaderHeight(e.nativeEvent.layout.height)}
      >
        <Pressable onPress={() => router.back()} style={styles.iconBtn} hitSlop={10}>
          <Ionicons name="arrow-back" size={20} color={C.text1} />
        </Pressable>
        <View style={styles.spacer} />
        <Pressable
          onPress={() => router.push(`/settings?id=${encodeURIComponent(deviceId)}`)}
          style={styles.iconBtn}
          hitSlop={10}
        >
          <Ionicons name="settings-outline" size={22} color={C.text1} />
        </Pressable>
      </View>

      {useSwiftSheet && swiftUI ? (
        <TrackerSwiftBottomSheet
          swiftUI={swiftUI}
          dragIndicator={dragIndicator}
          isPresented={swiftSheetOpen}
          onIsPresentedChange={setSwiftSheetOpen}
        >
          <TrackerSheetContent variant="swift" />
        </TrackerSwiftBottomSheet>
      ) : (
        <TrackerLegacyBottomSheet
          sheetHeight={SHEET_H}
          pan={pan}
          panResponder={panResponder}
          scrollBottomPadding={insets.bottom + 16}
        >
          <TrackerSheetContent variant="legacy" />
        </TrackerLegacyBottomSheet>
      )}

      {/* Full Screen Look Around Modal */}
      <Modal
        visible={fullScreenLookAround}
        animationType="slide"
        onRequestClose={() => setFullScreenLookAround(false)}
      >
        <View style={styles.fullScreenModal}>
          {isAppleMapsProvider ? (
            <LookAroundView
              coordinate={hasCoords ? { latitude: lat!, longitude: lon! } : { latitude: 44.5, longitude: 11.5 }}
              style={styles.fullScreenLookAround}
            />
          ) : null}
          <Pressable
            style={styles.closeFullScreenBtn}
            onPress={() => setFullScreenLookAround(false)}
          >
            <Ionicons name="close" size={24} color="#fff" />
          </Pressable>
        </View>
      </Modal>
    </View>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1 },
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
    backgroundColor: 'transparent',
    zIndex: 10,
  },
  iconBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.96)',
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  spacer: { flex: 1 },
  floatingControls: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: SHEET_H + 16,
    paddingHorizontal: 16,
    zIndex: 5,
  },
  floatingRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  recenterBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.95)',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 14,
    gap: 6,
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  recenterText: {
    fontSize: 13,
    fontWeight: '700',
    color: C.accent,
  },
  lookAroundPreviewContainer: {
    width: 120,
    height: 80,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.95)',
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#fff',
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  lookAroundPreview: {
    flex: 1,
  },
  fullScreenModal: {
    flex: 1,
    backgroundColor: '#000',
  },
  fullScreenLookAround: {
    flex: 1,
  },
  closeFullScreenBtn: {
    position: 'absolute',
    top: 50,
    right: 20,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 100,
  },
})
