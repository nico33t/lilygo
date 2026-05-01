import { Ionicons } from '@expo/vector-icons'
import { getAuth } from '@react-native-firebase/auth'
import { router } from 'expo-router'
import { useMemo, useState } from 'react'
import {
  ActivityIndicator,
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { C, R, S } from '../constants/design'
import { useCachedUserProfile } from '../hooks/useCachedUserProfile'
import { signOut } from '../services/authService'

export default function UserSettingsScreen() {
  const [busy, setBusy] = useState(false)
  const user = getAuth().currentUser
  const { photoURL: userPhoto, displayName: cachedName, email: cachedEmail } = useCachedUserProfile(user)
  const userName = useMemo(
    () => {
      const direct = cachedName ?? user?.displayName ?? user?.providerData?.find((p) => !!p?.displayName)?.displayName
      if (direct) return direct
      const email = cachedEmail ?? user?.email ?? user?.providerData?.find((p) => !!p?.email)?.email
      if (email) return email.split('@')[0]
      return 'Utente'
    },
    [user, cachedEmail, cachedName]
  )

  const provider = useMemo(() => {
    const id = user?.providerData?.[0]?.providerId
    if (id === 'google.com') return 'Google'
    if (id === 'apple.com') return 'Apple'
    if (id === 'password') return 'Email'
    return id ?? 'N/A'
  }, [user])

  async function handleLogout() {
    setBusy(true)
    try {
      await signOut()
      router.replace('/login')
    } finally {
      setBusy(false)
    }
  }

  return (
    <SafeAreaView style={styles.root}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.iconBtn} hitSlop={10}>
          <Ionicons name="arrow-back" size={20} color={C.text1} />
        </Pressable>
        <Text style={styles.title}>Impostazioni utente</Text>
        <View style={styles.iconBtnPlaceholder} />
      </View>

      <View style={styles.card}>
        <View style={styles.avatarWrap}>
          {userPhoto ? (
            <Image source={{ uri: userPhoto }} style={styles.avatar} />
          ) : (
            <Ionicons name="person-circle-outline" size={72} color={C.text2} />
          )}
        </View>
        <Text style={styles.nameText}>{userName}</Text>
        <Text style={styles.emailText}>{cachedEmail || user?.email || 'Email non disponibile'}</Text>
        <View style={styles.metaRow}>
          <Text style={styles.metaLabel}>Provider</Text>
          <Text style={styles.metaValue}>{provider}</Text>
        </View>
      </View>

      <Pressable style={[styles.logoutBtn, busy && styles.dimmed]} onPress={handleLogout} disabled={busy}>
        {busy ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <>
            <Ionicons name="log-out-outline" size={18} color="#fff" />
            <Text style={styles.logoutText}>Esci</Text>
          </>
        )}
      </Pressable>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: C.bg,
    paddingHorizontal: S.md,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: S.md,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: C.text1,
  },
  iconBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.96)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: C.sep,
  },
  iconBtnPlaceholder: {
    width: 36,
    height: 36,
  },
  card: {
    borderRadius: R.lg,
    backgroundColor: C.card,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: C.sep,
    padding: S.lg,
    gap: 8,
    alignItems: 'center',
  },
  avatarWrap: {
    width: 72,
    height: 72,
    borderRadius: 36,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: C.sep,
  },
  avatar: {
    width: '100%',
    height: '100%',
  },
  nameText: {
    marginTop: 6,
    fontSize: 18,
    fontWeight: '700',
    color: C.text1,
  },
  emailText: {
    fontSize: 13,
    color: C.text2,
  },
  metaRow: {
    marginTop: 8,
    width: '100%',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  metaLabel: {
    fontSize: 13,
    color: C.text3,
  },
  metaValue: {
    fontSize: 13,
    fontWeight: '700',
    color: C.text1,
  },
  logoutBtn: {
    marginTop: S.lg,
    height: 52,
    borderRadius: R.lg,
    backgroundColor: '#C62828',
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  logoutText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#fff',
  },
  dimmed: {
    opacity: 0.6,
  },
})
