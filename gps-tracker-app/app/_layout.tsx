import { Stack } from 'expo-router'
import { useTracker } from '../hooks/useTracker'

export default function RootLayout() {
  useTracker()

  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: '#ffffff' },
        headerShadowVisible: false,
        headerTintColor: '#222222',
      }}
    >
      <Stack.Screen name="index" options={{ headerShown: false }} />
      <Stack.Screen
        name="settings"
        options={{ title: 'Impostazioni', presentation: 'card' }}
      />
    </Stack>
  )
}
