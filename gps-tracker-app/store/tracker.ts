import { create } from 'zustand'
import {
  ConnectionStatus,
  GPSData,
  TrackPoint,
  TrackerConfig,
} from '../types'
import { DEFAULT_CONFIG, MAX_TRACK_POINTS } from '../constants/tracker'

interface TrackerState {
  gps: GPSData | null
  status: ConnectionStatus
  config: TrackerConfig
  track: TrackPoint[]
  setGPS: (data: GPSData) => void
  setStatus: (s: ConnectionStatus) => void
  setConfig: (c: TrackerConfig) => void
  clearTrack: () => void
}

export const useTrackerStore = create<TrackerState>((set) => ({
  gps: null,
  status: 'disconnected',
  config: { ...DEFAULT_CONFIG },
  track: [],

  setGPS: (data) =>
    set((state) => ({
      gps: data,
      track: data.valid
        ? [...state.track.slice(-MAX_TRACK_POINTS), { lat: data.lat, lon: data.lon }]
        : state.track,
    })),

  setStatus: (status) => set({ status }),

  setConfig: (config) => set({ config }),

  clearTrack: () => set({ track: [] }),
}))
