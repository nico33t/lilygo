#pragma once
#include <Arduino.h>

struct OtaInfo {
  String version;
  String url;
  String sha256;
  String changelog;
  bool   available = false;
};

bool ota_check(OtaInfo* info);
bool ota_apply(const OtaInfo& info, void (*progress_cb)(int pct));
void ota_set_url(const String& url);
