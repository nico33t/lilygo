const { withDangerousMod, withXcodeProject } = require('@expo/config-plugins')
const fs = require('fs')
const path = require('path')

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
}

function readTemplate(...parts) {
  const p = path.join(__dirname, 'native-map-clustering', ...parts)
  return fs.readFileSync(p, 'utf8')
}

function writeIfChanged(filePath, content) {
  if (fs.existsSync(filePath) && fs.readFileSync(filePath, 'utf8') === content) return
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

      writeIfChanged(
        path.join(destDir, 'NativeMapClusteringModule.swift'),
        readTemplate('ios', 'NativeMapClusteringModule.swift')
      )
      writeIfChanged(
        path.join(destDir, 'NativeMapClusteringModule.m'),
        readTemplate('ios', 'NativeMapClusteringModule.m')
      )
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

      const moduleKt = readTemplate('android', 'NativeMapClusteringModule.kt').replace(
        /__ANDROID_PACKAGE__/g,
        androidPackage
      )
      const packageKt = readTemplate('android', 'NativeMapClusteringPackage.kt').replace(
        /__ANDROID_PACKAGE__/g,
        androidPackage
      )

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

