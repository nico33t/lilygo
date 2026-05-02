import { useEffect, useRef } from 'react'
import { Alert, Linking, Platform } from 'react-native'
import { Stack, router } from 'expo-router'
import * as Notifications from 'expo-notifications'
import * as Haptics from 'expo-haptics'
import { bleManager, BleState } from '../services/bleService'
import { requestProximityPermissions } from '../services/proximityService'
import { NetworkProvider } from '../contexts/NetworkContext'

export default function RootLayout() {
  const autoConnectDone = useRef(false)
  const appReadyHapticDone = useRef(false)

  useEffect(() => {
    if (!bleManager) return
    const sub = bleManager.onStateChange((state) => {
      if (state === BleState.PoweredOn && !autoConnectDone.current) {
        autoConnectDone.current = true
      }

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

  useEffect(() => {
    requestProximityPermissions().catch(() => {})
  }, [])

  useEffect(() => {
    const sub = Notifications.addNotificationResponseReceivedListener((response) => {
      const data = response.notification.request.content.data as { navigate?: string }
      if (data?.navigate === 'settings') router.push('/settings')
    })
    return () => sub.remove()
  }, [])

  useEffect(() => {
    if (appReadyHapticDone.current) return
    appReadyHapticDone.current = true
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {})
  }, [])

  return (
    <NetworkProvider>
      <Stack
        screenOptions={{
          headerShown: false,
          headerStyle: { backgroundColor: '#ffffff' },
          headerShadowVisible: false,
          headerTintColor: '#222222',
        }}
      >
        <Stack.Screen name="index" />
        <Stack.Screen name="login" />
        <Stack.Screen name="user-settings" />
        <Stack.Screen name="cluster-test" />
        <Stack.Screen name="tracker" />
        <Stack.Screen name="history" options={{ headerShown: false }} />
        <Stack.Screen name="session" options={{ headerShown: false }} />
        <Stack.Screen
          name="settings"
          options={{ headerShown: true, title: 'Impostazioni', presentation: 'card' }}
        />
      </Stack>
    </NetworkProvider>
  )
}
