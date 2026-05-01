const { withDangerousMod } = require('@expo/config-plugins')
const fs = require('fs')
const path = require('path')

/**
 * Expo Config Plugin to apply iOS build fixes during prebuild.
 * This unified plugin handles both global Podfile settings (frameworks, modular headers)
 * and post_install build setting patches.
 */
module.exports = function withIOSBuildFixes(config) {
  return withDangerousMod(config, [
    'ios',
    async (config) => {
      const podfilePath = path.join(config.modRequest.platformProjectRoot, 'Podfile')
      if (!fs.existsSync(podfilePath)) return config

      let content = fs.readFileSync(podfilePath, 'utf8')

      // 1. Ensure use_modular_headers! is present (frameworks handled by expo-build-properties)
      if (!content.includes('use_modular_headers!')) {
        console.log('✅ [withIOSBuildFixes] Injecting use_modular_headers!')
        content = content.replace(
          /use_frameworks!.*\n/,
          "$&use_modular_headers!\n"
        )
      }

      // 2. Prepare the post_install fixes block
      const buildFixesBlock = `
    # --- [withIOSBuildFixes] START ---
    require 'fileutils'

    puts "🔍 [withIOSBuildFixes] Applying build setting fixes..."

    installer.pods_project.targets.each do |target|
      target.build_configurations.each do |config|
        # Fix deployment target and other standard settings
        config.build_settings['IPHONEOS_DEPLOYMENT_TARGET'] = '15.1'
        config.build_settings['ENABLE_USER_SCRIPT_SANDBOXING'] = 'NO'
        config.build_settings['DEFINES_MODULE'] = 'YES'
        config.build_settings['CLANG_ALLOW_NON_MODULAR_INCLUDES_IN_FRAMEWORK_MODULES'] = 'YES'

        # Fix gRPC modulemap paths which are often incorrectly pointed to Headers/Private
        ['OTHER_CFLAGS', 'OTHER_CPLUSPLUSFLAGS'].each do |key|
          if config.build_settings[key]
            val = config.build_settings[key]
            if val.is_a?(String)
              val = val.gsub('\${PODS_ROOT}/Headers/Private/grpc/gRPC-Core.modulemap', '\${PODS_ROOT}/Target Support Files/gRPC-Core/gRPC-Core.modulemap')
              val = val.gsub('\${PODS_ROOT}/Headers/Private/grpcpp/gRPC-C++.modulemap', '\${PODS_ROOT}/Target Support Files/gRPC-C++/gRPC-C++.modulemap')
              config.build_settings[key] = val
            elsif val.is_a?(Array)
              config.build_settings[key] = val.map do |item|
                item.gsub('\${PODS_ROOT}/Headers/Private/grpc/gRPC-Core.modulemap', '\${PODS_ROOT}/Target Support Files/gRPC-Core/gRPC-Core.modulemap')
                    .gsub('\${PODS_ROOT}/Headers/Private/grpcpp/gRPC-C++.modulemap', '\${PODS_ROOT}/Target Support Files/gRPC-C++/gRPC-C++.modulemap')
              end
            end
          end
        end
      end
    end

    # Directly patch .xcconfig files for gRPC modulemaps
    Dir.glob("#{installer.sandbox.root}/**/*.xcconfig").each do |file_path|
      xc_content = File.read(file_path)
      xc_changed = false
      if xc_content.include?('Headers/Private/grpc/gRPC-Core.modulemap')
        xc_content.gsub!('Headers/Private/grpc/gRPC-Core.modulemap', 'Target Support Files/gRPC-Core/gRPC-Core.modulemap')
        xc_changed = true
      end
      if xc_content.include?('Headers/Private/grpcpp/gRPC-C++.modulemap')
        xc_content.gsub!('Headers/Private/grpcpp/gRPC-C++.modulemap', 'Target Support Files/gRPC-C++/gRPC-C++.modulemap')
        xc_changed = true
      end
      if xc_changed
        File.write(file_path, xc_content)
        puts "✅ [withIOSBuildFixes] Patched .xcconfig: #{File.basename(file_path)}"
      end
    end

    installer.aggregate_targets.each do |aggregate_target|
      aggregate_target.user_project.targets.each do |target|
        target.build_configurations.each do |config|
          config.build_settings['IPHONEOS_DEPLOYMENT_TARGET'] = '15.1'
          config.build_settings['ENABLE_USER_SCRIPT_SANDBOXING'] = 'NO'
          config.build_settings['DEFINES_MODULE'] = 'YES'
          config.build_settings['CLANG_ALLOW_NON_MODULAR_INCLUDES_IN_FRAMEWORK_MODULES'] = 'YES'
        end
        target.build_phases.each do |phase|
          if phase.respond_to?(:name) && (
            phase.name == '[CP-User] [RNFB] Core Configuration' || 
            phase.name == '[Expo Dev Launcher] Strip Local Network Keys for Release'
          )
            phase.always_out_of_date = '1' if phase.respond_to?(:always_out_of_date)
          end
        end
      end
    end
    # --- [withIOSBuildFixes] END ---
`

      // 3. Insert the block into the Podfile
      const markerRegex = /[ \t]*# --- \[withIOSBuildFixes\] START ---[\s\S]*?# --- \[withIOSBuildFixes\] END ---\n?/m
      content = content.replace(markerRegex, '')

      const rnPostInstallPattern = /(react_native_post_install\([\s\S]*?\n[ \t]*\))/
      const postInstallPattern = /(post_install do \|installer\|)/

      if (rnPostInstallPattern.test(content)) {
        content = content.replace(rnPostInstallPattern, `$1\n${buildFixesBlock}`)
      } else if (postInstallPattern.test(content)) {
        content = content.replace(postInstallPattern, `$1\n${buildFixesBlock}`)
      }

      fs.writeFileSync(podfilePath, content, 'utf8')
      fs.writeFileSync(path.join(config.modRequest.platformProjectRoot, 'Podfile_FIXED'), content, 'utf8')
      console.log('✅ [withIOSBuildFixes] Applied all iOS build fixes to Podfile')
      return config
    },
  ])
}
