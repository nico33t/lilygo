import type { GPSData, TrackPoint } from '../types'
import type { LiveData } from './backendService'

type GPSInput = Partial<GPSData> & {
  lat?: unknown
  lon?: unknown
  speed?: unknown
  alt?: unknown
  heading?: unknown
  valid?: unknown
  stored?: unknown
  vsat?: unknown
  usat?: unknown
  acc?: unknown
  hdop?: unknown
  last_fix_age_s?: unknown
  time?: unknown
}

function toFiniteNumber(value: unknown, fallback: number): number {
  const n = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(n) ? n : fallback
}

function toBoolean(value: unknown, fallback: boolean): boolean {
  if (typeof value === 'boolean') return value
  if (typeof value === 'number') return value !== 0
  if (typeof value === 'string') {
    const s = value.trim().toLowerCase()
    if (s === 'true' || s === '1' || s === 'yes') return true
    if (s === 'false' || s === '0' || s === 'no') return false
  }
  return fallback
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

function normalizeHeading(value: unknown): number | undefined {
  if (value == null) return undefined
  const n = toFiniteNumber(value, NaN)
  if (!Number.isFinite(n)) return undefined
  let normalized = n % 360
  if (normalized < 0) normalized += 360
  return normalized
}

function normalizeIsoTime(value: unknown, fallbackMs?: number): string {
  if (typeof value === 'string' && value.trim().length > 0) {
    const parsed = Date.parse(value)
    if (Number.isFinite(parsed)) return new Date(parsed).toISOString()
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    const ms = value > 10_000_000_000 ? value : value * 1000
    return new Date(ms).toISOString()
  }
  return new Date(fallbackMs ?? Date.now()).toISOString()
}

export function normalizeGPSData(input: GPSInput): GPSData {
  const lat = toFiniteNumber(input.lat, 0)
  const lon = toFiniteNumber(input.lon, 0)
  const speed = Math.max(0, toFiniteNumber(input.speed, 0))
  const alt = toFiniteNumber(input.alt, 0)
  const heading = normalizeHeading(input.heading)
  const vsat = Math.max(0, Math.trunc(toFiniteNumber(input.vsat, 0)))
  const usat = Math.max(0, Math.trunc(toFiniteNumber(input.usat, 0)))
  const acc = Math.max(0, toFiniteNumber(input.acc, 0))
  const hdop = Math.max(0, toFiniteNumber(input.hdop, 0))
  const lastFixAge = input.last_fix_age_s == null ? undefined : Math.max(0, Math.trunc(toFiniteNumber(input.last_fix_age_s, 0)))
  const hasCoords = Number.isFinite(lat) && Number.isFinite(lon) && (lat !== 0 || lon !== 0)
  const valid = toBoolean(input.valid, hasCoords)
  const stored = toBoolean(input.stored, false)
  const time = normalizeIsoTime(input.time)

  return {
    valid,
    stored,
    lat: clamp(lat, -90, 90),
    lon: clamp(lon, -180, 180),
    speed,
    alt,
    heading,
    vsat,
    usat,
    acc,
    hdop,
    last_fix_age_s: lastFixAge,
    time,
  }
}

export function normalizeLiveDataToGPS(data: LiveData): GPSData {
  return normalizeGPSData({
    valid: true,
    stored: false,
    lat: data.lat,
    lon: data.lon,
    speed: data.speed,
    alt: data.alt,
    heading: 0,
    vsat: 0,
    usat: 0,
    acc: 0,
    hdop: 0,
    time: data.ts,
  })
}

export function normalizeTrackPoint(input: Partial<TrackPoint> & { lat?: unknown; lon?: unknown }): TrackPoint | null {
  const lat = toFiniteNumber(input.lat, NaN)
  const lon = toFiniteNumber(input.lon, NaN)
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null
  return {
    lat: clamp(lat, -90, 90),
    lon: clamp(lon, -180, 180),
  }
}

export function normalizeTrackPoints(points: unknown[]): TrackPoint[] {
  const out: TrackPoint[] = []
  for (const item of points) {
    if (!item || typeof item !== 'object') continue
    const point = normalizeTrackPoint(item as TrackPoint)
    if (point) out.push(point)
  }
  return out
}
