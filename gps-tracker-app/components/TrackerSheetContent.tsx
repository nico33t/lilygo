import { ScrollView, StyleSheet, View } from 'react-native'
import { C } from '../constants/design'
import StatusPanel from './StatusPanel'

type TrackerSheetContentProps = {
  variant: 'legacy' | 'swift'
}

export default function TrackerSheetContent({ variant }: TrackerSheetContentProps) {
  if (variant === 'swift') {
    return (
      <View style={styles.swiftContainer}>
        <ScrollView
          style={styles.swiftScroll}
          contentContainerStyle={styles.swiftInner}
          showsVerticalScrollIndicator={false}
          bounces={false}
        >
          <StatusPanel />
        </ScrollView>
      </View>
    )
  }

  return <StatusPanel />
}

const styles = StyleSheet.create({
  swiftContainer: {
    flex: 1,
    backgroundColor: C.card,
  },
  swiftScroll: {
    flex: 1,
  },
  swiftInner: {
    paddingBottom: 12,
    backgroundColor: C.card,
  },
})
