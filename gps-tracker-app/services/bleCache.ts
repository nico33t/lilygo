// In-memory fallback when AsyncStorage native module isn't available
let _mem: string | null = null

function storage() {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const AS = require('@react-native-async-storage/async-storage').default
    if (AS && typeof AS.getItem === 'function') return AS as typeof import('@react-native-async-storage/async-storage').default
  } catch {}
  return null
}

const KEY = 'ble_last_device'

export async function saveLastDevice(id: string): Promise<void> {
  _mem = id
  try { await storage()?.setItem(KEY, id) } catch {}
}

export async function getLastDevice(): Promise<string | null> {
  try {
    const val = await storage()?.getItem(KEY)
    if (val != null) { _mem = val; return val }
  } catch {}
  return _mem
}

export async function clearLastDevice(): Promise<void> {
  _mem = null
  try { await storage()?.removeItem(KEY) } catch {}
}
