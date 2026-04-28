import { SafeAreaView, StyleSheet } from 'react-native'
import SettingsPanel from '../components/SettingsPanel'

export default function SettingsScreen() {
  return (
    <SafeAreaView style={styles.container}>
      <SettingsPanel />
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
})
