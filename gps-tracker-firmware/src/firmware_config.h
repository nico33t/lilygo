#pragma once

#define FIRMWARE_VERSION     "0.1.0"
#define OTA_BASE_URL         "https://ota.example.com"   // override via NVS key "ota_url"
#define BACKEND_BASE_URL     ""                           // set via BLE cmd set_backend_url
#define V12_ADC_PIN          34                           // GPIO34 — voltage divider input
#define V12_THRESHOLD_MV     1500                         // ADC mV above which 12V is present
