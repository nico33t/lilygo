import { useEffect } from 'react'
import { Alert, Linking, Platform } from 'react-native'
import { Stack } from 'expo-router'
import { bleManager, BleState } from '../services/bleService'

export default function RootLayout() {
  useEffect(() => {
    const sub = bleManager.onStateChange((state) => {
      if (state === BleState.PoweredOff) {
        if (Platform.OS === 'android') {
          bleManager.enable().catch(() => {
            Alert.alert(
              'Bluetooth disabilitato',
              'Abilita il Bluetooth per connetterti al GPS Tracker.',
              [{ text: 'OK' }]
            )
          })
        } else {
          Alert.alert(
            'Bluetooth disabilitato',
            'Abilita il Bluetooth nelle Impostazioni per connetterti al GPS Tracker.',
            [
              { text: 'Impostazioni', onPress: () => Linking.openSettings() },
              { text: 'Non ora', style: 'cancel' },
            ]
          )
        }
      }
    }, true)
    return () => sub.remove()
  }, [])

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        headerStyle: { backgroundColor: '#ffffff' },
        headerShadowVisible: false,
        headerTintColor: '#222222',
      }}
    >
      <Stack.Screen name="index" />
      <Stack.Screen name="tracker" />
      <Stack.Screen
        name="settings"
        options={{ headerShown: true, title: 'Impostazioni', presentation: 'card' }}
      />
    </Stack>
  )
}
