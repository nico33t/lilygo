const { withDangerousMod } = require('@expo/config-plugins')
const fs   = require('fs')
const path = require('path')

// Inserts `use_modular_headers!` into the generated Podfile so that
// Firebase Swift pods (FirebaseAuth, FirebaseDatabase, FirebaseFirestore, …)
// can generate module maps when built as static libraries.
// Without this, `pod install` fails with "Swift pod cannot yet be integrated
// as static libraries" errors.
module.exports = function withModularHeaders(config) {
  return withDangerousMod(config, [
    'ios',
    async (config) => {
      const podfilePath = path.join(config.modRequest.platformProjectRoot, 'Podfile')

      if (!fs.existsSync(podfilePath)) return config

      let content = fs.readFileSync(podfilePath, 'utf8')

      if (content.includes('use_modular_headers!')) return config

      // Insert after the `platform :ios, ...` line
      content = content.replace(
        /(platform :ios,[^\n]+\n)/,
        '$1use_modular_headers!\n'
      )

      fs.writeFileSync(podfilePath, content, 'utf8')
      console.log('✅ [withModularHeaders] use_modular_headers! injected into Podfile')
      return config
    },
  ])
}
