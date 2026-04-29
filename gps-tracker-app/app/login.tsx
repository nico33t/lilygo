import { useState } from 'react'
import {
  ActivityIndicator, Platform, Pressable,
  StyleSheet, Text, View,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { router } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { signInWithGoogle, signInWithApple, isAppleAvailable } from '../services/authService'
import { C, R, S } from '../constants/design'

export default function LoginScreen() {
  const [loading, setLoading] = useState<'google' | 'apple' | null>(null)
  const [error, setError]     = useState<string | null>(null)

  async function handleGoogle() {
    setLoading('google')
    setError(null)
    try {
      await signInWithGoogle()
      router.replace('/')
    } catch (e: any) {
      if (e?.code !== 'SIGN_IN_CANCELLED') {
        setError('Accesso con Google non riuscito. Riprova.')
      }
    } finally {
      setLoading(null)
    }
  }

  async function handleApple() {
    setLoading('apple')
    setError(null)
    try {
      await signInWithApple()
      router.replace('/')
    } catch (e: any) {
      if (e?.code !== 'ERR_REQUEST_CANCELED') {
        setError('Accesso con Apple non riuscito. Riprova.')
      }
    } finally {
      setLoading(null)
    }
  }

  return (
    <SafeAreaView style={st.root}>
      {/* Back button */}
      <Pressable
        style={({ pressed }) => [st.backBtn, pressed && { opacity: 0.6 }]}
        onPress={() => router.back()}
        hitSlop={12}
      >
        <Ionicons name="chevron-back" size={20} color={C.text2} />
        <Text style={st.backText}>Indietro</Text>
      </Pressable>

      <View style={st.top}>
        <View style={st.iconWrap}>
          <Ionicons name="navigate-circle" size={56} color={C.accent} />
        </View>
        <Text style={st.title}>GPS Tracker</Text>
        <Text style={st.sub}>
          Accedi per tracciare i tuoi dispositivi{'\n'}da qualsiasi luogo, in tempo reale.
        </Text>

        {/* Value prop pills */}
        <View style={st.pills}>
          {['Trial 14 giorni gratis', 'Nessuna carta richiesta', '€5.99/mese per tracker'].map((label) => (
            <View key={label} style={st.pill}>
              <Ionicons name="checkmark-circle" size={13} color={C.green} />
              <Text style={st.pillText}>{label}</Text>
            </View>
          ))}
        </View>
      </View>

      <View style={st.buttons}>
        {error && (
          <View style={st.errorBanner}>
            <Text style={st.errorText}>{error}</Text>
          </View>
        )}

        {/* Google */}
        <Pressable
          style={({ pressed }) => [st.btn, st.btnGoogle, pressed && st.pressed]}
          onPress={handleGoogle}
          disabled={loading !== null}
        >
          {loading === 'google' ? (
            <ActivityIndicator color={C.text1} />
          ) : (
            <>
              <Ionicons name="logo-google" size={18} color={C.text1} />
              <Text style={st.btnTextDark}>Continua con Google</Text>
            </>
          )}
        </Pressable>

        {/* Apple — solo iOS */}
        {isAppleAvailable() && (
          <Pressable
            style={({ pressed }) => [st.btn, st.btnApple, pressed && st.pressed]}
            onPress={handleApple}
            disabled={loading !== null}
          >
            {loading === 'apple' ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <>
                <Ionicons name="logo-apple" size={20} color="#fff" />
                <Text style={st.btnTextLight}>Continua con Apple</Text>
              </>
            )}
          </Pressable>
        )}

        <Text style={st.legal}>
          Continuando accetti i Termini di servizio e la Privacy Policy.
        </Text>
      </View>
    </SafeAreaView>
  )
}

const st = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg, justifyContent: 'space-between' },

  backBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: S.md,
    paddingTop: S.sm,
    gap: 2,
    alignSelf: 'flex-start',
  },
  backText: { fontSize: 15, color: C.text2 },

  top: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: S.xl,
    gap: S.md,
  },
  iconWrap: {
    width: 88,
    height: 88,
    borderRadius: 22,
    backgroundColor: `${C.accent}18`,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: S.sm,
  },
  title: { fontSize: 32, fontWeight: '700', color: C.text1, letterSpacing: -0.5 },
  sub:   { fontSize: 16, color: C.text2, textAlign: 'center', lineHeight: 22 },

  pills: { gap: 6, alignItems: 'flex-start', alignSelf: 'center', marginTop: S.sm },
  pill:  { flexDirection: 'row', alignItems: 'center', gap: 6 },
  pillText: { fontSize: 13, color: C.text2 },

  buttons: { paddingHorizontal: S.lg, paddingBottom: S.xl, gap: S.sm },

  btn: {
    height: 54,
    borderRadius: R.lg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  btnGoogle: { backgroundColor: C.card, borderWidth: 1.5, borderColor: C.sep },
  btnApple:  { backgroundColor: '#1C1C1E' },
  btnTextDark:  { fontSize: 16, fontWeight: '600', color: C.text1 },
  btnTextLight: { fontSize: 16, fontWeight: '600', color: '#fff' },
  pressed: { opacity: 0.75 },

  errorBanner: { backgroundColor: '#FEE2E2', borderRadius: R.md, padding: 12 },
  errorText:   { fontSize: 14, color: '#B91C1C', textAlign: 'center' },

  legal: { fontSize: 11, color: C.text3, textAlign: 'center', lineHeight: 16, marginTop: S.sm },
})
