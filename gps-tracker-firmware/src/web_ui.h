#pragma once

#include <Arduino.h>

const char INDEX_HTML[] PROGMEM = R"rawhtml(
<!DOCTYPE html>
<html lang="it">

<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Airbnb GPS Tracker</title>
    <style>
        :root {
            --rausch: #ff385c;
            --rausch-active: #e00b41;
            --ink: #222222;
            --body: #3f3f3f;
            --muted: #6a6a6a;
            --muted-soft: #9b9b9b;
            --hairline: #dddddd;
            --hairline-soft: #ebebeb;
            --canvas: #ffffff;
            --surface-soft: #f7f7f7;
            --rounded-md: 14px;
            --rounded-full: 9999px;
            --shadow: rgba(0, 0, 0, 0.04) 0 2px 6px, rgba(0, 0, 0, 0.1) 0 4px 8px;
        }

        * {
            box-sizing: border-box;
            margin: 0;
            padding: 0;
            -webkit-font-smoothing: antialiased;
        }

        body {
            background: var(--canvas);
            color: var(--ink);
            font-family: Circular, -apple-system, BlinkMacSystemFont, Roboto, Helvetica Neue, sans-serif;
            line-height: 1.43;
            overflow-y: auto;
            min-height: 100vh;
        }

        header {
            height: 80px;
            padding: 0 24px;
            border-bottom: 1px solid var(--hairline-soft);
            display: flex;
            justify-content: space-between;
            align-items: center;
            position: sticky;
            top: 0;
            background: var(--canvas);
            z-index: 1000;
        }

        .logo {
            color: var(--rausch);
            font-size: 22px;
            font-weight: 800;
            display: flex;
            align-items: center;
            gap: 8px;
            letter-spacing: -0.5px;
        }

        #ws-status {
            padding: 10px 16px;
            border-radius: var(--rounded-full);
            border: 1px solid var(--hairline);
            font-size: 14px;
            font-weight: 600;
            display: flex;
            align-items: center;
            gap: 8px;
            box-shadow: 0 1px 2px rgba(0, 0, 0, 0.08);
        }

        #ws-status .dot {
            width: 10px;
            height: 10px;
            border-radius: 50%;
            background: #ddd;
        }

        #ws-status.ok .dot {
            background: var(--rausch);
        }

        .container {
            max-width: 1280px;
            margin: 0 auto;
            padding: 24px;
            display: grid;
            grid-template-columns: 1fr 400px;
            gap: 48px;
        }

        @media (max-width: 950px) {
            .container {
                grid-template-columns: 1fr;
                padding: 16px;
                gap: 24px;
            }
        }

        .map-section {
            width: 100%;
        }

        .canvas-wrap {
            width: 100%;
            aspect-ratio: 16/9;
            background: var(--surface-soft);
            border-radius: var(--rounded-md);
            overflow: hidden;
            position: relative;
            border: 1px solid var(--hairline-soft);
        }

        @media (max-width: 744px) {
            .canvas-wrap {
                aspect-ratio: 1/1;
            }
        }

        canvas {
            width: 100%;
            height: 100%;
            display: block;
        }

        #hint {
            position: absolute;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            text-align: center;
            background: white;
            padding: 16px 24px;
            border-radius: var(--rounded-full);
            box-shadow: var(--shadow);
            font-weight: 500;
            font-size: 14px;
            color: var(--ink);
            white-space: nowrap;
        }

        .data-panel {
            display: flex;
            flex-direction: column;
            gap: 24px;
        }

        .reservation-card {
            border: 1px solid var(--hairline);
            border-radius: var(--rounded-md);
            padding: 24px;
            box-shadow: var(--shadow);
            position: sticky;
            top: 104px;
            background: white;
        }

        .price-row {
            font-size: 22px;
            font-weight: 600;
            margin-bottom: 24px;
        }

        .grid-info {
            display: grid;
            grid-template-columns: 1fr 1fr;
            border: 1px solid var(--hairline);
            border-radius: 8px;
            overflow: hidden;
            margin-bottom: 16px;
        }

        .info-box {
            padding: 10px 12px;
            border: 0.5px solid var(--hairline);
            min-height: 58px;
        }

        .info-box.full {
            grid-column: span 2;
        }

        .lbl {
            font-size: 10px;
            font-weight: 800;
            text-transform: uppercase;
            color: var(--ink);
            margin-bottom: 4px;
        }

        .val {
            font-size: 14px;
            color: var(--body);
            word-break: break-word;
        }

        .val.dim {
            color: var(--muted-soft);
        }

        .btn-main {
            width: 100%;
            background: var(--rausch);
            color: white;
            border: none;
            padding: 14px 24px;
            border-radius: 8px;
            font-size: 16px;
            font-weight: 600;
            cursor: pointer;
            transition: background 0.2s;
        }

        .btn-main:active {
            background: var(--rausch-active);
        }

        footer {
            margin-top: 48px;
            padding: 24px;
            border-top: 1px solid var(--hairline-soft);
            color: var(--muted);
            font-size: 14px;
            text-align: center;
        }

        .section-title {
            font-size: 22px;
            font-weight: 600;
            margin-bottom: 16px;
            letter-spacing: -0.44px;
        }
    </style>
</head>

<body>
    <header>
        <div class="logo">
            <svg width="32" height="32" viewBox="0 0 32 32" fill="currentColor">
                <path d="M16 1c2.008 0 3.463.963 4.751 3.269l.533 1.025c1.954 3.83 6.114 12.54 7.1 14.836l.145.353c.667 1.591.91 2.472.96 3.396l.01.415.001.228c0 4.062-2.877 6.478-6.357 6.478-2.224 0-4.556-1.258-6.709-3.386l-.257-.26-.172-.179h-.011l-.176.185c-2.044 2.1-4.392 3.42-6.72 3.42-3.481 0-6.358-2.416-6.358-6.478l.002-.23c.01-.933.253-1.813.92-3.404l.145-.353c.986-2.296 5.146-11.006 7.1-14.836l.533-1.025C12.537 1.963 13.992 1 16 1zm0 2c-1.239 0-2.253.539-3.402 2.585l-.504.972C10.154 10.378 6.012 19.055 5.04 21.314c-.58 1.385-.77 2.083-.807 2.784l-.01.292-.001.19c0 3.012 1.986 4.478 4.358 4.478 1.706 0 3.513-1.03 5.307-2.825l.89-.922.214-.23.213.23.89.922c1.794 1.796 3.6 2.825 5.307 2.825 2.372 0 4.358-1.466 4.358-4.478l-.001-.19-.011-.292c-.036-.701-.227-1.399-.807-2.784-.973-2.26-5.115-10.937-7.054-14.757l-.504-.972C18.253 3.539 17.239 3 16 3z" />
            </svg>
            Tracker
        </div>

        <div id="ws-status">
            <div class="dot"></div>
            <span>RICERCA...</span>
        </div>
    </header>

    <div class="container">
        <div class="map-section">
            <h2 class="section-title">Percorso in tempo reale</h2>

            <div class="canvas-wrap">
                <canvas id="track"></canvas>
                <div id="hint">In attesa del fix GPS...</div>
            </div>

            <div style="margin-top: 24px; color: var(--body);">
                <p style="font-size: 16px; font-weight: 600;">Informazioni sul tracciamento</p>
                <p style="font-size: 14px; color: var(--muted); margin-top: 8px;">
                    Il sistema utilizza coordinate satellitari globali. La precisione dipende dalla visibilità del cielo
                    e dal numero di satelliti agganciati.
                </p>
            </div>
        </div>

        <div class="data-panel">
            <div class="reservation-card">
                <div class="price-row">
                    <span id="v-spd">0.0</span>
                    <span style="font-size: 16px; font-weight: 400; color: var(--muted);">km/h velocità</span>
                </div>

                <div class="grid-info">
                    <div class="info-box full">
                        <div class="lbl">Stato Posizione</div>
                        <div class="val" id="fix-val">Ricerca segnale...</div>
                    </div>

                    <div class="info-box">
                        <div class="lbl">Latitudine</div>
                        <div class="val" id="v-lat">--</div>
                    </div>

                    <div class="info-box">
                        <div class="lbl">Longitudine</div>
                        <div class="val" id="v-lon">--</div>
                    </div>

                    <div class="info-box">
                        <div class="lbl">Altitudine</div>
                        <div class="val"><span id="v-alt">--</span> m</div>
                    </div>

                    <div class="info-box">
                        <div class="lbl">Satelliti</div>
                        <div class="val" id="v-sat">-- / --</div>
                    </div>
                </div>

                <button class="btn-main" onclick="location.reload()">Aggiorna sessione</button>

                <p style="font-size: 12px; color: var(--muted); text-align: center; margin-top: 12px;">
                    Precisione stimata: <span id="v-acc">--</span>
                </p>
            </div>
        </div>
    </div>

    <footer>
        <p>© 2026 GPS Tracker · Locale AP Mode</p>
        <p id="f-time" style="margin-top: 8px;">Ultimo aggiornamento: --</p>
        <p id="f-pkts" style="font-size: 10px; opacity: 0.5;">pacchetti: 0</p>
    </footer>

    <script>
        var ws, track = [], pkts = 0, MAX = 1000;
        var canvas = document.getElementById('track');
        var ctx = canvas.getContext('2d');

        function conn() {
            ws = new WebSocket('ws://' + (location.hostname || '192.168.4.1') + ':81');

            ws.onopen = function () {
                setS(true);
            };

            ws.onclose = function () {
                setS(false);
                setTimeout(conn, 2000);
            };

            ws.onerror = function () {
                setS(false);
            };

            ws.onmessage = function (e) {
                try {
                    onData(JSON.parse(e.data));
                } catch (err) {
                    console.log('JSON error', err);
                }
            };
        }

        function setS(ok) {
            var el = document.getElementById('ws-status');
            el.querySelector('span').textContent = ok ? 'CONNESSO' : 'DISCONNESSO';
            el.className = ok ? 'ok' : '';
        }

        function sv(id, v, dim) {
            var el = document.getElementById(id);
            el.textContent = v;
            el.className = 'val' + (dim ? ' dim' : '');
        }

        function safeNumber(n, fallback) {
            return typeof n === 'number' && isFinite(n) ? n : fallback;
        }

        function onData(d) {
            pkts++;

            document.getElementById('f-pkts').textContent = 'pacchetti: ' + pkts;
            document.getElementById('f-time').textContent = 'Aggiornato alle ' + (d.time || '--');

            var ok = !!d.valid;

            var lat = safeNumber(d.lat, 0);
            var lon = safeNumber(d.lon, 0);
            var speed = safeNumber(d.speed, 0);
            var alt = safeNumber(d.alt, 0);
            var acc = safeNumber(d.acc, safeNumber(d.hdop, 0));
            var usat = safeNumber(d.usat, 0);
            var vsat = safeNumber(d.vsat, 0);

            sv('fix-val', ok ? '✔ Segnale Acquisito' : 'Ricerca segnale...', !ok);
            sv('v-lat', lat.toFixed(6), !ok);
            sv('v-lon', lon.toFixed(6), !ok);
            sv('v-spd', speed.toFixed(1), !ok);
            sv('v-alt', alt.toFixed(1), !ok);
            sv('v-sat', usat + ' / ' + vsat, !ok);
            sv('v-acc', acc.toFixed(1), !ok);

            if (ok && lat !== 0 && lon !== 0) {
                document.getElementById('hint').style.display = 'none';

                track.push({ la: lat, lo: lon });

                if (track.length > MAX) {
                    track.shift();
                }

                draw();
            }
        }

        function draw() {
            var W = canvas.offsetWidth;
            var H = canvas.offsetHeight;

            canvas.width = W;
            canvas.height = H;

            if (!track.length) return;

            var mla = Infinity;
            var xla = -Infinity;
            var mlo = Infinity;
            var xlo = -Infinity;

            track.forEach(function (p) {
                if (p.la < mla) mla = p.la;
                if (p.la > xla) xla = p.la;
                if (p.lo < mlo) mlo = p.lo;
                if (p.lo > xlo) xlo = p.lo;
            });

            var pad = 40;
            var dla = xla - mla || 0.0005;
            var dlo = xlo - mlo || 0.0005;
            var sc = Math.min((W - pad * 2) / dlo, (H - pad * 2) / dla);
            var ox = (W - pad * 2 - dlo * sc) / 2;
            var oy = (H - pad * 2 - dla * sc) / 2;

            function tx(lo) {
                return pad + ox + (lo - mlo) * sc;
            }

            function ty(la) {
                return H - pad - oy - (la - mla) * sc;
            }

            ctx.clearRect(0, 0, W, H);

            if (track.length === 1) {
                var p = track[0];
                var x = tx(p.lo);
                var y = ty(p.la);

                ctx.shadowBlur = 10;
                ctx.shadowColor = 'rgba(0,0,0,0.2)';
                ctx.fillStyle = '#ff385c';
                ctx.beginPath();
                ctx.arc(x, y, 8, 0, Math.PI * 2);
                ctx.fill();

                ctx.strokeStyle = '#fff';
                ctx.lineWidth = 3;
                ctx.stroke();

                ctx.shadowBlur = 0;
                return;
            }

            ctx.strokeStyle = '#ff385c';
            ctx.lineWidth = 4;
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';
            ctx.beginPath();

            track.forEach(function (p, i) {
                var x = tx(p.lo);
                var y = ty(p.la);

                if (i === 0) {
                    ctx.moveTo(x, y);
                } else {
                    ctx.lineTo(x, y);
                }
            });

            ctx.stroke();

            var lp = track[track.length - 1];
            var lx = tx(lp.lo);
            var ly = ty(lp.la);

            ctx.shadowBlur = 10;
            ctx.shadowColor = 'rgba(0,0,0,0.2)';
            ctx.fillStyle = '#ff385c';
            ctx.beginPath();
            ctx.arc(lx, ly, 8, 0, Math.PI * 2);
            ctx.fill();

            ctx.strokeStyle = '#fff';
            ctx.lineWidth = 3;
            ctx.stroke();

            ctx.shadowBlur = 0;
        }

        window.addEventListener('resize', function () {
            if (track.length) draw();
        });

        conn();
    </script>
</body>

</html>
)rawhtml";