import { Stack } from 'expo-router'

export default function RootLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        headerStyle: { backgroundColor: '#ffffff' },
        headerShadowVisible: false,
        headerTintColor: '#222222',
      }}
    >
      <Stack.Screen name="index" />
      <Stack.Screen name="tracker" />
      <Stack.Screen
        name="settings"
        options={{ headerShown: true, title: 'Impostazioni', presentation: 'card' }}
      />
    </Stack>
  )
}
