import { NativeModules, Platform } from 'react-native'
import type {
  ClusterBounds,
  ClusterFeature,
  ClusterOptions,
  ClusterPointInput,
} from '../types/clustering'
import { PROVIDER_GOOGLE } from 'react-native-maps'

type NativeMapClusteringModule = {
  buildClusters: (
    points: ClusterPointInput[],
    zoom: number,
    bounds: ClusterBounds,
    options?: ClusterOptions
  ) => Promise<ClusterFeature[]>
  getLeaves: (clusterId: string, limit: number, offset: number) => Promise<ClusterPointInput[]>
  getExpansionZoom: (clusterId: string) => Promise<number>
}

const nativeModule = NativeModules.NativeMapClusteringModule as NativeMapClusteringModule | undefined
const CLUSTERING_ENV = process.env.EXPO_PUBLIC_CLUSTERING_ENABLED

export function isClusteringFeatureEnabled(): boolean {
  // Enabled by default unless explicitly set to false/0/off.
  if (!CLUSTERING_ENV) return true
  const normalized = CLUSTERING_ENV.trim().toLowerCase()
  return normalized !== 'false' && normalized !== '0' && normalized !== 'off'
}

export function isNativeClusteringAvailable(): boolean {
  return isClusteringFeatureEnabled() &&
    (Platform.OS === 'ios' || Platform.OS === 'android')
    ? Boolean(nativeModule?.buildClusters)
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
