import { useEffect, useState } from 'react'
import { ActivityIndicator, FlatList, StyleSheet, Text, View } from 'react-native'
import { router, useLocalSearchParams } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import SessionCard from '../components/SessionCard'
import { listSessions } from '../services/historyService'
import { Session } from '../services/backendService'
import { C, S } from '../constants/design'

export default function HistoryScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>()
  const deviceId = id ?? ''
  const insets = useSafeAreaInsets()
  const [sessions, setSessions] = useState<Session[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    listSessions(deviceId).then((s) => { setSessions(s); setLoading(false) })
  }, [deviceId])

  return (
    <View style={[styles.container, { paddingTop: insets.top + S.md }]}>
      <Text style={styles.title}>Percorsi</Text>
      {loading ? (
        <ActivityIndicator style={styles.loader} color={C.accent} />
      ) : sessions.length === 0 ? (
        <Text style={styles.empty}>Nessun percorso registrato</Text>
      ) : (
        <FlatList
          data={sessions}
          keyExtractor={(s) => s.id}
          renderItem={({ item }) => (
            <SessionCard
              session={item}
              onPress={() => router.push(`/session?id=${item.id}&device=${encodeURIComponent(deviceId)}`)}
            />
          )}
          contentContainerStyle={{ paddingTop: S.md, paddingBottom: insets.bottom + S.xl }}
          showsVerticalScrollIndicator={false}
        />
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  title: { fontSize: 28, fontWeight: '700', color: C.text1, paddingHorizontal: S.md, paddingBottom: S.md },
  loader: { marginTop: 60 },
  empty: { textAlign: 'center', color: C.text3, marginTop: 60, fontSize: 15 },
})
