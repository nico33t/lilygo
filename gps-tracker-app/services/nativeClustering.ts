import { NativeModules, Platform } from 'react-native'
import type {
  ClusterBounds,
  ClusterFeature,
  ClusterOptions,
  ClusterPointInput,
} from '../types/clustering'

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

export function isNativeClusteringAvailable(): boolean {
  return Platform.OS === 'ios' || Platform.OS === 'android'
    ? Boolean(nativeModule?.buildClusters)
    : false
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

