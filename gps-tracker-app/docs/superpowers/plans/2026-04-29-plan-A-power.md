# Plan A — Power Management Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add 12V detection and a 4-state power machine (VEHICLE / MOVING / IDLE / PARKED) to the firmware, with deep sleep in PARKED state and a BLE power status message visible in the app.

**Architecture:** New `power.h/cpp` module owns all state logic. `main.cpp` calls `power_tick()` each loop; `power_tick()` returns the active state and target GPS/send intervals. When state transitions to PARKED the module calls `enterDeepSleep()`.  App receives `{"type":"power","mode":"VEHICLE","bat_mv":3820}` and shows a badge.

**Tech Stack:** ESP32 deep sleep API (`esp_sleep.h`), AXP2101 (battery voltage via PMU), ADC GPIO for 12V, NimBLE notify, ArduinoJson, Zustand (app).

---

## File Map

| File | Action | Purpose |
|------|--------|---------|
| `gps-tracker-firmware/src/firmware_config.h` | CREATE | All compile-time constants (version, URLs, pins) |
| `gps-tracker-firmware/src/power.h` | CREATE | PowerState enum, struct, public API |
| `gps-tracker-firmware/src/power.cpp` | CREATE | 12V ADC, state machine, deep sleep |
| `gps-tracker-firmware/src/main.cpp` | MODIFY | Include power.h, call power_tick(), wire GPS/send intervals |
| `gps-tracker-app/types/index.ts` | MODIFY | Add PowerData type |
| `gps-tracker-app/store/tracker.ts` | MODIFY | Add `power: PowerData | null`, `setPower` |
| `gps-tracker-app/services/bleService.ts` | MODIFY | Parse `type:"power"` messages |
| `gps-tracker-app/components/StatusPanel.tsx` | MODIFY | Show power mode badge |

---

### Task 1: Create firmware_config.h

**Files:**
- Create: `gps-tracker-firmware/src/firmware_config.h`

- [ ] **Create the file**

```cpp
#pragma once

#define FIRMWARE_VERSION     "0.1.0"
#define OTA_BASE_URL         "https://ota.example.com"   // override via NVS key "ota_url"
#define BACKEND_BASE_URL     ""                           // set via BLE cmd set_backend_url
#define V12_ADC_PIN          34                           // GPIO34 — voltage divider input
#define V12_THRESHOLD_MV     1500                         // ADC mV above which 12V is present
```

- [ ] **Replace FIRMWARE_VERSION in main.cpp**

In `main.cpp`, change:
```cpp
#define FIRMWARE_VERSION "0.0.2"
```
to:
```cpp
#include "firmware_config.h"
```
(the version is now in firmware_config.h)

- [ ] **Commit**
```bash
cd /Users/nicolatomassini/30_Progetti_Attivi/lilygo/gps-tracker-firmware
git add src/firmware_config.h src/main.cpp
git commit -m "config: add firmware_config.h with version and pin constants"
```

---

### Task 2: Create power.h

**Files:**
- Create: `gps-tracker-firmware/src/power.h`

- [ ] **Create the file**

```cpp
#pragma once
#include <Arduino.h>

enum class PowerState {
  VEHICLE,   // 12V present — full speed
  MOVING,    // battery, speed > 5 km/h
  IDLE,      // battery, stopped > 3 min
  PARKED,    // battery, stopped > 15 min — deep sleep
};

struct PowerConfig {
  uint32_t gps_interval_ms;   // how often to read GPS
  uint32_t send_interval_ms;  // how often to send BLE/cellular
};

// Call once after PMU init
void power_init(int adc_pin, int threshold_mv);

// Call every loop iteration. Returns current state and fills cfg.
// When state becomes PARKED, this function does NOT return (enters deep sleep).
PowerState power_tick(float speed_kmh, PowerConfig* cfg);

// Returns last battery voltage in mV (from AXP2101).
int power_bat_mv();

// Returns human-readable state name.
const char* power_state_name(PowerState s);
```

- [ ] **Commit**
```bash
git add src/power.h
git commit -m "feat(power): add power.h API"
```

---

### Task 3: Create power.cpp

**Files:**
- Create: `gps-tracker-firmware/src/power.cpp`

- [ ] **Create the file**

```cpp
#include "power.h"
#include <esp_sleep.h>
#define XPOWERS_CHIP_AXP2101
#include "XPowersLib.h"

extern XPowersPMU PMU;   // defined in main.cpp

static int     s_adc_pin       = 34;
static int     s_threshold_mv  = 1500;
static PowerState s_state      = PowerState::MOVING;
static uint32_t   s_stop_ms    = 0;    // millis() when speed first hit 0
static bool       s_stopped    = false;

void power_init(int adc_pin, int threshold_mv) {
  s_adc_pin      = adc_pin;
  s_threshold_mv = threshold_mv;
  analogSetAttenuation(ADC_11db);
  pinMode(s_adc_pin, INPUT);
}

static bool detect_12v() {
  // Average 4 samples to reduce noise
  int sum = 0;
  for (int i = 0; i < 4; i++) { sum += analogReadMilliVolts(s_adc_pin); delay(1); }
  int mv = sum / 4;
  Serial.printf("[PWR] ADC %d mV (threshold %d)\n", mv, s_threshold_mv);
  return mv >= s_threshold_mv;
}

PowerState power_tick(float speed_kmh, PowerConfig* cfg) {
  uint32_t now = millis();

  if (detect_12v()) {
    s_state   = PowerState::VEHICLE;
    s_stopped = false;
    s_stop_ms = 0;
  } else if (speed_kmh > 5.0f) {
    s_state   = PowerState::MOVING;
    s_stopped = false;
    s_stop_ms = 0;
  } else {
    if (!s_stopped) { s_stopped = true; s_stop_ms = now; }
    uint32_t stopped_s = (now - s_stop_ms) / 1000;
    if (stopped_s > 15 * 60) {
      s_state = PowerState::PARKED;
    } else if (stopped_s > 3 * 60) {
      s_state = PowerState::IDLE;
    }
  }

  switch (s_state) {
    case PowerState::VEHICLE:
      cfg->gps_interval_ms  = 2000;
      cfg->send_interval_ms = 5000;
      break;
    case PowerState::MOVING:
      cfg->gps_interval_ms  = 5000;
      cfg->send_interval_ms = 10000;
      break;
    case PowerState::IDLE:
      cfg->gps_interval_ms  = 60000;
      cfg->send_interval_ms = 5 * 60000;
      break;
    case PowerState::PARKED:
      cfg->gps_interval_ms  = 15 * 60000;
      cfg->send_interval_ms = 15 * 60000;
      // Enter deep sleep — does not return
      Serial.println("[PWR] Entro in deep sleep (PARKED)");
      Serial.flush();
      esp_sleep_enable_timer_wakeup((uint64_t)15 * 60 * 1000000ULL); // 15 min
      esp_deep_sleep_start();
      break;
  }
  return s_state;
}

int power_bat_mv() {
  // AXP2101 reports battery voltage in mV
  return (int)(PMU.getBattVoltage());
}

const char* power_state_name(PowerState s) {
  switch (s) {
    case PowerState::VEHICLE: return "VEHICLE";
    case PowerState::MOVING:  return "MOVING";
    case PowerState::IDLE:    return "IDLE";
    case PowerState::PARKED:  return "PARKED";
  }
  return "UNKNOWN";
}
```

- [ ] **Commit**
```bash
git add src/power.cpp
git commit -m "feat(power): implement state machine with deep sleep"
```

---

### Task 4: Wire power module into main.cpp

**Files:**
- Modify: `gps-tracker-firmware/src/main.cpp`

- [ ] **Add include at top of main.cpp** (after existing includes)
```cpp
#include "power.h"
```

- [ ] **Remove the old static gpsIntervalMs declaration** and replace with:
```cpp
static uint32_t lastSend    = 0;
static uint32_t sendIntervalMs = 5000;
static PowerState currentPowerState = PowerState::MOVING;
```
(keep `static uint32_t lastGPS = 0;` and `static uint32_t gpsIntervalMs = 2000;` — they will be updated by power_tick)

- [ ] **Add power_init call in setup()**, after `initPMU()`:
```cpp
power_init(V12_ADC_PIN, V12_THRESHOLD_MV);
```

- [ ] **Add sendPowerData() function** before sendGPSData():
```cpp
static void sendPowerData() {
  if (!bleConnected || !pTxChar) return;
  StaticJsonDocument<128> doc;
  doc["type"]   = "power";
  doc["mode"]   = power_state_name(currentPowerState);
  doc["bat_mv"] = power_bat_mv();
  String out;
  serializeJson(doc, out);
  pTxChar->setValue(out.c_str());
  pTxChar->notify();
}
```

- [ ] **Replace loop() body** with power-aware version:
```cpp
void loop() {
  uint32_t now = millis();

  PowerConfig pcfg;
  currentPowerState = power_tick(gps.speed_kmh, &pcfg);
  gpsIntervalMs     = pcfg.gps_interval_ms;
  sendIntervalMs    = pcfg.send_interval_ms;

  if (now - lastGPS >= gpsIntervalMs) {
    lastGPS = now;
    readGPS();
  }

  if (now - lastSend >= sendIntervalMs) {
    lastSend = now;
    sendGPSData();
    sendPowerData();

    if (now - lastSimMs >= SIM_INTERVAL_MS) {
      lastSimMs = now;
      readSimData();
      sendSimData();
    }
  }
}
```

- [ ] **Build to verify no errors**
```bash
cd /Users/nicolatomassini/30_Progetti_Attivi/lilygo/gps-tracker-firmware
pio run 2>&1 | tail -20
```
Expected: `SUCCESS`

- [ ] **Commit**
```bash
git add src/main.cpp
git commit -m "feat(power): wire power state machine into main loop"
```

---

### Task 5: App — add PowerData type and store

**Files:**
- Modify: `gps-tracker-app/types/index.ts`
- Modify: `gps-tracker-app/store/tracker.ts`

- [ ] **Add to types/index.ts** after SimData:
```typescript
export interface PowerData {
  mode: 'VEHICLE' | 'MOVING' | 'IDLE' | 'PARKED'
  bat_mv: number
}
```

- [ ] **Add to TrackerState in store/tracker.ts**:
```typescript
power: PowerData | null
setPower: (data: PowerData) => void
```

- [ ] **Add to initial state and actions**:
```typescript
power: null,
setPower: (data) => set({ power: data }),
```

- [ ] **Commit**
```bash
cd /Users/nicolatomassini/30_Progetti_Attivi/lilygo/gps-tracker-app
git add types/index.ts store/tracker.ts
git commit -m "feat(power): add PowerData type and store field"
```

---

### Task 6: App — parse power BLE messages and show badge

**Files:**
- Modify: `gps-tracker-app/services/bleService.ts`
- Modify: `gps-tracker-app/components/StatusPanel.tsx`

- [ ] **In bleService.ts, import PowerData**:
```typescript
import { GPSData, PowerData, SimData, TrackerConfig, WSCommand, WSConfigMessage } from '../types'
```

- [ ] **In parseNotification, add power case** after the sim case:
```typescript
} else if (type === 'power') {
  useTrackerStore.getState().setPower(msg as PowerData)
}
```

- [ ] **In StatusPanel.tsx, add power import** at top of component:
```typescript
const power = useTrackerStore((s) => s.power)
```

- [ ] **Add power badge row** at the very top of the returned JSX, inside `<View style={styles.container}>` before the fix banner:
```tsx
{power && (
  <View style={styles.powerRow}>
    <Text style={styles.powerMode}>{
      power.mode === 'VEHICLE' ? '⚡ Veicolo' :
      power.mode === 'MOVING'  ? '▶ In movimento' :
      power.mode === 'IDLE'    ? '⏸ Fermo' : '💤 Parcheggiato'
    }</Text>
    <Text style={styles.powerBat}>{(power.bat_mv / 1000).toFixed(2)} V</Text>
  </View>
)}
```

- [ ] **Add styles** before the closing `})` of StyleSheet.create:
```typescript
powerRow: {
  flexDirection: 'row',
  justifyContent: 'space-between',
  alignItems: 'center',
  paddingHorizontal: S.md,
  paddingVertical: 6,
  backgroundColor: C.bg,
},
powerMode: {
  fontSize: 11,
  fontWeight: '600',
  color: C.text2,
  letterSpacing: 0.3,
},
powerBat: {
  fontSize: 11,
  fontWeight: '600',
  color: C.text2,
  fontVariant: ['tabular-nums'],
},
```

- [ ] **Commit**
```bash
git add services/bleService.ts components/StatusPanel.tsx
git commit -m "feat(power): show power mode and battery voltage in status panel"
```
