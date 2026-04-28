# LilyGo T-SIM7080G GPS Tracker

Firmware ESP32-S3 per il board LilyGo T-SIM7080G. Crea un Access Point WiFi e serve una dashboard web in tempo reale con tracciamento GPS via WebSocket.

## Hardware

| Componente | Dettaglio |
|---|---|
| Board | LilyGo T-SIM7080G |
| MCU | ESP32-S3 |
| Modem | SIMCOM SIM7080G (NB-IoT / LTE-M / GPS) |
| PMU | AXP2101 |
| Flash | 16 MB |

## Funzionalità

- Access Point WiFi (`GPS-Tracker` / `gpstrack1`)
- Dashboard web su `http://192.168.4.1`
- Stream GPS in tempo reale via WebSocket (porta 81)
- Traccia percorso su canvas
- LED di stato: lampeggio lento = ricerca, lampeggio 4Hz = fix acquisito

## Struttura

```
src/
  main.cpp       — logica principale (PMU, modem, GPS, WiFi, WebSocket)
  web_ui.h       — dashboard HTML/CSS/JS inline (PROGMEM)
  utilities.h    — pin definitions
platformio.ini   — configurazione build
```

## Build e Flash

Richiede [PlatformIO](https://platformio.org/).

```bash
pio run -t upload
```

La porta è preconfigurata su `/dev/cu.usbmodem101`. Non serve premere nessun pulsante — il reset avviene automaticamente via RTS.

## Monitor Seriale

```bash
python3 - <<'EOF'
import serial, time
with serial.Serial('/dev/cu.usbmodem101', 115200, timeout=1) as s:
    while True:
        line = s.readline()
        if line: print(line.decode('utf-8', errors='replace'), end='')
EOF
```

## Pin

```
MODEM TX       GPIO 5
MODEM RX       GPIO 4
MODEM PWR      GPIO 41
I2C SDA        GPIO 15
I2C SCL        GPIO 7
```

## Bug noto — Firmware B16

Il firmware `1951B16SIM7080` (preinstallato) ha un bug noto che impedisce al GPS di dichiarare il fix anche quando le coordinate sono valide. Il workaround nel codice accetta la posizione se `lat/lon != 0` indipendentemente dal flag fix.

**Soluzione definitiva:** downgrade a `1951B08SIM7080` tramite il tool `qdl v1.58` (Windows). Vedere [issue #144](https://github.com/Xinyuan-LilyGO/LilyGo-T-SIM7080G/issues/144) sulla repo ufficiale LilyGo.

## Note GPS

- Cold start: 5–10 minuti all'aperto con cielo libero
- GPS e cellular non possono funzionare contemporaneamente (limitazione hardware SIM7080G)
- Antenna patch sul PCB: orientare il board con il lato antenna verso il cielo
