const { withDangerousMod } = require('@expo/config-plugins')
const fs = require('fs')
const path = require('path')

module.exports = function withRNFBIOSAppConfigure(config) {
  return withDangerousMod(config, [
    'ios',
    async (config) => {
      const appDelegatePath = path.join(
        config.modRequest.platformProjectRoot,
        config.modRequest.projectName,
        'AppDelegate.swift'
      )

      if (!fs.existsSync(appDelegatePath)) return config

      let content = fs.readFileSync(appDelegatePath, 'utf8')

      if (!content.includes('import FirebaseCore')) {
        content = content.replace(
          'import ReactAppDependencyProvider',
          'import ReactAppDependencyProvider\nimport FirebaseCore'
        )
      }

      if (!content.includes('FirebaseApp.configure()')) {
        content = content.replace(
          /public override func application\([\s\S]*?\)\s*-> Bool \{/,
          (match) => `${match}\n    FirebaseApp.configure()`
        )
      }

      fs.writeFileSync(appDelegatePath, content, 'utf8')
      console.log(`✅ [withRNFBIOSAppConfigure] Patched ${appDelegatePath}`)
      return config
    },
  ])
}

