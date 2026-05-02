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

        let cacheKey = "\(datasetId)|\(points.count)|\(radius)|\(minPoints)|\(maxZoom)|\(minZoom)"

        if let cached = self.datasetCache[cacheKey] {
          let output = self.toOutput(
            snapshot: cached.snapshots[z] ?? ZoomSnapshot(zoom: z, entities: []),
            points: cached.points
          )
          self.lastLeaves = self.computeLeavesMap(points: cached.points, snapshots: cached.snapshots)
          self.lastExpansionZoom = self.computeExpansionMap(snapshots: cached.snapshots, maxZoom: maxZoom)
          DispatchQueue.main.async { resolver(output) }
          return
        }

        let built = self.buildHierarchy(
          points: points,
          radius: radius,
          minPoints: minPoints,
          maxZoom: maxZoom,
          minZoom: minZoom
        )
        let snapshot = built.snapshots[z] ?? ZoomSnapshot(zoom: z, entities: [])
        let output = self.toOutput(snapshot: snapshot, points: points)
        self.lastLeaves = built.leaves
        self.lastExpansionZoom = built.expansionZoom
        self.insertCache(
          cacheKey: cacheKey,
          entry: DatasetCacheEntry(
            key: cacheKey,
            createdAt: Date().timeIntervalSince1970,
            points: points,
            snapshots: built.snapshots,
            entitiesById: built.entitiesById
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

  private func normalizedBounds(_ bounds: [String: Any]) -> (north: Double, south: Double, east: Double, west: Double) {
    let north = (bounds["north"] as? NSNumber)?.doubleValue ?? 90.0
    let south = (bounds["south"] as? NSNumber)?.doubleValue ?? -90.0
    let east = (bounds["east"] as? NSNumber)?.doubleValue ?? 180.0
    let west = (bounds["west"] as? NSNumber)?.doubleValue ?? -180.0
    return (north, south, east, west)
  }

  private func bboxKey(bounds: (north: Double, south: Double, east: Double, west: Double)) -> String {
    func q(_ value: Double) -> Int { Int((value * 1000.0).rounded()) }
    return "\(q(bounds.north))_\(q(bounds.south))_\(q(bounds.east))_\(q(bounds.west))"
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
    radius: Double,
    minPoints: Int,
    maxZoom: Int,
    minZoom: Int
  ) -> (snapshots: [Int: ZoomSnapshot], entitiesById: [String: ClusterEntity], leaves: [String: [[String: Any]]], expansionZoom: [String: Int]) {
    var entities: [ClusterEntity] = []
    entities.reserveCapacity(points.count)

    for (idx, point) in points.enumerated() {
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
    var current = entities

    for zoom in stride(from: maxZoom, through: minZoom, by: -1) {
      let tileScale = pow(2.0, Double(zoom))
      let degPerPixelLon = 360.0 / (256.0 * tileScale)
      let cellLon = max(0.000001, radius * degPerPixelLon)
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

      for cellKey in buckets.keys.sorted() {
        guard let bucket = buckets[cellKey] else { continue }
        let total = bucket.reduce(0) { $0 + $1.count }
        if total >= minPoints {
          let weightedLat = bucket.reduce(0.0) { $0 + $1.latitude * Double($1.count) }
          let weightedLon = bucket.reduce(0.0) { $0 + $1.longitude * Double($1.count) }
          let allLeafIndices = Array(Set(bucket.flatMap { $0.leafPointIndices })).sorted()
          let firstLeaf = allLeafIndices.first ?? -1
          let id = "c_\(zoom)_\(cellKey)_\(firstLeaf)_\(allLeafIndices.count)"
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
        } else {
          next.append(contentsOf: bucket)
          for e in bucket { entitiesById[e.id] = e }
        }
      }

      snapshots[zoom] = ZoomSnapshot(zoom: zoom, entities: next)
      current = next
    }

    let leavesMap = computeLeavesMap(points: points, snapshots: snapshots)
    let expansionMap = computeExpansionMap(snapshots: snapshots, maxZoom: maxZoom)
    return (snapshots, entitiesById, leavesMap, expansionMap)
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

  private func computeLeavesMap(
    points: [[String: Any]],
    snapshots: [Int: ZoomSnapshot]
  ) -> [String: [[String: Any]]] {
    var leavesMap: [String: [[String: Any]]] = [:]
    for (_, snapshot) in snapshots {
      for entity in snapshot.entities where entity.isCluster && entity.count > 1 {
        leavesMap[entity.id] = entity.leafPointIndices.compactMap { idx in
          if idx >= 0 && idx < points.count { return points[idx] }
          return nil
        }
      }
    }
    return leavesMap
  }

  private func computeExpansionMap(
    snapshots: [Int: ZoomSnapshot],
    maxZoom: Int
  ) -> [String: Int] {
    var expansionMap: [String: Int] = [:]
    for (zoom, snapshot) in snapshots {
      for entity in snapshot.entities where entity.isCluster && entity.count > 1 {
        var expansion = maxZoom
        if zoom < maxZoom {
          for targetZoom in (zoom + 1)...maxZoom {
            guard let targetSnapshot = snapshots[targetZoom] else { continue }
            var parents = Set<String>()
            for candidate in targetSnapshot.entities {
              for leaf in entity.leafPointIndices where candidate.leafPointIndices.contains(leaf) {
                parents.insert(candidate.id)
                break
              }
              if parents.count > 1 { break }
            }
            if parents.count > 1 {
              expansion = targetZoom
              break
            }
          }
        }
        expansionMap[entity.id] = expansion
      }
    }
    return expansionMap
  }
}
