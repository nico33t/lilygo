import * as Notifications from 'expo-notifications'
import { Platform } from 'react-native'

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
})

let _disconnectTimer: ReturnType<typeof setTimeout> | null = null

export async function requestProximityPermissions(): Promise<boolean> {
  const { status } = await Notifications.requestPermissionsAsync()
  return status === 'granted'
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
