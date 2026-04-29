import { useEffect, useRef } from 'react'
import { Alert, Linking, Platform } from 'react-native'
import { Stack, router, usePathname } from 'expo-router'
import * as Notifications from 'expo-notifications'
import { bleManager, BleState } from '../services/bleService'
import { getLastDevice } from '../services/bleCache'
import { requestProximityPermissions } from '../services/proximityService'
import { setFirebaseMode } from '../services/backendService'
import { useAuth } from '../hooks/useAuth'

export default function RootLayout() {
  const autoConnectDone = useRef(false)
  const pathname = usePathname()
  const user = useAuth()

  // Sincronizza Firebase mode con stato auth
  useEffect(() => {
    if (user === undefined) return
    setFirebaseMode(user !== null)
  }, [user])

  useEffect(() => {
    if (!bleManager) return
    const sub = bleManager.onStateChange((state) => {
      if (state === BleState.PoweredOn && !autoConnectDone.current) {
        autoConnectDone.current = true
        getLastDevice().then((id) => {
          if (id && pathname === '/') {
            router.push(`/tracker?id=${encodeURIComponent(id)}`)
          }
        }).catch(() => {})
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
      <Stack.Screen name="login" />
      <Stack.Screen name="tracker" />
      <Stack.Screen name="history" options={{ headerShown: false }} />
      <Stack.Screen name="session" options={{ headerShown: false }} />
      <Stack.Screen
        name="settings"
        options={{ headerShown: true, title: 'Impostazioni', presentation: 'card' }}
      />
    </Stack>
  )
}
