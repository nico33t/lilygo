# Plan B — Remote Backend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Firmware uploads GPS positions and sessions to a configurable HTTPS backend via cellular (SIM7080). App shows live position from anywhere when BLE is unavailable. Default backend is Firebase; switching to a custom platform requires only changing one URL.

**Architecture:** `remote.h/cpp` in firmware wraps TinyGSM HTTPS calls to a REST endpoint defined in NVS. App has a `TrackerBackend` interface with `FirebaseBackend` and `HttpBackend` implementations; factory selects based on AsyncStorage `BACKEND_TYPE` key. BLE remains primary; Firebase is fallback when BLE disconnects.

**Tech Stack:** TinyGSM + ArduinoHttpClient (firmware), Firebase Realtime DB + Firestore REST (default backend), `@react-native-firebase/app` + `@react-native-firebase/database` + `@react-native-firebase/firestore` (app).

---

## File Map

| File | Action | Purpose |
|------|--------|---------|
| `gps-tracker-firmware/platformio.ini` | MODIFY | Add `arduino-libraries/ArduinoHttpClient` |
| `gps-tracker-firmware/src/remote.h` | CREATE | Upload API declarations |
| `gps-tracker-firmware/src/remote.cpp` | CREATE | HTTPS POST to backend, NVS config |
| `gps-tracker-firmware/src/main.cpp` | MODIFY | Call remote_send_live() in loop |
| `gps-tracker-app/services/backendService.ts` | CREATE | TrackerBackend interface + factory |
| `gps-tracker-app/services/firebaseBackend.ts` | CREATE | Firebase implementation |
| `gps-tracker-app/services/httpBackend.ts` | CREATE | Generic HTTP implementation |
| `gps-tracker-app/store/tracker.ts` | MODIFY | Add `remoteConnected` flag |
| `gps-tracker-app/hooks/useRemote.ts` | CREATE | React hook that starts remote subscription |
| `gps-tracker-app/app/tracker.tsx` | MODIFY | Call useRemote when BLE disconnects |
| `gps-tracker-app/components/ConnectionBadge.tsx` | MODIFY | Show "Remoto" when on Firebase |

---

### Task 1: Add ArduinoHttpClient to firmware

**Files:**
- Modify: `gps-tracker-firmware/platformio.ini`

- [ ] **Add lib_dep**:
```ini
lib_deps =
    lewisxhe/XPowersLib @ ^0.3.3
    vshymanskyy/TinyGSM @ ^0.11.7
    vshymanskyy/StreamDebugger @ ^1.0.1
    links2004/WebSockets @ ^2.4.1
    bblanchon/ArduinoJson @ ^6.21.5
    h2zero/NimBLE-Arduino @ ^1.4.3
    arduino-libraries/ArduinoHttpClient @ ^0.6.1
```

- [ ] **Verify it fetches**:
```bash
cd /Users/nicolatomassini/30_Progetti_Attivi/lilygo/gps-tracker-firmware
pio pkg install 2>&1 | tail -10
```

- [ ] **Commit**:
```bash
git add platformio.ini
git commit -m "deps: add ArduinoHttpClient for cellular HTTPS upload"
```

---

### Task 2: Create remote.h

**Files:**
- Create: `gps-tracker-firmware/src/remote.h`

- [ ] **Create the file**:
```cpp
#pragma once
#include <Arduino.h>

// Call once after modem is registered on network.
// Loads backend URL + token from NVS namespace "remote".
void remote_init();

// Set backend URL at runtime (also saves to NVS).
void remote_set_url(const String& url);

// Set auth token at runtime (also saves to NVS).
void remote_set_token(const String& token);

// POST current GPS position to /live endpoint.
// Returns true on HTTP 200.
bool remote_send_live(float lat, float lon, float speed, float alt,
                      int bat_mv, const char* power_mode);

// POST a session-start event to /session/start.
bool remote_send_session_start(const String& session_id);

// POST a track point to /track.
bool remote_send_track_point(const String& session_id,
                              float lat, float lon, float speed, float alt);

// POST session-end stats to /session/end.
bool remote_send_session_end(const String& session_id,
                              float distance_km, float max_speed, float avg_speed);
```

- [ ] **Commit**:
```bash
git add src/remote.h
git commit -m "feat(remote): add remote.h upload API"
```

---

### Task 3: Create remote.cpp

**Files:**
- Create: `gps-tracker-firmware/src/remote.cpp`

- [ ] **Create the file**:
```cpp
#include "remote.h"
#include <Preferences.h>
#include <ArduinoHttpClient.h>
#include <TinyGsmClient.h>

extern TinyGsm modem;    // defined in main.cpp

static String s_url;     // e.g. "https://your-firebase-project.firebaseio.com"
static String s_token;   // Firebase Database Secret or custom token
static String s_device_id; // BLE MAC — set via remote_init from NVS "device/mac"

static TinyGsmClientSecure gsmClient(modem);

static bool do_post(const String& path, const String& body) {
  if (s_url.isEmpty()) {
    Serial.println("[REM] URL non configurato, skip");
    return false;
  }

  String host = s_url;
  host.replace("https://", "");
  host.replace("http://", "");

  HttpClient http(gsmClient, host, 443);
  http.connectionKeepAlive();

  String full_path = path;
  if (!s_token.isEmpty()) full_path += "?auth=" + s_token;

  int err = http.post(full_path, "application/json", body);
  if (err != 0) {
    Serial.printf("[REM] POST error %d\n", err);
    http.stop();
    return false;
  }
  int status = http.responseStatusCode();
  http.skipResponseHeaders();
  http.stop();
  Serial.printf("[REM] POST %s → %d\n", path.c_str(), status);
  return status >= 200 && status < 300;
}

void remote_init() {
  Preferences prefs;
  prefs.begin("remote", true);
  s_url      = prefs.getString("url", "");
  s_token    = prefs.getString("token", "");
  s_device_id = prefs.getString("device_id", "default");
  prefs.end();
  Serial.printf("[REM] URL: %s\n", s_url.isEmpty() ? "(non impostato)" : s_url.c_str());
}

void remote_set_url(const String& url) {
  s_url = url;
  Preferences prefs;
  prefs.begin("remote", false);
  prefs.putString("url", url);
  prefs.end();
}

void remote_set_token(const String& token) {
  s_token = token;
  Preferences prefs;
  prefs.begin("remote", false);
  prefs.putString("token", token);
  prefs.end();
}

bool remote_send_live(float lat, float lon, float speed, float alt,
                      int bat_mv, const char* power_mode) {
  StaticJsonDocument<256> doc;
  doc["device_id"]   = s_device_id;
  doc["lat"]         = lat;
  doc["lon"]         = lon;
  doc["speed"]       = speed;
  doc["alt"]         = alt;
  doc["bat_mv"]      = bat_mv;
  doc["power_mode"]  = power_mode;
  doc["ts"]          = millis() / 1000;
  String body;
  serializeJson(doc, body);
  // Firebase Realtime DB: PUT to /devices/{mac}/live.json
  return do_post("/devices/" + s_device_id + "/live.json", body);
}

bool remote_send_session_start(const String& session_id) {
  StaticJsonDocument<128> doc;
  doc["device_id"]  = s_device_id;
  doc["session_id"] = session_id;
  doc["start_time"] = millis() / 1000;
  String body;
  serializeJson(doc, body);
  return do_post("/sessions/" + s_device_id + "/" + session_id + ".json", body);
}

bool remote_send_track_point(const String& session_id,
                              float lat, float lon, float speed, float alt) {
  StaticJsonDocument<192> doc;
  doc["device_id"]  = s_device_id;
  doc["session_id"] = session_id;
  doc["lat"]        = lat;
  doc["lon"]        = lon;
  doc["speed"]      = speed;
  doc["alt"]        = alt;
  doc["ts"]         = millis() / 1000;
  String body;
  serializeJson(doc, body);
  String ts = String(millis() / 1000);
  return do_post("/sessions/" + s_device_id + "/" + session_id + "/points/" + ts + ".json", body);
}

bool remote_send_session_end(const String& session_id,
                              float distance_km, float max_speed, float avg_speed) {
  StaticJsonDocument<192> doc;
  doc["end_time"]      = millis() / 1000;
  doc["distance_km"]   = distance_km;
  doc["max_speed_kmh"] = max_speed;
  doc["avg_speed_kmh"] = avg_speed;
  String body;
  serializeJson(doc, body);
  return do_post("/sessions/" + s_device_id + "/" + session_id + "/stats.json", body);
}
```

- [ ] **Build to verify**:
```bash
pio run 2>&1 | tail -20
```

- [ ] **Commit**:
```bash
git add src/remote.cpp
git commit -m "feat(remote): implement cellular HTTPS upload to configurable backend"
```

---

### Task 4: Wire remote into main.cpp

**Files:**
- Modify: `gps-tracker-firmware/src/main.cpp`

- [ ] **Add include**:
```cpp
#include "remote.h"
```

- [ ] **Add remote_init() call in setup()** after `initModem()`:
```cpp
remote_init();
```

- [ ] **Add BLE command handlers in RxCallbacks::onWrite** for the new commands (after the existing `restart_gps` handler):
```cpp
} else if (strcmp(c, "set_backend_url") == 0) {
  const char* val = cmd["value"] | "";
  if (strlen(val) > 0) { remote_set_url(String(val)); Serial.printf("[BLE] Backend URL: %s\n", val); }
  return;
} else if (strcmp(c, "set_backend_token") == 0) {
  const char* val = cmd["value"] | "";
  if (strlen(val) > 0) { remote_set_token(String(val)); Serial.println("[BLE] Token aggiornato"); }
  return;
```

- [ ] **In sendGPSData(), add remote upload when fix is valid**:

After the BLE notify block in `sendGPSData()`, add:
```cpp
  // Remote upload (cellular) — only when fix is live and valid
  if (gps.valid && !gps.stored) {
    remote_send_live(gps.lat, gps.lon, gps.speed_kmh, gps.altitude,
                     power_bat_mv(), power_state_name(currentPowerState));
  }
```

- [ ] **Add WSCommand types for new commands in WSCommand type** (update `types/index.ts` in app):
```typescript
export interface WSCommand {
  cmd: 'set_interval' | 'set_gnss_mode' | 'get_config' | 'restart_gps'
      | 'set_backend_url' | 'set_backend_token' | 'set_ota_url'
  value?: number | string
}
```

- [ ] **Build**:
```bash
pio run 2>&1 | tail -20
```

- [ ] **Commit**:
```bash
git add src/main.cpp
git commit -m "feat(remote): wire cellular upload in main loop and add BLE config commands"
```

---

### Task 5: App — TrackerBackend interface and factory

**Files:**
- Create: `gps-tracker-app/services/backendService.ts`

- [ ] **Create the file**:
```typescript
import AsyncStorage from '@react-native-async-storage/async-storage'
import type { SimData, TrackPoint } from '../types'

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
  // Returns unsubscribe function
  subscribeToLive(deviceId: string, cb: (data: LiveData) => void): () => void
  listSessions(deviceId: string, limit: number): Promise<Session[]>
  getSessionPoints(sessionId: string, deviceId: string): Promise<TrackPoint[]>
}

const BACKEND_TYPE_KEY = 'BACKEND_TYPE'
const BACKEND_URL_KEY  = 'BACKEND_URL'

let _instance: TrackerBackend | null = null

export async function getBackend(): Promise<TrackerBackend> {
  if (_instance) return _instance
  const type = await AsyncStorage.getItem(BACKEND_TYPE_KEY) ?? 'firebase'
  if (type === 'http') {
    const { HttpBackend } = await import('./httpBackend')
    const url = await AsyncStorage.getItem(BACKEND_URL_KEY) ?? ''
    _instance = new HttpBackend(url)
  } else {
    const { FirebaseBackend } = await import('./firebaseBackend')
    _instance = new FirebaseBackend()
  }
  return _instance
}

export async function setBackendUrl(url: string): Promise<void> {
  await AsyncStorage.multiSet([
    [BACKEND_URL_KEY, url],
    [BACKEND_TYPE_KEY, 'http'],
  ])
  _instance = null  // force re-init on next getBackend()
}

export async function resetToFirebase(): Promise<void> {
  await AsyncStorage.setItem(BACKEND_TYPE_KEY, 'firebase')
  _instance = null
}
```

- [ ] **Commit**:
```bash
git add services/backendService.ts
git commit -m "feat(remote): add TrackerBackend interface and factory"
```

---

### Task 6: App — Firebase backend implementation

**Files:**
- Create: `gps-tracker-app/services/firebaseBackend.ts`

- [ ] **Install Firebase packages**:
```bash
cd /Users/nicolatomassini/30_Progetti_Attivi/lilygo/gps-tracker-app
npx expo install @react-native-firebase/app @react-native-firebase/database @react-native-firebase/firestore
```

- [ ] **Create firebaseBackend.ts**:
```typescript
import database from '@react-native-firebase/database'
import firestore from '@react-native-firebase/firestore'
import type { TrackerBackend, LiveData, Session } from './backendService'
import type { TrackPoint } from '../types'

export class FirebaseBackend implements TrackerBackend {
  subscribeToLive(deviceId: string, cb: (data: LiveData) => void): () => void {
    const ref = database().ref(`/devices/${deviceId}/live`)
    const handler = ref.on('value', (snap) => {
      const val = snap.val()
      if (val) cb(val as LiveData)
    })
    return () => ref.off('value', handler)
  }

  async listSessions(deviceId: string, limit: number): Promise<Session[]> {
    const snap = await firestore()
      .collection('sessions')
      .doc(deviceId)
      .collection('items')
      .orderBy('startTime', 'desc')
      .limit(limit)
      .get()
    return snap.docs.map((d) => ({ id: d.id, deviceId, ...d.data() } as Session))
  }

  async getSessionPoints(sessionId: string, deviceId: string): Promise<TrackPoint[]> {
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
  }
}
```

- [ ] **Commit**:
```bash
git add services/firebaseBackend.ts package.json
git commit -m "feat(remote): add FirebaseBackend implementation"
```

---

### Task 7: App — HTTP backend (custom platform)

**Files:**
- Create: `gps-tracker-app/services/httpBackend.ts`

- [ ] **Create the file**:
```typescript
import type { TrackerBackend, LiveData, Session } from './backendService'
import type { TrackPoint } from '../types'

export class HttpBackend implements TrackerBackend {
  constructor(private baseUrl: string) {}

  subscribeToLive(deviceId: string, cb: (data: LiveData) => void): () => void {
    // Poll every 10s — replace with SSE/WebSocket when custom server supports it
    let active = true
    const poll = async () => {
      while (active) {
        try {
          const res = await fetch(`${this.baseUrl}/live?device_id=${deviceId}`)
          if (res.ok) cb(await res.json())
        } catch { /* network error, retry */ }
        await new Promise(r => setTimeout(r, 10000))
      }
    }
    poll()
    return () => { active = false }
  }

  async listSessions(deviceId: string, limit: number): Promise<Session[]> {
    const res = await fetch(`${this.baseUrl}/sessions?device_id=${deviceId}&limit=${limit}`)
    return res.ok ? res.json() : []
  }

  async getSessionPoints(sessionId: string, deviceId: string): Promise<TrackPoint[]> {
    const res = await fetch(`${this.baseUrl}/sessions/${sessionId}/points?device_id=${deviceId}`)
    return res.ok ? res.json() : []
  }
}
```

- [ ] **Commit**:
```bash
git add services/httpBackend.ts
git commit -m "feat(remote): add HttpBackend for custom platform"
```

---

### Task 8: App — useRemote hook and tracker wiring

**Files:**
- Create: `gps-tracker-app/hooks/useRemote.ts`
- Modify: `gps-tracker-app/app/tracker.tsx`
- Modify: `gps-tracker-app/store/tracker.ts`

- [ ] **Add remoteConnected to store**:

In `store/tracker.ts`, add to `TrackerState`:
```typescript
remoteConnected: boolean
setRemoteConnected: (v: boolean) => void
```
And to initial state + actions:
```typescript
remoteConnected: false,
setRemoteConnected: (remoteConnected) => set({ remoteConnected }),
```

- [ ] **Create useRemote.ts**:
```typescript
import { useEffect } from 'react'
import { getBackend } from '../services/backendService'
import { useTrackerStore } from '../store/tracker'

export function useRemote(deviceId: string, enabled: boolean) {
  const setGPS    = useTrackerStore((s) => s.setGPS)
  const setRemote = useTrackerStore((s) => s.setRemoteConnected)

  useEffect(() => {
    if (!enabled || !deviceId) return
    let unsub: (() => void) | null = null

    getBackend().then((backend) => {
      setRemote(true)
      unsub = backend.subscribeToLive(deviceId, (live) => {
        setGPS({
          valid: true,
          lat: live.lat,
          lon: live.lon,
          speed: live.speed,
          alt: live.alt,
          vsat: 0,
          usat: 0,
          acc: 0,
          hdop: 0,
          time: new Date(live.ts * 1000).toISOString(),
        })
      })
    }).catch(() => setRemote(false))

    return () => {
      unsub?.()
      setRemote(false)
    }
  }, [enabled, deviceId])
}
```

- [ ] **Wire into tracker.tsx** — add below `useTracker(deviceId)`:
```typescript
const status = useTrackerStore((s) => s.status)
useRemote(deviceId, status === 'disconnected')
```

- [ ] **Commit**:
```bash
git add hooks/useRemote.ts app/tracker.tsx store/tracker.ts
git commit -m "feat(remote): activate Firebase fallback when BLE disconnects"
```
