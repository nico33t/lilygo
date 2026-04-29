#include "session.h"
#include "remote.h"
#include <math.h>

#define SESSION_START_SPEED_KMH  3.0f
#define SESSION_END_STOP_S       300     // 5 minutes
#define TRACK_POINT_INTERVAL_MS  30000

struct SessionStats {
  float distance_km   = 0;
  float max_speed_kmh = 0;
  float avg_speed_sum = 0;
  int   avg_speed_cnt = 0;
};

static bool         s_active          = false;
static String       s_id;
static SessionStats s_stats;
static uint32_t     s_stop_ms         = 0;
static uint32_t     s_last_point_ms   = 0;
static float        s_last_lat        = 0, s_last_lon = 0;
static bool         s_first           = true;

static String make_session_id() {
  char buf[20];
  snprintf(buf, sizeof(buf), "s%lu", millis());
  return String(buf);
}

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
      s_id    = make_session_id();
      s_stats = {};
      s_active = true;
      s_first  = true;
      s_stop_ms = 0;
      s_last_point_ms = 0;
      remote_send_session_start(s_id);
      Serial.printf("[SES] Sessione avviata: %s\n", s_id.c_str());
    }
    return;
  }

  if (speed_kmh > s_stats.max_speed_kmh) s_stats.max_speed_kmh = speed_kmh;
  s_stats.avg_speed_sum += speed_kmh;
  s_stats.avg_speed_cnt++;

  if (!s_first) s_stats.distance_km += haversine(s_last_lat, s_last_lon, lat, lon);
  s_first    = false;
  s_last_lat = lat;
  s_last_lon = lon;

  if (now - s_last_point_ms >= TRACK_POINT_INTERVAL_MS) {
    s_last_point_ms = now;
    remote_send_track_point(s_id, lat, lon, speed_kmh, 0);
  }

  if (speed_kmh < SESSION_START_SPEED_KMH) {
    if (s_stop_ms == 0) s_stop_ms = now;
    if ((now - s_stop_ms) / 1000 >= SESSION_END_STOP_S) {
      float avg = s_stats.avg_speed_cnt > 0
                  ? s_stats.avg_speed_sum / s_stats.avg_speed_cnt : 0;
      remote_send_session_end(s_id, s_stats.distance_km, s_stats.max_speed_kmh, avg);
      Serial.printf("[SES] Fine: %.2f km, %.0f km/h max\n",
                    s_stats.distance_km, s_stats.max_speed_kmh);
      s_active  = false;
      s_stop_ms = 0;
    }
  } else {
    s_stop_ms = 0;
  }
}
