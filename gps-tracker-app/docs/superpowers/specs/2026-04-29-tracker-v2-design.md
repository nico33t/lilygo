# GPS Tracker v2 — Design Spec
**Date:** 2026-04-29  
**Status:** Approved

---

## Overview

Four independent subsystems, built in dependency order:

```
A (Power) → B (Remote) → C (History) → D (OTA)
```

---

## A — Power Management

### 12V Detection
- Hardware: voltage divider (10 kΩ + 3.3 kΩ) on a free ADC GPIO
- Reads at boot and every 30 s in loop
- If ADC > 1.5 V → `POWER_MODE_VEHICLE`; else → `POWER_MODE_BATTERY`

### Four Operating States

| State | Trigger | GPS interval | Send interval | ESP32 sleep |
|-------|---------|-------------|--------------|-------------|
| `VEHICLE` | 12 V present | 2 s | 5 s | none |
| `MOVING` | speed > 5 km/h | 5 s | 10 s | light sleep |
| `IDLE` | speed = 0 for > 3 min | 60 s | 5 min | modem PSM |
| `PARKED` | speed = 0 for > 15 min | off | 15 min | deep sleep (timer) |

### Deep Sleep Flow
1. Save state to NVS (power mode, last GPS fix, session ID)
2. Power off GPS (AT+CGNSPWR=0)
3. Put modem in PSM (AT+CPSMS=1 with T3412=15 min)
4. ESP32 `esp_deep_sleep_start()` with `esp_sleep_enable_timer_wakeup()`
5. On wakeup: restore state, take GPS reading, send if moved > 50 m, sleep again

### Firmware Additions
- `power.cpp`: `detectPowerMode()`, `enterDeepSleep()`, `getPowerState()`
- New NVS namespace `pwr`: stores `mode`, `sleep_count`, `last_send_ts`
- New BLE message `{"type":"power","mode":"PARKED","bat_mv":3820}`
- New BLE command `{"cmd":"set_power_mode","value":0}` (0=auto, 1=vehicle, 2=battery)

---

## B — Remote Tracking (provider-agnostic backend)

### Key Design: Backend Adapter

The firmware sends to a single configurable HTTPS endpoint. The app connects to a configurable backend URL. Both are stored in NVS / AsyncStorage and can be changed at runtime without recompiling. Firebase is the default implementation; any server that satisfies the contract can replace it.

### Firmware → Backend API Contract

```
POST {BACKEND_URL}/live
Body: { device_id, lat, lon, speed, alt, ts, bat_mv, power_mode }

POST {BACKEND_URL}/track
Body: { device_id, session_id, lat, lon, speed, alt, ts }

POST {BACKEND_URL}/session/start
Body: { device_id, session_id, start_time }

POST {BACKEND_URL}/session/end
Body: { device_id, session_id, end_time, distance_km, max_speed_kmh, avg_speed_kmh }
```

All requests include header `X-Device-Token: {token}` for auth.

### App → Backend API Contract

```typescript
interface TrackerBackend {
  subscribeToLive(deviceId: string, cb: (pos: LiveData) => void): () => void
  listSessions(deviceId: string, limit: number): Promise<Session[]>
  getSessionPoints(sessionId: string): Promise<TrackPoint[]>
}
```

Implementations:
- `FirebaseBackend` — uses Firebase Realtime DB + Firestore REST APIs
- `HttpBackend` — calls generic REST endpoints above (for custom platform)

Active backend chosen via `BACKEND_TYPE` in AsyncStorage (`'firebase'` | `'http'`).

### Firebase (default) — Data Structure
Device identifier: ESP32 BLE MAC address (6 bytes hex, shown in app Settings).

```
Realtime DB:
  /devices/{mac}/live → { lat, lon, speed, alt, ts, bat_mv, power_mode }

Firestore:
  /sessions/{mac}/{sessionId} → { startTime, endTime,
                                   distance_km, maxSpeed_kmh, avgSpeed_kmh, pointCount }
  /sessions/{mac}/{sessionId}/points/{ts} → { lat, lon, speed, alt }
```

Firebase Spark (free): 1 GB storage, 10 GB/month transfer → sufficient for single-device use. Switching to custom platform costs nothing — just change `BACKEND_URL` via app.

### App — Remote Mode
- When BLE disconnected: app falls back to remote backend automatically
- `services/backendService.ts`: factory returns active `TrackerBackend` implementation
- Status banner: "BLE" (green) / "Remoto" (blue) / "Offline" (gray)

### Data Budget (with power saving)
- Moving 3 h/day × 1 point/10 s × 50 bytes = ~54 KB/day → ~1.6 MB/month

---

## C — Track History

### Session Lifecycle
- **Start**: firmware detects speed > 3 km/h after being stopped → POSTs `session/start`, stores `sessionId` in NVS
- **Points**: every 30 s while moving → POSTs to `track`
- **End**: speed = 0 for > 5 min → POSTs `session/end` with computed stats

### App — History Tab
**List view** (card per session):
- Date + weekday, duration, distance, max speed
- Thumbnail map preview (mini MapView snapshot, cached as image in AsyncStorage)
- Color badge: today green, past gray

**Detail view** (tap on card):
- Full-screen map with colored polyline
- Timeline scrubber → animates marker along route
- Stats bar: distance / avg speed / max speed / duration
- Share button (screenshot)

### Local Cache
- Last 10 sessions in AsyncStorage for offline viewing
- `services/historyService.ts`: `listSessions()`, `getSessionDetail(id)`, `cacheSession()`

---

## D — OTA Firmware Update

### API Contract (any backend must implement)
```
GET {OTA_BASE_URL}/latest.json
→ { "version": "0.0.3", "url": "https://…/firmware.bin", "sha256": "…64chars", "changelog": "…" }
```

`OTA_BASE_URL` defaults to a `#define` in `firmware_config.h`; overridden at runtime via NVS (`ota_url` key), settable via BLE command `{"cmd":"set_ota_url","value":"https://…"}`.

### Firmware OTA Flow
1. On boot + every 24 h: GET `/latest.json` via HTTPS
2. Compare `version` string with `FIRMWARE_VERSION`
3. If newer: notify BLE `{"type":"ota","available":true,"version":"…","changelog":"…"}`
4. User confirms in app → sends `{"cmd":"start_ota"}`
5. Firmware streams `.bin` via HTTPS chunks into OTA partition
6. Verify SHA256 → `esp_ota_set_boot_partition()` → reboot
7. On next boot: app valid → confirm; else automatic rollback

### App — OTA UI (Settings screen)
- Shows current firmware version
- "Controlla aggiornamenti" button → triggers BLE command `get_ota_status`
- When update available: card with version + changelog + "Aggiorna" button
- Progress bar during download (firmware sends `{"type":"ota_progress","pct":42}`)

---

## Implementation Order

1. **A** — Power management (firmware only)
2. **B** — Backend adapter + Firebase implementation + app remote mode
3. **C** — Session tracking (firmware) + History tab (app)
4. **D** — OTA check + update flow

---

## Out of Scope (this spec)
- Geofencing / push alerts
- Multi-device support
- User authentication (device token only)
- Offline map tile pre-download (deferred)
