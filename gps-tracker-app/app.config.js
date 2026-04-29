const IS_DEV = process.env.APP_VARIANT === 'development'

/** @type {import('expo/config').ExpoConfig} */
module.exports = {
  name: IS_DEV ? 'GPS Tracker (Dev)' : 'GPS Tracker',
  slug: 'gps-tracker',
  version: '0.0.2',
  orientation: 'default',
  platforms: ['ios', 'android', 'web'],
  scheme: 'gpstracker',
  web: {
    bundler: 'metro',
    output: 'static',
  },
  plugins: [
    'expo-router',
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
  ],
  experiments: {
    typedRoutes: true,
    newArchEnabled: true,
  },
  ios: {
    bundleIdentifier: IS_DEV
      ? 'com.nicotomassini.gps-tracker.dev'
      : 'com.nicotomassini.gps-tracker',
    infoPlist: {
      NSLocationWhenInUseUsageDescription:
        'GPS Tracker shows your position on the map.',
      NSLocationAlwaysUsageDescription:
        'GPS Tracker needs location to track your route.',
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
}
