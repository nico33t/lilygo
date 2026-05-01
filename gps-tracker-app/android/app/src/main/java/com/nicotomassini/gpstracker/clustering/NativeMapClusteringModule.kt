package com.nicotomassini.gpstracker.clustering

import com.facebook.react.bridge.*
import java.util.concurrent.Executors
import kotlin.math.floor
import kotlin.math.pow
import kotlin.math.roundToInt

private data class ClusterEntity(
  val id: String,
  val latitude: Double,
  val longitude: Double,
  val count: Int,
  val leafPointIndices: IntArray,
  val isCluster: Boolean,
)

private data class ZoomSnapshot(
  val zoom: Int,
  val entities: List<ClusterEntity>,
)

private data class DatasetCacheEntry(
  val key: String,
  val points: ReadableArray,
  val snapshots: Map<Int, ZoomSnapshot>,
  val leaves: Map<String, IntArray>,
  val expansionZoom: Map<String, Int>,
)

class NativeMapClusteringModule(reactContext: ReactApplicationContext) :
  ReactContextBaseJavaModule(reactContext) {
  private val worker = Executors.newSingleThreadExecutor()
  private val cache = LinkedHashMap<String, DatasetCacheEntry>(16, 0.75f, true)
  private val maxCacheEntries = 8
  private var lastLeaves: Map<String, IntArray> = emptyMap()
  private var lastPoints: ReadableArray? = null
  private var lastExpansionZoom: Map<String, Int> = emptyMap()

  override fun getName(): String = "NativeMapClusteringModule"

  @ReactMethod
  fun buildClusters(
    points: ReadableArray,
    zoom: Double,
    bounds: ReadableMap,
    options: ReadableMap?,
    promise: Promise
  ) {
    worker.execute {
      try {
        val datasetId = if (options?.hasKey("datasetId") == true) options.getString("datasetId") else "default"
        val radius = if (options?.hasKey("radius") == true) options.getDouble("radius") else 56.0
        val minPoints = if (options?.hasKey("minPoints") == true) options.getInt("minPoints") else 3
        val maxZoom = if (options?.hasKey("maxZoom") == true) options.getInt("maxZoom") else 18
        val minZoom = if (options?.hasKey("minZoom") == true) options.getInt("minZoom") else 0
        val z = zoom.toInt().coerceIn(minZoom, maxZoom)
        val bbox = normalizedBounds(bounds)
        val cacheKey = "${datasetId}|$z|${bboxKey(bbox)}|${points.size()}|$radius|$minPoints|$maxZoom|$minZoom"

        val cached = cache[cacheKey]
        if (cached != null) {
          val snapshot = cached.snapshots[z] ?: ZoomSnapshot(z, emptyList())
          val out = toOutput(snapshot, bbox)
          reactApplicationContext.runOnUiQueueThread {
            promise.resolve(out)
          }
          return@execute
        }

        val built = buildHierarchy(points, radius, minPoints, maxZoom, minZoom)
        val snapshot = built.snapshots[z] ?: ZoomSnapshot(z, emptyList())
        val out = toOutput(snapshot, bbox)
        lastLeaves = built.leaves
        lastPoints = points
        lastExpansionZoom = built.expansionZoom

        putCache(
          cacheKey,
          DatasetCacheEntry(
            key = cacheKey,
            points = points,
            snapshots = built.snapshots,
            leaves = built.leaves,
            expansionZoom = built.expansionZoom,
          )
        )
        reactApplicationContext.runOnUiQueueThread {
          promise.resolve(out)
        }
      } catch (t: Throwable) {
        reactApplicationContext.runOnUiQueueThread {
          promise.reject("clustering_error", t.message, t)
        }
      }
    }
  }

  @ReactMethod
  fun getLeaves(clusterId: String, limit: Int, offset: Int, promise: Promise) {
    val pointIndices = lastLeaves[clusterId] ?: run {
      promise.resolve(Arguments.createArray())
      return
    }
    val src = lastPoints ?: run {
      promise.resolve(Arguments.createArray())
      return
    }
    val start = offset.coerceAtLeast(0)
    val lim = limit.coerceAtLeast(0)
    if (lim == 0 || start >= pointIndices.size) {
      promise.resolve(Arguments.createArray())
      return
    }
    val end = (start + lim).coerceAtMost(pointIndices.size)
    val out = Arguments.createArray()
    for (i in start until end) {
      val idx = pointIndices[i]
      val map = src.getMap(idx)
      if (map != null) out.pushMap(map)
    }
    promise.resolve(out)
  }

  @ReactMethod
  fun getExpansionZoom(clusterId: String, promise: Promise) {
    promise.resolve(lastExpansionZoom[clusterId] ?: 18)
  }

  private fun putCache(key: String, value: DatasetCacheEntry) {
    cache[key] = value
    while (cache.size > maxCacheEntries) {
      val first = cache.entries.firstOrNull()?.key ?: break
      cache.remove(first)
    }
  }

  private fun normalizedBounds(bounds: ReadableMap): DoubleArray {
    val north = if (bounds.hasKey("north")) bounds.getDouble("north") else 90.0
    val south = if (bounds.hasKey("south")) bounds.getDouble("south") else -90.0
    val east = if (bounds.hasKey("east")) bounds.getDouble("east") else 180.0
    val west = if (bounds.hasKey("west")) bounds.getDouble("west") else -180.0
    return doubleArrayOf(north, south, east, west)
  }

  private fun bboxKey(bounds: DoubleArray): String {
    fun q(v: Double): Int = (v * 1000.0).roundToInt()
    return "${q(bounds[0])}_${q(bounds[1])}_${q(bounds[2])}_${q(bounds[3])}"
  }

  private fun inBounds(lat: Double, lon: Double, bounds: DoubleArray): Boolean {
    return lat <= bounds[0] && lat >= bounds[1] && lon <= bounds[2] && lon >= bounds[3]
  }

  private fun buildHierarchy(
    points: ReadableArray,
    radius: Double,
    minPoints: Int,
    maxZoom: Int,
    minZoom: Int,
  ): Triple<Map<Int, ZoomSnapshot>, Map<String, IntArray>, Map<String, Int>> {
    var current = mutableListOf<ClusterEntity>()
    for (i in 0 until points.size()) {
      val p = points.getMap(i) ?: continue
      if (!p.hasKey("latitude") || !p.hasKey("longitude")) continue
      current.add(
        ClusterEntity(
          id = "p_$i",
          latitude = p.getDouble("latitude"),
          longitude = p.getDouble("longitude"),
          count = 1,
          leafPointIndices = intArrayOf(i),
          isCluster = false,
        )
      )
    }

    val snapshots = mutableMapOf<Int, ZoomSnapshot>()
    val leaves = mutableMapOf<String, IntArray>()
    val expansionMap = mutableMapOf<String, Int>()

    for (zoom in maxZoom downTo minZoom) {
      val tileScale = 2.0.pow(zoom.toDouble())
      val degPerPixelLon = 360.0 / (256.0 * tileScale)
      val cellLon = (radius * degPerPixelLon).coerceAtLeast(0.000001)
      val cellLat = cellLon

      val buckets = mutableMapOf<String, MutableList<ClusterEntity>>()
      current.forEach { e ->
        val gx = floor((e.longitude + 180.0) / cellLon).toInt()
        val gy = floor((e.latitude + 90.0) / cellLat).toInt()
        val key = "${gx}_${gy}"
        buckets.getOrPut(key) { mutableListOf() }.add(e)
      }

      val next = mutableListOf<ClusterEntity>()
      var cIdx = 0
      buckets.forEach { (cellKey, bucket) ->
        val total = bucket.sumOf { it.count }
        if (total >= minPoints) {
          val wLat = bucket.sumOf { it.latitude * it.count.toDouble() }
          val wLon = bucket.sumOf { it.longitude * it.count.toDouble() }
          val leafs = bucket.flatMap { it.leafPointIndices.toList() }.toIntArray()
          val id = "c_${zoom}_${cellKey}_$cIdx"
          cIdx += 1
          val cluster = ClusterEntity(
            id = id,
            latitude = wLat / total.toDouble(),
            longitude = wLon / total.toDouble(),
            count = total,
            leafPointIndices = leafs,
            isCluster = true,
          )
          next.add(cluster)
          leaves[id] = leafs
          expansionMap[id] = (zoom + 1).coerceAtMost(maxZoom)
        } else {
          next.addAll(bucket)
        }
      }
      snapshots[zoom] = ZoomSnapshot(zoom, next.toList())
      current = next
    }

    snapshots.forEach { (zoom, snapshot) ->
      snapshot.entities.forEach { entity ->
        if (!entity.isCluster || entity.count <= 1) return@forEach
        var expansionZoom = maxZoom
        if (zoom < maxZoom) {
          for (targetZoom in (zoom + 1)..maxZoom) {
            val targetSnapshot = snapshots[targetZoom] ?: continue
            val parentIds = mutableSetOf<String>()
            targetSnapshot.entities.forEach targetLoop@{ candidate ->
              for (leaf in entity.leafPointIndices) {
                if (candidate.leafPointIndices.contains(leaf)) {
                  parentIds.add(candidate.id)
                  return@targetLoop
                }
              }
            }
            if (parentIds.size > 1) {
              expansionZoom = targetZoom
              break
            }
          }
        }
        expansionMap[entity.id] = expansionZoom
      }
    }

    return Triple(snapshots, leaves, expansionMap)
  }

  private fun toOutput(snapshot: ZoomSnapshot, bounds: DoubleArray): WritableArray {
    val out = Arguments.createArray()
    snapshot.entities.forEach { e ->
      if (!inBounds(e.latitude, e.longitude, bounds)) return@forEach
      val item = Arguments.createMap()
      item.putString("id", e.id)
      item.putString("type", if (e.isCluster && e.count > 1) "cluster" else "point")
      item.putInt("count", e.count)
      item.putDouble("latitude", e.latitude)
      item.putDouble("longitude", e.longitude)
      out.pushMap(item)
    }
    return out
  }
}
