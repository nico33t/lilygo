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
      const iosRoot = config.modRequest.platformProjectRoot // ios/

      if (!fs.existsSync(src)) {
        console.warn(
          '\n⚠️  [withGoogleServicesFile] GoogleService-Info.plist non trovato nella root del progetto.\n' +
          '   Scaricalo da Firebase Console → Project settings → iOS app → GoogleService-Info.plist\n' +
          '   e mettilo in: ' + src + '\n'
        )
        return config
      }

      // Copia in tutti i target app iOS (es: ios/Trackly/GoogleService-Info.plist)
      // Evita dipendenza da modRequest.projectName quando cambia o non è valorizzato.
      const dirs = fs.readdirSync(iosRoot, { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .map((entry) => entry.name)
        .filter((name) => {
          const full = path.join(iosRoot, name)
          if (name === 'Pods' || name.endsWith('.xcodeproj') || name.endsWith('.xcworkspace')) return false
          if (!fs.existsSync(path.join(full, 'Info.plist'))) return false
          return true
        })

      if (dirs.length === 0) {
        console.warn('\n⚠️  [withGoogleServicesFile] Nessun target iOS trovato con Info.plist.\n')
        return config
      }

      for (const dirName of dirs) {
        const dest = path.join(iosRoot, dirName, 'GoogleService-Info.plist')
        fs.copyFileSync(src, dest)
        console.log(`✅ [withGoogleServicesFile] Copiato → ${dest}`)
      }

      return config
    },
  ])
}
