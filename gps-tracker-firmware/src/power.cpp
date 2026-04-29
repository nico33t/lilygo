#include "power.h"
#include <esp_sleep.h>
#define XPOWERS_CHIP_AXP2101
#include "XPowersLib.h"

extern XPowersPMU PMU;

static int        s_adc_pin      = 34;
static int        s_threshold_mv = 1500;
static PowerState s_state        = PowerState::MOVING;
static uint32_t   s_stop_ms      = 0;
static bool       s_stopped      = false;

void power_init(int adc_pin, int threshold_mv) {
  s_adc_pin      = adc_pin;
  s_threshold_mv = threshold_mv;
  if (adc_pin >= 0) {
    analogSetAttenuation(ADC_11db);
    pinMode(adc_pin, INPUT);
  }
}

static bool detect_12v() {
  if (s_adc_pin < 0) return false;
  int sum = 0;
  for (int i = 0; i < 4; i++) { sum += analogReadMilliVolts(s_adc_pin); delay(1); }
  return (sum / 4) >= s_threshold_mv;
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
    if      (stopped_s > 15 * 60) s_state = PowerState::PARKED;
    else if (stopped_s >  3 * 60) s_state = PowerState::IDLE;
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
      Serial.println("[PWR] Entro in deep sleep (PARKED)");
      Serial.flush();
      esp_sleep_enable_timer_wakeup((uint64_t)15 * 60 * 1000000ULL);
      esp_deep_sleep_start();
      break;
  }
  return s_state;
}

int power_bat_mv() {
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
