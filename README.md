# LilyGo T-SIM7080G GPS Tracker

Sistema completo di tracciamento GPS: firmware ESP32-S3 + app mobile React Native/Expo.

```
┌─────────────────────┐        BLE / WiFi         ┌──────────────────────┐
│  LilyGo T-SIM7080G  │ ◄──────────────────────► │  GPS Tracker App     │
│  ESP32-S3 firmware  │                            │  iOS / Android       │
│  GPS · SIM · PMU    │        LTE-M / NB-IoT      └──────────────────────┘
└─────────────────────┘ ──────────────────────────► Backend (Firebase / REST)
```

---

## Hardware

| Componente | Dettaglio |
|---|---|
| Board | LilyGo T-SIM7080G |
| MCU | ESP32-S3 (dual-core 240 MHz, 16 MB Flash) |
| Modem | SIMCOM SIM7080G (NB-IoT / LTE-M / GPS integrato) |
| PMU | AXP2101 |
| Connettore alimentazione | USB-C oppure 12 V tramite divisore resistivo su GPIO 34 |

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
| **GPS** | Fix NMEA via AT commands; workaround bug B16 (accetta posizione se `lat/lon ≠ 0`) |
| **BLE** | GATT service custom; notify JSON stream, write comandi; iBeacon advertising |
| **WiFi** | Access Point `GPS-Tracker` + WebSocket (porta 81) per debug |
| **SIM** | AT+CCID / AT+COPS? / AT+CSQ / AT+CPSI? — operatore, ICCID, RSSI, tipo rete |
| **Power** | State machine: VEHICLE → MOVING → IDLE → PARKED (deep sleep 15 min) |
| **Remote** | HTTP POST LTE-M verso backend configurabile; posizione live + track points |
| **Session** | Sessioni automatiche (avvio a >3 km/h, fine dopo 5 min fermi) |
| **OTA** | Aggiornamento firmware via HTTPS; SHA-256 verification; rollback automatico |

### State machine risparmio batteria

```
12V ADC > 1.5 V ──► VEHICLE  (GPS 2 s  / send 5 s)
speed > 5 km/h  ──► MOVING   (GPS 5 s  / send 10 s)
fermo > 3 min   ──► IDLE     (GPS 60 s / send 5 min)
fermo > 15 min  ──► PARKED   (deep sleep 15 min, poi wakeup GPS + send)
```

### Comandi BLE (JSON → RX characteristic)

```json
{ "cmd": "get_config" }
{ "cmd": "set_interval",     "value": 2000 }
{ "cmd": "set_gnss_mode",    "value": 0 }        // 0=GPS, 1=GPS+BeiDou
{ "cmd": "restart_gps" }
{ "cmd": "set_backend_url",  "value": "https://..." }
{ "cmd": "set_backend_token","value": "Bearer ..." }
{ "cmd": "set_ota_url",      "value": "https://..." }
{ "cmd": "start_ota" }
{ "cmd": "set_power_mode",   "value": "MOVING" }  // override manuale
```

### Messaggi BLE in uscita (JSON ← TX characteristic)

```json
{ "type": "gps",    "lat": 45.123, "lon": 9.456, "speed": 42.1, "alt": 120, ... }
{ "type": "sim",    "op": "Emnify", "rssi": -73, "iccid": "...", "reg": true, "net": "LTE-M" }
{ "type": "power",  "mode": "MOVING", "bat_mv": 3820 }
{ "type": "config", "interval_ms": 2000, "gnss_mode": 0 }
{ "type": "ota",    "available": true, "version": "0.2.0", "changelog": "..." }
{ "type": "ota_progress", "pct": 42 }
```

---

## Struttura firmware

```
gps-tracker-firmware/
├── platformio.ini
└── src/
    ├── main.cpp          — setup/loop, BLE, WiFi, AT commands, comando dispatch
    ├── firmware_config.h — versione, URL OTA, URL backend, pin ADC
    ├── power.h / .cpp    — state machine risparmio batteria, deep sleep
    ├── remote.h / .cpp   — HTTP POST LTE-M verso backend (Firebase / REST)
    ├── session.h / .cpp  — rilevamento sessioni di guida, haversine distance
    ├── ota.h / .cpp      — OTA via HTTPS, SHA-256, rollback
    ├── utilities.h       — definizioni pin
    └── web_ui.h          — dashboard HTML/JS inline (debug WiFi)
```

### Build e flash

Richiede [PlatformIO](https://platformio.org/).

```bash
cd gps-tracker-firmware
pio run -t upload
```

Monitor seriale:

```bash
pio device monitor
```

> La porta upload è `/dev/cu.usbmodem2101`. Modificare `platformio.ini` se diversa.

---

## App mobile

React Native + Expo, supporta iOS e Android.

### Funzionalità app

- Connessione BLE (auto-reconnect) o WiFi (WebSocket)
- Mappa live Google Maps con traccia percorso
- Ultima posizione nota quando BLE non è in range
- Pannello stato: GPS, SIM, batteria, modalità power
- Storico sessioni con replay su mappa e slider temporale
- Impostazioni: intervallo GPS, modalità GNSS, riavvio GPS
- Aggiornamento firmware OTA con barra di avanzamento
- **Allarme prossimità BLE**: notifica push se il dispositivo esce dal range
- **iBeacon**: il tracker pubblica un beacon UUID per rilevamento in background
- Backend intercambiabile: Firebase Realtime DB / Firestore oppure qualsiasi REST server

### Struttura app

```
gps-tracker-app/
├── app/
│   ├── index.tsx         — schermata scan BLE / inserimento IP
│   ├── tracker.tsx       — mappa live + status panel
│   ├── history.tsx       — lista sessioni
│   ├── session.tsx       — replay sessione su mappa
│   └── settings.tsx      — impostazioni dispositivo
├── components/
│   ├── GPSMap.tsx        — mappa con marcatore e polyline
│   ├── StatusPanel.tsx   — dati GPS, SIM, batteria
│   ├── SettingsPanel.tsx — slider intervallo, OTA, allarme prossimità
│   ├── ConnectionBadge.tsx
│   └── SessionCard.tsx   — card sessione nella lista storico
├── services/
│   ├── bleService.ts       — BLE connect/disconnect/send/parse
│   ├── wsService.ts        — WebSocket (modalità WiFi)
│   ├── backendService.ts   — interfaccia TrackerBackend + factory
│   ├── firebaseBackend.ts  — implementazione Firebase (opzionale)
│   ├── httpBackend.ts      — implementazione REST generica
│   ├── historyService.ts   — caricamento sessioni + cache AsyncStorage
│   └── proximityService.ts — allarme BLE + notifiche push
├── store/tracker.ts      — stato globale Zustand
├── hooks/
│   ├── useTracker.ts     — lifecycle BLE / WiFi
│   └── useRemote.ts      — fallback remote quando BLE disconnesso
└── types/index.ts        — GPSData, SimData, PowerData, OtaStatus, ...
```

### Setup

```bash
cd gps-tracker-app
npm install
```

Variabili d'ambiente (file `.env` o in EAS Secrets):

```env
EXPO_PUBLIC_GOOGLE_MAPS_IOS_KEY=...
EXPO_PUBLIC_GOOGLE_MAPS_ANDROID_KEY=...
```

Avvio sviluppo:

```bash
npx expo start
```

Build iOS/Android tramite EAS:

```bash
eas build --platform ios
eas build --platform android
```

---

## Backend (opzionale)

Il tracker funziona completamente offline via BLE senza nessun backend.
Il backend serve solo per: posizione live da remoto via LTE-M + storico sessioni cloud.

### Opzione A — Firebase

1. Crea un progetto Firebase con Realtime Database e Firestore
2. Scarica `google-services.json` (Android) e `GoogleService-Info.plist` (iOS) nella cartella app
3. Installa i pacchetti Firebase:

```bash
npx expo install @react-native-firebase/app @react-native-firebase/database @react-native-firebase/firestore
```

4. Imposta il tipo di backend nel dispositivo (una volta sola via BLE):
   Invia `{ "cmd": "set_backend_url", "value": "https://<project>.firebaseio.com" }`

### Opzione B — REST server personalizzato

Implementa il contratto HTTP seguente sul tuo server:

```
POST /live/{deviceId}          — body: { lat, lon, speed, alt, ts }
POST /sessions/{deviceId}      — body: { id, startTime }
POST /sessions/{deviceId}/{id}/points — body: { lat, lon, ts }
GET  /sessions/{deviceId}      — risponde: Session[]
GET  /sessions/{deviceId}/{id}/points — risponde: TrackPoint[]
```

Poi configura l'URL e il token tramite BLE:

```json
{ "cmd": "set_backend_url",   "value": "https://mio-server.com" }
{ "cmd": "set_backend_token", "value": "Bearer <token>" }
```

### OTA server

Servi su HTTPS un file `latest.json`:

```json
{
  "version": "0.2.0",
  "url": "https://ota.example.com/firmware-0.2.0.bin",
  "sha256": "abc123...",
  "changelog": "Fix GPS cold start"
}
```

Poi imposta l'URL OTA via BLE: `{ "cmd": "set_ota_url", "value": "https://ota.example.com" }`

---

## Bug noto — Firmware B16

Il firmware `1951B16SIM7080` (preinstallato sulla board) ha un bug noto che impedisce al GPS di dichiarare il fix anche quando le coordinate sono valide.

**Workaround nel codice**: la posizione viene accettata se `lat/lon ≠ 0`, indipendentemente dal flag fix. Le posizioni con `stored: true` vengono mostrate in arancione nell'app.

**Soluzione definitiva**: downgrade a `1951B08SIM7080` tramite il tool `qdl v1.58` (solo Windows). Vedi [issue #144](https://github.com/Xinyuan-LilyGO/LilyGo-T-SIM7080G/issues/144) nella repo ufficiale LilyGo.

---

## Note GPS

- Cold start: 5–10 minuti all'aperto con cielo libero
- GPS e cellular **non** possono funzionare contemporaneamente (limitazione hardware SIM7080G) — il firmware alterna le due funzioni automaticamente
- Antenna patch sul PCB: orientare il board con il lato antenna verso il cielo
- Con SIM Emnify (o altro operatore NB-IoT/LTE-M): verificare che l'APN sia configurato correttamente nella SIM stessa
