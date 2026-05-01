const IS_DEV = process.env.APP_VARIANT === 'development'
const EAS_PROJECT_ID = '29a33dca-0355-455a-aa1a-cf38ba295f27'
const REVERSED_CLIENT_ID = process.env.REVERSED_CLIENT_ID ?? 'com.googleusercontent.apps.REPLACE_ME'

/** @type {import('expo/config').ExpoConfig} */
module.exports = {
  name: IS_DEV ? 'Trackly (Dev)' : 'Trackly',
  slug: 'gps-tracker',
  version: '0.0.2',
  orientation: 'default',
  platforms: ['ios', 'android', 'web'],
  scheme: 'gpstracker',
  runtimeVersion: '0.0.2',
  updates: {
    url: `https://u.expo.dev/${EAS_PROJECT_ID}`,
    enabled: true,
    checkAutomatically: 'ON_LOAD',
  },
  web: { bundler: 'metro', output: 'single' },
  plugins: [
    './plugins/withModularHeaders',
    './plugins/withIOSBuildFixes',
    './plugins/withGoogleServicesFile',
    'expo-router',
    'expo-updates',
    [
      'react-native-maps',
      {
        iosGoogleMapsApiKey: process.env.EXPO_PUBLIC_GOOGLE_MAPS_IOS_KEY ?? '',
        androidGoogleMapsApiKey: process.env.EXPO_PUBLIC_GOOGLE_MAPS_ANDROID_KEY ?? '',
      },
    ],
    'expo-asset',
    [
      'react-native-ble-plx',
      {
        isBackgroundEnabled: false,
        modes: [],
        bluetoothAlwaysPermission:
          'Allow $(PRODUCT_NAME) to connect to Bluetooth GPS devices',
      },
    ],
    'expo-notifications',
    [
      '@react-native-google-signin/google-signin',
      { iosUrlScheme: REVERSED_CLIENT_ID },
    ],
    'expo-apple-authentication',
  ],
  experiments: { typedRoutes: true, newArchEnabled: true },
  ios: {
    bundleIdentifier: IS_DEV
      ? 'com.nicotomassini.gps-tracker.dev'
      : 'com.nicotomassini.gps-tracker',
    buildNumber: '1',
    infoPlist: {
      NSLocationWhenInUseUsageDescription:
        'Trackly shows your position on the map.',
      NSLocationAlwaysUsageDescription:
        'Trackly needs location to track your route.',
      CFBundleURLTypes: [{ CFBundleURLSchemes: [REVERSED_CLIENT_ID] }],
    },
    entitlements: {
      'aps-environment': IS_DEV ? 'development' : 'production',
      'com.apple.developer.applesignin': ['Default'],
    },
  },
  android: {
    package: IS_DEV
      ? 'com.nicotomassini.gpstracker.dev'
      : 'com.nicotomassini.gpstracker',
    permissions: [
      'android.permission.ACCESS_FINE_LOCATION',
      'android.permission.ACCESS_COARSE_LOCATION',
      'android.permission.BLUETOOTH',
      'android.permission.BLUETOOTH_ADMIN',
      'android.permission.BLUETOOTH_SCAN',
      'android.permission.BLUETOOTH_CONNECT',
    ],
  },
  extra: { eas: { projectId: EAS_PROJECT_ID } },
}
