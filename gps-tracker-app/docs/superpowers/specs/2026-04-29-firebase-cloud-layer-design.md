# Firebase Cloud Layer — Design Spec (Sub-project A)

**Goal:** Aggiungere autenticazione utente, live tracking via SIM e history su cloud, mantenendo la connessione BLE come canale primario quando disponibile.

**Architecture:** Firebase Auth (Google + Apple) per account utenti. Realtime Database per dati GPS live che il firmware pusha via SIM. Firestore per device ownership e session history. Il backend service esistente viene esteso con FirebaseBackend già parzialmente scritto.

**Tech Stack:** @react-native-firebase/app, auth, database, firestore · @react-native-google-signin/google-signin · expo-apple-authentication · Firebase Security Rules

---

## Scope

Questo spec copre solo **Sub-progetto A**. Non include:
- Pagamenti (Stripe) → Sub-progetto C
- Web dashboard → Sub-progetto D
- Firmware cloud reporting (push via SIM) → Sub-progetto B, dipende da questo

---

## Data Model

### Firestore

```
users/{uid}
  email: string
  displayName: string
  createdAt: Timestamp
  plan: 'free' | 'pro'          // per billing futuro

devices/{deviceId}
  ownerId: string               // uid Firebase
  name: string                  // "La mia moto"
  createdAt: Timestamp
  lastSeen: Timestamp | null

sessions/{deviceId}/items/{sessionId}
  startTime: number             // unix seconds
  endTime: number | null
  distance_km: number
  maxSpeed_kmh: number
  avgSpeed_kmh: number
  pointCount: number
  subcollection: points/{n}
    lat: number
    lon: number
    ts: number
```

### Realtime Database

```
/devices/{deviceId}/live
  lat: number
  lon: number
  speed: number
  alt: number
  heading: number
  bat_mv: number
  power_mode: string
  ts: number
  valid: boolean
```

---

## Security Rules

### Firestore
```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /users/{uid} {
      allow read, write: if request.auth.uid == uid;
    }
    match /devices/{deviceId} {
      allow read, write: if request.auth.uid == resource.data.ownerId;
      allow create: if request.auth != null;
      match /items/{session} {
        allow read, write: if request.auth.uid ==
          get(/databases/$(database)/documents/devices/$(deviceId)).data.ownerId;
        match /points/{pt} {
          allow read, write: if request.auth.uid ==
            get(/databases/$(database)/documents/devices/$(deviceId)).data.ownerId;
        }
      }
    }
  }
}
```

### RTDB
```json
{
  "rules": {
    "devices": {
      "$deviceId": {
        "live": {
          ".read": "auth != null",
          ".write": "auth != null"
        }
      }
    }
  }
}
```
*(Le regole RTDB verranno raffinate in Sub-progetto B quando il firmware scrive direttamente)*

---

## App Flow

### Auth flow
1. `_layout.tsx` controlla `firebase.auth().currentUser` all'avvio
2. Se `null` → naviga a `/login` (nuova schermata)
3. Se presente → procede normalmente
4. Login supportati: Google Sign-In, Apple Sign-In
5. Logout disponibile in Settings

### Device claiming
- Primo collegamento BLE → dialog "Associa questo device al tuo account"
- Conferma → scrive `devices/{macAddress}` con `ownerId: uid`
- Se il device è già associato a un altro account → errore "Device già registrato"

### Live tracking remoto (via RTDB)
- `useTracker` hook: se il dispositivo è offline BLE ma l'utente è loggato,
  sottoscrive RTDB `/devices/{deviceId}/live`
- I dati RTDB aggiornano lo stesso store Zustand → la UI non cambia

### History
- `FirebaseBackend` già scritto legge Firestore sessions
- `backendService.ts` viene aggiornato per usare `FirebaseBackend` quando Auth è presente

---

## Files Touched

| File | Azione |
|---|---|
| `services/firebaseApp.ts` | CREA — init Firebase app singleton |
| `services/authService.ts` | CREA — login/logout/currentUser |
| `services/deviceService.ts` | CREA — claim device, list user devices |
| `services/firebaseBackend.ts` | MODIFICA — completa live RTDB subscription |
| `services/backendService.ts` | MODIFICA — usa FirebaseBackend se auth presente |
| `hooks/useTracker.ts` | MODIFICA — fallback su RTDB quando BLE offline |
| `app/_layout.tsx` | MODIFICA — auth guard, redirect /login |
| `app/login.tsx` | CREA — schermata Google + Apple Sign-In |
| `app/settings.tsx` | MODIFICA — aggiungi logout + info account |
| `app/index.tsx` | MODIFICA — mostra device cloud oltre quelli BLE |
| `firestore.rules` | CREA |
| `database.rules.json` | CREA |
| `google-services.json` | DA AGGIUNGERE manualmente |
| `ios/GoogleService-Info.plist` | DA AGGIUNGERE manualmente |
