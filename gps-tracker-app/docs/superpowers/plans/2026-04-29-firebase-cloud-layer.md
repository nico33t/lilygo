# Firebase Cloud Layer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Aggiungere Firebase Auth, live tracking via cloud, device claiming con trial 14 giorni e modello subscription per-dispositivo all'app GPS Tracker.

**Architecture:** Firebase Auth (Google + Apple) per account utenti. Realtime Database per dati GPS live pushati dal firmware via SIM. Firestore per device ownership, subscription status e session history. Ogni GPS tracker ha la propria subscription (€5.99/mese) — non l'account utente. 14 giorni di trial gratuito all'associazione del device. Il backend service esistente viene esteso: FirebaseBackend attivato quando Auth è presente, HttpBackend come fallback.

**Tech Stack:** @react-native-firebase/app · /auth · /database · /firestore · @react-native-google-signin/google-signin · expo-apple-authentication · Firebase Security Rules

---

## File Structure

| File | Azione | Responsabilità |
|---|---|---|
| `services/authService.ts` | CREA | signInWithGoogle, signInWithApple, signOut, currentUser |
| `services/deviceService.ts` | CREA | claimDevice, isDeviceClaimed, listUserDevices, getSubscriptionStatus |
| `hooks/useAuth.ts` | CREA | onAuthStateChanged hook, ritorna User \| null \| undefined |
| `app/login.tsx` | CREA | Schermata login Google + Apple, design iOS-like |
| `services/firebaseBackend.ts` | RISCRIVI | Import statici, subscribeToLive via RTDB, sessioni via Firestore |
| `services/backendService.ts` | MODIFICA | setFirebaseMode(), reset cache, usa FirebaseBackend quando mode=true |
| `hooks/useTracker.ts` | MODIFICA | Fallback RTDB quando BLE è disconnesso e utente è loggato |
| `app/_layout.tsx` | MODIFICA | Add /login route, init Firebase mode su auth state change |
| `app/index.tsx` | MODIFICA | Sezione "I miei tracker" con device cloud dell'utente |
| `components/SettingsPanel.tsx` | MODIFICA | Sezione account: email, trial status, logout |
| `app.config.js` | MODIFICA | URL scheme per Google Sign-In (REVERSED_CLIENT_ID) |
| `firestore.rules` | CREA | Regole sicurezza Firestore |
| `database.rules.json` | CREA | Regole sicurezza RTDB |

---

## Task 1: Prerequisiti manuali — Firebase Console

**Files:** nessun file da modificare — passi manuali documentati qui.

- [ ] **Step 1: Crea il progetto Firebase**

  1. Vai su https://console.firebase.google.com
  2. "Crea progetto" → nome: `gps-tracker-prod`
  3. Disabilita Google Analytics (non serve per ora)

- [ ] **Step 2: Aggiungi app iOS**

  1. In Firebase console → "Aggiungi app" → iOS
  2. Bundle ID: `com.nicotomassini.gps-tracker`
  3. Scarica `GoogleService-Info.plist`
  4. Copia il file in `ios/GPSTracker/GoogleService-Info.plist`
  5. In Xcode: tasto destro su `GPSTracker` folder → "Add Files to GPSTracker" → seleziona il plist

- [ ] **Step 3: Abilita Authentication**

  1. Firebase console → Authentication → Sign-in method
  2. Abilita "Google" → salva il **Web Client ID** (lo usi nel Task 3)
  3. Abilita "Apple" → inserisci `com.nicotomassini.gps-tracker` come Service ID

- [ ] **Step 4: Abilita Realtime Database**

  1. Firebase console → Realtime Database → "Crea database"
  2. Scegli regione: `europe-west1`
  3. Modalità: "Test" (le regole vere le mettiamo nel Task 13)

- [ ] **Step 5: Abilita Firestore**

  1. Firebase console → Firestore Database → "Crea database"
  2. Modalità: "Produzione"
  3. Regione: `eur3 (europe-west)``

- [ ] **Step 6: Annota le credenziali**

  Dal file `GoogleService-Info.plist` copia questi valori — ti serviranno:
  - `REVERSED_CLIENT_ID` (es. `com.googleusercontent.apps.123456789-xxxx`)
  - `CLIENT_ID` (es. `123456789-xxxx.apps.googleusercontent.com`)

  Dal Firebase console → Authentication → Google → Web SDK configuration:
  - `Web Client ID` (es. `123456789-yyyy.apps.googleusercontent.com`)

---

## Task 2: Installa dipendenze

**Files:** `package.json`, `ios/Podfile.lock`

- [ ] **Step 1: Installa pacchetti Firebase e Sign-In**

  ```bash
  cd /Users/nicolatomassini/30_Progetti_Attivi/lilygo/gps-tracker-app
  npm install @react-native-firebase/app@21 \
              @react-native-firebase/auth@21 \
              @react-native-firebase/database@21 \
              @react-native-firebase/firestore@21 \
              @react-native-google-signin/google-signin \
              expo-apple-authentication
  ```

  Expected: pacchetti aggiunti senza errori.

- [ ] **Step 2: Verifica versioni installate**

  ```bash
  node -e "console.log(require('./node_modules/@react-native-firebase/app/package.json').version)"
  node -e "console.log(require('./node_modules/@react-native-google-signin/google-signin/package.json').version)"
  ```

  Expected: versione stampata per entrambi.

- [ ] **Step 3: Pod install**

  ```bash
  cd /Users/nicolatomassini/30_Progetti_Attivi/lilygo/gps-tracker-app/ios && pod install
  ```

  Expected: `Pod installation complete!` senza errori.

- [ ] **Step 4: Commit**

  ```bash
  cd /Users/nicolatomassini/30_Progetti_Attivi/lilygo/gps-tracker-app
  git add package.json package-lock.json ios/Podfile.lock
  git commit -m "feat: add @react-native-firebase and google-signin dependencies"
  ```

---

## Task 3: app.config.js — URL scheme Google Sign-In

**Files:** `app.config.js`

Con `@react-native-google-signin`, iOS richiede un URL scheme con il `REVERSED_CLIENT_ID` dal plist.

- [ ] **Step 1: Aggiungi URL scheme e plugin**

  Modifica `app.config.js` — sostituisci il blocco `ios:` con:

  ```js
  // In cima al file, aggiungi:
  const REVERSED_CLIENT_ID = process.env.REVERSED_CLIENT_ID ?? 'com.googleusercontent.apps.REPLACE_ME'
  const GOOGLE_WEB_CLIENT_ID = process.env.GOOGLE_WEB_CLIENT_ID ?? 'REPLACE_ME.apps.googleusercontent.com'

  // Nel blocco ios: { ... }, aggiungi dentro infoPlist:
  CFBundleURLTypes: [
    {
      CFBundleURLSchemes: [REVERSED_CLIENT_ID],
    },
  ],
  ```

  E nel blocco `plugins:` aggiungi:
  ```js
  [
    '@react-native-google-signin/google-signin',
    { iosUrlScheme: REVERSED_CLIENT_ID },
  ],
  'expo-apple-authentication',
  ```

  Il file completo diventa:

  ```js
  const IS_DEV = process.env.APP_VARIANT === 'development'
  const EAS_PROJECT_ID = '29a33dca-0355-455a-aa1a-cf38ba295f27'
  const REVERSED_CLIENT_ID = process.env.REVERSED_CLIENT_ID ?? 'com.googleusercontent.apps.REPLACE_ME'

  module.exports = {
    name: IS_DEV ? 'GPS Tracker (Dev)' : 'GPS Tracker',
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
      'expo-router',
      'expo-updates',
      ['react-native-maps', {
        iosGoogleMapsApiKey: process.env.EXPO_PUBLIC_GOOGLE_MAPS_IOS_KEY ?? '',
        androidGoogleMapsApiKey: process.env.EXPO_PUBLIC_GOOGLE_MAPS_ANDROID_KEY ?? '',
      }],
      'expo-asset',
      ['react-native-ble-plx', {
        isBackgroundEnabled: false,
        modes: [],
        bluetoothAlwaysPermission: 'Allow $(PRODUCT_NAME) to connect to Bluetooth GPS devices',
      }],
      'expo-notifications',
      ['@react-native-google-signin/google-signin', { iosUrlScheme: REVERSED_CLIENT_ID }],
      'expo-apple-authentication',
    ],
    experiments: { typedRoutes: true, newArchEnabled: true },
    ios: {
      bundleIdentifier: IS_DEV ? 'com.nicotomassini.gps-tracker.dev' : 'com.nicotomassini.gps-tracker',
      buildNumber: '1',
      infoPlist: {
        NSLocationWhenInUseUsageDescription: 'GPS Tracker shows your position on the map.',
        NSLocationAlwaysUsageDescription: 'GPS Tracker needs location to track your route.',
        CFBundleURLTypes: [{ CFBundleURLSchemes: [REVERSED_CLIENT_ID] }],
      },
    },
    android: {
      package: IS_DEV ? 'com.nicotomassini.gpstracker.dev' : 'com.nicotomassini.gpstracker',
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
  ```

- [ ] **Step 2: Crea `.env` con le credenziali reali**

  ```bash
  # Crea il file .env nella root del progetto (non committare questo file!)
  cat > /Users/nicolatomassini/30_Progetti_Attivi/lilygo/gps-tracker-app/.env << 'EOF'
  REVERSED_CLIENT_ID=com.googleusercontent.apps.REPLACE_WITH_VALUE_FROM_PLIST
  GOOGLE_WEB_CLIENT_ID=REPLACE_WITH_WEB_CLIENT_ID_FROM_FIREBASE_CONSOLE
  EOF
  ```

- [ ] **Step 3: Aggiungi .env a .gitignore**

  ```bash
  echo '.env' >> /Users/nicolatomassini/30_Progetti_Attivi/lilygo/gps-tracker-app/.gitignore
  ```

- [ ] **Step 4: Commit**

  ```bash
  git add app.config.js .gitignore
  git commit -m "feat: add Google Sign-In URL scheme and expo-apple-authentication plugin"
  ```

---

## Task 4: services/authService.ts

**Files:**
- Create: `services/authService.ts`

- [ ] **Step 1: Crea il file**

  ```ts
  // services/authService.ts
  import auth from '@react-native-firebase/auth'
  import { GoogleSignin } from '@react-native-google-signin/google-signin'
  import * as AppleAuthentication from 'expo-apple-authentication'
  import { Platform } from 'react-native'

  const WEB_CLIENT_ID = process.env.GOOGLE_WEB_CLIENT_ID ?? ''

  GoogleSignin.configure({ webClientId: WEB_CLIENT_ID })

  export async function signInWithGoogle(): Promise<void> {
    await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true })
    const { data } = await GoogleSignin.signIn()
    const credential = auth.GoogleAuthProvider.credential(data?.idToken ?? null)
    await auth().signInWithCredential(credential)
  }

  export async function signInWithApple(): Promise<void> {
    const credential = await AppleAuthentication.signInAsync({
      requestedScopes: [
        AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
        AppleAuthentication.AppleAuthenticationScope.EMAIL,
      ],
    })
    const appleCredential = auth.AppleAuthProvider.credential(
      credential.identityToken!,
      credential.authorizationCode!,
    )
    await auth().signInWithCredential(appleCredential)
  }

  export async function signOut(): Promise<void> {
    try { await GoogleSignin.signOut() } catch {}
    await auth().signOut()
  }

  export function currentUser() {
    return auth().currentUser
  }

  export function isAppleAvailable(): boolean {
    return Platform.OS === 'ios'
  }
  ```

- [ ] **Step 2: Commit**

  ```bash
  git add services/authService.ts
  git commit -m "feat: add Firebase authService with Google and Apple Sign-In"
  ```

---

## Task 5: hooks/useAuth.ts

**Files:**
- Create: `hooks/useAuth.ts`

- [ ] **Step 1: Crea il file**

  ```ts
  // hooks/useAuth.ts
  import { useEffect, useState } from 'react'
  import auth from '@react-native-firebase/auth'
  import type { FirebaseAuthTypes } from '@react-native-firebase/auth'

  // undefined = loading, null = not logged in, User = logged in
  export type AuthState = FirebaseAuthTypes.User | null | undefined

  export function useAuth(): AuthState {
    const [user, setUser] = useState<AuthState>(undefined)

    useEffect(() => {
      const unsub = auth().onAuthStateChanged((u) => setUser(u ?? null))
      return unsub
    }, [])

    return user
  }
  ```

- [ ] **Step 2: Commit**

  ```bash
  git add hooks/useAuth.ts
  git commit -m "feat: add useAuth hook"
  ```

---

## Task 6: app/login.tsx

**Files:**
- Create: `app/login.tsx`

- [ ] **Step 1: Crea il file**

  ```tsx
  // app/login.tsx
  import { useState } from 'react'
  import {
    ActivityIndicator, Image, Platform, Pressable,
    StyleSheet, Text, View,
  } from 'react-native'
  import { SafeAreaView } from 'react-native-safe-area-context'
  import { router } from 'expo-router'
  import { Ionicons } from '@expo/vector-icons'
  import { signInWithGoogle, signInWithApple, isAppleAvailable } from '../services/authService'
  import { C, R, S } from '../constants/design'

  export default function LoginScreen() {
    const [loading, setLoading] = useState<'google' | 'apple' | null>(null)
    const [error, setError] = useState<string | null>(null)

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
        <View style={st.top}>
          <View style={st.iconWrap}>
            <Ionicons name="navigate-circle" size={56} color={C.accent} />
          </View>
          <Text style={st.title}>GPS Tracker</Text>
          <Text style={st.sub}>
            Accedi per tracciare i tuoi dispositivi{'\n'}da qualsiasi luogo, in tempo reale.
          </Text>
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
              <ActivityIndicator color="#1C1C1E" />
            ) : (
              <>
                <Ionicons name="logo-google" size={18} color="#1C1C1E" />
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
            {'\n'}Nessuna carta di credito richiesta per il trial.
          </Text>
        </View>
      </SafeAreaView>
    )
  }

  const st = StyleSheet.create({
    root: { flex: 1, backgroundColor: C.bg, justifyContent: 'space-between' },

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
    title: {
      fontSize: 32,
      fontWeight: '700',
      color: C.text1,
      letterSpacing: -0.5,
    },
    sub: {
      fontSize: 16,
      color: C.text2,
      textAlign: 'center',
      lineHeight: 22,
    },

    buttons: {
      paddingHorizontal: S.lg,
      paddingBottom: S.xl,
      gap: S.sm,
    },
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

    errorBanner: {
      backgroundColor: '#FEE2E2',
      borderRadius: R.md,
      padding: 12,
    },
    errorText: { fontSize: 14, color: '#B91C1C', textAlign: 'center' },

    legal: {
      fontSize: 11,
      color: C.text3,
      textAlign: 'center',
      lineHeight: 16,
      marginTop: S.sm,
    },
  })
  ```

- [ ] **Step 2: Commit**

  ```bash
  git add app/login.tsx
  git commit -m "feat: add login screen with Google and Apple Sign-In"
  ```

---

## Task 7: services/deviceService.ts

**Files:**
- Create: `services/deviceService.ts`

Il subscription model è **per-dispositivo GPS**: ogni tracker ha un trial di 14 giorni dalla prima associazione, poi richiede un piano Pro.

- [ ] **Step 1: Crea il file**

  ```ts
  // services/deviceService.ts
  import firestore from '@react-native-firebase/firestore'
  import auth from '@react-native-firebase/auth'

  export interface DeviceInfo {
    id: string
    name: string
    ownerId: string
    createdAt: number        // unix ms
    lastSeen: number | null
    subscription: {
      plan: 'free' | 'pro'
      trialEnd: number       // unix ms — 14 giorni dalla claim
      expiresAt: number | null  // null = abbonamento attivo gestito da Stripe
      stripeSubscriptionId: string | null
    }
  }

  const TRIAL_DAYS = 14
  const MS_PER_DAY = 86_400_000

  export async function claimDevice(deviceId: string, name: string): Promise<void> {
    const uid = auth().currentUser?.uid
    if (!uid) throw new Error('Not authenticated')

    const existing = await firestore().collection('devices').doc(deviceId).get()
    if (existing.exists) {
      const data = existing.data()!
      if (data.ownerId !== uid) throw new Error('Device già associato a un altro account')
      return // already claimed by this user — no-op
    }

    const now = Date.now()
    await firestore().collection('devices').doc(deviceId).set({
      ownerId: uid,
      name,
      createdAt: now,
      lastSeen: null,
      subscription: {
        plan: 'free',
        trialEnd: now + TRIAL_DAYS * MS_PER_DAY,
        expiresAt: null,
        stripeSubscriptionId: null,
      },
    })
  }

  export async function isDeviceClaimed(deviceId: string): Promise<{ claimed: boolean; isOwner: boolean }> {
    const doc = await firestore().collection('devices').doc(deviceId).get()
    if (!doc.exists) return { claimed: false, isOwner: false }
    const uid = auth().currentUser?.uid
    return { claimed: true, isOwner: doc.data()!.ownerId === uid }
  }

  export async function listUserDevices(): Promise<DeviceInfo[]> {
    const uid = auth().currentUser?.uid
    if (!uid) return []
    const snap = await firestore()
      .collection('devices')
      .where('ownerId', '==', uid)
      .orderBy('createdAt', 'desc')
      .get()
    return snap.docs.map((d) => ({ id: d.id, ...d.data() } as DeviceInfo))
  }

  export function getTrialStatus(device: DeviceInfo): {
    isTrialActive: boolean
    isProActive: boolean
    daysLeft: number
    needsSubscription: boolean
  } {
    const now = Date.now()
    const isProActive = device.subscription.plan === 'pro' &&
      (device.subscription.expiresAt === null || device.subscription.expiresAt > now)
    const isTrialActive = !isProActive && device.subscription.trialEnd > now
    const daysLeft = Math.max(0, Math.ceil((device.subscription.trialEnd - now) / MS_PER_DAY))
    return {
      isTrialActive,
      isProActive,
      daysLeft,
      needsSubscription: !isTrialActive && !isProActive,
    }
  }

  export async function updateDeviceName(deviceId: string, name: string): Promise<void> {
    const uid = auth().currentUser?.uid
    if (!uid) throw new Error('Not authenticated')
    await firestore().collection('devices').doc(deviceId).update({ name })
  }

  export async function touchLastSeen(deviceId: string): Promise<void> {
    try {
      await firestore().collection('devices').doc(deviceId).update({ lastSeen: Date.now() })
    } catch {}
  }
  ```

- [ ] **Step 2: Commit**

  ```bash
  git add services/deviceService.ts
  git commit -m "feat: add deviceService with per-device subscription model and 14-day trial"
  ```

---

## Task 8: services/firebaseBackend.ts — riscrittura con import statici

**Files:**
- Modify: `services/firebaseBackend.ts`

- [ ] **Step 1: Riscrivi il file**

  ```ts
  // services/firebaseBackend.ts
  import database from '@react-native-firebase/database'
  import firestore from '@react-native-firebase/firestore'
  import type { TrackerBackend, LiveData, Session } from './backendService'
  import type { TrackPoint } from '../types'

  export class FirebaseBackend implements TrackerBackend {
    subscribeToLive(deviceId: string, cb: (data: LiveData) => void): () => void {
      const ref = database().ref(`/devices/${deviceId}/live`)
      const handler = (snap: any) => {
        const val = snap.val()
        if (val) cb(val as LiveData)
      }
      ref.on('value', handler)
      return () => ref.off('value', handler)
    }

    async listSessions(deviceId: string, limit: number): Promise<Session[]> {
      try {
        const snap = await firestore()
          .collection('sessions')
          .doc(deviceId)
          .collection('items')
          .orderBy('startTime', 'desc')
          .limit(limit)
          .get()
        return snap.docs.map((d) => ({ id: d.id, deviceId, ...d.data() } as Session))
      } catch { return [] }
    }

    async getSessionPoints(sessionId: string, deviceId: string): Promise<TrackPoint[]> {
      try {
        const snap = await firestore()
          .collection('sessions')
          .doc(deviceId)
          .collection('items')
          .doc(sessionId)
          .collection('points')
          .orderBy('ts', 'asc')
          .get()
        return snap.docs.map((d) => {
          const p = d.data()
          return { lat: p.lat, lon: p.lon }
        })
      } catch { return [] }
    }
  }
  ```

- [ ] **Step 2: Commit**

  ```bash
  git add services/firebaseBackend.ts
  git commit -m "refactor: rewrite firebaseBackend with static imports"
  ```

---

## Task 9: services/backendService.ts — aggiungi modalità Firebase

**Files:**
- Modify: `services/backendService.ts`

- [ ] **Step 1: Modifica il file**

  ```ts
  // services/backendService.ts
  import type { TrackPoint } from '../types'

  export interface LiveData {
    lat: number
    lon: number
    speed: number
    alt: number
    ts: number
    bat_mv: number
    power_mode: string
  }

  export interface Session {
    id: string
    deviceId: string
    startTime: number
    endTime?: number
    distance_km?: number
    maxSpeed_kmh?: number
    avgSpeed_kmh?: number
    pointCount?: number
  }

  export interface TrackerBackend {
    subscribeToLive(deviceId: string, cb: (data: LiveData) => void): () => void
    listSessions(deviceId: string, limit: number): Promise<Session[]>
    getSessionPoints(sessionId: string, deviceId: string): Promise<TrackPoint[]>
  }

  let _instance: TrackerBackend | null = null
  let _url = ''
  let _firebaseMode = false

  export function setFirebaseMode(enabled: boolean): void {
    if (_firebaseMode === enabled) return
    _firebaseMode = enabled
    _instance = null   // reset cache so next call picks the right backend
  }

  export async function getBackend(): Promise<TrackerBackend> {
    if (_instance) return _instance
    if (_firebaseMode) {
      const { FirebaseBackend } = await import('./firebaseBackend')
      _instance = new FirebaseBackend()
    } else {
      const { HttpBackend } = await import('./httpBackend')
      _instance = new HttpBackend(_url)
    }
    return _instance
  }

  export async function setBackendUrl(url: string): Promise<void> {
    _url = url
    _instance = null
    try {
      const AS = require('@react-native-async-storage/async-storage').default
      await AS?.setItem('BACKEND_URL', url)
    } catch {}
  }

  export async function loadBackendUrl(): Promise<void> {
    try {
      const AS = require('@react-native-async-storage/async-storage').default
      const saved = await AS?.getItem('BACKEND_URL')
      if (saved) _url = saved
    } catch {}
  }
  ```

- [ ] **Step 2: Commit**

  ```bash
  git add services/backendService.ts
  git commit -m "feat: add setFirebaseMode to backendService"
  ```

---

## Task 10: app/_layout.tsx — aggiungi route login e inizializza Firebase mode

**Files:**
- Modify: `app/_layout.tsx`

- [ ] **Step 1: Modifica il file**

  ```tsx
  // app/_layout.tsx
  import { useEffect, useRef } from 'react'
  import { Alert, Linking, Platform } from 'react-native'
  import { Stack, router, usePathname } from 'expo-router'
  import * as Notifications from 'expo-notifications'
  import { bleManager, BleState } from '../services/bleService'
  import { getLastDevice } from '../services/bleCache'
  import { requestProximityPermissions } from '../services/proximityService'
  import { setFirebaseMode } from '../services/backendService'
  import { useAuth } from '../hooks/useAuth'

  export default function RootLayout() {
    const autoConnectDone = useRef(false)
    const pathname = usePathname()
    const user = useAuth()

    // Sincronizza Firebase mode con stato auth
    useEffect(() => {
      if (user === undefined) return   // ancora in loading
      setFirebaseMode(user !== null)
    }, [user])

    useEffect(() => {
      if (!bleManager) return
      const sub = bleManager.onStateChange((state) => {
        if (state === BleState.PoweredOn && !autoConnectDone.current) {
          autoConnectDone.current = true
          getLastDevice().then((id) => {
            if (id && pathname === '/') {
              router.push(`/tracker?id=${encodeURIComponent(id)}`)
            }
          }).catch(() => {})
        }

        if (state === BleState.PoweredOff) {
          if (Platform.OS === 'android') {
            bleManager.enable().catch(() => {
              Alert.alert('Bluetooth disabilitato', 'Abilita il Bluetooth per connetterti al GPS Tracker.', [{ text: 'OK' }])
            })
          } else {
            Alert.alert(
              'Bluetooth disabilitato',
              'Abilita il Bluetooth nelle Impostazioni per connetterti al GPS Tracker.',
              [
                { text: 'Impostazioni', onPress: () => Linking.openSettings() },
                { text: 'Non ora', style: 'cancel' },
              ]
            )
          }
        }
      }, true)
      return () => sub.remove()
    }, [])

    useEffect(() => {
      requestProximityPermissions().catch(() => {})
    }, [])

    useEffect(() => {
      const sub = Notifications.addNotificationResponseReceivedListener((response) => {
        const data = response.notification.request.content.data as { navigate?: string }
        if (data?.navigate === 'settings') router.push('/settings')
      })
      return () => sub.remove()
    }, [])

    return (
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="login" />
        <Stack.Screen name="tracker" />
        <Stack.Screen name="history" options={{ headerShown: false }} />
        <Stack.Screen name="session" options={{ headerShown: false }} />
        <Stack.Screen
          name="settings"
          options={{ headerShown: true, title: 'Impostazioni', presentation: 'card' }}
        />
      </Stack>
    )
  }
  ```

- [ ] **Step 2: Commit**

  ```bash
  git add app/_layout.tsx
  git commit -m "feat: sync Firebase mode with auth state in _layout"
  ```

---

## Task 11: hooks/useTracker.ts — fallback RTDB quando BLE offline

**Files:**
- Modify: `hooks/useTracker.ts`

- [ ] **Step 1: Modifica il file**

  ```ts
  // hooks/useTracker.ts
  import { useEffect } from 'react'
  import auth from '@react-native-firebase/auth'
  import { bleConnect, bleDisconnect } from '../services/bleService'
  import { connect as wsConnect, disconnect as wsDisconnect } from '../services/wsService'
  import { getBackend } from '../services/backendService'
  import { touchLastSeen } from '../services/deviceService'
  import { useTrackerStore } from '../store/tracker'
  import type { LiveData } from '../services/backendService'

  const IP_RE = /^\d{1,3}(\.\d{1,3}){3}/

  export function useTracker(deviceId: string) {
    const isWifi  = IP_RE.test(deviceId) || deviceId.startsWith('localhost')
    const status  = useTrackerStore((s) => s.status)

    // Connessione BLE / WiFi (canale primario)
    useEffect(() => {
      if (!deviceId) return
      if (isWifi) {
        wsConnect(deviceId)
        return wsDisconnect
      } else {
        bleConnect(deviceId)
        return bleDisconnect
      }
    }, [deviceId])

    // Fallback RTDB: attivo solo quando BLE è disconnesso e utente è loggato
    useEffect(() => {
      if (isWifi || status !== 'disconnected') return
      if (!auth().currentUser) return

      let cancelled = false
      let unsub: (() => void) | null = null

      ;(async () => {
        try {
          const backend = await getBackend()
          if (cancelled) return
          unsub = backend.subscribeToLive(deviceId, (data) => applyLiveData(data))
          useTrackerStore.getState().setRemoteConnected(true)
          touchLastSeen(deviceId).catch(() => {})
        } catch {}
      })()

      return () => {
        cancelled = true
        unsub?.()
        useTrackerStore.getState().setRemoteConnected(false)
      }
    }, [deviceId, status, isWifi])
  }

  function applyLiveData(data: LiveData) {
    const store = useTrackerStore.getState()
    store.setGPS({
      valid: true,
      lat: data.lat,
      lon: data.lon,
      speed: data.speed,
      alt: data.alt,
      heading: 0,
      vsat: 0,
      usat: 0,
      acc: 0,
      hdop: 0,
      time: new Date(data.ts * 1000).toISOString(),
    })
    store.setPower({ mode: data.power_mode as any, bat_mv: data.bat_mv })
  }
  ```

- [ ] **Step 2: Commit**

  ```bash
  git add hooks/useTracker.ts
  git commit -m "feat: add RTDB live fallback in useTracker when BLE offline"
  ```

---

## Task 12: app/index.tsx — sezione dispositivi cloud

**Files:**
- Modify: `app/index.tsx`

Aggiunge una sezione "I miei tracker" in cima alla lista: mostra i device Firestore dell'utente loggato con l'ultimo stato noto. Tap → apre la tracker screen in modalità cloud.

- [ ] **Step 1: Aggiungi la sezione cloud in cima a ListHeader**

  Aggiungi questi import all'inizio di `app/index.tsx`:

  ```tsx
  import { useEffect, useState } from 'react' // useEffect già c'è, aggiungi useState
  import auth from '@react-native-firebase/auth'
  import { listUserDevices, DeviceInfo, getTrialStatus } from '../services/deviceService'
  ```

  Aggiungi questo hook dentro `DiscoveryScreen`:

  ```tsx
  const [cloudDevices, setCloudDevices] = useState<DeviceInfo[]>([])

  useEffect(() => {
    const unsub = auth().onAuthStateChanged(async (user) => {
      if (user) {
        try {
          const devices = await listUserDevices()
          setCloudDevices(devices)
        } catch {}
      } else {
        setCloudDevices([])
      }
    })
    return unsub
  }, [])
  ```

  Aggiungi questo componente subito prima del `return` finale di `DiscoveryScreen`:

  ```tsx
  const CloudSection = cloudDevices.length > 0 ? (
    <>
      <Text style={st.sectionLabel}>I MIEI TRACKER · {cloudDevices.length}</Text>
      {cloudDevices.map((device, index) => {
        const sub = getTrialStatus(device)
        const isFirst = index === 0
        const isLast  = index === cloudDevices.length - 1
        return (
          <Pressable
            key={device.id}
            style={({ pressed }) => [
              st.deviceRow,
              isFirst && st.rowFirst,
              isLast  && st.rowLast,
              pressed && st.pressed,
            ]}
            onPress={() => router.push(`/tracker?id=${encodeURIComponent(device.id)}`)}
          >
            <View style={[st.iconCircle, { backgroundColor: `${C.accent}12` }]}>
              <Ionicons name="navigate-circle-outline" size={20} color={C.accent} />
            </View>
            <View style={st.rowInfo}>
              <Text style={st.rowTitle}>{device.name}</Text>
              <Text style={st.rowSub} numberOfLines={1}>
                {device.lastSeen
                  ? `Visto ${new Date(device.lastSeen).toLocaleDateString('it-IT')}`
                  : 'Mai connesso via cloud'}
              </Text>
            </View>
            {sub.isTrialActive && (
              <View style={[st.connectPill, { backgroundColor: C.green }]}>
                <Text style={st.connectPillText}>Trial {sub.daysLeft}g</Text>
              </View>
            )}
            {sub.needsSubscription && (
              <View style={[st.connectPill, { backgroundColor: C.orange }]}>
                <Text style={st.connectPillText}>Scaduto</Text>
              </View>
            )}
            <Ionicons name="chevron-forward" size={16} color={C.text3} style={{ marginLeft: 4 }} />
          </Pressable>
        )
      })}
    </>
  ) : null
  ```

  Nel `ListHeader`, aggiungi `{CloudSection}` come primo elemento prima dell'Electron banner.

  Aggiungi anche questo bottone in fondo all'header, accanto a quello settings, per il login:

  ```tsx
  {/* Nel header accanto a settings */}
  <Pressable
    style={({ pressed }) => [st.iconBtn, pressed && { opacity: 0.6 }]}
    onPress={() => {
      const user = auth().currentUser
      user ? router.push('/settings') : router.push('/login')
    }}
    hitSlop={10}
  >
    <Ionicons
      name={auth().currentUser ? 'person-circle-outline' : 'person-circle'}
      size={22}
      color={auth().currentUser ? C.accent : C.text2}
    />
  </Pressable>
  ```

- [ ] **Step 2: Commit**

  ```bash
  git add app/index.tsx
  git commit -m "feat: show cloud devices section in discovery screen"
  ```

---

## Task 13: components/SettingsPanel.tsx — sezione account + trial status

**Files:**
- Modify: `components/SettingsPanel.tsx`

Aggiunge sezione ACCOUNT in fondo: email dell'utente, status del trial/abbonamento per il device corrente, pulsante logout.

- [ ] **Step 1: Aggiungi import e logica**

  Aggiungi questi import in cima a `SettingsPanel.tsx`:

  ```tsx
  import { useEffect, useState } from 'react'
  import auth from '@react-native-firebase/auth'
  import { router } from 'expo-router'
  import { signOut } from '../services/authService'
  import { isDeviceClaimed, listUserDevices, getTrialStatus, DeviceInfo } from '../services/deviceService'
  ```

  Aggiungi questi hook dentro `SettingsPanel`:

  ```tsx
  const [userEmail, setUserEmail]       = useState<string | null>(null)
  const [deviceInfo, setDeviceInfo]     = useState<DeviceInfo | null>(null)
  const [claimVisible, setClaimVisible] = useState(false)
  const [claimName, setClaimName]       = useState('')
  const [claiming, setClaiming]         = useState(false)

  useEffect(() => {
    const unsub = auth().onAuthStateChanged(async (user) => {
      setUserEmail(user?.email ?? null)
      if (user && deviceId) {
        try {
          const devices = await listUserDevices()
          const found = devices.find((d) => d.id === deviceId)
          setDeviceInfo(found ?? null)
        } catch {}
      }
    })
    return unsub
  }, [deviceId])
  ```

- [ ] **Step 2: Aggiungi la sezione ACCOUNT nella ScrollView**

  Prima di `<View style={{ height: S.xl }} />` alla fine del `ScrollView`, aggiungi:

  ```tsx
  {/* ─── Account ──────────────────────────────────────────────────────── */}
  <SectionLabel title="ACCOUNT" />
  {userEmail ? (
    <Card>
      <InfoRow label="Email" value={userEmail} />
      {deviceInfo && (() => {
        const sub = getTrialStatus(deviceInfo)
        return (
          <>
            <Sep />
            <InfoRow
              label="Piano tracker"
              value={sub.isProActive ? 'Pro attivo' : sub.isTrialActive ? `Trial · ${sub.daysLeft} giorni` : 'Scaduto'}
              accent={sub.isProActive || sub.isTrialActive}
            />
          </>
        )
      })()}
      {connected && !deviceInfo && (
        <>
          <Sep />
          <Pressable
            style={styles.actionRow}
            onPress={() => setClaimVisible(true)}
          >
            <Text style={[styles.actionLabel, { color: C.accent }]}>
              Associa questo tracker all'account
            </Text>
          </Pressable>
        </>
      )}
      <Sep />
      <Pressable
        style={styles.actionRow}
        onPress={async () => {
          await signOut()
          router.replace('/login')
        }}
      >
        <Text style={[styles.actionLabel, { color: C.red }]}>Esci dall'account</Text>
      </Pressable>
    </Card>
  ) : (
    <Pressable
      style={[styles.applyBtn, { backgroundColor: C.text1 }]}
      onPress={() => router.push('/login')}
    >
      <Text style={styles.applyBtnText}>Accedi per il tracking cloud</Text>
    </Pressable>
  )}
  ```

  Aggiungi anche l'import di `TextInput` se non presente (già c'è) e `router`:

  ```tsx
  import { router } from 'expo-router'
  ```

- [ ] **Step 3: Commit**

  ```bash
  git add components/SettingsPanel.tsx
  git commit -m "feat: add account section in SettingsPanel with trial status"
  ```

---

## Task 14: Firestore + RTDB security rules

**Files:**
- Create: `firestore.rules`
- Create: `database.rules.json`

- [ ] **Step 1: Crea firestore.rules**

  ```
  rules_version = '2';
  service cloud.firestore {
    match /databases/{database}/documents {

      match /users/{uid} {
        allow read, write: if request.auth != null && request.auth.uid == uid;
      }

      match /devices/{deviceId} {
        allow read:   if request.auth != null && resource.data.ownerId == request.auth.uid;
        allow create: if request.auth != null && request.resource.data.ownerId == request.auth.uid;
        allow update: if request.auth != null && resource.data.ownerId == request.auth.uid;
        allow delete: if request.auth != null && resource.data.ownerId == request.auth.uid;

        match /items/{sessionId} {
          allow read, write: if request.auth != null &&
            get(/databases/$(database)/documents/devices/$(deviceId)).data.ownerId == request.auth.uid;

          match /points/{pointId} {
            allow read, write: if request.auth != null &&
              get(/databases/$(database)/documents/devices/$(deviceId)).data.ownerId == request.auth.uid;
          }
        }
      }
    }
  }
  ```

- [ ] **Step 2: Crea database.rules.json**

  ```json
  {
    "rules": {
      "devices": {
        "$deviceId": {
          "live": {
            ".read":  "auth != null",
            ".write": "auth != null"
          }
        }
      }
    }
  }
  ```

  Carica manualmente queste regole in Firebase console:
  - Firestore → Regole → incolla `firestore.rules` → Pubblica
  - Realtime Database → Regole → incolla il JSON di `database.rules.json` → Pubblica

- [ ] **Step 3: Commit**

  ```bash
  git add firestore.rules database.rules.json
  git commit -m "feat: add Firestore and RTDB security rules"
  ```

---

## Task 15: pod install finale + build test

- [ ] **Step 1: Pod install per includere nuovi pacchetti nativi**

  ```bash
  cd /Users/nicolatomassini/30_Progetti_Attivi/lilygo/gps-tracker-app/ios && pod install
  ```

  Expected: `Pod installation complete!` — nessun errore Reanimated/worklets.

- [ ] **Step 2: Build e run sul device**

  ```bash
  cd /Users/nicolatomassini/30_Progetti_Attivi/lilygo/gps-tracker-app
  npx expo run:ios --device "Nico"
  ```

  Expected: app compila e si lancia senza crash.

- [ ] **Step 3: Test manuale del flow**

  1. Apri l'app → schermata Dispositivi
  2. Tap sull'icona account (in alto a destra) → va a /login
  3. Tap "Continua con Google" → autenticazione Google
  4. Ritorna a Dispositivi → sezione "I miei tracker" vuota ma visibile
  5. Connetti il tracker via BLE → entra in tracker screen
  6. Vai in Settings → sezione ACCOUNT mostra email + "Associa questo tracker all'account"
  7. Tap "Associa" → device compare in "I miei tracker"

---

## Self-Review

**Spec coverage:**
- ✓ Firebase Auth (Google + Apple) → Task 4, 5, 6
- ✓ Device claiming con trial 14 giorni → Task 7
- ✓ Per-device subscription schema → Task 7 (DeviceInfo.subscription)
- ✓ RTDB live fallback → Task 8, 9, 11
- ✓ FirebaseBackend static imports → Task 8
- ✓ setFirebaseMode in backendService → Task 9
- ✓ Auth mode sync in _layout → Task 10
- ✓ Cloud devices in index.tsx → Task 12
- ✓ Account section in Settings → Task 13
- ✓ Security rules → Task 14

**Placeholder scan:** nessun TBD trovato.

**Type consistency:** `DeviceInfo`, `getTrialStatus`, `LiveData` usati coerentemente in tutti i task.
