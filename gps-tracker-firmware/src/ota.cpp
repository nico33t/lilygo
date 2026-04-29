#include "ota.h"
#include "firmware_config.h"
#include <esp_ota_ops.h>
#include <esp_partition.h>
#include <Preferences.h>
#include <ArduinoHttpClient.h>
#include <TinyGsmClient.h>
#include <ArduinoJson.h>
#include <mbedtls/sha256.h>

extern TinyGsm modem;

static String s_ota_url = OTA_BASE_URL;

void ota_set_url(const String& url) {
  s_ota_url = url;
  Preferences prefs;
  prefs.begin("ota", false);
  prefs.putString("url", url);
  prefs.end();
}

static void load_url_from_nvs() {
  Preferences prefs;
  prefs.begin("ota", true);
  String saved = prefs.getString("url", "");
  prefs.end();
  if (saved.length() > 0) s_ota_url = saved;
}

bool ota_check(OtaInfo* info) {
  load_url_from_nvs();
  if (s_ota_url.isEmpty() || s_ota_url == "https://ota.example.com") {
    Serial.println("[OTA] URL non configurato");
    return false;
  }

  String host = s_ota_url;
  host.replace("https://", "");
  int slash = host.indexOf('/');
  String path = (slash >= 0 ? host.substring(slash) : String("")) + "/latest.json";
  host = slash >= 0 ? host.substring(0, slash) : host;

  TinyGsmClientSecure client(modem);
  HttpClient http(client, host, 443);
  if (http.get(path) != 0) { http.stop(); return false; }
  if (http.responseStatusCode() != 200) { http.stop(); return false; }

  String body = http.responseBody();
  http.stop();

  StaticJsonDocument<512> doc;
  if (deserializeJson(doc, body)) return false;

  info->version   = (const char*)(doc["version"]   | "");
  info->url       = (const char*)(doc["url"]       | "");
  info->sha256    = (const char*)(doc["sha256"]    | "");
  info->changelog = (const char*)(doc["changelog"] | "");
  info->available = (info->version != FIRMWARE_VERSION && info->version.length() > 0);

  Serial.printf("[OTA] Latest: %s (current: %s)\n", info->version.c_str(), FIRMWARE_VERSION);
  return info->available;
}

bool ota_apply(const OtaInfo& info, void (*progress_cb)(int pct)) {
  Serial.printf("[OTA] Download: %s\n", info.url.c_str());

  String host = info.url;
  host.replace("https://", "");
  int slash = host.indexOf('/');
  String path = slash >= 0 ? host.substring(slash) : String("/");
  host = slash >= 0 ? host.substring(0, slash) : host;

  TinyGsmClientSecure client(modem);
  HttpClient http(client, host, 443);
  if (http.get(path) != 0 || http.responseStatusCode() != 200) {
    http.stop(); return false;
  }

  int total = http.contentLength();
  const esp_partition_t* update_partition = esp_ota_get_next_update_partition(NULL);
  esp_ota_handle_t ota_handle;
  if (esp_ota_begin(update_partition, OTA_SIZE_UNKNOWN, &ota_handle) != ESP_OK) {
    http.stop(); return false;
  }

  mbedtls_sha256_context sha_ctx;
  mbedtls_sha256_init(&sha_ctx);
  mbedtls_sha256_starts(&sha_ctx, 0);

  uint8_t buf[512];
  int downloaded = 0;
  while (http.connected() || http.available()) {
    int avail = http.available();
    if (avail > 0) {
      int n = http.readBytes(buf, min(avail, (int)sizeof(buf)));
      esp_ota_write(ota_handle, buf, n);
      mbedtls_sha256_update(&sha_ctx, buf, n);
      downloaded += n;
      if (total > 0 && progress_cb) progress_cb(downloaded * 100 / total);
    }
    delay(1);
  }
  http.stop();

  uint8_t hash[32];
  mbedtls_sha256_finish(&sha_ctx, hash);
  mbedtls_sha256_free(&sha_ctx);

  if (info.sha256.length() == 64) {
    char computed[65];
    for (int i = 0; i < 32; i++) snprintf(computed + i*2, 3, "%02x", hash[i]);
    if (info.sha256 != String(computed)) {
      Serial.println("[OTA] SHA256 mismatch — rollback");
      esp_ota_abort(ota_handle);
      return false;
    }
  }

  if (esp_ota_end(ota_handle) != ESP_OK) return false;
  if (esp_ota_set_boot_partition(update_partition) != ESP_OK) return false;

  Serial.println("[OTA] Applicato. Riavvio...");
  delay(500);
  esp_restart();
  return true;
}
