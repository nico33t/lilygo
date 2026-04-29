#pragma once
#include <Arduino.h>

void session_tick(bool gps_valid, float lat, float lon, float speed_kmh, uint32_t unix_ts);
