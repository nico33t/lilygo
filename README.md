# LilyGo T-SIM7080G GPS Tracker

Sistema completo di tracciamento GPS con modello di business SaaS per-dispositivo.
Firmware ESP32-S3 + app mobile iOS/Android + backend Firebase + monetizzazione Stripe.

```
┌─────────────────────┐        BLE / WiFi         ┌──────────────────────────┐
│  LilyGo T-SIM7080G  │ ◄──────────────────────► │  GPS Tracker App          │
│  ESP32-S3 firmware  │                            │  iOS / Android            │
│  GPS · SIM · PMU    │        LTE-M / NB-IoT      │  Auth · Map · Sessions    │
└─────────────────────┘ ──────────────────────────► Firebase RTDB / Firestore  │
                                                    └──────────────────────────┘
```

---

## Modello di business

> **€5.99/mese per tracker · 14 giorni gratis · nessun account richiesto per iniziare**

### Come funziona

1. L'utente acquista il tracker (hardware, margine ~€15–25 per unità)
2. Apre l'app → scansiona via BLE → associa il dispositivo al proprio account
3. Trial gratuito 14 giorni (nessuna carta di credito richiesta)
4. Allo scadere del trial: sblocca il cloud tracking con €5.99/mese
5. La sottoscrizione è per dispositivo, non per account → chi ha 3 tracker paga 3×€5.99

### Perché per dispositivo e non per utente

- Il valore percepito è "tracciare questo tracker" non "avere un account"
- Resistente al multi-utente gratuito (1 account per 10 tracker)
- Scalabilità lineare: più tracker → più MRR automaticamente
- Facilmente vendibile come "attiva il cloud" in un click

### Proiezione ricavi (scenario conservativo)

| Mese | Tracker attivi | Conversione trial→paid | MRR lordo | Costi infrastruttura | MRR netto |
|------|---------------|----------------------|-----------|---------------------|-----------|
| 1    | 30            | 40%                  | €72       | ~€5                 | ~€67      |
| 3    | 80            | 45%                  | €215      | ~€8                 | ~€207     |
| 6    | 180           | 50%                  | €539      | ~€15                | ~€524     |
| 12   | 350           | 55%                  | €1,152    | ~€25                | ~€1,127   |
| 18   | 600           | 60%                  | €2,156    | ~€40                | ~€2,116   |

La soglia di €1,000/mese netti si raggiunge intorno al mese 12 con ~350 tracker attivi.

### Struttura dei costi

| Voce | Costo | Note |
|------|-------|------|
| Firebase Spark (free tier) | €0 | Fino a ~50k letture/giorno |
| Firebase Blaze (pay-as-you-go) | ~€0.06/100k letture | Scala automaticamente |
| SIM IoT (1NCE) | €0.08/tracker/mese | €10 una tantum per 500 MB = ~10 anni di uso tipico |
| Stripe commissioni | 1.5% + €0.25/transazione | ~€0.34 per sub €5.99 |
| Apple/Google store | 15–30% | Solo su acquisti in-app (se route App Store) |
| Hosting OTA firmware | ~€3/mese | S3 o equivalente |
| **Totale per 350 tracker** | **~€25/mese fissi** | Resto completamente variabile |

**Il costo della SIM è il punto di forza competitivo**: 1NCE offre €10 una tantum per 500 MB di dati, validi 10 anni. Per un tracker GPS che invia ~1 KB ogni 5 secondi quando in movimento, 500 MB durano circa 700 ore di movimento attivo — verosimilmente 10+ anni di uso reale.

### Analisi competitiva

| Prodotto | Prezzo mensile | Hardware | BLE + SIM | Open source |
|----------|--------------|---------|-----------|-------------|
| **GPS Tracker (questo)** | **€5.99/dispositivo** | **€35–50** | **sì** | **sì** |
| Traccar (cloud) | €5–20/dispositivo | qualsiasi | no | client sì |
| Bouncie | $8/veicolo | $67 hardware | no | no |
| MOTOsafety | $12.99/mese | $0 hardware | no | no |
| Optimus 2.0 | $19.95/mese | $0 hardware | no | no |

Vantaggio differenziale: **BLE locale** (funziona senza SIM, senza internet, senza abbonamento) + **SIM integrata** (tracking cloud quando necessario) + **costo SIM trasparente** comunicato all'utente.

### Canali di distribuzione

1. **Diretta web** (margine massimo): shop online con hardware + attivazione cloud
2. **Amazon** (volume): FBA con listing, rinuncia al 15% ma riduce attrito d'acquisto
3. **B2B / flotte**: aziende con 10+ veicoli, contratto annuale con sconto 20%
4. **White label**: OEM del firmware per altre aziende (licenza una tantum €2,000–5,000 + royalty)

### Piano operativo a 12 mesi

| Trimestre | Obiettivo | Azione |
|-----------|-----------|--------|
| Q1 | MVP + prime 30 vendite | Listino Amazon, social niche (moto, auto d'epoca) |
| Q2 | 100 tracker attivi | Referral program (1 mese gratis per ogni amico) |
| Q3 | Break-even infrastruttura + B2B primo contratto | Outreach flotte PMI |
| Q4 | €1,000/mese netti | Geofencing (sub Pro €9.99), notifiche avanzate |

### Upsell: Piano Pro (€9.99/mese)

- Geofencing illimitato con alert real-time
- Storico sessioni illimitato (free: 30 giorni)
- Export GPX/CSV
- API access per integrazioni custom
- Supporto prioritario

Con il 30% dei paid che upgradano a Pro: ricavo aggiuntivo di €1.00/tracker/mese in media, senza costi aggiuntivi di infrastruttura significativi.

---

## Hardware

| Componente | Dettaglio |
|---|---|
| Board | LilyGo T-SIM7080G |
| MCU | ESP32-S3 (dual-core 240 MHz, 16 MB Flash) |
| Modem | SIMCOM SIM7080G (NB-IoT / LTE-M / GPS integrato) |
| PMU | AXP2101 |
| Connettore alimentazione | USB-C oppure 12 V tramite divisore resistivo su GPIO 34 |
| SIM consigliata | 1NCE (€10 una tantum, 500 MB / 10 anni) |

### Pin principali

| Segnale | GPIO |
|---|---|
| MODEM TX | 5 |
| MODEM RX | 4 |
| MODEM PWR | 41 |
| I2C SDA | 15 |
| I2C SCL | 7 |
| 12 V ADC | 34 |

---

## Funzionalità firmware

| Modulo | Descrizione |
|---|---|
| **GPS** | Fix NMEA via AT commands; workaround bug B16; heading (course over ground); timestamp UTC reale |
| **BLE** | GATT service Nordic UART; notify JSON chunked via raw NimBLE C API; MTU adattivo; iBeacon advertising |
| **WiFi** | Access Point `GPS-Tracker` + WebSocket (porta 81) per debug |
| **SIM** | AT+CCID / AT+COPS? / AT+CSQ / AT+CPSI? — operatore, ICCID, RSSI, tipo rete |
| **Power** | State machine: VEHICLE → MOVING → IDLE → PARKED (deep sleep 15 min) |
| **Remote** | HTTP PUT LTE-M verso Firebase RTDB; live position + sessioni con timestamp GPS reale |
| **Session** | Sessioni automatiche (avvio a >3 km/h, fine dopo 5 min fermi); distanza haversine |
| **OTA** | Aggiornamento firmware via HTTPS; SHA-256 verification; rollback automatico |

### State machine risparmio batteria

```
12V ADC > 1.5 V ──► VEHICLE  (GPS 2 s  / send 5 s)
speed > 5 km/h  ──► MOVING   (GPS 5 s  / send 10 s)
fermo > 3 min   ──► IDLE     (GPS 60 s / send 5 min)
fermo > 15 min  ──► PARKED   (deep sleep 15 min, poi wakeup GPS + send)
```

### Schema dati RTDB (Firebase Realtime Database)

```
/devices/{deviceId}/live
  → { lat, lon, speed, alt, heading, bat_mv, power_mode, ts }   (aggiornato ogni ~5s)

/sessions/{deviceId}/{sessionId}/start_time   → unix timestamp (PUT)
/sessions/{deviceId}/{sessionId}/end_time     → unix timestamp (PUT)
/sessions/{deviceId}/{sessionId}/stats        → { distance_km, max_speed_kmh, avg_speed_kmh, start_time }
/sessions/{deviceId}/{sessionId}/points/{ts}  → { lat, lon, speed, alt, ts }
```

### Comandi BLE (JSON → RX characteristic)

```json
{ "cmd": "get_config" }
{ "cmd": "set_interval",      "value": 2000 }
{ "cmd": "set_gnss_mode",     "value": 0 }
{ "cmd": "restart_gps" }
{ "cmd": "set_backend_url",   "value": "https://<project-id>-default-rtdb.europe-west1.firebasedatabase.app" }
{ "cmd": "set_backend_token", "value": "<firebase-database-secret>" }
{ "cmd": "set_ota_url",       "value": "https://..." }
{ "cmd": "start_ota" }
{ "cmd": "set_power_mode",    "value": "MOVING" }
```

### Messaggi BLE in uscita (JSON ← TX characteristic)

```json
{ "type": "gps",    "lat": 45.123, "lon": 9.456, "speed": 42.1, "alt": 120, "heading": 270.5, ... }
{ "type": "sim",    "op": "1NCE", "rssi": -73, "iccid": "...", "reg": true, "net": "LTE-M" }
{ "type": "power",  "mode": "MOVING", "bat_mv": 3820 }
{ "type": "config", "interval_ms": 2000, "gnss_mode": 0 }
{ "type": "ota",    "available": true, "version": "0.2.0", "changelog": "..." }
```

---

## Struttura firmware

```
gps-tracker-firmware/
├── platformio.ini
└── src/
    ├── main.cpp          — setup/loop, BLE, WiFi, AT commands, dispatch comandi
    ├── firmware_config.h — versione, URL OTA, URL backend, pin ADC
    ├── power.h / .cpp    — state machine risparmio batteria, deep sleep
    ├── remote.h / .cpp   — HTTP PUT LTE-M verso Firebase RTDB; unix timestamp da GPS
    ├── session.h / .cpp  — rilevamento sessioni di guida, distanza haversine
    ├── ota.h / .cpp      — OTA via HTTPS, SHA-256, rollback
    ├── utilities.h       — definizioni pin
    └── web_ui.h          — dashboard HTML/JS inline (debug WiFi)
```

### Build e flash

```bash
cd gps-tracker-firmware
pio run -t upload
```

Monitor seriale:

```bash
pio device monitor
```

---

## App mobile

React Native + Expo Managed Workflow. iOS e Android da un unico codebase.

### Funzionalità

- Connessione BLE (auto-reconnect) o WiFi (WebSocket) — funziona senza internet
- Cloud tracking via Firebase quando SIM attiva
- Login Google / Apple (opzionale — BLE funziona sempre senza account)
- Associazione dispositivo + trial 14 giorni gratuiti
- Mappa live Google Maps con heading e traccia percorso (animazione callout)
- Ultima posizione nota quando BLE non è in range
- Pannello stato: GPS, SIM, batteria, modalità power
- Storico sessioni con replay su mappa
- Impostazioni: intervallo GPS, modalità GNSS, riavvio GPS, backend URL/token
- Aggiornamento firmware OTA con barra di avanzamento
- Allarme prossimità BLE: notifica push se il tracker esce dal range
- iBeacon: il tracker pubblica un beacon UUID per rilevamento in background

### Struttura app

```
gps-tracker-app/
├── app/
│   ├── _layout.tsx       — root layout, auth listener, Firebase mode switch
│   ├── index.tsx         — home: BLE scan + cloud devices list
│   ├── login.tsx         — Google / Apple Sign-In + value prop
│   ├── tracker.tsx       — mappa live + status panel
│   ├── history.tsx       — lista sessioni
│   ├── session.tsx       — replay sessione su mappa
│   └── settings.tsx      — impostazioni dispositivo
├── components/
│   ├── GPSMap/           — mappa con callout animato, heading, polyline
│   ├── Icons/            — set tipizzato di icone (AppIconName semantici)
│   ├── StatusPanel.tsx   — dati GPS, SIM, batteria
│   ├── SettingsPanel.tsx — sezioni card, slider, OTA, account/abbonamento
│   └── SessionCard.tsx   — card sessione nella lista storico
├── services/
│   ├── bleService.ts       — BLE connect/disconnect/send/parse
│   ├── wsService.ts        — WebSocket (modalità WiFi)
│   ├── authService.ts      — Google Sign-In + Apple Sign-In + signOut
│   ├── deviceService.ts    — claimDevice, getTrialStatus, listUserDevices
│   ├── backendService.ts   — interfaccia TrackerBackend + factory + setFirebaseMode
│   ├── firebaseBackend.ts  — Firebase RTDB live + sessioni
│   ├── httpBackend.ts      — REST server generico
│   └── proximityService.ts — allarme BLE + notifiche push
├── hooks/
│   ├── useTracker.ts     — lifecycle BLE / WiFi + fallback RTDB
│   └── useAuth.ts        — Firebase Auth state listener
├── store/tracker.ts      — stato globale Zustand
├── plugins/
│   ├── withGoogleServicesFile.js — copia GoogleService-Info.plist dopo ogni prebuild
│   └── withModularHeaders.js     — inietta use_modular_headers! nel Podfile
└── types/index.ts        — GPSData, SimData, PowerData, OtaStatus, ...
```

### Setup sviluppo

```bash
cd gps-tracker-app
npm install
```

Copia `.env.example` → `.env` e compila i valori:

```env
EXPO_PUBLIC_GOOGLE_MAPS_IOS_KEY=...
EXPO_PUBLIC_GOOGLE_MAPS_ANDROID_KEY=...
REVERSED_CLIENT_ID=com.googleusercontent.apps.<ID>
GOOGLE_WEB_CLIENT_ID=<ID>.apps.googleusercontent.com
```

Scarica `GoogleService-Info.plist` da Firebase Console → mettilo nella root del progetto (non in `ios/`).

```bash
npx expo run:ios --device "NomeDispositivo"
```

Build produzione via EAS:

```bash
eas build --platform ios --profile production
eas build --platform android --profile production
```

---

## Setup Firebase

### 1. Crea il progetto

1. [Firebase Console](https://console.firebase.google.com) → Nuovo progetto
2. Aggiungi app iOS (bundle ID: `com.nicotomassini.gps-tracker`) e Android
3. Scarica `GoogleService-Info.plist` → mettilo nella root del repo

### 2. Abilita Authentication

Console → Authentication → Sign-in method → abilita Google e Apple

### 3. Crea Realtime Database

Console → Realtime Database → Crea database in modalità test → poi applica le regole:

```json
{
  "rules": {
    "devices": {
      "$deviceId": {
        "live": { ".read": "auth != null", ".write": "auth != null" }
      }
    },
    "sessions": {
      "$deviceId": { ".read": "auth != null", ".write": "auth != null" }
    }
  }
}
```

### 4. Crea Firestore

Console → Firestore → Crea database → poi applica le regole da `firestore.rules`

### 5. Configura il firmware

Una volta acquistata la SIM e configurato il tracker, invia via BLE:

```json
{ "cmd": "set_backend_url",   "value": "https://<project-id>-default-rtdb.europe-west1.firebasedatabase.app" }
{ "cmd": "set_backend_token", "value": "<firebase-database-secret>" }
```

Il `database secret` si trova in Firebase Console → Project settings → Service accounts → Database secrets.

---

## Bug noto — Firmware B16

Il firmware `1951B16SIM7080` (preinstallato) ha un bug che impedisce al GPS di dichiarare il fix anche quando le coordinate sono valide.

**Workaround**: la posizione viene accettata se `lat/lon ≠ 0`, indipendentemente dal flag fix. Le posizioni con `stored: true` vengono mostrate in arancione nell'app.

**Soluzione definitiva**: downgrade a `1951B08SIM7080` tramite `qdl v1.58` (solo Windows). Vedi [issue #144](https://github.com/Xinyuan-LilyGO/LilyGo-T-SIM7080G/issues/144).

---

## Note GPS

- Cold start: 5–10 minuti all'aperto con cielo libero
- GPS e cellular non possono funzionare contemporaneamente (limitazione SIM7080G) — il firmware li alterna automaticamente
- Antenna patch sul PCB: orientare il board con il lato antenna verso il cielo
- Con SIM 1NCE: l'APN è preconfigurato sul chip, nessuna modifica necessaria
