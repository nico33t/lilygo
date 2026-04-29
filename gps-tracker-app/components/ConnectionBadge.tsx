import { useEffect, useRef } from 'react'
import { Animated, StyleSheet, Text, View } from 'react-native'
import { useTrackerStore } from '../store/tracker'
import { ConnectionStatus } from '../types'
import { C } from '../constants/design'

const STATUS_COLOR: Record<ConnectionStatus, string> = {
  connected:    C.green,
  connecting:   C.orange,
  disconnected: C.red,
}

const STATUS_LABEL: Record<ConnectionStatus, string> = {
  connected:    'Connesso',
  connecting:   'Connessione…',
  disconnected: 'Disconnesso',
}

export default function ConnectionBadge() {
  const status = useTrackerStore((s) => s.status)
  const color = STATUS_COLOR[status]
  const opacity = useRef(new Animated.Value(1)).current

  useEffect(() => {
    if (status === 'connecting') {
      Animated.loop(
        Animated.sequence([
          Animated.timing(opacity, { toValue: 0.25, duration: 550, useNativeDriver: true }),
          Animated.timing(opacity, { toValue: 1,    duration: 550, useNativeDriver: true }),
        ])
      ).start()
    } else {
      opacity.stopAnimation()
      Animated.timing(opacity, { toValue: 1, duration: 200, useNativeDriver: true }).start()
    }
  }, [status])

  return (
    <View style={[styles.badge, { backgroundColor: color + '18' }]}>
      <Animated.View style={[styles.dot, { backgroundColor: color, opacity }]} />
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
    borderRadius: 999,
    gap: 5,
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  label: {
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 0.1,
  },
})
