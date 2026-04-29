#pragma once
#include <Arduino.h>

enum class PowerState {
  VEHICLE,  // 12V present — full speed
  MOVING,   // battery, speed > 5 km/h
  IDLE,     // battery, stopped > 3 min
  PARKED,   // battery, stopped > 15 min — deep sleep
};

struct PowerConfig {
  uint32_t gps_interval_ms;
  uint32_t send_interval_ms;
};

void power_init(int adc_pin, int threshold_mv);
PowerState power_tick(float speed_kmh, PowerConfig* cfg);
int power_bat_mv();
const char* power_state_name(PowerState s);
