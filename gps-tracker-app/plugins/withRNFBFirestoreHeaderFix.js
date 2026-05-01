const { withDangerousMod } = require('@expo/config-plugins')
const fs = require('fs')
const path = require('path')

// Xcode 26 + modular headers can require RNFBAppModule to be imported before RCTBridgeModule
// in RNFB Firestore headers. Also, some .m files need an explicit RCTBridgeModule import
// so RCT_EXPORT_* macros resolve correctly.
module.exports = function withRNFBFirestoreHeaderFix(config) {
  return withDangerousMod(config, [
    'ios',
    async (config) => {
      const headersDir = path.join(
        config.modRequest.projectRoot,
        'node_modules',
        '@react-native-firebase',
        'firestore',
        'ios',
        'RNFBFirestore'
      )

      if (!fs.existsSync(headersDir)) {
        console.warn('\n⚠️  [withRNFBFirestoreHeaderFix] RNFBFirestore headers folder not found, skipping patch.\n')
        return config
      }

      const headerFiles = fs
        .readdirSync(headersDir)
        .filter((f) => f.endsWith('.h'))
        .map((f) => path.join(headersDir, f))

      let changed = 0
      for (const file of headerFiles) {
        const src = fs.readFileSync(file, 'utf8')
        if (!src.includes('#import <React/RCTBridgeModule.h>')) continue

        if (src.includes('#import <RNFBApp/RNFBAppModule.h>')) continue

        const next = src.replace(
          '#import <React/RCTBridgeModule.h>',
          '#import <RNFBApp/RNFBAppModule.h>\n#import <React/RCTBridgeModule.h>'
        )

        if (next !== src) {
          fs.writeFileSync(file, next, 'utf8')
          changed += 1
        }
      }

      const objcFiles = [
        'RNFBFirestoreModule.m',
        'RNFBFirestoreTransactionModule.m',
        'RNFBFirestoreDocumentModule.m',
        'RNFBFirestoreCollectionModule.m',
      ].map((f) => path.join(headersDir, f))

      for (const file of objcFiles) {
        if (!fs.existsSync(file)) continue
        const src = fs.readFileSync(file, 'utf8')
        if (src.includes('#import <React/RCTBridgeModule.h>')) continue

        const marker = '#import <React/RCTUtils.h>'
        let next = src
        if (src.includes(marker)) {
          next = src.replace(
            marker,
            `${marker}\n#import <React/RCTBridgeModule.h>`
          )
        } else {
          next = `#import <React/RCTBridgeModule.h>\n${src}`
        }

        if (next !== src) {
          fs.writeFileSync(file, next, 'utf8')
          changed += 1
        }
      }

      if (changed > 0) {
        console.log(`✅ [withRNFBFirestoreHeaderFix] Patched ${changed} RNFBFirestore header file(s)`)
      } else {
        console.log('ℹ️  [withRNFBFirestoreHeaderFix] No changes needed')
      }

      return config
    },
  ])
}
