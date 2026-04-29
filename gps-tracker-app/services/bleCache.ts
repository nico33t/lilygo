import AsyncStorage from '@react-native-async-storage/async-storage'

const KEY = 'ble_last_device'

export async function saveLastDevice(id: string): Promise<void> {
  await AsyncStorage.setItem(KEY, id)
}

export async function getLastDevice(): Promise<string | null> {
  return AsyncStorage.getItem(KEY)
}

export async function clearLastDevice(): Promise<void> {
  await AsyncStorage.removeItem(KEY)
}
