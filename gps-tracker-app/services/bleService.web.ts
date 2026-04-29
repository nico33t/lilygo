// Web/Electron stub — BLE not available on this platform
import { WSCommand } from '../types'

export enum BleState {
  Unknown = 'Unknown',
  Resetting = 'Resetting',
  Unsupported = 'Unsupported',
  Unauthorized = 'Unauthorized',
  PoweredOff = 'PoweredOff',
  PoweredOn = 'PoweredOn',
}

export const bleManager = {
  onStateChange: (_cb: (s: BleState) => void, _emit: boolean) => ({ remove: () => {} }),
  startDeviceScan: (_uuids: any, _opts: any, _cb: any) => {},
  stopDeviceScan: () => {},
  state: async () => BleState.Unsupported,
}

export async function bleConnect(_deviceId: string): Promise<void> {}
export async function bleSendCommand(_cmd: WSCommand): Promise<void> {}
export function bleDisconnect(): void {}
export function getBleState(): Promise<BleState> {
  return Promise.resolve(BleState.Unsupported)
}
