const { withDangerousMod } = require('@expo/config-plugins')
const fs = require('fs')
const path = require('path')

const RNFB_IF_BLOCK_RE = /#if\s+__has_include\(<RNFBApp\/RNFBAppModule\.h>\)[\s\S]*?#endif\s*/g
const RCT_DEFINES_IF_BLOCK_RE = /#if\s+__has_include\("RCTDefines\.h"\)[\s\S]*?#endif\s*/g
const RCT_BRIDGE_IF_BLOCK_RE = /#if\s+__has_include\("RCTBridgeModule\.h"\)[\s\S]*?#endif\s*/g

function normalizeSource(src) {
  return src
    .replace(RNFB_IF_BLOCK_RE, '')
    .replace(RCT_DEFINES_IF_BLOCK_RE, '')
    .replace(RCT_BRIDGE_IF_BLOCK_RE, '')
    .replace(/^\s*#import\s+["<]RCTDefines\.h[">]\s*\n?/gm, '')
    .replace(/^\s*#import\s+<React\/RCTDefines\.h>\s*\n?/gm, '')
    .replace(/^\s*#import\s+["<]RCTBridgeModule\.h[">]\s*\n?/gm, '')
    .replace(/^\s*#import\s+<React\/RCTBridgeModule\.h>\s*\n?/gm, '')
    .replace(/^\s*#import\s+<RNFBApp\/RNFBAppModule\.h>\s*\n?/gm, '')
}

function insertAtTop(src, importLine) {
  // Find the end of the license comment if it exists
  const commentEnd = src.indexOf('*/')
  if (commentEnd !== -1) {
    const insertPos = commentEnd + 2
    return src.slice(0, insertPos) + '\n' + importLine + src.slice(insertPos)
  }
  return importLine + '\n' + src
}

function ensureReactBridgeImports(src) {
  let next = src
  // Insert in reverse order so they appear as:
  // #import <React/RCTDefines.h>
  // #import <React/RCTBridgeModule.h>
  next = insertAtTop(next, '#import <React/RCTBridgeModule.h>')
  next = insertAtTop(next, '#import <React/RCTDefines.h>')
  return next
}

module.exports = function withRNFBFirestoreHeaderFix(config) {
  return withDangerousMod(config, [
    'ios',
    async (config) => {
      const firestoreDir = path.join(
        config.modRequest.projectRoot,
        'node_modules',
        '@react-native-firebase',
        'firestore',
        'ios',
        'RNFBFirestore'
      )

      if (!fs.existsSync(firestoreDir)) {
        console.warn('\n⚠️  [withRNFBFirestoreHeaderFix] RNFBFirestore folder not found, skipping patch.\n')
        return config
      }

      const headerFiles = [
        'RNFBFirestoreCommon.h',
        'RNFBFirestoreModule.h',
        'RNFBFirestoreCollectionModule.h',
        'RNFBFirestoreDocumentModule.h',
        'RNFBFirestoreTransactionModule.h',
      ].map((f) => path.join(firestoreDir, f))

      const moduleFiles = [
        'RNFBFirestoreModule.m',
        'RNFBFirestoreTransactionModule.m',
        'RNFBFirestoreDocumentModule.m',
        'RNFBFirestoreCollectionModule.m',
      ].map((f) => path.join(firestoreDir, f))

      let changed = 0

      for (const file of headerFiles) {
        if (!fs.existsSync(file)) continue
        const original = fs.readFileSync(file, 'utf8')
        let next = normalizeSource(original)
        next = insertAtTop(next, '#import <RNFBApp/RNFBAppModule.h>')
        next = ensureReactBridgeImports(next)
        if (next !== original) {
          fs.writeFileSync(file, next, 'utf8')
          changed += 1
        }
      }

      for (const file of moduleFiles) {
        if (!fs.existsSync(file)) continue
        const original = fs.readFileSync(file, 'utf8')
        let next = normalizeSource(original)
        next = ensureReactBridgeImports(next)
        if (next !== original) {
          fs.writeFileSync(file, next, 'utf8')
          changed += 1
        }
      }

      if (changed > 0) {
        console.log(`✅ [withRNFBFirestoreHeaderFix] Patched ${changed} RNFBFirestore file(s)`)
      } else {
        console.log('ℹ️  [withRNFBFirestoreHeaderFix] No changes needed')
      }

      return config
    },
  ])
}
