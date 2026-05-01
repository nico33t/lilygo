const { withDangerousMod } = require('@expo/config-plugins')
const fs = require('fs')
const path = require('path')

const BRIDGE_BLOCK = `#if __has_include("RCTDefines.h")
#import "RCTDefines.h"
#else
#import <React/RCTDefines.h>
#endif
#if __has_include("RCTBridgeModule.h")
#import "RCTBridgeModule.h"
#else
#import <React/RCTBridgeModule.h>
#endif`

function isBridgeIf(line) {
  const t = line.trim()
  return t === '#if __has_include("RCTBridgeModule.h")' || t === '#if __has_include("RCTDefines.h")'
}

function sanitizeRNFBFile(src) {
  const lines = src.split('\n')

  // Restrict cleanup to file preamble to avoid touching functional preprocessor logic.
  let boundary = lines.findIndex((l) => {
    const t = l.trim()
    return t.startsWith('@interface') || t.startsWith('@implementation') || t === 'NS_ASSUME_NONNULL_BEGIN'
  })
  if (boundary === -1) boundary = lines.length

  const preamble = lines.slice(0, boundary)
  const tail = lines.slice(boundary)

  const cleaned = []
  for (let i = 0; i < preamble.length; i += 1) {
    const line = preamble[i]
    const t = line.trim()

    if (isBridgeIf(line)) {
      let depth = 1
      i += 1
      while (i < preamble.length && depth > 0) {
        const c = preamble[i].trim()
        if (c.startsWith('#if ')) depth += 1
        else if (c === '#endif') depth -= 1
        i += 1
      }
      i -= 1
      continue
    }

    if (
      line.includes('RCTBridgeModule.h') ||
      line.includes('RCTDefines.h') ||
      t === '#else' ||
      t === '#endif'
    ) {
      continue
    }

    // Remove old workaround import to avoid module visibility side effects.
    if (line.includes('RNFBAppModule.h')) continue

    cleaned.push(line)
  }

  const hasBridgeContext =
    src.includes('RCT_EXPORT_MODULE') ||
    src.includes('RCT_EXPORT_METHOD') ||
    src.includes('RCTPromiseRejectBlock') ||
    src.includes('<RCTBridgeModule>')

  if (!hasBridgeContext) {
    return [...cleaned, ...tail].join('\n')
  }

  let insertAt = -1
  for (let i = 0; i < cleaned.length; i += 1) {
    if (cleaned[i].trim().startsWith('#import ')) insertAt = i
  }

  const out = cleaned.slice()
  const blockLines = BRIDGE_BLOCK.split('\n')
  if (insertAt >= 0) {
    out.splice(insertAt + 1, 0, ...blockLines)
  } else {
    out.unshift(...blockLines, '')
  }

  return [...out, ...tail].join('\n')
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

      const targetFiles = fs
        .readdirSync(firestoreDir)
        .filter((f) => f.endsWith('.h') || f.endsWith('.m'))
        .map((f) => path.join(firestoreDir, f))

      let changed = 0
      for (const file of targetFiles) {
        const src = fs.readFileSync(file, 'utf8')
        const patched = sanitizeRNFBFile(src)
        if (patched !== src) {
          fs.writeFileSync(file, patched, 'utf8')
          changed += 1
        }
      }

      if (changed > 0) {
        console.log(`✅ [withRNFBFirestoreHeaderFix] Sanitized ${changed} RNFBFirestore file(s)`)
      } else {
        console.log('ℹ️  [withRNFBFirestoreHeaderFix] No changes needed')
      }

      return config
    },
  ])
}
