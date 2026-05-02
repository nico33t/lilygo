import { useEffect, useRef } from 'react'
import { Alert, Linking, Platform } from 'react-native'
import { Stack, Redirect, router } from 'expo-router'
import * as Notifications from 'expo-notifications'
import * as Haptics from 'expo-haptics'
import { bleManager, BleState } from '../services/bleService'
import { requestProximityPermissions } from '../services/proximityService'
import { NetworkProvider } from '../contexts/NetworkContext'
import { ErrorBoundary } from '../components/ErrorBoundary'
import NotFoundScreen from './+not-found'

// --- DEBUG FLAGS ---
const DEBUG_FORCE_ERROR = false; // Imposta a true per testare l'Error Boundary
const DEBUG_FORCE_404 = false;   // Imposta a true per testare la pagina 404
// -------------------

const SHOW_LAB_ONLY = false; // Imposta a false per tornare all'app normale

export default function RootLayout() {
  if (SHOW_LAB_ONLY) {
    return (
      <ErrorBoundary>
        <Redirect href="/new-component-test" />
        <Stack>
          <Stack.Screen name="new-component-test" options={{ title: 'Component Lab', headerShown: true }} />
        </Stack>
      </ErrorBoundary>
    );
  }
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

  if (DEBUG_FORCE_404) return <NotFoundScreen />;

  return (
    <ErrorBoundary forceShow={DEBUG_FORCE_ERROR}>
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
          <Stack.Screen name="sim-trip-test" options={{ headerShown: true, title: 'Test Simulazione' }} />
          <Stack.Screen name="new-component-test" options={{ title: 'Component Lab', headerShown: true }} />
        </Stack>
      </NetworkProvider>
    </ErrorBoundary>
  )
}
