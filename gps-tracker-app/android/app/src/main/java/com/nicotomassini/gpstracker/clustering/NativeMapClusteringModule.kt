package com.nicotomassini.gpstracker.clustering

import com.facebook.react.bridge.*

class NativeMapClusteringModule(reactContext: ReactApplicationContext) :
  ReactContextBaseJavaModule(reactContext) {
  private val lastLeaves: MutableMap<String, WritableArray> = mutableMapOf()

  override fun getName(): String = "NativeMapClusteringModule"

  @ReactMethod
  fun buildClusters(
    points: ReadableArray,
    zoom: Double,
    bounds: ReadableMap,
    options: ReadableMap?,
    promise: Promise
  ) {
    val radius = if (options?.hasKey("radius") == true) options.getDouble("radius") else 56.0
    val minPoints = if (options?.hasKey("minPoints") == true) options.getInt("minPoints") else 3
    val z = zoom.coerceIn(0.0, 22.0)
    val tileScale = Math.pow(2.0, z)
    val degPerPixelLon = 360.0 / (256.0 * tileScale)
    val cellLon = (radius * degPerPixelLon).coerceAtLeast(0.000001)
    val cellLat = cellLon

    val buckets = mutableMapOf<String, MutableList<ReadableMap>>()

    for (i in 0 until points.size()) {
      val p = points.getMap(i) ?: continue
      if (!p.hasKey("latitude") || !p.hasKey("longitude")) continue
      val lat = p.getDouble("latitude")
      val lon = p.getDouble("longitude")
      val gx = kotlin.math.floor((lon + 180.0) / cellLon).toInt()
      val gy = kotlin.math.floor((lat + 90.0) / cellLat).toInt()
      val key = "${gx}_${gy}"
      buckets.getOrPut(key) { mutableListOf() }.add(p)
    }

    val out = Arguments.createArray()
    lastLeaves.clear()

    for ((key, bucket) in buckets) {
      if (bucket.size >= minPoints) {
        var sumLat = 0.0
        var sumLon = 0.0
        bucket.forEach { p ->
          sumLat += p.getDouble("latitude")
          sumLon += p.getDouble("longitude")
        }
        val clusterId = "c_${z.toInt()}_$key"
        val item = Arguments.createMap()
        item.putString("id", clusterId)
        item.putString("type", "cluster")
        item.putInt("count", bucket.size)
        item.putDouble("latitude", sumLat / bucket.size.toDouble())
        item.putDouble("longitude", sumLon / bucket.size.toDouble())
        out.pushMap(item)

        val leaves = Arguments.createArray()
        bucket.forEach { leaves.pushMap(it) }
        lastLeaves[clusterId] = leaves
      } else {
        bucket.forEachIndexed { idx, p ->
          val item = Arguments.createMap()
          val pid = if (p.hasKey("id") && !p.isNull("id")) p.getString("id") else "p_$idx"
          item.putString("id", pid)
          item.putString("type", "point")
          item.putInt("count", 1)
          item.putDouble("latitude", p.getDouble("latitude"))
          item.putDouble("longitude", p.getDouble("longitude"))
          out.pushMap(item)
        }
      }
    }
    promise.resolve(out)
  }

  @ReactMethod
  fun getLeaves(clusterId: String, limit: Int, offset: Int, promise: Promise) {
    val src = lastLeaves[clusterId] ?: run {
      promise.resolve(Arguments.createArray())
      return
    }
    val start = offset.coerceAtLeast(0)
    val lim = limit.coerceAtLeast(0)
    if (lim == 0 || start >= src.size()) {
      promise.resolve(Arguments.createArray())
      return
    }
    val end = (start + lim).coerceAtMost(src.size())
    val out = Arguments.createArray()
    for (i in start until end) {
      out.pushMap(src.getMap(i))
    }
    promise.resolve(out)
  }

  @ReactMethod
  fun getExpansionZoom(clusterId: String, promise: Promise) {
    promise.resolve(18)
  }
}
