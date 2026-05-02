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

        // Spatial Filtering (Culling)
        val north = if (bounds.hasKey("north")) bounds.getDouble("north") else 90.0
        val south = if (bounds.hasKey("south")) bounds.getDouble("south") else -90.0
        val east = if (bounds.hasKey("east")) bounds.getDouble("east") else 180.0
        val west = if (bounds.hasKey("west")) bounds.getDouble("west") else -180.0
        
        val latPad = Math.abs(north - south) * 0.25
        val lonPad = Math.abs(east - west) * 0.25
        
        val bNorth = (north + latPad).coerceAtMost(90.0)
        val bSouth = (south - latPad).coerceAtLeast(-90.0)
        val bEast = east + lonPad
        val bWest = west - lonPad
        
        val filteredIndices = mutableListOf<Int>()
        for (i in 0 until points.size()) {
          val p = points.getMap(i) ?: continue
          val lat = p.getDouble("latitude")
          val lon = p.getDouble("longitude")
          
          if (lat in bSouth..bNorth) {
            if (bWest <= bEast) {
              if (lon in bWest..bEast) filteredIndices.add(i)
            } else {
              if (lon >= bWest || lon <= bEast) filteredIndices.add(i)
            }
          }
        }

        val cacheKey = "${datasetId}|${filteredIndices.size}|$radius|$minPoints|$maxZoom|$minZoom"

        val cached = cache[cacheKey]
        if (cached != null) {
          // Movement detection
          if (filteredIndices.isNotEmpty()) {
            val f = filteredIndices.first()
            val l = filteredIndices.last()
            val p1 = points.getMap(f)
            val p2 = points.getMap(l)
            val cp1 = cached.points.getMap(f)
            val cp2 = cached.points.getMap(l)
            if (p1?.getDouble("latitude") == cp1?.getDouble("latitude") &&
                p2?.getDouble("latitude") == cp2?.getDouble("latitude")) {
              val snapshot = cached.snapshots[z] ?: ZoomSnapshot(z, emptyList())
              val out = toOutput(snapshot)
              lastLeaves = cached.leaves
              lastPoints = cached.points
              lastExpansionZoom = cached.expansionZoom
              reactApplicationContext.runOnUiQueueThread { promise.resolve(out) }
              return@execute
            }
          }
        }

        val built = buildHierarchy(points, filteredIndices, radius, minPoints, maxZoom, minZoom)
        val snapshot = built.first[z] ?: ZoomSnapshot(z, emptyList())
        val out = toOutput(snapshot)
        lastLeaves = built.second
        lastPoints = points
        lastExpansionZoom = built.third

        putCache(
          cacheKey,
          DatasetCacheEntry(
            key = cacheKey,
            points = points,
            snapshots = built.first,
            leaves = built.second,
            expansionZoom = built.third,
          )
        )
        reactApplicationContext.runOnUiQueueThread { promise.resolve(out) }
      } catch (t: Throwable) {
        reactApplicationContext.runOnUiQueueThread { promise.reject("clustering_error", t.message, t) }
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
    filteredIndices: List<Int>,
    radius: Double,
    minPoints: Int,
    maxZoom: Int,
    minZoom: Int,
  ): Triple<Map<Int, ZoomSnapshot>, Map<String, IntArray>, Map<String, Int>> {
    var current = mutableListOf<ClusterEntity>()
    for (i in filteredIndices) {
      val p = points.getMap(i) ?: continue
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
      // Optimization: Avoid sorted map
      buckets.forEach { (_, bucket) ->
        val total = bucket.sumOf { it.count }
        if (total >= minPoints) {
          val wLat = bucket.sumOf { it.latitude * it.count.toDouble() }
          val wLon = bucket.sumOf { it.longitude * it.count.toDouble() }
          
          // Optimization: Simple merge instead of distinct/sorted
          val leafs = IntArray(total)
          var pos = 0
          for (e in bucket) {
            System.arraycopy(e.leafPointIndices, 0, leafs, pos, e.leafPointIndices.size)
            pos += e.leafPointIndices.size
          }
          
          val id = "c_${zoom}_${leafs.firstOrNull() ?: -1}_${leafs.size}"
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

    return Triple(snapshots, leaves, expansionMap)
  }

  @ReactMethod
  fun buildFullHierarchyGeoJSON(
    points: ReadableArray,
    options: ReadableMap?,
    promise: Promise
  ) {
    worker.execute {
      try {
        val radius = if (options?.hasKey("radius") == true) options.getDouble("radius") else 56.0
        val minPoints = if (options?.hasKey("minPoints") == true) options.getInt("minPoints") else 3
        val maxZoom = if (options?.hasKey("maxZoom") == true) options.getInt("maxZoom") else 18
        val minZoom = if (options?.hasKey("minZoom") == true) options.getInt("minZoom") else 0

        val validIndices = mutableListOf<Int>()
        for (i in 0 until points.size()) {
          val p = points.getMap(i) ?: continue
          if (p.hasKey("latitude") && p.hasKey("longitude")) {
            validIndices.add(i)
          }
        }

        val built = buildHierarchy(points, validIndices, radius, minPoints, maxZoom, minZoom)
        
        val geoJsonOutput = Arguments.createMap()
        built.first.forEach { (zoom, snapshot) ->
          geoJsonOutput.putMap(zoom.toString(), toGeoJsonFeatureCollection(snapshot))
        }

        lastLeaves = built.second
        lastPoints = points
        lastExpansionZoom = built.third

        reactApplicationContext.runOnUiQueueThread { promise.resolve(geoJsonOutput) }
      } catch (t: Throwable) {
        reactApplicationContext.runOnUiQueueThread { promise.reject("clustering_error", t.message, t) }
      }
    }
  }

  private fun toGeoJsonFeatureCollection(snapshot: ZoomSnapshot): WritableMap {
    val features = Arguments.createArray()
    snapshot.entities.forEach { e ->
      val isCluster = e.isCluster && e.count > 1
      val feature = Arguments.createMap()
      feature.putString("type", "Feature")
      feature.putString("id", e.id)
      
      val geometry = Arguments.createMap()
      geometry.putString("type", "Point")
      val coords = Arguments.createArray()
      coords.pushDouble(e.longitude)
      coords.pushDouble(e.latitude)
      geometry.putArray("coordinates", coords)
      feature.putMap("geometry", geometry)
      
      val props = Arguments.createMap()
      props.putBoolean("cluster", isCluster)
      props.putInt("point_count", e.count)
      props.putString("type", if (isCluster) "cluster" else "point")
      feature.putMap("properties", props)
      
      features.pushMap(feature)
    }
    
    val collection = Arguments.createMap()
    collection.putString("type", "FeatureCollection")
    collection.putArray("features", features)
    return collection
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
