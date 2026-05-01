const fs = require('fs')
const path = require('path')

const IS_DEV = process.env.APP_VARIANT === 'development'
const EAS_PROJECT_ID = '29a33dca-0355-455a-aa1a-cf38ba295f27'
const REVERSED_CLIENT_ID = process.env.REVERSED_CLIENT_ID ?? 'com.googleusercontent.apps.REPLACE_ME'
const HAS_ANDROID_GOOGLE_SERVICES = fs.existsSync(
  path.join(__dirname, 'google-services.json')
)

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
    [
      'expo-build-properties',
      {
        ios: {
          useFrameworks: 'static',
        },
      },
    ],
    './plugins/withIOSBuildFixes',
    './plugins/withGoogleServicesFile',
    './plugins/withAndroidGoogleServicesWarning',
    './plugins/withRNFBFirestoreHeaderFix',
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
    icon: './assets/logo.icon',
    bundleIdentifier: 'com.nicotomassini.gps-tracker',
    buildNumber: '1',
    googleServicesFile: './GoogleService-Info.plist',
    infoPlist: {
      NSLocationWhenInUseUsageDescription:
        'Trackly shows your position on the map.',
      NSLocationAlwaysUsageDescription:
        'Trackly needs location to track your route.',
    },
    /* entitlements: {
      'aps-environment': 'production',
      'com.apple.developer.applesignin': ['Default'],
    }, */
  },
  android: {
    package: 'com.nicotomassini.gpstracker',
    ...(HAS_ANDROID_GOOGLE_SERVICES ? { googleServicesFile: './google-services.json' } : {}),
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
