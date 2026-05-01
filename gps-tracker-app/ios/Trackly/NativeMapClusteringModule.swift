import Foundation
import React
import CoreLocation

@objc(NativeMapClusteringModule)
class NativeMapClusteringModule: NSObject {
  private var lastLeaves: [String: [[String: Any]]] = [:]

  @objc static func requiresMainQueueSetup() -> Bool { false }

  @objc(buildClusters:zoom:bounds:options:resolver:rejecter:)
  func buildClusters(
    _ points: [[String: Any]],
    zoom: NSNumber,
    bounds: [String: Any],
    options: [String: Any]?,
    resolver: RCTPromiseResolveBlock,
    rejecter: RCTPromiseRejectBlock
  ) {
    let radius = (options?["radius"] as? NSNumber)?.doubleValue ?? 56.0
    let minPoints = (options?["minPoints"] as? NSNumber)?.intValue ?? 3
    let z = max(0.0, min(22.0, zoom.doubleValue))
    let tileScale = pow(2.0, z)
    let degPerPixelLon = 360.0 / (256.0 * tileScale)
    let cellLon = max(0.000001, radius * degPerPixelLon)
    let cellLat = cellLon

    var buckets: [String: [[String: Any]]] = [:]

    for (idx, point) in points.enumerated() {
      guard let latNum = point["latitude"] as? NSNumber,
            let lonNum = point["longitude"] as? NSNumber else { continue }
      let lat = latNum.doubleValue
      let lon = lonNum.doubleValue
      let gx = Int(floor((lon + 180.0) / cellLon))
      let gy = Int(floor((lat + 90.0) / cellLat))
      let key = "\(gx)_\(gy)"

      var enriched = point
      if enriched["id"] == nil {
        enriched["id"] = "p_\(idx)"
      }
      buckets[key, default: []].append(enriched)
    }

    var result: [[String: Any]] = []
    var leavesMap: [String: [[String: Any]]] = [:]

    for (key, bucket) in buckets {
      if bucket.count >= minPoints {
        var sumLat = 0.0
        var sumLon = 0.0
        for p in bucket {
          if let latNum = p["latitude"] as? NSNumber,
             let lonNum = p["longitude"] as? NSNumber {
            sumLat += latNum.doubleValue
            sumLon += lonNum.doubleValue
          }
        }
        let clusterId = "c_\(Int(z))_\(key)"
        let count = bucket.count
        result.append([
          "id": clusterId,
          "type": "cluster",
          "count": count,
          "latitude": sumLat / Double(count),
          "longitude": sumLon / Double(count),
        ])
        leavesMap[clusterId] = bucket
      } else {
        for p in bucket {
          if let latNum = p["latitude"] as? NSNumber,
             let lonNum = p["longitude"] as? NSNumber {
            result.append([
              "id": (p["id"] as? String) ?? UUID().uuidString,
              "type": "point",
              "count": 1,
              "latitude": latNum.doubleValue,
              "longitude": lonNum.doubleValue,
            ])
          }
        }
      }
    }

    lastLeaves = leavesMap
    resolver(result)
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
    resolver(18)
  }
}
