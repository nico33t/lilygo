const { withDangerousMod } = require('@expo/config-plugins')
const fs = require('fs')
const path = require('path')

// Avviso non bloccante: segnala quando manca google-services.json in root.
// Non modifica cartelle native e non interrompe prebuild.
module.exports = function withAndroidGoogleServicesWarning(config) {
  return withDangerousMod(config, [
    'android',
    async (config) => {
      const src = path.resolve(config.modRequest.projectRoot, 'google-services.json')
      if (!fs.existsSync(src)) {
        console.warn(
          '\n⚠️  [withAndroidGoogleServicesWarning] google-services.json non trovato nella root del progetto.\n' +
            '   Android prebuild continuerà, ma Firebase su Android non verrà inizializzato.\n' +
            '   Scaricalo da Firebase Console → Project settings → Android app → google-services.json\n' +
            '   e mettilo in: ' + src + '\n'
        )
      } else {
        console.log(`✅ [withAndroidGoogleServicesWarning] Trovato → ${src}`)
      }
      return config
    },
  ])
}

