import { NativeModules, Platform } from 'react-native'
import type {
  ClusterBounds,
  ClusterFeature,
  ClusterOptions,
  ClusterPointInput,
} from '../types/clustering'
import { PROVIDER_GOOGLE } from 'react-native-maps'

export type GeoJsonFeature = {
  type: 'Feature'
  id: string
  geometry: {
    type: 'Point'
    coordinates: [number, number]
  }
  properties: {
    cluster: boolean
    point_count: number
    type: 'cluster' | 'point'
  }
}

export type GeoJsonFeatureCollection = {
  type: 'FeatureCollection'
  features: GeoJsonFeature[]
}

export type GeoJsonHierarchy = Record<string, GeoJsonFeatureCollection>

type NativeMapClusteringModule = {
  buildClusters: (
    points: ClusterPointInput[],
    zoom: number,
    bounds: ClusterBounds,
    options?: ClusterOptions
  ) => Promise<ClusterFeature[]>
  buildFullHierarchyGeoJSON: (
    points: ClusterPointInput[],
    options?: ClusterOptions
  ) => Promise<GeoJsonHierarchy>
  getLeaves: (clusterId: string, limit: number, offset: number) => Promise<ClusterPointInput[]>
  getExpansionZoom: (clusterId: string) => Promise<number>
}

const nativeModule = NativeModules.NativeMapClusteringModule as NativeMapClusteringModule | undefined
const CLUSTERING_ENV = process.env.EXPO_PUBLIC_CLUSTERING_ENABLED

// Client-side cache for the full hierarchy
let hierarchyCache: { datasetId: string; data: GeoJsonHierarchy } | null = null

export function isClusteringFeatureEnabled(): boolean {
  if (!CLUSTERING_ENV) return true
  const normalized = CLUSTERING_ENV.trim().toLowerCase()
  return normalized !== 'false' && normalized !== '0' && normalized !== 'off'
}

export function isNativeClusteringAvailable(): boolean {
  return isClusteringFeatureEnabled() &&
    (Platform.OS === 'ios' || Platform.OS === 'android')
    ? Boolean(nativeModule?.buildFullHierarchyGeoJSON)
    : false
}

export function getClusterProviderTuning(provider?: string): Required<ClusterOptions> {
  const isGoogle = provider === PROVIDER_GOOGLE
  const isIOS = Platform.OS === 'ios'
  if (isIOS && !isGoogle) {
    return {
      datasetId: 'apple-default',
      radius: 48,
      minPoints: 3,
      minZoom: 0,
      maxZoom: 20,
    }
  }
  if (isIOS && isGoogle) {
    return {
      datasetId: 'google-ios',
      radius: 58,
      minPoints: 3,
      minZoom: 0,
      maxZoom: 20,
    }
  }
  return {
    datasetId: 'google-android',
    radius: 62,
    minPoints: 4,
    minZoom: 0,
    maxZoom: 20,
  }
}

export async function buildFullGeoJsonHierarchy(
  points: ClusterPointInput[],
  options: ClusterOptions = {}
): Promise<{ datasetId: string; status: string }> {
  if (!nativeModule?.buildFullHierarchyGeoJSON) return { datasetId: options.datasetId || 'default', status: 'error' }
  
  const result = await nativeModule.buildFullHierarchyGeoJSON(points, options) as any
  return result
}

export async function fetchGeoJsonForZoom(datasetId: string, zoom: number): Promise<GeoJsonFeatureCollection | null> {
  // @ts-ignore - dynamic method
  if (!nativeModule?.getGeoJsonForZoom) return null
  // @ts-ignore - dynamic method
  const result = await nativeModule.getGeoJsonForZoom(datasetId, zoom)
  if (result) {
    if (!hierarchyCache || hierarchyCache.datasetId !== datasetId) {
      hierarchyCache = { datasetId, data: {} }
    }
    hierarchyCache.data[Math.round(zoom).toString()] = result
  }
  return result
}

export function getGeoJsonForZoomSync(zoom: number, datasetId?: string): GeoJsonFeatureCollection | null {
  if (!hierarchyCache || (datasetId && hierarchyCache.datasetId !== datasetId)) return null
  const z = Math.round(zoom).toString()
  return hierarchyCache.data[z] || null
}

export async function buildNativeClusters(
  points: ClusterPointInput[],
  zoom: number,
  bounds: ClusterBounds,
  options: ClusterOptions = {}
): Promise<ClusterFeature[]> {
  if (!nativeModule?.buildClusters) {
    return points.map((p, idx) => ({
      id: p.id ?? `p_${idx}`,
      type: 'point',
      count: 1,
      latitude: p.latitude,
      longitude: p.longitude,
    }))
  }
  return nativeModule.buildClusters(points, zoom, bounds, options)
}

export async function getClusterLeaves(
  clusterId: string,
  limit = 100,
  offset = 0
): Promise<ClusterPointInput[]> {
  if (!nativeModule?.getLeaves) return []
  return nativeModule.getLeaves(clusterId, limit, offset)
}

export async function getClusterExpansionZoom(clusterId: string): Promise<number> {
  if (!nativeModule?.getExpansionZoom) return 18
  return nativeModule.getExpansionZoom(clusterId)
}
