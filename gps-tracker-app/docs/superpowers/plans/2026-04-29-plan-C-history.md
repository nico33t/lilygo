# Plan C — Session Tracking & History Tab

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Firmware auto-detects drive sessions (start/stop on speed threshold), uploads track points to the backend, and the app shows a scrollable list of sessions with detail view (map + stats + scrubber).

**Architecture:** `session.h/cpp` in firmware tracks state, distance, and stats; calls `remote_send_*` from Plan B. App adds a History tab (`app/history.tsx`) that queries the backend via `historyService.ts` and caches the last 10 sessions in AsyncStorage.

**Tech Stack:** expo-router (tab nav), `react-native-maps` Polyline, AsyncStorage, backendService from Plan B.

---

## File Map

| File | Action | Purpose |
|------|--------|---------|
| `gps-tracker-firmware/src/session.h` | CREATE | Session state struct and API |
| `gps-tracker-firmware/src/session.cpp` | CREATE | Start/stop/point logic, distance calc |
| `gps-tracker-firmware/src/main.cpp` | MODIFY | Call session_tick() after readGPS |
| `gps-tracker-app/services/historyService.ts` | CREATE | List/cache sessions from backend |
| `gps-tracker-app/app/tracker.tsx` | MODIFY | Add history icon button in header |
| `gps-tracker-app/app/history.tsx` | CREATE | Session list screen |
| `gps-tracker-app/app/session.tsx` | CREATE | Session detail: map + stats + scrubber |
| `gps-tracker-app/components/SessionCard.tsx` | CREATE | Single session card component |

---

### Task 1: Create session.h

**Files:**
- Create: `gps-tracker-firmware/src/session.h`

- [ ] **Create the file**:
```cpp
#pragma once
#include <Arduino.h>

struct SessionStats {
  float distance_km   = 0;
  float max_speed_kmh = 0;
  float avg_speed_sum = 0;   // sum for computing average
  int   avg_speed_cnt = 0;
};

// Call after every GPS read. Manages session start/end automatically.
// session_id is written when a new session starts (UUID stored in NVS).
void session_tick(bool gps_valid, float lat, float lon, float speed_kmh);
```

- [ ] **Commit**:
```bash
cd /Users/nicolatomassini/30_Progetti_Attivi/lilygo/gps-tracker-firmware
git add src/session.h
git commit -m "feat(session): add session.h API"
```

---

### Task 2: Create session.cpp

**Files:**
- Create: `gps-tracker-firmware/src/session.cpp`

- [ ] **Create the file**:
```cpp
#include "session.h"
#include "remote.h"
#include <Preferences.h>
#include <math.h>

#define SESSION_START_SPEED_KMH   3.0f
#define SESSION_END_STOP_S        300     // 5 minutes stopped = session end
#define TRACK_POINT_INTERVAL_MS   30000   // one point every 30s

static bool          s_active    = false;
static String        s_id;
static SessionStats  s_stats;
static uint32_t      s_stop_ms   = 0;
static uint32_t      s_last_point_ms = 0;
static float         s_last_lat  = 0, s_last_lon = 0;
static bool          s_first     = true;

static String make_session_id() {
  char buf[20];
  snprintf(buf, sizeof(buf), "s%lu", millis());
  return String(buf);
}

// Haversine distance in km between two lat/lon points
static float haversine(float lat1, float lon1, float lat2, float lon2) {
  const float R = 6371.0f;
  float dLat = (lat2 - lat1) * M_PI / 180.0f;
  float dLon = (lon2 - lon1) * M_PI / 180.0f;
  float a = sinf(dLat/2)*sinf(dLat/2) +
            cosf(lat1*M_PI/180.0f)*cosf(lat2*M_PI/180.0f)*
            sinf(dLon/2)*sinf(dLon/2);
  return R * 2.0f * atan2f(sqrtf(a), sqrtf(1.0f-a));
}

void session_tick(bool gps_valid, float lat, float lon, float speed_kmh) {
  if (!gps_valid) return;
  uint32_t now = millis();

  if (!s_active) {
    if (speed_kmh >= SESSION_START_SPEED_KMH) {
      s_id      = make_session_id();
      s_stats   = {};
      s_active  = true;
      s_first   = true;
      s_stop_ms = 0;
      s_last_point_ms = 0;
      remote_send_session_start(s_id);
      Serial.printf("[SES] Sessione avviata: %s\n", s_id.c_str());
    }
    return;
  }

  // Update stats
  if (speed_kmh > s_stats.max_speed_kmh) s_stats.max_speed_kmh = speed_kmh;
  s_stats.avg_speed_sum += speed_kmh;
  s_stats.avg_speed_cnt++;

  // Accumulate distance
  if (!s_first) {
    s_stats.distance_km += haversine(s_last_lat, s_last_lon, lat, lon);
  }
  s_first    = false;
  s_last_lat = lat;
  s_last_lon = lon;

  // Send track point every 30s
  if (now - s_last_point_ms >= TRACK_POINT_INTERVAL_MS) {
    s_last_point_ms = now;
    remote_send_track_point(s_id, lat, lon, speed_kmh, 0);
  }

  // Check for stop
  if (speed_kmh < SESSION_START_SPEED_KMH) {
    if (s_stop_ms == 0) s_stop_ms = now;
    if ((now - s_stop_ms) / 1000 >= SESSION_END_STOP_S) {
      float avg = s_stats.avg_speed_cnt > 0
                  ? s_stats.avg_speed_sum / s_stats.avg_speed_cnt : 0;
      remote_send_session_end(s_id, s_stats.distance_km,
                               s_stats.max_speed_kmh, avg);
      Serial.printf("[SES] Sessione terminata: %.2f km, %.0f km/h max\n",
                    s_stats.distance_km, s_stats.max_speed_kmh);
      s_active  = false;
      s_stop_ms = 0;
    }
  } else {
    s_stop_ms = 0;
  }
}
```

- [ ] **Build**:
```bash
pio run 2>&1 | tail -20
```

- [ ] **Commit**:
```bash
git add src/session.cpp
git commit -m "feat(session): implement auto session lifecycle with track upload"
```

---

### Task 3: Wire session into main.cpp

**Files:**
- Modify: `gps-tracker-firmware/src/main.cpp`

- [ ] **Add include**:
```cpp
#include "session.h"
```

- [ ] **Add session_tick call** in `loop()`, right after `readGPS()`:
```cpp
session_tick(gps.valid, gps.lat, gps.lon, gps.speed_kmh);
```

- [ ] **Build and commit**:
```bash
pio run 2>&1 | tail -5
git add src/main.cpp
git commit -m "feat(session): wire session_tick into main loop"
```

---

### Task 4: App — historyService.ts

**Files:**
- Create: `gps-tracker-app/services/historyService.ts`

- [ ] **Create the file**:
```typescript
import AsyncStorage from '@react-native-async-storage/async-storage'
import { getBackend, Session } from './backendService'
import type { TrackPoint } from '../types'

const CACHE_KEY = (deviceId: string) => `history_cache_${deviceId}`

export async function listSessions(deviceId: string, limit = 20): Promise<Session[]> {
  try {
    const backend = await getBackend()
    const sessions = await backend.listSessions(deviceId, limit)
    // Cache the latest 10
    await AsyncStorage.setItem(CACHE_KEY(deviceId), JSON.stringify(sessions.slice(0, 10)))
    return sessions
  } catch {
    // Fallback to cache
    const cached = await AsyncStorage.getItem(CACHE_KEY(deviceId))
    return cached ? JSON.parse(cached) : []
  }
}

export async function getSessionPoints(sessionId: string, deviceId: string): Promise<TrackPoint[]> {
  try {
    const backend = await getBackend()
    return await backend.getSessionPoints(sessionId, deviceId)
  } catch {
    return []
  }
}

export function formatDuration(startTime: number, endTime?: number): string {
  const secs = ((endTime ?? Date.now() / 1000) - startTime)
  const h = Math.floor(secs / 3600)
  const m = Math.floor((secs % 3600) / 60)
  return h > 0 ? `${h}h ${m}m` : `${m}m`
}

export function formatDate(ts: number): string {
  const d = new Date(ts * 1000)
  return d.toLocaleDateString('it-IT', { weekday: 'short', day: 'numeric', month: 'short' })
}
```

- [ ] **Commit**:
```bash
git add services/historyService.ts
git commit -m "feat(history): add historyService with cache fallback"
```

---

### Task 5: App — SessionCard component

**Files:**
- Create: `gps-tracker-app/components/SessionCard.tsx`

- [ ] **Create the file**:
```tsx
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { C, S, R } from '../constants/design'
import { Session } from '../services/backendService'
import { formatDate, formatDuration } from '../services/historyService'

interface Props {
  session: Session
  onPress: () => void
}

export default function SessionCard({ session, onPress }: Props) {
  const isToday = session.startTime > (Date.now() / 1000 - 86400)

  return (
    <Pressable style={styles.card} onPress={onPress}>
      <View style={styles.left}>
        <View style={[styles.dot, { backgroundColor: isToday ? C.green : C.text3 }]} />
        <View style={styles.info}>
          <Text style={styles.date}>{formatDate(session.startTime)}</Text>
          <Text style={styles.duration}>{formatDuration(session.startTime, session.endTime)}</Text>
        </View>
      </View>
      <View style={styles.right}>
        <Text style={styles.distance}>
          {session.distance_km != null ? session.distance_km.toFixed(1) : '—'}
          <Text style={styles.unit}> km</Text>
        </Text>
        {session.maxSpeed_kmh != null && (
          <Text style={styles.speed}>max {Math.round(session.maxSpeed_kmh)} km/h</Text>
        )}
      </View>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: C.card,
    borderRadius: R.lg,
    padding: S.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginHorizontal: S.md,
    marginBottom: S.sm,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  left: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  info: { gap: 2 },
  date: { fontSize: 14, fontWeight: '600', color: C.text1 },
  duration: { fontSize: 12, color: C.text3 },
  right: { alignItems: 'flex-end', gap: 2 },
  distance: { fontSize: 22, fontWeight: '700', color: C.text1 },
  unit: { fontSize: 13, fontWeight: '400', color: C.text2 },
  speed: { fontSize: 12, color: C.text3 },
})
```

- [ ] **Commit**:
```bash
git add components/SessionCard.tsx
git commit -m "feat(history): add SessionCard component"
```

---

### Task 6: App — history.tsx screen (session list)

**Files:**
- Create: `gps-tracker-app/app/history.tsx`

- [ ] **Create the file**:
```tsx
import { useEffect, useState } from 'react'
import { ActivityIndicator, FlatList, StyleSheet, Text, View } from 'react-native'
import { router, useLocalSearchParams } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import SessionCard from '../components/SessionCard'
import { listSessions } from '../services/historyService'
import { Session } from '../services/backendService'
import { C, S } from '../constants/design'

export default function HistoryScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>()
  const deviceId = id ?? ''
  const insets = useSafeAreaInsets()
  const [sessions, setSessions] = useState<Session[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    listSessions(deviceId).then((s) => { setSessions(s); setLoading(false) })
  }, [deviceId])

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <Text style={styles.title}>Percorsi</Text>
      {loading ? (
        <ActivityIndicator style={styles.loader} color={C.accent} />
      ) : sessions.length === 0 ? (
        <Text style={styles.empty}>Nessun percorso registrato</Text>
      ) : (
        <FlatList
          data={sessions}
          keyExtractor={(s) => s.id}
          renderItem={({ item }) => (
            <SessionCard
              session={item}
              onPress={() => router.push(`/session?id=${item.id}&device=${deviceId}`)}
            />
          )}
          contentContainerStyle={{ paddingTop: S.md, paddingBottom: insets.bottom + S.xl }}
          showsVerticalScrollIndicator={false}
        />
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  title: { fontSize: 28, fontWeight: '700', color: C.text1, paddingHorizontal: S.md, paddingBottom: S.md },
  loader: { marginTop: 60 },
  empty: { textAlign: 'center', color: C.text3, marginTop: 60, fontSize: 15 },
})
```

- [ ] **Register route in `_layout.tsx`** — add inside `<Stack>`:
```tsx
<Stack.Screen name="history" options={{ headerShown: false }} />
<Stack.Screen name="session" options={{ headerShown: false }} />
```

- [ ] **Add history button to tracker.tsx header** — add after the settings icon button:
```tsx
<Pressable
  onPress={() => router.push(`/history?id=${encodeURIComponent(deviceId)}`)}
  style={styles.iconBtn}
  hitSlop={8}
>
  <Ionicons name="time-outline" size={22} color={C.text1} />
</Pressable>
```

- [ ] **Commit**:
```bash
git add app/history.tsx app/_layout.tsx app/tracker.tsx
git commit -m "feat(history): add history screen with session list"
```

---

### Task 7: App — session.tsx (detail + map + scrubber)

**Files:**
- Create: `gps-tracker-app/app/session.tsx`

- [ ] **Create the file**:
```tsx
import { useEffect, useRef, useState } from 'react'
import { ActivityIndicator, Platform, StyleSheet, Text, View } from 'react-native'
import MapView, { Polyline, Marker, PROVIDER_GOOGLE } from 'react-native-maps'
import Slider from '@react-native-community/slider'
import { router, useLocalSearchParams } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { Pressable } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { getSessionPoints, formatDuration, formatDate } from '../services/historyService'
import { getBackend } from '../services/backendService'
import type { TrackPoint } from '../types'
import { C, S } from '../constants/design'

export default function SessionScreen() {
  const { id, device } = useLocalSearchParams<{ id: string; device: string }>()
  const insets = useSafeAreaInsets()
  const [points, setPoints] = useState<TrackPoint[]>([])
  const [loading, setLoading] = useState(true)
  const [scrubIndex, setScrubIndex] = useState(0)

  useEffect(() => {
    getSessionPoints(id, device).then((pts) => {
      setPoints(pts)
      setScrubIndex(pts.length - 1)
      setLoading(false)
    })
  }, [id, device])

  const coords = points.map((p) => ({ latitude: p.lat, longitude: p.lon }))
  const current = points[scrubIndex]

  return (
    <View style={{ flex: 1 }}>
      <View style={[styles.header, { paddingTop: insets.top + 6 }]}>
        <Pressable onPress={() => router.back()} style={styles.iconBtn} hitSlop={8}>
          <Ionicons name="arrow-back" size={22} color={C.text1} />
        </Pressable>
        <Text style={styles.title}>Dettaglio percorso</Text>
      </View>

      {loading ? (
        <ActivityIndicator style={{ marginTop: 60 }} color={C.accent} />
      ) : (
        <>
          <MapView
            style={{ flex: 1 }}
            provider={PROVIDER_GOOGLE}
            initialRegion={coords.length > 0 ? {
              latitude: coords[0].latitude,
              longitude: coords[0].longitude,
              latitudeDelta: 0.05,
              longitudeDelta: 0.05,
            } : undefined}
          >
            {coords.length > 1 && (
              <Polyline coordinates={coords} strokeColor={C.accent} strokeWidth={3} />
            )}
            {current && (
              <Marker
                coordinate={{ latitude: current.lat, longitude: current.lon }}
                image={require('../assets/marker.png')}
              />
            )}
          </MapView>

          <View style={[styles.panel, { paddingBottom: insets.bottom + S.md }]}>
            <Text style={styles.pointInfo}>
              Punto {scrubIndex + 1} / {points.length}
            </Text>
            <Slider
              style={{ width: '100%' }}
              minimumValue={0}
              maximumValue={Math.max(points.length - 1, 1)}
              step={1}
              value={scrubIndex}
              onValueChange={setScrubIndex}
              minimumTrackTintColor={C.accent}
              maximumTrackTintColor={C.sep}
              thumbTintColor={C.accent}
            />
          </View>
        </>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingBottom: 10,
    gap: 8,
    backgroundColor: C.card,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: C.sep,
  },
  iconBtn: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 16, fontWeight: '700', color: C.text1 },
  panel: { backgroundColor: C.card, paddingHorizontal: S.md, paddingTop: S.sm },
  pointInfo: { fontSize: 12, color: C.text3, textAlign: 'center', marginBottom: 4 },
})
```

- [ ] **Commit**:
```bash
git add app/session.tsx
git commit -m "feat(history): add session detail screen with map and scrubber"
```
