const { withDangerousMod } = require('@expo/config-plugins')
const fs = require('fs')
const path = require('path')

const IOS_IMAGESET_NAME = 'marker_arrow_shared.imageset'
const IOS_IMAGE_NAME = 'marker_arrow_shared.png'
const ANDROID_DRAWABLE_NAME = 'marker_arrow_shared.png'

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
}

function copyIfChanged(src, dest) {
  if (!fs.existsSync(src)) return false
  const srcBuf = fs.readFileSync(src)
  if (fs.existsSync(dest)) {
    const dstBuf = fs.readFileSync(dest)
    if (Buffer.compare(srcBuf, dstBuf) === 0) return true
  }
  fs.writeFileSync(dest, srcBuf)
  return true
}

module.exports = function withNativeMarkerImageCache(config) {
  config = withDangerousMod(config, [
    'ios',
    async (config) => {
      const projectRoot = config.modRequest.projectRoot
      const iosRoot = config.modRequest.platformProjectRoot
      const srcPng = path.join(projectRoot, 'assets', 'marker.png')
      if (!fs.existsSync(srcPng)) {
        console.warn('[withNativeMarkerImageCache] assets/marker.png non trovato, skip iOS.')
        return config
      }

      const targetDirs = fs
        .readdirSync(iosRoot, { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .map((entry) => entry.name)
        .filter((name) => fs.existsSync(path.join(iosRoot, name, 'Info.plist')))

      for (const dirName of targetDirs) {
        const imagesRoot = path.join(iosRoot, dirName, 'Images.xcassets')
        ensureDir(imagesRoot)
        const imageSetDir = path.join(imagesRoot, IOS_IMAGESET_NAME)
        ensureDir(imageSetDir)
        copyIfChanged(srcPng, path.join(imageSetDir, IOS_IMAGE_NAME))
        const contents = {
          images: [
            { idiom: 'universal', filename: IOS_IMAGE_NAME, scale: '1x' },
            { idiom: 'universal', scale: '2x' },
            { idiom: 'universal', scale: '3x' },
          ],
          info: { author: 'xcode', version: 1 },
        }
        fs.writeFileSync(
          path.join(imageSetDir, 'Contents.json'),
          `${JSON.stringify(contents, null, 2)}\n`,
          'utf8'
        )
      }
      return config
    },
  ])

  config = withDangerousMod(config, [
    'android',
    async (config) => {
      const projectRoot = config.modRequest.projectRoot
      const srcPng = path.join(projectRoot, 'assets', 'marker.png')
      if (!fs.existsSync(srcPng)) {
        console.warn('[withNativeMarkerImageCache] assets/marker.png non trovato, skip Android.')
        return config
      }

      const resDir = path.join(projectRoot, 'android', 'app', 'src', 'main', 'res')
      
      const TARGET_FOLDER = 'drawable-mdpi';
      const densityFolders = [
        'drawable-ldpi',
        'drawable-mdpi',
        'drawable-hdpi',
        'drawable-xhdpi',
        'drawable-xxhdpi',
        'drawable-xxxhdpi',
        'drawable-nodpi'
      ];

      densityFolders.forEach(folder => {
        const p = path.join(resDir, folder, ANDROID_DRAWABLE_NAME)
        if (fs.existsSync(p)) fs.unlinkSync(p)
      })

      const drawableDir = path.join(resDir, TARGET_FOLDER)
      ensureDir(drawableDir)
      copyIfChanged(srcPng, path.join(drawableDir, ANDROID_DRAWABLE_NAME))
      return config
    },
  ])

  return config
}
