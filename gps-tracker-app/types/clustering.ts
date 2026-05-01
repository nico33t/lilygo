export type ClusterPointInput = {
  id?: string
  latitude: number
  longitude: number
  [key: string]: unknown
}

export type ClusterBounds = {
  north: number
  south: number
  east: number
  west: number
}

export type ClusterOptions = {
  radius?: number
  minPoints?: number
  maxZoom?: number
}

export type ClusterFeature = {
  id: string
  type: 'point' | 'cluster'
  count: number
  latitude: number
  longitude: number
}

