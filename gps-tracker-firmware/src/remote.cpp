#include "remote.h"
#include <Preferences.h>
#include <ArduinoHttpClient.h>
#include <TinyGsmClient.h>
#include <ArduinoJson.h>

extern TinyGsm modem;

static String s_url;
static String s_token;
static String s_device_id = "default";

static TinyGsmClientSecure gsmClient(modem);

// Firebase RTDB REST requires PUT (not POST) to set a value at a specific path.
// POST would create a random push-key child instead of writing at the given path.
static bool do_put(const String& path, const String& body) {
  if (s_url.isEmpty()) return false;

  String host = s_url;
  host.replace("https://", "");
  host.replace("http://", "");

  HttpClient http(gsmClient, host, 443);

  String full_path = path;
  if (!s_token.isEmpty()) full_path += "?auth=" + s_token;

  int err = http.put(full_path, "application/json", body);
  if (err != 0) {
    Serial.printf("[REM] PUT error %d\n", err);
    http.stop();
    return false;
  }
  int status = http.responseStatusCode();
  http.skipResponseHeaders();
  http.stop();
  Serial.printf("[REM] PUT %s → %d\n", path.c_str(), status);
  return status >= 200 && status < 300;
}

uint32_t remote_gps_to_unix(int year, int month, int day,
                             int hour, int min, int sec) {
  if (year < 2020) return 0;
  static const uint8_t days_per_month[] = {31,28,31,30,31,30,31,31,30,31,30,31};
  uint32_t days = 0;
  for (int y = 1970; y < year; y++)
    days += ((y % 4 == 0) && (y % 100 != 0 || y % 400 == 0)) ? 366 : 365;
  bool leap = (year % 4 == 0) && (year % 100 != 0 || year % 400 == 0);
  for (int m = 1; m < month; m++) {
    days += days_per_month[m - 1];
    if (m == 2 && leap) days++;
  }
  days += day - 1;
  return days * 86400UL + hour * 3600UL + min * 60UL + sec;
}

void remote_init() {
  Preferences prefs;
  prefs.begin("remote", true);
  s_url       = prefs.getString("url", "");
  s_token     = prefs.getString("token", "");
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
                      float heading, uint32_t unix_ts,
                      int bat_mv, const char* power_mode) {
  StaticJsonDocument<256> doc;
  doc["lat"]        = lat;
  doc["lon"]        = lon;
  doc["speed"]      = speed;
  doc["alt"]        = alt;
  doc["heading"]    = heading;
  doc["bat_mv"]     = bat_mv;
  doc["power_mode"] = power_mode;
  doc["ts"]         = unix_ts ? unix_ts : millis() / 1000;
  String body;
  serializeJson(doc, body);
  return do_put("/devices/" + s_device_id + "/live.json", body);
}

// RTDB layout:
//   /sessions/{deviceId}/{sessionId}/start_time  ← PUT single value
//   /sessions/{deviceId}/{sessionId}/end_time    ← PUT single value
//   /sessions/{deviceId}/{sessionId}/stats.json  ← PUT object
//   /sessions/{deviceId}/{sessionId}/points/{unix_ts}.json ← PUT per point
// This layout lets the app query orderByChild('start_time') on /sessions/{deviceId}.

bool remote_send_session_start(const String& session_id, uint32_t unix_ts) {
  String val = String(unix_ts);
  return do_put("/sessions/" + s_device_id + "/" + session_id + "/start_time.json", val);
}

bool remote_send_track_point(const String& session_id,
                              float lat, float lon, float speed, float alt,
                              uint32_t unix_ts) {
  StaticJsonDocument<192> doc;
  doc["lat"]   = lat;
  doc["lon"]   = lon;
  doc["speed"] = speed;
  doc["alt"]   = alt;
  doc["ts"]    = unix_ts;
  String body;
  serializeJson(doc, body);
  String ts_key = String(unix_ts ? unix_ts : millis() / 1000);
  return do_put("/sessions/" + s_device_id + "/" + session_id + "/points/" + ts_key + ".json", body);
}

bool remote_send_session_end(const String& session_id,
                              float distance_km, float max_speed, float avg_speed,
                              uint32_t start_unix, uint32_t end_unix) {
  // Write end_time as a direct child so orderByChild('end_time') works too
  String end_val = String(end_unix);
  bool ok = do_put("/sessions/" + s_device_id + "/" + session_id + "/end_time.json", end_val);

  // Write stats as a sub-object
  StaticJsonDocument<128> stats;
  stats["distance_km"]   = distance_km;
  stats["max_speed_kmh"] = max_speed;
  stats["avg_speed_kmh"] = avg_speed;
  stats["start_time"]    = start_unix;  // denormalise for convenience
  String stats_body;
  serializeJson(stats, stats_body);
  ok &= do_put("/sessions/" + s_device_id + "/" + session_id + "/stats.json", stats_body);
  return ok;
}
