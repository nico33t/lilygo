#include <Arduino.h>
#include <ArduinoJson.h>
#include <NimBLEDevice.h>
#include <Wire.h>

#define XPOWERS_CHIP_AXP2101
#include "XPowersLib.h"

#define TINY_GSM_MODEM_SIM7080
#define TINY_GSM_RX_BUFFER 1024
#include <StreamDebugger.h>
#include <TinyGsmClient.h>

#include "utilities.h"
#include "web_ui.h"

// ─── Feature flags ─────────────────────────────────────────────────────────
// Imposta 1 per riattivare l'Access Point WiFi + WebSocket server
#define ENABLE_WIFI 0

#if ENABLE_WIFI
#include <WebServer.h>
#include <WebSocketsServer.h>
#include <WiFi.h>
#define AP_SSID "GPS-Tracker"
#define AP_PASS "gpstrack1"
#endif

// ─── BLE ────────────────────────────────────────────────────────────────────
// Nordic UART Service — stesso protocollo JSON del WebSocket
#define BLE_SERVICE_UUID "6E400001-B5A3-F393-E0A9-E50E24DCCA9E"
#define BLE_RX_UUID      "6E400002-B5A3-F393-E0A9-E50E24DCCA9E"
#define BLE_TX_UUID      "6E400003-B5A3-F393-E0A9-E50E24DCCA9E"
#define BLE_DEVICE_NAME  "GPS-Tracker"

#define FIRMWARE_VERSION "0.0.2"

#define USE_MODEM_DEBUGGER 1

// ─── Globals ───────────────────────────────────────────────────────────────

XPowersPMU PMU;
HardwareSerial SerialAT(1);

#if USE_MODEM_DEBUGGER
StreamDebugger debugger(SerialAT, Serial);
TinyGsm modem(debugger);
#else
TinyGsm modem(SerialAT);
#endif

#if ENABLE_WIFI
WebServer httpServer(80);
WebSocketsServer wsServer(81);
#endif

struct GPSData {
  float lat = 0;
  float lon = 0;
  float speed_kmh = 0;
  float altitude = 0;
  int vsat = 0;
  int usat = 0;
  float accuracy = 0;
  int year = 0;
  int month = 0;
  int day = 0;
  int hour = 0;
  int minute = 0;
  int sec = 0;
  bool valid = false;
};

static GPSData gps;
static bool ledLevel = false;
static uint32_t lastGPS = 0;
static uint32_t lastFixMs = 0;
static uint32_t gpsIntervalMs = 2000;
static int gnssMode = 1; // 0=GPS only, 1=GPS+BeiDou

// BLE state
static NimBLEServer*         pServer     = nullptr;
static NimBLECharacteristic* pTxChar     = nullptr;
static NimBLECharacteristic* pRxChar     = nullptr;
static bool                  bleConnected = false;

// ─── Utility ────────────────────────────────────────────────────────────────

static String getField(const String &s, int idx) {
  int pos = 0;
  int cur = 1;
  while (cur < idx) {
    pos = s.indexOf(',', pos);
    if (pos < 0) return "";
    pos++;
    cur++;
  }
  int end = s.indexOf(',', pos);
  return (end < 0) ? s.substring(pos) : s.substring(pos, end);
}

static void sendDiag(const char *cmd, uint32_t timeout = 3000) {
  String resp;
  modem.sendAT(cmd);
  modem.waitResponse(timeout, resp);
  resp.trim();
  Serial.printf("[DIAG] AT%s -> %s\n", cmd, resp.c_str());
}

// ─── PMU ───────────────────────────────────────────────────────────────────

static void initPMU() {
  if (!PMU.begin(Wire, AXP2101_SLAVE_ADDRESS, I2C_SDA, I2C_SCL)) {
    Serial.println("[PMU] Init FAILED");
    while (true) delay(1000);
  }
  if (esp_sleep_get_wakeup_cause() == ESP_SLEEP_WAKEUP_UNDEFINED) {
    Serial.println("[PMU] Cold boot: power-cycle modem rail");
    PMU.disableDC3();
    delay(300);
  }
  PMU.setDC3Voltage(3000);
  PMU.enableDC3();
  PMU.setBLDO2Voltage(3300);
  PMU.enableBLDO2();
  PMU.disableTSPinMeasure();
  Serial.println("[PMU] OK");
  Serial.printf("[PMU] DC3: %s @ %dmV\n", PMU.isEnableDC3() ? "ON" : "OFF", (int)PMU.getDC3Voltage());
  Serial.printf("[PMU] BLDO2: %s @ %dmV\n", PMU.isEnableBLDO2() ? "ON" : "OFF", (int)PMU.getBLDO2Voltage());
}

// ─── Modem ─────────────────────────────────────────────────────────────────

static void pulseModemPowerKey() {
  digitalWrite(BOARD_MODEM_PWR_PIN, LOW);
  delay(100);
  digitalWrite(BOARD_MODEM_PWR_PIN, HIGH);
  delay(1000);
  digitalWrite(BOARD_MODEM_PWR_PIN, LOW);
}

static void initModem() {
  SerialAT.begin(MODEM_BAUD, SERIAL_8N1, BOARD_MODEM_RXD_PIN, BOARD_MODEM_TXD_PIN);
  pinMode(BOARD_MODEM_PWR_PIN, OUTPUT);
  digitalWrite(BOARD_MODEM_PWR_PIN, LOW);
  delay(300);
  Serial.println("[MODEM] Power key pulse...");
  pulseModemPowerKey();
  Serial.print("[MODEM] Attesa risposta AT");
  int retries = 0;
  while (!modem.testAT(1000)) {
    Serial.print(".");
    retries++;
    if (retries > 15) {
      Serial.println("\n[MODEM] Timeout, nuovo power-cycle...");
      pulseModemPowerKey();
      retries = 0;
    }
  }
  Serial.println("\n[MODEM] OK");
  sendDiag("E0", 1000);
  sendDiag("+CGMM", 1000);
  sendDiag("+CGMR", 1000);
}

// ─── GPS ───────────────────────────────────────────────────────────────────

static void initGPS() {
  Serial.println("[GPS] === Init GNSS ===");
  sendDiag("+CCLK=\"26/04/28,14:00:00+02\"", 2000);
  sendDiag("+CGNSPWR=0", 2000);
  delay(1500);
  PMU.setBLDO2Voltage(3300);
  PMU.enableBLDO2();
  Serial.printf("[PMU] BLDO2: %s @ %dmV\n", PMU.isEnableBLDO2() ? "ON" : "OFF", (int)PMU.getBLDO2Voltage());
  sendDiag("+CGNSMOD=1,0,1,0,0", 1000);
  sendDiag("+SGNSCMD=2,1000,0,0", 1000);
  sendDiag("+SGNSCMD=0", 1000);
  delay(500);
  sendDiag("+CGNSPWR=1", 3000);
  delay(2000);
  sendDiag("+CGNSPWR?", 2000);
  sendDiag("+CGNSINF", 3000);
  Serial.println("[GPS] === Fine init ===");
}

// ─── Config helpers ────────────────────────────────────────────────────────

static void applyGnssMode() {
  if (gnssMode == 0) {
    sendDiag("+CGNSMOD=1,0,0,0,0", 1000);
  } else {
    sendDiag("+CGNSMOD=1,0,1,0,0", 1000);
  }
}

static String buildConfigJson() {
  StaticJsonDocument<128> cfg;
  cfg["type"]        = "config";
  cfg["interval_ms"] = gpsIntervalMs;
  cfg["gnss_mode"]   = gnssMode;
  String out;
  serializeJson(cfg, out);
  return out;
}

// ─── BLE callbacks ─────────────────────────────────────────────────────────

class BLEServerCallbacks : public NimBLEServerCallbacks {
  void onConnect(NimBLEServer* pSrv, ble_gap_conn_desc* desc) override {
    bleConnected = true;
    Serial.printf("[BLE] Client connesso: %s\n", NimBLEAddress(desc->peer_ota_addr).toString().c_str());
    // Invia configurazione appena connesso
    if (pTxChar) {
      String cfg = buildConfigJson();
      pTxChar->setValue(cfg.c_str());
      pTxChar->notify();
    }
  }
  void onDisconnect(NimBLEServer* pSrv) override {
    bleConnected = false;
    Serial.println("[BLE] Client disconnesso, riavvio advertising...");
    NimBLEDevice::startAdvertising();
  }
};

class RxCallbacks : public NimBLECharacteristicCallbacks {
  void onWrite(NimBLECharacteristic* pChar) override {
    std::string val = pChar->getValue();
    if (val.empty()) return;

    StaticJsonDocument<128> cmd;
    if (deserializeJson(cmd, val.c_str(), val.length())) return;

    const char* c = cmd["cmd"] | "";

    if (strcmp(c, "set_interval") == 0) {
      int v = cmd["value"] | (int)gpsIntervalMs;
      gpsIntervalMs = (uint32_t)constrain(v, 500, 10000);
      Serial.printf("[BLE] Intervallo GPS: %u ms\n", gpsIntervalMs);
    } else if (strcmp(c, "set_gnss_mode") == 0) {
      int mode = cmd["value"] | gnssMode;
      gnssMode = constrain(mode, 0, 1);
      applyGnssMode();
      Serial.printf("[BLE] Modalità GNSS: %d\n", gnssMode);
    } else if (strcmp(c, "get_config") != 0) {
      return; // unknown command
    }

    // Rispondi con config aggiornata
    String cfg = buildConfigJson();
    pTxChar->setValue(cfg.c_str());
    pTxChar->notify();
  }
};

static void initBLE() {
  NimBLEDevice::init(BLE_DEVICE_NAME);
  NimBLEDevice::setPower(ESP_PWR_LVL_P9);
  NimBLEDevice::setMTU(512);

  pServer = NimBLEDevice::createServer();
  pServer->setCallbacks(new BLEServerCallbacks());

  NimBLEService* pService = pServer->createService(BLE_SERVICE_UUID);

  // TX: device → phone (notify)
  pTxChar = pService->createCharacteristic(BLE_TX_UUID, NIMBLE_PROPERTY::NOTIFY);

  // RX: phone → device (write)
  pRxChar = pService->createCharacteristic(
    BLE_RX_UUID,
    NIMBLE_PROPERTY::WRITE | NIMBLE_PROPERTY::WRITE_NR
  );
  pRxChar->setCallbacks(new RxCallbacks());

  pService->start();

  NimBLEAdvertising* pAdv = NimBLEDevice::getAdvertising();
  pAdv->addServiceUUID(BLE_SERVICE_UUID);
  pAdv->setScanResponse(true);
  pAdv->setMinPreferred(0x06);
  pAdv->start();

  Serial.printf("[BLE] Advertising: %s\n", BLE_DEVICE_NAME);
}

// ─── WiFi + Web ────────────────────────────────────────────────────────────
#if ENABLE_WIFI

static void sendConfigToClient(uint8_t num) {
  String cfg = buildConfigJson();
  wsServer.sendTXT(num, cfg);
}

static void onWSEvent(uint8_t num, WStype_t type, uint8_t *payload, size_t length) {
  switch (type) {
  case WStype_CONNECTED:
    Serial.printf("[WS] Client %u connesso\n", num);
    sendConfigToClient(num);
    break;
  case WStype_DISCONNECTED:
    Serial.printf("[WS] Client %u disconnesso\n", num);
    break;
  case WStype_TEXT: {
    StaticJsonDocument<128> cmd;
    if (deserializeJson(cmd, payload, length)) break;
    const char *c = cmd["cmd"] | "";
    if (strcmp(c, "set_interval") == 0) {
      int val = cmd["value"] | (int)gpsIntervalMs;
      gpsIntervalMs = (uint32_t)constrain(val, 500, 10000);
      Serial.printf("[WS] Intervallo GPS: %u ms\n", gpsIntervalMs);
      sendConfigToClient(num);
    } else if (strcmp(c, "set_gnss_mode") == 0) {
      int mode = cmd["value"] | gnssMode;
      gnssMode = constrain(mode, 0, 1);
      applyGnssMode();
      Serial.printf("[WS] Modalità GNSS: %d\n", gnssMode);
      sendConfigToClient(num);
    } else if (strcmp(c, "get_config") == 0) {
      sendConfigToClient(num);
    }
    break;
  }
  default: break;
  }
}

static void initWiFi() {
  WiFi.mode(WIFI_AP);
  bool apOk = WiFi.softAP(AP_SSID, AP_PASS);
  if (!apOk) {
    Serial.println("[WiFi] Errore avvio Access Point");
  } else {
    Serial.printf("[WiFi] AP: %s  IP: %s\n", AP_SSID, WiFi.softAPIP().toString().c_str());
  }
  httpServer.on("/", HTTP_GET, []() { httpServer.send_P(200, "text/html", INDEX_HTML); });
  httpServer.on("/status", HTTP_GET, []() {
    StaticJsonDocument<256> d;
    d["ok"] = true;
    d["gps_valid"] = gps.valid;
    d["uptime_s"] = millis() / 1000;
    d["lat"] = gps.lat;
    d["lon"] = gps.lon;
    d["sat_used"] = gps.usat;
    d["sat_view"] = gps.vsat;
    d["hdop"] = gps.accuracy;
    d["last_fix_age_s"] = lastFixMs > 0 ? (millis() - lastFixMs) / 1000 : -1;
    String json;
    serializeJson(d, json);
    httpServer.send(200, "application/json", json);
  });
  httpServer.onNotFound([]() { httpServer.send(404, "text/plain", "404 - Not found"); });
  httpServer.begin();
  wsServer.begin();
  wsServer.onEvent(onWSEvent);
  Serial.println("[Web] http://192.168.4.1");
}

#endif // ENABLE_WIFI

// ─── GPS send ──────────────────────────────────────────────────────────────

static void sendGPSData() {
  StaticJsonDocument<384> doc;
  doc["valid"] = gps.valid;
  doc["lat"]   = gps.lat;
  doc["lon"]   = gps.lon;
  doc["speed"] = gps.speed_kmh;
  doc["alt"]   = gps.altitude;
  doc["vsat"]  = gps.vsat;
  doc["usat"]  = gps.usat;
  doc["acc"]   = gps.accuracy;
  doc["hdop"]  = gps.accuracy;
  doc["last_fix_age_s"] = lastFixMs > 0 ? (long)((millis() - lastFixMs) / 1000) : -1;

  char t[24];
  if (gps.year > 0) {
    snprintf(t, sizeof(t), "%04d-%02d-%02d %02d:%02d:%02d",
             gps.year, gps.month, gps.day, gps.hour, gps.minute, gps.sec);
  } else {
    snprintf(t, sizeof(t), "no-time");
  }
  doc["time"] = t;

  String out;
  serializeJson(doc, out);

  // BLE notify
  if (bleConnected && pTxChar) {
    pTxChar->setValue(out.c_str());
    pTxChar->notify();
  }

#if ENABLE_WIFI
  wsServer.broadcastTXT(out);
#endif
}

// ─── GPS read ──────────────────────────────────────────────────────────────

static void readGPS() {
  String raw;
  modem.sendAT("+CGNSINF");
  int8_t res = modem.waitResponse(1000, raw);
  if (res != 1) {
    static uint32_t lastNoRespLog = 0;
    if (millis() - lastNoRespLog > 5000) { lastNoRespLog = millis(); Serial.println("[GPS] Nessuna risposta valida da AT+CGNSINF"); }
    return;
  }

  int dataStart = raw.indexOf("+CGNSINF:");
  if (dataStart < 0) {
    static uint32_t lastBadLog = 0;
    if (millis() - lastBadLog > 5000) { lastBadLog = millis(); Serial.println("[GPS] Risposta senza +CGNSINF:"); Serial.println(raw); }
    return;
  }

  int lineEnd = raw.indexOf('\n', dataStart);
  String data = lineEnd >= 0 ? raw.substring(dataStart + 9, lineEnd) : raw.substring(dataStart + 9);
  data.replace("\r", "");
  data.trim();

  String runStatus  = getField(data, 1);
  String fixStatus  = getField(data, 2);
  String utc        = getField(data, 3);
  String latStr     = getField(data, 4);
  String lonStr     = getField(data, 5);
  String altStr     = getField(data, 6);
  String spdStr     = getField(data, 7);
  String hdopStr    = getField(data, 11);
  String satViewStr = getField(data, 15);
  String satUsedStr = getField(data, 16);

  int satView = satViewStr.length() > 0 ? satViewStr.toInt() : 0;
  int satUsed = satUsedStr.length() > 0 ? satUsedStr.toInt() : 0;

  // B16 firmware bug: fix field is always empty even with valid coordinates
  bool hasCoords = latStr.length() > 0 && lonStr.length() > 0 &&
                   latStr.toFloat() != 0.0f && lonStr.toFloat() != 0.0f;
  bool hasFix = hasCoords && (fixStatus == "1" || fixStatus == "");

  static uint32_t lastLog = 0;
  if (hasFix || millis() - lastLog > 5000) {
    lastLog = millis();
    Serial.printf("[GPS] run=%s fix=%s sat=%d/%d hdop=%s lat=%s lon=%s\n",
                  runStatus.c_str(), fixStatus.c_str(), satUsed, satView,
                  hdopStr.length() ? hdopStr.c_str() : "?",
                  latStr.length() ? latStr.c_str() : "?",
                  lonStr.length() ? lonStr.c_str() : "?");
  }

  gps.vsat = satView;
  gps.usat = satUsed;
  if (hdopStr.length() > 0) gps.accuracy = hdopStr.toFloat();

  if (utc.length() >= 14) {
    gps.year   = utc.substring(0, 4).toInt();
    gps.month  = utc.substring(4, 6).toInt();
    gps.day    = utc.substring(6, 8).toInt();
    gps.hour   = utc.substring(8, 10).toInt();
    gps.minute = utc.substring(10, 12).toInt();
    gps.sec    = utc.substring(12, 14).toInt();
  }

  if (hasFix) {
    gps.valid     = true;
    gps.lat       = latStr.toFloat();
    gps.lon       = lonStr.toFloat();
    gps.altitude  = altStr.toFloat();
    gps.speed_kmh = spdStr.toFloat() * 1.852f;
    lastFixMs     = millis();
    PMU.setChargingLedMode(XPOWERS_CHG_LED_BLINK_4HZ);
    Serial.printf("[GPS] FIX! %.6f, %.6f  sat=%d/%d  %.1fkm/h  %.1fm  hdop=%.1f\n",
                  gps.lat, gps.lon, satUsed, satView, gps.speed_kmh, gps.altitude, gps.accuracy);
  } else {
    gps.valid = false;
    ledLevel  = !ledLevel;
    PMU.setChargingLedMode(ledLevel ? XPOWERS_CHG_LED_ON : XPOWERS_CHG_LED_OFF);
  }
}

// ─── Setup / Loop ──────────────────────────────────────────────────────────

void setup() {
  Serial.begin(115200);
  delay(5000);
  Serial.println();
  Serial.println("=== GPS TRACKER BOOT v" FIRMWARE_VERSION " ===");
  Serial.printf("Modalità: %s\n", ENABLE_WIFI ? "WiFi + BLE" : "BLE");

  initPMU();
  initModem();
  initGPS();
  initBLE();

#if ENABLE_WIFI
  initWiFi();
  Serial.printf("Collegati al WiFi \"%s\"  pass: %s\n", AP_SSID, AP_PASS);
  Serial.println("Poi apri: http://192.168.4.1");
#endif

  Serial.println("=== PRONTO ===");
}

void loop() {
#if ENABLE_WIFI
  httpServer.handleClient();
  wsServer.loop();
#endif

  uint32_t now = millis();
  if (now - lastGPS >= gpsIntervalMs) {
    lastGPS = now;
    readGPS();
    sendGPSData();
  }
}
