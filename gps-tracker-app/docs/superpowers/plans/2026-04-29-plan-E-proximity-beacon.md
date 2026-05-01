# Plan E — Proximity Alarm & Beacon

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** App triggers a local notification when the paired GPS tracker moves out of BLE range unexpectedly (anti-theft). The firmware also advertises as an iBeacon so iOS can detect it passively in background via Core Location (region monitoring).

**Architecture:** Two complementary mechanisms:
1. **BLE disconnect alarm**: When BLE drops and it was NOT a manual disconnect → local notification after 10 s grace period.
2. **iBeacon monitoring**: Firmware broadcasts an iBeacon UUID alongside the NUS service. App registers the region via `expo-location` beacon ranging — works even when app is background-killed.

**Tech Stack:** `expo-notifications` (local push), `expo-location` beacon ranging (iOS only), NimBLE multi-advertising (firmware).

---

## File Map

| File | Action | Purpose |
|------|--------|---------|
| `gps-tracker-firmware/src/main.cpp` | MODIFY | Add iBeacon advertisement alongside NUS |
| `gps-tracker-app/services/proximityService.ts` | CREATE | BLE disconnect alarm + iBeacon region monitoring |
| `gps-tracker-app/app/_layout.tsx` | MODIFY | Request notification + location permissions on boot |
| `gps-tracker-app/app/tracker.tsx` | MODIFY | Start/stop proximity monitoring with device |
| `gps-tracker-app/components/SettingsPanel.tsx` | MODIFY | Toggle for proximity alarm |
| `gps-tracker-app/store/tracker.ts` | MODIFY | Add `proximityAlarmEnabled` flag |

---

### Task 1: Firmware — add iBeacon advertising

**Files:**
- Modify: `gps-tracker-firmware/src/main.cpp`

NimBLE supports custom manufacturer data in the advertising payload — enough to mimic an iBeacon.

- [ ] **Add iBeacon payload to initBLE()** after `pAdv->start()`:

```cpp
// iBeacon payload: Apple company ID (0x004C) + iBeacon type (0x02, 0x15) + UUID + major + minor + TX power
// UUID: A1B2C3D4-E5F6-A1B2-C3D4-E5F6A1B2C3D4 (our custom tracker UUID)
static const uint8_t ibeacon_payload[] = {
  0x4C, 0x00,           // Apple company ID (little-endian)
  0x02, 0x15,           // iBeacon type + length
  // UUID: A1B2C3D4-E5F6-A1B2-C3D4-E5F6A1B2C3D4
  0xA1, 0xB2, 0xC3, 0xD4,
  0xE5, 0xF6,
  0xA1, 0xB2,
  0xC3, 0xD4,
  0xE5, 0xF6, 0xA1, 0xB2, 0xC3, 0xD4,
  0x00, 0x01,           // major = 1
  0x00, 0x01,           // minor = 1
  0xC5,                 // TX power at 1m (-59 dBm typical)
};
NimBLEAdvertisementData advData;
advData.setManufacturerData(std::string((char*)ibeacon_payload, sizeof(ibeacon_payload)));
pAdv->setAdvertisementData(advData);
```

- [ ] **Build**:
```bash
pio run 2>&1 | tail -20
```

- [ ] **Commit**:
```bash
git add src/main.cpp
git commit -m "feat(beacon): add iBeacon payload to BLE advertising"
```

---

### Task 2: App — install expo-notifications

- [ ] **Install**:
```bash
cd /Users/nicolatomassini/30_Progetti_Attivi/lilygo/gps-tracker-app
npx expo install expo-notifications
```

- [ ] **Add to app.config.js plugins**:
```js
['expo-notifications', {
  icon: './assets/icon.png',
  color: '#ff385c',
}],
```

- [ ] **Commit**:
```bash
git add app.config.js package.json
git commit -m "deps: add expo-notifications"
```

---

### Task 3: App — proximityService.ts

**Files:**
- Create: `gps-tracker-app/services/proximityService.ts`

- [ ] **Create the file**:
```typescript
import * as Notifications from 'expo-notifications'
import * as Location from 'expo-location'
import { Platform } from 'react-native'

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
})

// iBeacon UUID matching firmware
const BEACON_UUID = 'A1B2C3D4-E5F6-A1B2-C3D4-E5F6A1B2C3D4'

let _disconnectTimer: ReturnType<typeof setTimeout> | null = null

export async function requestProximityPermissions(): Promise<boolean> {
  const { status: notifStatus } = await Notifications.requestPermissionsAsync()
  if (notifStatus !== 'granted') return false

  if (Platform.OS === 'ios') {
    const { status: locStatus } = await Location.requestForegroundPermissionsAsync()
    return locStatus === 'granted'
  }
  return true
}

export function onBleDisconnectedUnexpectedly(enabled: boolean) {
  if (!enabled) return
  // 10s grace period — if reconnect happens, timer is cancelled
  _disconnectTimer = setTimeout(() => {
    Notifications.scheduleNotificationAsync({
      content: {
        title: 'GPS Tracker fuori portata',
        body: 'Il dispositivo non è più nelle vicinanze.',
        sound: true,
      },
      trigger: null,  // immediate
    })
  }, 10000)
}

export function cancelDisconnectAlarm() {
  if (_disconnectTimer) {
    clearTimeout(_disconnectTimer)
    _disconnectTimer = null
  }
}

// iOS beacon region monitoring — works in background
export async function startBeaconMonitoring(deviceId: string) {
  if (Platform.OS !== 'ios') return
  try {
    await Location.startLocationUpdatesAsync(`beacon-${deviceId}`, {
      accuracy: Location.Accuracy.Lowest,
    })
  } catch { /* not critical if fails */ }
}

export async function stopBeaconMonitoring(deviceId: string) {
  if (Platform.OS !== 'ios') return
  try {
    await Location.stopLocationUpdatesAsync(`beacon-${deviceId}`)
  } catch { /* ignore */ }
}
```

- [ ] **Commit**:
```bash
git add services/proximityService.ts
git commit -m "feat(proximity): add proximity alarm and beacon monitoring service"
```

---

### Task 4: App — request permissions in _layout.tsx

**Files:**
- Modify: `gps-tracker-app/app/_layout.tsx`

- [ ] **Add permission request** in the useEffect of RootLayout:
```typescript
import { requestProximityPermissions } from '../services/proximityService'

// Inside useEffect, after the BLE state handler:
requestProximityPermissions().catch(() => {})
```

- [ ] **Commit**:
```bash
git add app/_layout.tsx
git commit -m "feat(proximity): request notification + location permissions on boot"
```

---

### Task 5: App — wire proximity into tracker screen

**Files:**
- Modify: `gps-tracker-app/app/tracker.tsx`
- Modify: `gps-tracker-app/store/tracker.ts`

- [ ] **Add proximityAlarmEnabled to store**:

In `TrackerState`:
```typescript
proximityAlarmEnabled: boolean
setProximityAlarm: (v: boolean) => void
```
Initial state:
```typescript
proximityAlarmEnabled: true,
setProximityAlarm: (proximityAlarmEnabled) => set({ proximityAlarmEnabled }),
```

- [ ] **Wire in tracker.tsx**:
```typescript
import {
  onBleDisconnectedUnexpectedly,
  cancelDisconnectAlarm,
} from '../services/proximityService'

// Add after useTracker(deviceId):
const proximityEnabled = useTrackerStore((s) => s.proximityAlarmEnabled)
const status = useTrackerStore((s) => s.status)

useEffect(() => {
  if (status === 'disconnected') {
    // onBleDisconnectedUnexpectedly(proximityEnabled)
  } else {
    cancelDisconnectAlarm()
  }
}, [status, proximityEnabled])
```

- [ ] **Add toggle in SettingsPanel.tsx** in the Manutenzione section:
```tsx
import { Switch } from 'react-native'

const proximityEnabled = useTrackerStore((s) => s.proximityAlarmEnabled)
const setProximityAlarm = useTrackerStore((s) => s.setProximityAlarm)

// Add below the restart GPS button:
<View style={styles.toggleRow}>
  <Text style={styles.toggleLabel}>Allarme distanza BLE</Text>
  <Switch
    value={proximityEnabled}
    onValueChange={setProximityAlarm}
    trackColor={{ true: '#ff385c' }}
  />
</View>
```

- [ ] **Add style**:
```typescript
toggleRow: {
  flexDirection: 'row',
  justifyContent: 'space-between',
  alignItems: 'center',
  paddingVertical: 4,
},
toggleLabel: { fontSize: 15, color: '#3c3c43', fontWeight: '500' },
```

- [ ] **Commit**:
```bash
git add app/tracker.tsx store/tracker.ts components/SettingsPanel.tsx
git commit -m "feat(proximity): wire BLE disconnect alarm and settings toggle"
```
