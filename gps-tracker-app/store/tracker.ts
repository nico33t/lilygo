import { create } from 'zustand'
import {
  ConnectionStatus,
  GPSData,
  OtaStatus,
  PowerData,
  SimData,
  TrackPoint,
  TrackerConfig,
} from '../types'
import { DEFAULT_CONFIG, MAX_TRACK_POINTS } from '../constants/tracker'
import { normalizeGPSData } from '../services/gpsNormalizer'

interface TrackerState {
  gps: GPSData | null
  sim: SimData | null
  power: PowerData | null
  ota: OtaStatus | null
  status: ConnectionStatus
  config: TrackerConfig
  track: TrackPoint[]
  deviceId: string | null
  remoteConnected: boolean
  proximityAlarmEnabled: boolean
  lastRx: number | null
  bleError: string | null
  setGPS: (data: GPSData) => void
  setSim: (data: SimData) => void
  setPower: (data: PowerData) => void
  setOta: (data: OtaStatus) => void
  setStatus: (s: ConnectionStatus) => void
  setConfig: (c: TrackerConfig) => void
  setDeviceId: (id: string | null) => void
  clearTrack: () => void
  setRemoteConnected: (v: boolean) => void
  setProximityAlarm: (v: boolean) => void
  setLastRx: (t: number) => void
  setBleError: (e: string | null) => void
}

export const useTrackerStore = create<TrackerState>((set) => ({
  gps: null,
  sim: null,
  power: null,
  ota: null,
  status: 'disconnected',
  config: { ...DEFAULT_CONFIG },
  track: [],
  deviceId: null,
  remoteConnected: false,
  proximityAlarmEnabled: true,
  lastRx: null,
  bleError: null,

  setSim: (data) => set({ sim: data }),
  setPower: (data) => set({ power: data }),
  setOta: (data) => set({ ota: data }),
  setRemoteConnected: (remoteConnected) => set({ remoteConnected }),
  setProximityAlarm: (proximityAlarmEnabled) => set({ proximityAlarmEnabled }),

  setGPS: (data) =>
    set((state) => {
      const gps = normalizeGPSData(data)
      return {
        gps,
        track: gps.valid
          ? [...state.track.slice(-MAX_TRACK_POINTS), { lat: gps.lat, lon: gps.lon }]
          : state.track,
      }
    }),

  setStatus: (status) => set({ status }),
  setConfig: (config) => set({ config }),
  setDeviceId: (deviceId) => set({ deviceId }),
  clearTrack: () => set({ track: [] }),
  setLastRx: (lastRx) => set({ lastRx }),
  setBleError: (bleError) => set({ bleError }),
}))
