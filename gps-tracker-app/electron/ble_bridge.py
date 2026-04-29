#!/usr/bin/env python3
"""
BLE → WebSocket bridge for GPS Tracker (Electron desktop)

Connects to the LilyGo GPS Tracker via Bluetooth LE (Nordic UART Service)
and exposes data on a local WebSocket server so the Electron renderer can
talk to the device without needing a native BLE stack in Node.js.

Usage:
    python3 ble_bridge.py [port]   (default port: 8765)

Protocol — identical to WiFi WebSocket mode:
    Received from tracker  →  broadcast to all WS clients as-is
    Received from WS client  →  written to BLE RX characteristic
"""

import asyncio
import json
import logging
import sys

try:
    import websockets
    from bleak import BleakClient, BleakScanner
    from bleak.exc import BleakError
except ImportError as exc:
    print(f"[ERROR] Missing dependency: {exc}")
    print("Install with:  pip install bleak websockets")
    sys.exit(1)

# ── Nordic UART Service ──────────────────────────────────────────────────────
NUS_TX = "6e400003-b5a3-f393-e0a9-e50e24dcca9e"  # tracker → PC (notify)
NUS_RX = "6e400002-b5a3-f393-e0a9-e50e24dcca9e"  # PC → tracker (write)

DEVICE_NAME     = "GPS-Tracker"
WS_PORT         = int(sys.argv[1]) if len(sys.argv) > 1 else 8765
RECONNECT_DELAY = 3  # seconds between retry attempts

logging.basicConfig(level=logging.INFO, format="[%(levelname)s] %(message)s")
log = logging.getLogger("ble_bridge")

# ── Shared state ─────────────────────────────────────────────────────────────
ws_clients: set = set()
ble_client: BleakClient | None = None
_json_buf: str = ""


# ── BLE notification → WS broadcast ─────────────────────────────────────────

def _on_notify(sender, data: bytearray):
    global _json_buf
    _json_buf += data.decode("utf-8", errors="replace")

    # GPS Tracker sends JSON split across multiple BLE packets.
    # Keep accumulating until we can parse a complete object.
    while _json_buf:
        try:
            obj = json.loads(_json_buf)
            asyncio.get_event_loop().create_task(_broadcast(json.dumps(obj)))
            _json_buf = ""
        except json.JSONDecodeError:
            if len(_json_buf) > 4096:
                log.warning("JSON buffer overflow — discarding")
                _json_buf = ""
            break


async def _broadcast(message: str):
    dead = set()
    for client in ws_clients:
        try:
            await client.send(message)
        except Exception:
            dead.add(client)
    ws_clients.difference_update(dead)


# ── WS message → BLE write ───────────────────────────────────────────────────

async def _send_to_ble(data: str):
    if ble_client and ble_client.is_connected:
        try:
            raw = data.encode("utf-8")
            # Write in 20-byte chunks for maximum compatibility
            for i in range(0, len(raw), 20):
                await ble_client.write_gatt_char(NUS_RX, raw[i : i + 20])
        except Exception as exc:
            log.error(f"BLE write error: {exc}")


# ── WebSocket server ─────────────────────────────────────────────────────────

async def _ws_handler(websocket, path=""):
    ws_clients.add(websocket)
    log.info(f"WS client connected  (total: {len(ws_clients)})")
    # Tell the client the current BLE state immediately
    is_connected = ble_client is not None and ble_client.is_connected
    await websocket.send(json.dumps({"type": "ble_status", "connected": is_connected}))
    try:
        async for msg in websocket:
            await _send_to_ble(msg)
    except Exception:
        pass
    finally:
        ws_clients.discard(websocket)
        log.info(f"WS client disconnected  (total: {len(ws_clients)})")


# ── BLE connection loop ──────────────────────────────────────────────────────

async def _ble_loop():
    global ble_client, _json_buf
    while True:
        log.info(f"Scanning for '{DEVICE_NAME}'…")
        try:
            device = await BleakScanner.find_device_by_name(DEVICE_NAME, timeout=10)
        except Exception as exc:
            log.error(f"Scan error: {exc}")
            await asyncio.sleep(RECONNECT_DELAY)
            continue

        if device is None:
            log.info(f"'{DEVICE_NAME}' not found, retrying in {RECONNECT_DELAY}s")
            await asyncio.sleep(RECONNECT_DELAY)
            continue

        log.info(f"Connecting to {device.address}…")
        try:
            async with BleakClient(device) as client:
                ble_client = client
                _json_buf = ""

                await client.start_notify(NUS_TX, _on_notify)
                log.info("BLE connected — bridge active")
                await _broadcast(json.dumps({"type": "ble_status", "connected": True}))

                while client.is_connected:
                    await asyncio.sleep(0.5)

        except BleakError as exc:
            log.error(f"BLE error: {exc}")
        except Exception as exc:
            log.error(f"Unexpected error: {exc}")
        finally:
            ble_client = None
            await _broadcast(json.dumps({"type": "ble_status", "connected": False}))
            log.info(f"BLE disconnected, retrying in {RECONNECT_DELAY}s…")

        await asyncio.sleep(RECONNECT_DELAY)


# ── Main ─────────────────────────────────────────────────────────────────────

async def main():
    log.info(f"GPS Tracker BLE bridge — ws://localhost:{WS_PORT}")
    async with websockets.serve(_ws_handler, "localhost", WS_PORT):
        await _ble_loop()


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        log.info("Bridge stopped")
