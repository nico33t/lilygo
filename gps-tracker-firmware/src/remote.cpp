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

static bool do_post(const String& path, const String& body) {
  if (s_url.isEmpty()) return false;

  String host = s_url;
  host.replace("https://", "");
  host.replace("http://", "");

  HttpClient http(gsmClient, host, 443);

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
                      int bat_mv, const char* power_mode) {
  StaticJsonDocument<256> doc;
  doc["device_id"]  = s_device_id;
  doc["lat"]        = lat;
  doc["lon"]        = lon;
  doc["speed"]      = speed;
  doc["alt"]        = alt;
  doc["bat_mv"]     = bat_mv;
  doc["power_mode"] = power_mode;
  doc["ts"]         = millis() / 1000;
  String body;
  serializeJson(doc, body);
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
