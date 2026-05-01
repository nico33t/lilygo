const { withDangerousMod } = require('@expo/config-plugins')
const fs = require('fs')
const path = require('path')

/**
 * Expo Config Plugin to apply iOS build fixes during prebuild.
 * This avoids direct modifications to the /ios folder which are lost on prebuild.
 */
module.exports = function withIOSBuildFixes(config) {
  return withDangerousMod(config, [
    'ios',
    async (config) => {
      const podfilePath = path.join(config.modRequest.platformProjectRoot, 'Podfile')
      if (!fs.existsSync(podfilePath)) return config

      let content = fs.readFileSync(podfilePath, 'utf8')

      // Avoid duplicate injection
      if (content.includes('withIOSBuildFixes')) return config

      const buildFixesBlock = `
    # --- [withIOSBuildFixes] START ---
    installer.pods_project.targets.each do |target|
      target.build_configurations.each do |config|
        # Fix deployment version mismatch (expected >= 2.0 <= 26.4.99)
        config.build_settings['IPHONEOS_DEPLOYMENT_TARGET'] = '15.1'
        
        # Fix "Script has ambiguous dependencies" and Firebase config issues in Xcode 15+
        config.build_settings['ENABLE_USER_SCRIPT_SANDBOXING'] = 'NO'
      end
      
      # Mark problematic scripts to run every time to avoid ambiguous dependency warnings
      target.build_phases.each do |phase|
        if phase.respond_to?(:name) && (
          phase.name == '[CP-User] [RNFB] Core Configuration' || 
          phase.name == '[Expo Dev Launcher] Strip Local Network Keys for Release'
        )
          if phase.respond_to?(:always_out_of_date)
            phase.always_out_of_date = '1'
          end
        end
      end
    end
    # --- [withIOSBuildFixes] END ---
`

      // Insert at the beginning of the post_install block
      const searchPattern = /post_install do \|installer\|/
      if (searchPattern.test(content)) {
        content = content.replace(searchPattern, `post_install do |installer|${buildFixesBlock}`)
      }

      fs.writeFileSync(podfilePath, content, 'utf8')
      console.log('✅ [withIOSBuildFixes] Applied iOS build fixes to Podfile')
      return config
    },
  ])
}
