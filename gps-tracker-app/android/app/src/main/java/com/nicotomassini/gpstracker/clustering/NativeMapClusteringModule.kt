package com.nicotomassini.gpstracker.clustering

import com.facebook.react.bridge.*
import java.util.concurrent.Executors
import kotlin.math.floor
import kotlin.math.pow

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
        @Suppress("UNUSED_VARIABLE")
        val _bounds = bounds
        val cacheKey = "${datasetId}|${points.size()}|$radius|$minPoints|$maxZoom|$minZoom"

        val cached = cache[cacheKey]
        if (cached != null) {
          val snapshot = cached.snapshots[z] ?: ZoomSnapshot(z, emptyList())
          val out = toOutput(snapshot)
          lastLeaves = cached.leaves
          lastPoints = cached.points
          lastExpansionZoom = cached.expansionZoom
          reactApplicationContext.runOnUiQueueThread {
            promise.resolve(out)
          }
          return@execute
        }

        val built = buildHierarchy(points, radius, minPoints, maxZoom, minZoom)
        val snapshot = built.snapshots[z] ?: ZoomSnapshot(z, emptyList())
        val out = toOutput(snapshot)
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
      val zoomRadiusScale = when {
        zoom >= 15 -> 0.65
        zoom >= 12 -> 0.80
        zoom <= 5 -> 1.30
        else -> 1.00
      }
      val cellLon = (radius * zoomRadiusScale * degPerPixelLon).coerceAtLeast(0.000001)
      val cellLat = cellLon

      val buckets = mutableMapOf<String, MutableList<ClusterEntity>>()
      current.forEach { e ->
        val gx = floor((e.longitude + 180.0) / cellLon).toInt()
        val gy = floor((e.latitude + 90.0) / cellLat).toInt()
        val key = "${gx}_${gy}"
        buckets.getOrPut(key) { mutableListOf() }.add(e)
      }

      val next = mutableListOf<ClusterEntity>()
      buckets.toSortedMap().forEach { (cellKey, bucket) ->
        val total = bucket.sumOf { it.count }
        if (total >= minPoints) {
          val wLat = bucket.sumOf { it.latitude * it.count.toDouble() }
          val wLon = bucket.sumOf { it.longitude * it.count.toDouble() }
          val leafs = bucket.flatMap { it.leafPointIndices.toList() }.distinct().sorted().toIntArray()
          val id = "c_${zoom}_${cellKey}_${leafs.firstOrNull() ?: -1}_${leafs.size}"
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
        expansionMap[entity.id] = (zoom + 1).coerceAtMost(maxZoom)
      }
    }

    return Triple(snapshots, leaves, expansionMap)
  }

  private fun toOutput(snapshot: ZoomSnapshot): WritableArray {
    val out = Arguments.createArray()
    snapshot.entities.forEach { e ->
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
