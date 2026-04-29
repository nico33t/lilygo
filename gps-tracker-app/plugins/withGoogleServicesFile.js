const { withDangerousMod } = require('@expo/config-plugins')
const fs   = require('fs')
const path = require('path')

// Copia GoogleService-Info.plist dalla root del progetto nella cartella iOS ad ogni prebuild.
// Il file sorgente deve stare nella root del progetto (mai dentro ios/ che viene rigenerata).
module.exports = function withGoogleServicesFile(config) {
  return withDangerousMod(config, [
    'ios',
    async (config) => {
      const src = path.resolve(config.modRequest.projectRoot, 'GoogleService-Info.plist')

      if (!fs.existsSync(src)) {
        console.warn(
          '\n⚠️  [withGoogleServicesFile] GoogleService-Info.plist non trovato nella root del progetto.\n' +
          '   Scaricalo da Firebase Console → Project settings → iOS app → GoogleService-Info.plist\n' +
          '   e mettilo in: ' + src + '\n'
        )
        return config
      }

      const dest = path.join(
        config.modRequest.platformProjectRoot,  // ios/
        config.modRequest.projectName,           // ios/GPSTracker/
        'GoogleService-Info.plist',
      )

      fs.copyFileSync(src, dest)
      console.log(`✅ [withGoogleServicesFile] Copiato → ${dest}`)
      return config
    },
  ])
}
