#pragma once
#include <Arduino.h>

void remote_init();
void remote_set_url(const String& url);
void remote_set_token(const String& token);

bool remote_send_live(float lat, float lon, float speed, float alt,
                      int bat_mv, const char* power_mode);
bool remote_send_session_start(const String& session_id);
bool remote_send_track_point(const String& session_id,
                              float lat, float lon, float speed, float alt);
bool remote_send_session_end(const String& session_id,
                              float distance_km, float max_speed, float avg_speed);
