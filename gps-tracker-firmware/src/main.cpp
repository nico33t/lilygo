#include <Arduino.h>
#include <ArduinoJson.h>
#include <NimBLEDevice.h>
#include <Preferences.h>
#include <Wire.h>
#include "firmware_config.h"
#include "power.h"
#include "remote.h"
#include "session.h"
#include "ota.h"

#define XPOWERS_CHIP_AXP2101
#include "XPowersLib.h"

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

#define USE_MODEM_DEBUGGER 1

// ─── FreeRTOS IPC ───────────────────────────────────────────────────────────
//
// modemTask  (Core 1) — proprietario esclusivo di SerialAT:
//   legge GPS, SIM, gestisce remote_send e OTA.
//   Posta su s_bleQueue i messaggi JSON da inviare via BLE.
//
// bleTask    (Core 0) — co-locato con il NimBLE host task:
//   drena s_bleQueue → chiama txJsonChunked().
//   I comandi BLE in arrivo vengono postati su s_cmdQueue per modemTask.
//
// Nessun mutex su SerialAT: è accessibile solo da modemTask.

#define BLE_MSG_MAX    512
#define BLE_QUEUE_LEN    8
#define CMD_QUEUE_LEN    8

struct BleMsg { char buf[BLE_MSG_MAX]; };

struct BleCmd {
  char type[32];
  char strVal[128];
  int  intVal;
};

static QueueHandle_t s_bleQueue;   // Core 1 → Core 0
static QueueHandle_t s_cmdQueue;   // Core 0 → Core 1

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
  float heading = 0;   // course over ground, degrees 0-360
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
  bool stored = false; // true = caricato da NVS, non live
};

struct SimData {
  int    rssi_dbm = 0;
  String iccid;
  String op;
  String net_type;   // LTE-M, NB-IoT, GSM, NO SERVICE
  bool   registered = false;
};

static GPSData gps;
static SimData sim;
static Preferences prefs;
static bool ledLevel = false;

// Timing — accessibili solo da modemTask dopo l'avvio dei task
static uint32_t lastGPS       = 0;
static uint32_t lastSend      = 0;
static uint32_t lastFixMs     = 0;
static uint32_t lastSimMs     = 0;
static uint32_t lastOtaCheck  = 0;
static uint32_t gpsIntervalMs  = 2000;
static uint32_t sendIntervalMs = 5000;
static int gnssMode = 1;
static PowerState currentPowerState = PowerState::MOVING;
static OtaInfo    otaInfo;
#define SIM_INTERVAL_MS       30000
#define OTA_CHECK_INTERVAL_MS (24UL * 3600 * 1000)

// BLE state — volatile: scritto dai callback NimBLE (Core 0),
// letto da bleTask (Core 0) e modemTask (Core 1) per il cap degli intervalli.
// bool e uint16_t sono atomici su ARM Cortex-M.
static NimBLEServer*         pServer     = nullptr;
static NimBLECharacteristic* pTxChar     = nullptr;
static NimBLECharacteristic* pRxChar     = nullptr;
static volatile bool         bleConnected  = false;
static volatile uint16_t     bleConnHandle = 0xFFFF;

// ─── IPC helpers ────────────────────────────────────────────────────────────

// Chiamabile da qualsiasi core — posta un JSON sulla coda BLE TX.
// Non blocca: se la coda è piena il messaggio viene scartato.
static void postToBle(const String& json) {
  if (!s_bleQueue) return;
  BleMsg msg;
  size_t len = min(json.length(), (size_t)(BLE_MSG_MAX - 1));
  memcpy(msg.buf, json.c_str(), len);
  msg.buf[len] = '\0';
  xQueueSend(s_bleQueue, &msg, 0);
}

// Chiamabile dai callback BLE (Core 0) — posta un comando per modemTask.
static void postCmd(const char* type, int intVal = 0, const char* strVal = "") {
  if (!s_cmdQueue) return;
  BleCmd cmd;
  strncpy(cmd.type,   type,   sizeof(cmd.type)   - 1); cmd.type[sizeof(cmd.type) - 1]     = '\0';
  strncpy(cmd.strVal, strVal, sizeof(cmd.strVal) - 1); cmd.strVal[sizeof(cmd.strVal) - 1] = '\0';
  cmd.intVal = intVal;
  xQueueSend(s_cmdQueue, &cmd, 0);
}

// ─── Utility ────────────────────────────────────────────────────────────────

static String getField(const String& s, int idx) {
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

static void sendDiag(const char* cmd, uint32_t timeout = 3000) {
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
  Serial.printf("[PMU] DC3: %s @ %dmV\n",   PMU.isEnableDC3()   ? "ON" : "OFF", (int)PMU.getDC3Voltage());
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

  // Network config: LTE-M + NB-IoT, bande Italia (20=800MHz, 3=1800MHz, 8=900MHz)
  sendDiag("+CNMP=38",                     2000);
  sendDiag("+CMNB=3",                      2000);
  sendDiag("+CBANDCFG=\"CAT-M\",20,3,8",   3000);
  sendDiag("+CBANDCFG=\"NB-IOT\",20,3,8",  3000);

  // APN Emnify
  sendDiag("+CGDCONT=1,\"IP\",\"em\"", 2000);

  // Registrazione automatica rete
  sendDiag("+COPS=0", 5000);
  Serial.println("[MODEM] Config rete completata, attesa registrazione...");
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
  StaticJsonDocument<160> cfg;
  cfg["type"]        = "config";
  cfg["interval_ms"] = gpsIntervalMs;
  cfg["gnss_mode"]   = gnssMode;
  cfg["fw_version"]  = FIRMWARE_VERSION;
  String out;
  serializeJson(cfg, out);
  return out;
}

// ─── SIM / Cellular ────────────────────────────────────────────────────────

static void readSimData() {
  String resp;

  modem.sendAT("+CSQ");
  resp = "";
  if (modem.waitResponse(2000, resp) == 1) {
    int idx = resp.indexOf("+CSQ:");
    if (idx >= 0) {
      String data = resp.substring(idx + 5);
      data.trim();
      int csq = getField(data, 1).toInt();
      if (csq > 0 && csq < 99) sim.rssi_dbm = -113 + 2 * csq;
    }
  }

  modem.sendAT("+CCID");
  resp = "";
  if (modem.waitResponse(3000, resp) == 1) {
    int idx = resp.indexOf("+CCID:");
    String icc = idx >= 0 ? resp.substring(idx + 6) : resp;
    icc.trim();
    int nl = icc.indexOf('\n');
    if (nl >= 0) icc = icc.substring(0, nl);
    icc.trim();
    while (icc.length() > 0 && (icc[icc.length()-1] == 'F' || icc[icc.length()-1] == 'f'))
      icc.remove(icc.length() - 1);
    if (icc.length() >= 10) sim.iccid = icc;
  }

  modem.sendAT("+COPS=3,0");
  modem.waitResponse(1000);
  modem.sendAT("+COPS?");
  resp = "";
  if (modem.waitResponse(5000, resp) == 1) {
    int q1 = resp.indexOf('"');
    int q2 = q1 >= 0 ? resp.indexOf('"', q1 + 1) : -1;
    if (q1 >= 0 && q2 > q1) {
      sim.op = resp.substring(q1 + 1, q2);
      if (sim.op.length() > 16) sim.op = sim.op.substring(0, 16);
    }
  }

  modem.sendAT("+CPSI?");
  resp = "";
  if (modem.waitResponse(3000, resp) == 1) {
    int idx = resp.indexOf("+CPSI:");
    if (idx >= 0) {
      String data = resp.substring(idx + 6);
      data.trim();
      String sys = getField(data, 1);
      sys.trim();

      if (sys.indexOf("CAT-M") >= 0 || sys.indexOf("CATM") >= 0) {
        sim.net_type = "LTE-M";
      } else if (sys.indexOf("NB") >= 0) {
        sim.net_type = "NB-IoT";
      } else if (sys.startsWith("GSM")) {
        sim.net_type = "GSM";
      } else {
        sim.net_type = sys.length() > 12 ? sys.substring(0, 12) : sys;
      }
      sim.registered = (sys != "NO SERVICE") && sys.length() > 0;

      if (sim.rssi_dbm == 0 &&
          (sys.indexOf("CAT-M") >= 0 || sys.indexOf("NB") >= 0)) {
        String rssiStr = getField(data, 12);
        rssiStr.trim();
        if (rssiStr.startsWith("-")) sim.rssi_dbm = rssiStr.toInt();
      }

      if (sim.op.length() == 0) {
        String mccMnc = getField(data, 3);
        mccMnc.trim();
        if (mccMnc.length() > 0 && mccMnc.indexOf('-') >= 0) sim.op = mccMnc;
      }
    }
  }

  if (!sim.registered) {
    Serial.println("[SIM] Non registrato, retry COPS=0...");
    modem.sendAT("+COPS=0");
    modem.waitResponse(8000);
  }

  Serial.printf("[SIM] rssi=%d iccid=%s op=%s net=%s reg=%d\n",
    sim.rssi_dbm, sim.iccid.c_str(), sim.op.c_str(), sim.net_type.c_str(), sim.registered);
}

// ─── NVS fix persistence ───────────────────────────────────────────────────

static void saveFixToNVS() {
  prefs.begin("gps", false);
  prefs.putFloat("lat", gps.lat);
  prefs.putFloat("lon", gps.lon);
  prefs.putFloat("alt", gps.altitude);
  prefs.putFloat("spd", gps.speed_kmh);
  prefs.putBool("valid", true);
  prefs.end();
  Serial.printf("[NVS] Fix salvato: %.6f, %.6f\n", gps.lat, gps.lon);
}

static void loadFixFromNVS() {
  prefs.begin("gps", true);
  bool hasStored = prefs.getBool("valid", false);
  if (hasStored) {
    gps.lat       = prefs.getFloat("lat", 0);
    gps.lon       = prefs.getFloat("lon", 0);
    gps.altitude  = prefs.getFloat("alt", 0);
    gps.speed_kmh = prefs.getFloat("spd", 0);
    gps.valid     = true;
    gps.stored    = true;
    Serial.printf("[NVS] Ultimo fix: %.6f, %.6f\n", gps.lat, gps.lon);
  }
  prefs.end();
}

// ─── GPS read ──────────────────────────────────────────────────────────────

static void readGPS() {
  String raw;
  modem.sendAT("+CGNSINF");
  int8_t res = modem.waitResponse(1000, raw);
  if (res != 1) {
    static uint32_t lastNoRespLog = 0;
    if (millis() - lastNoRespLog > 5000) {
      lastNoRespLog = millis();
      Serial.println("[GPS] Nessuna risposta valida da AT+CGNSINF");
    }
    return;
  }

  int dataStart = raw.indexOf("+CGNSINF:");
  if (dataStart < 0) {
    static uint32_t lastBadLog = 0;
    if (millis() - lastBadLog > 5000) {
      lastBadLog = millis();
      Serial.println("[GPS] Risposta senza +CGNSINF:");
      Serial.println(raw);
    }
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
  String cogStr     = getField(data, 8);
  String hdopStr    = getField(data, 11);
  String satViewStr = getField(data, 15);
  String satUsedStr = getField(data, 16);

  int satView = satViewStr.length() > 0 ? satViewStr.toInt() : 0;
  int satUsed = satUsedStr.length() > 0 ? satUsedStr.toInt() : 0;

  // B16 firmware bug: fix field è sempre vuoto anche con coordinate valide
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
    gps.stored    = false;
    gps.lat       = latStr.toFloat();
    gps.lon       = lonStr.toFloat();
    gps.altitude  = altStr.toFloat();
    gps.speed_kmh = spdStr.toFloat() * 1.852f;
    if (cogStr.length() > 0) gps.heading = cogStr.toFloat();
    lastFixMs = millis();
    saveFixToNVS();
    PMU.setChargingLedMode(XPOWERS_CHG_LED_BLINK_4HZ);
    Serial.printf("[GPS] FIX! %.6f, %.6f  sat=%d/%d  %.1fkm/h  %.1fm  hdop=%.1f\n",
                  gps.lat, gps.lon, satUsed, satView, gps.speed_kmh, gps.altitude, gps.accuracy);
  } else {
    gps.valid = false;
    ledLevel  = !ledLevel;
    PMU.setChargingLedMode(ledLevel ? XPOWERS_CHG_LED_ON : XPOWERS_CHG_LED_OFF);
  }
}

// ─── JSON builders ─────────────────────────────────────────────────────────
// Queste funzioni vengono chiamate solo da modemTask (Core 1).

static String buildGpsJson() {
  StaticJsonDocument<448> doc;
  doc["valid"]   = gps.valid;
  doc["stored"]  = gps.stored;
  doc["lat"]     = gps.lat;
  doc["lon"]     = gps.lon;
  doc["speed"]   = gps.speed_kmh;
  doc["alt"]     = gps.altitude;
  doc["heading"] = gps.heading;
  doc["vsat"]    = gps.vsat;
  doc["usat"]    = gps.usat;
  doc["acc"]     = gps.accuracy;
  doc["hdop"]    = gps.accuracy;

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
  return out;
}

static String buildPowerJson() {
  StaticJsonDocument<128> doc;
  doc["type"]   = "power";
  doc["mode"]   = power_state_name(currentPowerState);
  doc["bat_mv"] = power_bat_mv();
  String out;
  serializeJson(doc, out);
  return out;
}

static String buildSimJson() {
  StaticJsonDocument<192> doc;
  doc["type"] = "sim";
  doc["reg"]  = sim.registered;
  if (sim.rssi_dbm != 0) doc["rssi"] = sim.rssi_dbm; else doc["rssi"] = nullptr;
  if (sim.iccid.length() > 0)    doc["iccid"] = sim.iccid;
  if (sim.op.length() > 0)       doc["op"]    = sim.op;
  if (sim.net_type.length() > 0) doc["net"]   = sim.net_type;

  String out;
  serializeJson(doc, out);
  if (out.length() > 180) {
    doc.remove("iccid");
    out = "";
    serializeJson(doc, out);
  }
  return out;
}

static String buildOtaJson() {
  StaticJsonDocument<256> doc;
  doc["type"]      = "ota";
  doc["available"] = otaInfo.available;
  doc["version"]   = otaInfo.version;
  doc["changelog"] = otaInfo.changelog;
  String out;
  serializeJson(doc, out);
  return out;
}

// ─── BLE chunked notify ────────────────────────────────────────────────────
// Chiamata solo da bleTask (Core 0).
// Usa la raw NimBLE C API per bypassare i problemi di overload C++.
static void txJsonChunked(const String& data) {
  if (!bleConnected || bleConnHandle == 0xFFFF || !pTxChar) return;

  uint16_t mtu = ble_att_mtu(bleConnHandle);
  if (mtu < 4) mtu = 23;
  uint16_t maxPayload = mtu - 3;

  uint16_t    charHandle = pTxChar->getHandle();
  const char* buf        = data.c_str();
  size_t      total      = data.length();

  Serial.printf("[BLE] txJson %u bytes, mtu=%u, payload=%u\n", total, mtu, maxPayload);

  for (size_t i = 0; i < total; i += maxPayload) {
    size_t len = total - i;
    if (len > maxPayload) len = maxPayload;

    struct os_mbuf* om = ble_hs_mbuf_from_flat(buf + i, len);
    if (!om) { Serial.println("[BLE] mbuf alloc fail"); continue; }

    int rc = ble_gatts_notify_custom(bleConnHandle, charHandle, om);
    if (rc != 0) Serial.printf("[BLE] notify rc=%d chunk@%u\n", rc, i);

    if (i + len < total) vTaskDelay(pdMS_TO_TICKS(10));
  }
}

// ─── WiFi + Web ─────────────────────────────────────────────────────────────
#if ENABLE_WIFI

static void sendConfigToClient(uint8_t num) {
  wsServer.sendTXT(num, buildConfigJson());
}

static void onWSEvent(uint8_t num, WStype_t type, uint8_t* payload, size_t length) {
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
    const char* c = cmd["cmd"] | "";
    if (strcmp(c, "set_interval") == 0) {
      int val = cmd["value"] | (int)gpsIntervalMs;
      gpsIntervalMs = (uint32_t)constrain(val, 500, 10000);
      Serial.printf("[WS] Intervallo GPS: %u ms\n", gpsIntervalMs);
      sendConfigToClient(num);
    } else if (strcmp(c, "set_gnss_mode") == 0) {
      int mode = cmd["value"] | gnssMode;
      gnssMode = constrain(mode, 0, 1);
      applyGnssMode();
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
    d["ok"] = true; d["gps_valid"] = gps.valid; d["uptime_s"] = millis() / 1000;
    d["lat"] = gps.lat; d["lon"] = gps.lon;
    d["sat_used"] = gps.usat; d["sat_view"] = gps.vsat; d["hdop"] = gps.accuracy;
    d["last_fix_age_s"] = lastFixMs > 0 ? (millis() - lastFixMs) / 1000 : -1;
    String json; serializeJson(d, json);
    httpServer.send(200, "application/json", json);
  });
  httpServer.onNotFound([]() { httpServer.send(404, "text/plain", "404 - Not found"); });
  httpServer.begin();
  wsServer.begin();
  wsServer.onEvent(onWSEvent);
  Serial.println("[Web] http://192.168.4.1");
}

#endif // ENABLE_WIFI

// ─── Command handler ────────────────────────────────────────────────────────
// Chiamato solo da modemTask (Core 1) — ha accesso esclusivo a SerialAT.

static void handleCmd(const BleCmd& cmd) {
  if (strcmp(cmd.type, "_ble_connected") == 0) {
    // Connessione BLE: invia config immediatamente e forza ciclo di send
    postToBle(buildConfigJson());
    lastGPS  = 0;
    lastSend = 0;
    return;
  }

  if (strcmp(cmd.type, "set_interval") == 0) {
    gpsIntervalMs = (uint32_t)constrain(cmd.intVal, 500, 10000);
    Serial.printf("[CMD] Intervallo GPS: %u ms\n", gpsIntervalMs);
    postToBle(buildConfigJson());
  } else if (strcmp(cmd.type, "set_gnss_mode") == 0) {
    gnssMode = constrain(cmd.intVal, 0, 1);
    applyGnssMode();
    Serial.printf("[CMD] Modalità GNSS: %d\n", gnssMode);
    postToBle(buildConfigJson());
  } else if (strcmp(cmd.type, "restart_gps") == 0) {
    Serial.println("[CMD] Riavvio GPS");
    initGPS();
  } else if (strcmp(cmd.type, "set_backend_url") == 0) {
    if (strlen(cmd.strVal) > 0) {
      remote_set_url(String(cmd.strVal));
      Serial.printf("[CMD] Backend URL: %s\n", cmd.strVal);
    }
  } else if (strcmp(cmd.type, "set_backend_token") == 0) {
    if (strlen(cmd.strVal) > 0) {
      remote_set_token(String(cmd.strVal));
      Serial.println("[CMD] Token aggiornato");
    }
  } else if (strcmp(cmd.type, "start_ota") == 0) {
    if (otaInfo.available) {
      Serial.println("[CMD] OTA confermato, avvio...");
      ota_apply(otaInfo, [](int pct) {
        StaticJsonDocument<64> d;
        d["type"] = "ota_progress";
        d["pct"]  = pct;
        String out;
        serializeJson(d, out);
        postToBle(out);
      });
    }
  } else if (strcmp(cmd.type, "set_ota_url") == 0) {
    if (strlen(cmd.strVal) > 0) {
      ota_set_url(String(cmd.strVal));
      Serial.printf("[CMD] OTA URL: %s\n", cmd.strVal);
    }
  } else if (strcmp(cmd.type, "set_power_mode") == 0) {
    Serial.printf("[CMD] Power mode override: %d\n", cmd.intVal);
  } else if (strcmp(cmd.type, "set_apn") == 0) {
    if (strlen(cmd.strVal) > 0) {
      String atCmd = "+CGDCONT=1,\"IP\",\"" + String(cmd.strVal) + "\"";
      sendDiag(atCmd.c_str(), 2000);
      sendDiag("+COPS=0", 8000);
      Serial.printf("[CMD] APN: %s\n", cmd.strVal);
    }
  } else if (strcmp(cmd.type, "get_config") == 0) {
    postToBle(buildConfigJson());
  }
}

// ─── BLE callbacks ─────────────────────────────────────────────────────────
// Girano nel contesto del NimBLE host task (Core 0).
// Non toccano mai SerialAT — usano le code per comunicare con modemTask.

class GPSServerCallbacks : public NimBLEServerCallbacks {
  void onConnect(NimBLEServer* pSrv) override {
    Serial.println("[BLE] onConnect (handle pending)");
  }
  void onConnect(NimBLEServer* pSrv, ble_gap_conn_desc* desc) override {
    bleConnected  = true;
    bleConnHandle = desc->conn_handle;
    uint16_t mtu  = ble_att_mtu(desc->conn_handle);
    Serial.printf("[BLE] Client connesso addr=%s handle=%u mtu=%u\n",
                  NimBLEAddress(desc->peer_ota_addr).toString().c_str(),
                  bleConnHandle, mtu);
    // Segnala a modemTask di inviare config + reset timer
    postCmd("_ble_connected");
  }
  void onDisconnect(NimBLEServer* pSrv) override {
    bleConnected  = false;
    bleConnHandle = 0xFFFF;
    Serial.println("[BLE] Client disconnesso, riavvio advertising...");
    NimBLEDevice::startAdvertising();
  }
};

class RxCallbacks : public NimBLECharacteristicCallbacks {
  void onWrite(NimBLECharacteristic* pChar) override {
    std::string val = pChar->getValue();
    if (val.empty()) return;

    StaticJsonDocument<128> doc;
    if (deserializeJson(doc, val.c_str(), val.length())) return;

    const char* cmdType = doc["cmd"] | "";
    if (strlen(cmdType) == 0) return;

    // Serializza il valore sia come int che come stringa —
    // handleCmd userà quello appropriato per ogni tipo di comando.
    int         intVal = doc["value"] | 0;
    const char* strVal = doc["value"] | "";
    postCmd(cmdType, intVal, strVal);
  }
};

// ─── initBLE ───────────────────────────────────────────────────────────────

static void initBLE() {
  NimBLEDevice::init(BLE_DEVICE_NAME);
  NimBLEDevice::setPower(ESP_PWR_LVL_P9);
  NimBLEDevice::setMTU(512);

  pServer = NimBLEDevice::createServer();
  pServer->setCallbacks(new GPSServerCallbacks());

  NimBLEService* pService = pServer->createService(BLE_SERVICE_UUID);

  pTxChar = pService->createCharacteristic(BLE_TX_UUID, NIMBLE_PROPERTY::NOTIFY);

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

  // iBeacon payload: UUID A1B2C3D4-E5F6-A1B2-C3D4-E5F6A1B2C3D4
  static const uint8_t ibeacon_payload[] = {
    0x4C, 0x00,
    0x02, 0x15,
    0xA1, 0xB2, 0xC3, 0xD4, 0xE5, 0xF6,
    0xA1, 0xB2, 0xC3, 0xD4, 0xE5, 0xF6,
    0xA1, 0xB2, 0xC3, 0xD4,
    0x00, 0x01,
    0x00, 0x01,
    0xC5,
  };
  NimBLEAdvertisementData advData;
  advData.setManufacturerData(std::string((char*)ibeacon_payload, sizeof(ibeacon_payload)));
  pAdv->setAdvertisementData(advData);

  pAdv->start();
  Serial.printf("[BLE] Advertising: %s (iBeacon attivo)\n", BLE_DEVICE_NAME);
}

// ─── modemTask — Core 1 ─────────────────────────────────────────────────────
//
// Proprietario esclusivo di SerialAT. Ciclo di lettura GPS + SIM + invio dati.
// Riceve comandi BLE da s_cmdQueue (postati dai callback NimBLE su Core 0).
//
// Stack: 12 KB  — spazio per risposta AT, JSON e stack HTTP OTA.

static void modemTask(void* param) {
  Serial.println("[TASK] modemTask avviato su Core " + String(xPortGetCoreID()));

  for (;;) {
    // 1. Elabora tutti i comandi BLE in coda (non bloccante)
    BleCmd cmd;
    while (xQueueReceive(s_cmdQueue, &cmd, 0) == pdTRUE) {
      handleCmd(cmd);
    }

    uint32_t now = millis();

    // 2. Aggiorna power state e derivane gli intervalli
    PowerConfig pcfg;
    currentPowerState = power_tick(gps.speed_kmh, &pcfg);
    gpsIntervalMs     = pcfg.gps_interval_ms;
    sendIntervalMs    = pcfg.send_interval_ms;

    // Riduce gli intervalli quando il client BLE è connesso (max 5s)
    if (bleConnected) {
      if (gpsIntervalMs  > 5000) gpsIntervalMs  = 5000;
      if (sendIntervalMs > 5000) sendIntervalMs = 5000;
    }

    // 3. Lettura GPS
    if (now - lastGPS >= gpsIntervalMs) {
      lastGPS = now;
      readGPS();
      uint32_t s_unix = remote_gps_to_unix(gps.year, gps.month, gps.day,
                                            gps.hour, gps.minute, gps.sec);
      session_tick(gps.valid, gps.lat, gps.lon, gps.speed_kmh, s_unix);
    }

    // 4. Ciclo di invio: BLE TX + remote upload
    if (now - lastSend >= sendIntervalMs) {
      lastSend = now;

      postToBle(buildGpsJson());
      postToBle(buildPowerJson());

#if ENABLE_WIFI
      wsServer.broadcastTXT(buildGpsJson());
#endif

      // Upload live su cellular (solo fix reali)
      if (gps.valid && !gps.stored) {
        uint32_t ts = remote_gps_to_unix(gps.year, gps.month, gps.day,
                                          gps.hour, gps.minute, gps.sec);
        remote_send_live(gps.lat, gps.lon, gps.speed_kmh, gps.altitude,
                         gps.heading, ts,
                         power_bat_mv(), power_state_name(currentPowerState));
      }

      // Dati SIM ogni 30s
      if (now - lastSimMs >= SIM_INTERVAL_MS) {
        lastSimMs = now;
        readSimData();
        postToBle(buildSimJson());
      }

      // Check OTA ogni 24h
      if (now - lastOtaCheck >= OTA_CHECK_INTERVAL_MS || lastOtaCheck == 0) {
        lastOtaCheck = now;
        if (ota_check(&otaInfo)) postToBle(buildOtaJson());
      }
    }

#if ENABLE_WIFI
    httpServer.handleClient();
    wsServer.loop();
#endif

    // Cede il timeslice — 10ms è sufficiente data la granularità degli intervalli GPS
    vTaskDelay(pdMS_TO_TICKS(10));
  }
}

// ─── bleTask — Core 0 ───────────────────────────────────────────────────────
//
// Co-locato con il NimBLE host task. Drena s_bleQueue e chiama txJsonChunked().
// Il timeout di 100ms evita busy-loop mantenendo reattività al BLE.
//
// Stack: 6 KB  — txJsonChunked usa chiamate NimBLE + printf.

static void bleTask(void* param) {
  Serial.println("[TASK] bleTask avviato su Core " + String(xPortGetCoreID()));

  BleMsg msg;
  for (;;) {
    if (xQueueReceive(s_bleQueue, &msg, pdMS_TO_TICKS(100)) == pdTRUE) {
      txJsonChunked(String(msg.buf));
    }
  }
}

// ─── Setup ─────────────────────────────────────────────────────────────────

void setup() {
  Serial.begin(115200);
  delay(5000);
  Serial.println();
  Serial.println("=== GPS TRACKER BOOT v" FIRMWARE_VERSION " ===");
  Serial.printf("Build: %s %s\n", __DATE__, __TIME__);
  Serial.printf("Modalità: %s\n", ENABLE_WIFI ? "WiFi + BLE" : "BLE");

  // Hardware init — eseguito qui prima di lanciare i task
  initPMU();
  power_init(V12_ADC_PIN, V12_THRESHOLD_MV);
  initModem();
  remote_init();
  initGPS();
  initBLE();
  loadFixFromNVS();

#if ENABLE_WIFI
  initWiFi();
  Serial.printf("Collegati al WiFi \"%s\"  pass: %s\n", AP_SSID, AP_PASS);
  Serial.println("Poi apri: http://192.168.4.1");
#endif

  // Crea le code IPC
  s_bleQueue = xQueueCreate(BLE_QUEUE_LEN, sizeof(BleMsg));
  s_cmdQueue = xQueueCreate(CMD_QUEUE_LEN, sizeof(BleCmd));
  configASSERT(s_bleQueue);
  configASSERT(s_cmdQueue);

  // Lancia i task sui core dedicati
  //   modemTask → Core 1  (stesso core dell'Arduino loopTask, priorità > 1)
  //   bleTask   → Core 0  (stesso core del NimBLE host task)
  xTaskCreatePinnedToCore(modemTask, "modem", 12288, nullptr, 4, nullptr, 1);
  xTaskCreatePinnedToCore(bleTask,   "ble",   6144,  nullptr, 3, nullptr, 0);

  Serial.println("=== PRONTO — task avviati ===");
}

// ─── Loop ──────────────────────────────────────────────────────────────────
// Il loop Arduino non viene usato: tutta la logica è nei task FreeRTOS.
// vTaskDelay(portMAX_DELAY) sospende il loopTask senza consumare CPU.

void loop() {
  vTaskDelay(portMAX_DELAY);
}
