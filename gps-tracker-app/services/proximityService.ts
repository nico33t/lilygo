import * as Notifications from 'expo-notifications'
import { Platform } from 'react-native'

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
})

let _disconnectTimer: ReturnType<typeof setTimeout> | null = null

export async function requestProximityPermissions(): Promise<boolean> {
  const result = await Notifications.requestPermissionsAsync() as any
  return result.granted === true || result.status === 'granted'
}

export function notifyOtaAvailable(version: string) {
  Notifications.scheduleNotificationAsync({
    content: {
      title: 'Aggiornamento firmware disponibile',
      body: `Versione ${version} è pronta. Apri le impostazioni per aggiornare.`,
      sound: true,
      data: { navigate: 'settings' },
    },
    trigger: null,
  }).catch(() => {})
}

export function onBleDisconnectedUnexpectedly(enabled: boolean) {
  if (!enabled) return
  _disconnectTimer = setTimeout(() => {
    Notifications.scheduleNotificationAsync({
      content: {
        title: 'GPS Tracker fuori portata',
        body: 'Il dispositivo non è più nelle vicinanze.',
        sound: true,
      },
      trigger: null,
    })
  }, 10000)
}

export function cancelDisconnectAlarm() {
  if (_disconnectTimer) {
    clearTimeout(_disconnectTimer)
    _disconnectTimer = null
  }
}
