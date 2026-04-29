#pragma once
#include <Arduino.h>

void     remote_init();
void     remote_set_url(const String& url);
void     remote_set_token(const String& token);
uint32_t remote_gps_to_unix(int year, int month, int day, int hour, int min, int sec);

bool remote_send_live(float lat, float lon, float speed, float alt,
                      float heading, uint32_t unix_ts,
                      int bat_mv, const char* power_mode);
bool remote_send_session_start(const String& session_id, uint32_t unix_ts);
bool remote_send_track_point(const String& session_id,
                              float lat, float lon, float speed, float alt,
                              uint32_t unix_ts);
bool remote_send_session_end(const String& session_id,
                              float distance_km, float max_speed, float avg_speed,
                              uint32_t start_unix, uint32_t end_unix);
