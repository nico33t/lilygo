const { withDangerousMod, withXcodeProject } = require('@expo/config-plugins')
const fs = require('fs')
const path = require('path')

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
}

function writeIfChanged(filePath, content) {
  if (fs.existsSync(filePath)) {
    const prev = fs.readFileSync(filePath, 'utf8')
    if (prev === content) return
  }
  fs.writeFileSync(filePath, content, 'utf8')
}

module.exports = function withNativeMapClustering(config) {
  config = withDangerousMod(config, [
    'ios',
    async (config) => {
      const iosRoot = config.modRequest.platformProjectRoot
      const projectName = config.modRequest.projectName
      const destDir = path.join(iosRoot, projectName)
      ensureDir(destDir)

      const swiftModule = `import Foundation
import React
import CoreLocation

@objc(NativeMapClusteringModule)
class NativeMapClusteringModule: NSObject {
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
    // Step 1 (scaffold): passthrough single-point clusters.
    var result: [[String: Any]] = []
    for (idx, point) in points.enumerated() {
      guard let lat = point["latitude"] as? NSNumber,
            let lon = point["longitude"] as? NSNumber else {
        continue
      }
      let id = (point["id"] as? String) ?? "p_\\(idx)"
      result.append([
        "id": id,
        "type": "point",
        "count": 1,
        "latitude": lat,
        "longitude": lon,
      ])
    }
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
    resolver([])
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
`

      const objcBridge = `#import <React/RCTBridgeModule.h>

@interface RCT_EXTERN_MODULE(NativeMapClusteringModule, NSObject)
RCT_EXTERN_METHOD(buildClusters:(NSArray *)points
                  zoom:(nonnull NSNumber *)zoom
                  bounds:(NSDictionary *)bounds
                  options:(NSDictionary *)options
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)
RCT_EXTERN_METHOD(getLeaves:(NSString *)clusterId
                  limit:(nonnull NSNumber *)limit
                  offset:(nonnull NSNumber *)offset
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)
RCT_EXTERN_METHOD(getExpansionZoom:(NSString *)clusterId
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)
@end
`

      writeIfChanged(path.join(destDir, 'NativeMapClusteringModule.swift'), swiftModule)
      writeIfChanged(path.join(destDir, 'NativeMapClusteringModule.m'), objcBridge)
      return config
    },
  ])

  config = withXcodeProject(config, (config) => {
    const projectName = config.modRequest.projectName
    const xcodeProject = config.modResults
    const files = ['NativeMapClusteringModule.swift', 'NativeMapClusteringModule.m']

    files.forEach((fileName) => {
      const filePath = path.join(projectName, fileName)
      if (!xcodeProject.hasFile(filePath)) {
        xcodeProject.addSourceFile(
          filePath,
          null,
          xcodeProject.findPBXGroupKey({ name: projectName })
        )
      }
    })
    return config
  })

  config = withDangerousMod(config, [
    'android',
    async (config) => {
      const projectRoot = config.modRequest.projectRoot
      const androidPackage = config.android?.package || 'com.example.app'
      const packagePath = androidPackage.replace(/\./g, '/')
      const srcDir = path.join(
        projectRoot,
        'android',
        'app',
        'src',
        'main',
        'java',
        packagePath,
        'clustering'
      )
      ensureDir(srcDir)

      const moduleKt = `package ${androidPackage}.clustering

import com.facebook.react.bridge.*

class NativeMapClusteringModule(reactContext: ReactApplicationContext) :
  ReactContextBaseJavaModule(reactContext) {

  override fun getName(): String = "NativeMapClusteringModule"

  @ReactMethod
  fun buildClusters(
    points: ReadableArray,
    zoom: Double,
    bounds: ReadableMap,
    options: ReadableMap?,
    promise: Promise
  ) {
    // Step 1 (scaffold): passthrough single-point clusters.
    val out = Arguments.createArray()
    for (i in 0 until points.size()) {
      val p = points.getMap(i) ?: continue
      val lat = p.getDouble("latitude")
      val lon = p.getDouble("longitude")
      val id = if (p.hasKey("id") && !p.isNull("id")) p.getString("id") else "p_$i"

      val item = Arguments.createMap()
      item.putString("id", id)
      item.putString("type", "point")
      item.putInt("count", 1)
      item.putDouble("latitude", lat)
      item.putDouble("longitude", lon)
      out.pushMap(item)
    }
    promise.resolve(out)
  }

  @ReactMethod
  fun getLeaves(clusterId: String, limit: Int, offset: Int, promise: Promise) {
    promise.resolve(Arguments.createArray())
  }

  @ReactMethod
  fun getExpansionZoom(clusterId: String, promise: Promise) {
    promise.resolve(18)
  }
}
`

      const packageKt = `package ${androidPackage}.clustering

import com.facebook.react.ReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.uimanager.ViewManager

class NativeMapClusteringPackage : ReactPackage {
  override fun createNativeModules(reactContext: ReactApplicationContext): List<NativeModule> {
    return listOf(NativeMapClusteringModule(reactContext))
  }

  override fun createViewManagers(reactContext: ReactApplicationContext): List<ViewManager<*, *>> {
    return emptyList()
  }
}
`

      writeIfChanged(path.join(srcDir, 'NativeMapClusteringModule.kt'), moduleKt)
      writeIfChanged(path.join(srcDir, 'NativeMapClusteringPackage.kt'), packageKt)

      const mainAppPath = path.join(
        projectRoot,
        'android',
        'app',
        'src',
        'main',
        'java',
        packagePath,
        'MainApplication.kt'
      )
      if (fs.existsSync(mainAppPath)) {
        let mainContent = fs.readFileSync(mainAppPath, 'utf8')
        const importLine = `import ${androidPackage}.clustering.NativeMapClusteringPackage`
        if (!mainContent.includes(importLine)) {
          mainContent = mainContent.replace(
            /import com.facebook.react.defaults.DefaultNewArchitectureEntryPoint\n/,
            `import com.facebook.react.defaults.DefaultNewArchitectureEntryPoint\n${importLine}\n`
          )
        }
        if (!mainContent.includes('add(NativeMapClusteringPackage())')) {
          mainContent = mainContent.replace(
            /PackageList\(this\)\.packages\.apply \{\n([\s\S]*?)\n\s*\}/m,
            (match, body) =>
              `PackageList(this).packages.apply {\n${body}\n          add(NativeMapClusteringPackage())\n        }`
          )
        }
        fs.writeFileSync(mainAppPath, mainContent, 'utf8')
      }

      return config
    },
  ])

  return config
}

