import Foundation
import React
import CoreLocation

private struct ClusterEntity {
  let id: String
  let latitude: Double
  let longitude: Double
  let count: Int
  let leafPointIndices: [Int]
  let isCluster: Bool
}

private struct ZoomSnapshot {
  let zoom: Int
  let entities: [ClusterEntity]
}

private struct DatasetCacheEntry {
  let key: String
  let createdAt: TimeInterval
  let points: [[String: Any]]
  let snapshots: [Int: ZoomSnapshot]
  let entitiesById: [String: ClusterEntity]
}

@objc(NativeMapClusteringModule)
class NativeMapClusteringModule: NSObject {
  private let workQueue = DispatchQueue(label: "clustering.native.ios.queue", qos: .userInitiated)
  private var datasetCache: [String: DatasetCacheEntry] = [:]
  private var cacheOrder: [String] = []
  private let maxCacheEntries = 8
  private var lastLeaves: [String: [[String: Any]]] = [:]
  private var lastExpansionZoom: [String: Int] = [:]

  @objc static func requiresMainQueueSetup() -> Bool { false }

  @objc(buildClusters:zoom:bounds:options:resolver:rejecter:)
  func buildClusters(
    _ points: [[String: Any]],
    zoom: NSNumber,
    bounds: [String: Any],
    options: [String: Any]?,
    resolver: @escaping RCTPromiseResolveBlock,
    rejecter: @escaping RCTPromiseRejectBlock
  ) {
    workQueue.async {
      do {
        let datasetId = (options?["datasetId"] as? String) ?? "default"
        let radius = (options?["radius"] as? NSNumber)?.doubleValue ?? 56.0
        let minPoints = (options?["minPoints"] as? NSNumber)?.intValue ?? 3
        let maxZoom = (options?["maxZoom"] as? NSNumber)?.intValue ?? 18
        let minZoom = (options?["minZoom"] as? NSNumber)?.intValue ?? 0
        let z = max(minZoom, min(maxZoom, zoom.intValue))

        // Spatial Filtering (Culling)
        // Add a 25% buffer to avoid popping at edges during small pans
        let north = (bounds["north"] as? NSNumber)?.doubleValue ?? 90.0
        let south = (bounds["south"] as? NSNumber)?.doubleValue ?? -90.0
        let east = (bounds["east"] as? NSNumber)?.doubleValue ?? 180.0
        let west = (bounds["west"] as? NSNumber)?.doubleValue ?? -180.0
        
        let latPad = abs(north - south) * 0.25
        let lonPad = abs(east - west) * 0.25
        
        let bNorth = min(90, north + latPad)
        let bSouth = max(-90, south - latPad)
        let bEast = east + lonPad
        let bWest = west - lonPad
        
        // Filter points within padded bounds
        var filteredIndices: [Int] = []
        filteredIndices.reserveCapacity(points.count)
        
        for (idx, p) in points.enumerated() {
          guard let lat = (p["latitude"] as? NSNumber)?.doubleValue,
                let lon = (p["longitude"] as? NSNumber)?.doubleValue else { continue }
          
          if lat >= bSouth && lat <= bNorth {
            // Handle wrap around for longitude
            if bWest <= bEast {
              if lon >= bWest && lon <= bEast { filteredIndices.append(idx) }
            } else {
              if lon >= bWest || lon <= bEast { filteredIndices.append(idx) }
            }
          }
        }

        // Cache Key should include some data characteristic if possible, 
        // or we just skip cache for very small datasets or frequent updates.
        // For now, let's keep it simple but optimized.
        let cacheKey = "\(datasetId)|\(filteredIndices.count)|\(radius)|\(minPoints)|\(maxZoom)|\(minZoom)"

        if let cached = self.datasetCache[cacheKey] {
          // Verify first and last points to detect movement if count is same
          if !filteredIndices.isEmpty {
            let firstIdx = filteredIndices[0]
            let lastIdx = filteredIndices.last!
            let p1 = points[firstIdx]
            let p2 = points[lastIdx]
            let cachedPoints = cached.points
            if cachedPoints.count > max(firstIdx, lastIdx) {
              let cp1 = cachedPoints[firstIdx]
              let cp2 = cachedPoints[lastIdx]
              if (p1["latitude"] as? Double) == (cp1["latitude"] as? Double) &&
                 (p2["latitude"] as? Double) == (cp2["latitude"] as? Double) {
                let output = self.toOutput(
                  snapshot: cached.snapshots[z] ?? ZoomSnapshot(zoom: z, entities: []),
                  points: cached.points
                )
                self.lastLeaves = cached.leaves
                self.lastExpansionZoom = cached.expansionZoom
                DispatchQueue.main.async { resolver(output) }
                return
              }
            }
          }
        }

        let built = self.buildHierarchy(
          points: points,
          filteredIndices: filteredIndices,
          radius: radius,
          minPoints: minPoints,
          maxZoom: maxZoom,
          minZoom: minZoom
        )
        
        let snapshot = built.snapshots[z] ?? ZoomSnapshot(zoom: z, entities: [])
        let output = self.toOutput(snapshot: snapshot, points: points)
        
        // Only store the maps for the CURRENT view to save memory/CPU
        // or build them on the fly in getLeaves.
        // For now, we still return the full snapshot at Z.
        self.lastLeaves = built.leaves
        self.lastExpansionZoom = built.expansionZoom
        
        self.insertCache(
          cacheKey: cacheKey,
          entry: DatasetCacheEntry(
            key: cacheKey,
            createdAt: Date().timeIntervalSince1970,
            points: points,
            snapshots: built.snapshots,
            entitiesById: built.entitiesById,
            leaves: built.leaves,
            expansionZoom: built.expansionZoom
          )
        )
        DispatchQueue.main.async { resolver(output) }
      } catch {
        DispatchQueue.main.async {
          rejecter("clustering_error", error.localizedDescription, error)
        }
      }
    }
  }

  @objc(getLeaves:limit:offset:resolver:rejecter:)
  func getLeaves(
    _ clusterId: String,
    limit: NSNumber,
    offset: NSNumber,
    resolver: RCTPromiseResolveBlock,
    rejecter: RCTPromiseRejectBlock
  ) {
    let all = lastLeaves[clusterId] ?? []
    let o = max(0, offset.intValue)
    let l = max(0, limit.intValue)
    if o >= all.count || l == 0 {
      resolver([])
      return
    }
    let end = min(all.count, o + l)
    resolver(Array(all[o..<end]))
  }

  @objc(getExpansionZoom:resolver:rejecter:)
  func getExpansionZoom(
    _ clusterId: String,
    resolver: RCTPromiseResolveBlock,
    rejecter: RCTPromiseRejectBlock
  ) {
    resolver(lastExpansionZoom[clusterId] ?? 18)
  }

  private func insertCache(cacheKey: String, entry: DatasetCacheEntry) {
    datasetCache[cacheKey] = entry
    cacheOrder.removeAll(where: { $0 == cacheKey })
    cacheOrder.append(cacheKey)
    while cacheOrder.count > maxCacheEntries {
      let evicted = cacheOrder.removeFirst()
      datasetCache.removeValue(forKey: evicted)
    }
  }

  private func buildHierarchy(
    points: [[String: Any]],
    filteredIndices: [Int],
    radius: Double,
    minPoints: Int,
    maxZoom: Int,
    minZoom: Int
  ) -> (snapshots: [Int: ZoomSnapshot], entitiesById: [String: ClusterEntity], leaves: [String: [[String: Any]]], expansionZoom: [String: Int]) {
    var entities: [ClusterEntity] = []
    entities.reserveCapacity(filteredIndices.count)

    for idx in filteredIndices {
      let point = points[idx]
      guard let lat = (point["latitude"] as? NSNumber)?.doubleValue,
            let lon = (point["longitude"] as? NSNumber)?.doubleValue else { continue }
      entities.append(
        ClusterEntity(
          id: "p_\(idx)",
          latitude: lat,
          longitude: lon,
          count: 1,
          leafPointIndices: [idx],
          isCluster: false
        )
      )
    }

    var snapshots: [Int: ZoomSnapshot] = [:]
    var entitiesById: [String: ClusterEntity] = [:]
    var leavesMap: [String: [[String: Any]]] = [:]
    var expansionMap: [String: Int] = [:]
    
    var current = entities

    for zoom in stride(from: maxZoom, through: minZoom, by: -1) {
      let tileScale = pow(2.0, Double(zoom))
      let degPerPixelLon = 360.0 / (256.0 * tileScale)
      let zoomRadiusScale: Double
      if zoom >= 15 {
        zoomRadiusScale = 0.65
      } else if zoom >= 12 {
        zoomRadiusScale = 0.80
      } else if zoom <= 5 {
        zoomRadiusScale = 1.30
      } else {
        zoomRadiusScale = 1.00
      }
      let cellLon = max(0.000001, radius * zoomRadiusScale * degPerPixelLon)
      let cellLat = cellLon

      var buckets: [String: [ClusterEntity]] = [:]
      for e in current {
        let gx = Int(floor((e.longitude + 180.0) / cellLon))
        let gy = Int(floor((e.latitude + 90.0) / cellLat))
        let key = "\(gx)_\(gy)"
        buckets[key, default: []].append(e)
      }

      var next: [ClusterEntity] = []
      next.reserveCapacity(current.count)

      // Avoid sorting buckets for performance
      for (_, bucket) in buckets {
        let total = bucket.reduce(0) { $0 + $1.count }
        if total >= minPoints {
          let weightedLat = bucket.reduce(0.0) { $0 + $1.latitude * Double($1.count) }
          let weightedLon = bucket.reduce(0.0) { $0 + $1.longitude * Double($1.count) }
          
          // Optimization: Merge leaf indices without Set/Sort
          // Since building bottom-up, indices are already unique and somewhat ordered
          var allLeafIndices: [Int] = []
          allLeafIndices.reserveCapacity(total)
          for e in bucket {
            allLeafIndices.append(contentsOf: e.leafPointIndices)
          }
          
          let firstLeaf = allLeafIndices.first ?? -1
          let id = "c_\(zoom)_\(firstLeaf)_\(allLeafIndices.count)"
          let cluster = ClusterEntity(
            id: id,
            latitude: weightedLat / Double(total),
            longitude: weightedLon / Double(total),
            count: total,
            leafPointIndices: allLeafIndices,
            isCluster: true
          )
          next.append(cluster)
          entitiesById[id] = cluster
          
          // Pre-populate maps only for clusters
          leavesMap[id] = allLeafIndices.compactMap { idx in
            if idx >= 0 && idx < points.count { return points[idx] }
            return nil
          }
          expansionMap[id] = min(maxZoom, zoom + 1)
        } else {
          for e in bucket {
            next.append(e)
            entitiesById[e.id] = e
          }
        }
      }

      snapshots[zoom] = ZoomSnapshot(zoom: zoom, entities: next)
      current = next
    }

    return (snapshots, entitiesById, leavesMap, expansionMap)
  }

  @objc(buildFullHierarchyGeoJSON:options:resolver:rejecter:)
  func buildFullHierarchyGeoJSON(
    _ points: [[String: Any]],
    options: [String: Any]?,
    resolver: @escaping RCTPromiseResolveBlock,
    rejecter: @escaping RCTPromiseRejectBlock
  ) {
    workQueue.async {
      do {
        let datasetId = (options?["datasetId"] as? String) ?? "default"
        let radius = (options?["radius"] as? NSNumber)?.doubleValue ?? 56.0
        let minPoints = (options?["minPoints"] as? NSNumber)?.intValue ?? 3
        let maxZoom = (options?["maxZoom"] as? NSNumber)?.intValue ?? 18
        let minZoom = (options?["minZoom"] as? NSNumber)?.intValue ?? 0

        // Spatial filtering for "Full Hierarchy" is less useful since we want all zooms,
        // but we can still cull points that are completely outside the world (safety).
        var validIndices: [Int] = []
        validIndices.reserveCapacity(points.count)
        for (idx, p) in points.enumerated() {
          if let _ = p["latitude"] as? NSNumber, let _ = p["longitude"] as? NSNumber {
            validIndices.append(idx)
          }
        }

        let built = self.buildHierarchy(
          points: points,
          filteredIndices: validIndices,
          radius: radius,
          minPoints: minPoints,
          maxZoom: maxZoom,
          minZoom: minZoom
        )

        var geoJsonOutput: [String: [String: Any]] = [:]
        for (zoom, snapshot) in built.snapshots {
          geoJsonOutput["\(zoom)"] = self.toGeoJsonFeatureCollection(snapshot: snapshot)
        }

        // Cache the maps for getLeaves/getExpansionZoom
        self.lastLeaves = built.leaves
        self.lastExpansionZoom = built.expansionZoom

        DispatchQueue.main.async { resolver(geoJsonOutput) }
      } catch {
        DispatchQueue.main.async {
          rejecter("clustering_error", error.localizedDescription, error)
        }
      }
    }
  }

  private func toGeoJsonFeatureCollection(snapshot: ZoomSnapshot) -> [String: Any] {
    var features: [[String: Any]] = []
    features.reserveCapacity(snapshot.entities.count)
    
    for e in snapshot.entities {
      let isCluster = e.isCluster && e.count > 1
      features.append([
        "type": "Feature",
        "id": e.id,
        "geometry": [
          "type": "Point",
          "coordinates": [e.longitude, e.latitude]
        ],
        "properties": [
          "cluster": isCluster,
          "point_count": e.count,
          "type": isCluster ? "cluster" : "point"
        ]
      ])
    }
    
    return [
      "type": "FeatureCollection",
      "features": features
    ]
  }

  private func toOutput(
    snapshot: ZoomSnapshot,
    points: [[String: Any]]
  ) -> [[String: Any]] {
    var out: [[String: Any]] = []
    out.reserveCapacity(snapshot.entities.count)
    for e in snapshot.entities {
      out.append([
        "id": e.id,
        "type": e.isCluster && e.count > 1 ? "cluster" : "point",
        "count": e.count,
        "latitude": e.latitude,
        "longitude": e.longitude,
      ])
    }
    return out
  }
}
