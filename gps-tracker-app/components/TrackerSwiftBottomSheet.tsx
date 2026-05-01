import { type ComponentType, type ReactNode, useState } from 'react'
import { StyleSheet } from 'react-native'
import type { PresentationDetent } from '@expo/ui/swift-ui/modifiers'

type SwiftUIBundle = {
  Host: ComponentType<any>
  BottomSheet: ComponentType<any>
  RNHostView: ComponentType<any>
  Group?: ComponentType<any>
}

type DragIndicatorFn = (value: 'visible' | 'hidden' | 'automatic') => any

type TrackerSwiftBottomSheetProps = {
  swiftUI: SwiftUIBundle
  dragIndicator: DragIndicatorFn | null
  isPresented: boolean
  onIsPresentedChange: (open: boolean) => void
  children: ReactNode
}

const DETENT_HEIGHT_300: PresentationDetent = { height: 300 }
const DETENT_FRACTION_30: PresentationDetent = { fraction: 0.3 }
const DETENTS: PresentationDetent[] = [DETENT_HEIGHT_300, DETENT_FRACTION_30, 'medium', 'large']

export default function TrackerSwiftBottomSheet({
  swiftUI,
  dragIndicator,
  isPresented,
  onIsPresentedChange,
  children,
}: TrackerSwiftBottomSheetProps) {
  const [selectedDetent, setSelectedDetent] = useState<PresentationDetent>(DETENT_FRACTION_30)
  const { Host, BottomSheet, RNHostView, Group } = swiftUI
  const modifiers = require('@expo/ui/swift-ui/modifiers')

  return (
    <Host style={StyleSheet.absoluteFill} pointerEvents="box-none">
      <BottomSheet isPresented={isPresented} onIsPresentedChange={onIsPresentedChange}>
        {Group && dragIndicator ? (
          <Group
            modifiers={[
              // Mirrors Expo SwiftUI BottomSheet detent-selection pattern.
              modifiers.presentationDetents(DETENTS, {
                selection: selectedDetent,
                onSelectionChange: setSelectedDetent,
              }),
              // Keep background interactive until medium; at large it becomes dimmed/non-interactive.
              modifiers.presentationBackgroundInteraction({
                type: 'enabledUpThrough',
                detent: 'medium',
              }),
              modifiers.interactiveDismissDisabled(),
              dragIndicator('visible'),
            ]}
          >
            <RNHostView>
              {children}
            </RNHostView>
          </Group>
        ) : (
          <RNHostView>
            {children}
          </RNHostView>
        )}
      </BottomSheet>
    </Host>
  )
}
