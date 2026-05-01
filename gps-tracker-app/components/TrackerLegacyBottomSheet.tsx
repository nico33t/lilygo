import { type ReactNode } from 'react'
import {
  Animated,
  type PanResponderInstance,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native'
import { C } from '../constants/design'

const SHEET_RADIUS = 32

type TrackerLegacyBottomSheetProps = {
  sheetHeight: number
  pan: Animated.Value
  panResponder: PanResponderInstance
  scrollBottomPadding: number
  children: ReactNode
}

export default function TrackerLegacyBottomSheet({
  sheetHeight,
  pan,
  panResponder,
  scrollBottomPadding,
  children,
}: TrackerLegacyBottomSheetProps) {
  return (
    <Animated.View
      style={[
        styles.sheet,
        { height: sheetHeight, transform: [{ translateY: pan }] },
      ]}
    >
      <View style={styles.handleArea} {...panResponder.panHandlers}>
        <View style={styles.handleBar} />
      </View>

      <ScrollView
        style={styles.sheetScroll}
        showsVerticalScrollIndicator={false}
        bounces={false}
        contentContainerStyle={{ paddingBottom: scrollBottomPadding }}
      >
        {children}
      </ScrollView>
    </Animated.View>
  )
}

const styles = StyleSheet.create({
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: C.card,
    borderTopLeftRadius: SHEET_RADIUS,
    borderTopRightRadius: SHEET_RADIUS,
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
    borderTopLeftRadius: SHEET_RADIUS,
    borderTopRightRadius: SHEET_RADIUS,
  },
  handleBar: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(0,0,0,0.15)',
  },
  sheetScroll: { flex: 1 },
})
