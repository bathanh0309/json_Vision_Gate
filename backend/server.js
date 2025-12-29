// ===== File: server.js =====
const express = require('express');
const path = require('path');
const mqtt = require('mqtt');
const sqlite3 = require('sqlite3').verbose();
const app = express();
const PORT = 3000;

// 1. SETUP DATABASE (SQLite)
// Thay vì PostgreSQL nặng nề, dùng SQLite (file .db) cực nhẹ
const db = new sqlite3.Database(path.join(__dirname, '../database/gate_system.db'), (err) => {
    if (err) console.error('[DB]  Cannot open database:', err.message);
    else console.log('[DB]  Connected to SQLite database.');
});

// Tạo bảng logs nếu chưa có
db.run(`CREATE TABLE IF NOT EXISTS logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    event_type TEXT,
    description TEXT
)`);

// Tạo bảng vehicles để track xe trong bãi
// KHÔNG XÓA khi xe ra, chỉ đánh dấu status
db.run(`CREATE TABLE IF NOT EXISTS vehicles (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    plate TEXT NOT NULL,
    status TEXT DEFAULT 'IN_PARKING',
    entry_time DATETIME DEFAULT CURRENT_TIMESTAMP,
    exit_time DATETIME
)`, (err) => {
    if (err) console.error('[DB] Error creating vehicles table:', err);
    else console.log('[DB] ✓ Vehicles table ready');
});

// 2. SETUP MQTT CLIENT
const MQTT_BROKER = 'mqtt://broker.emqx.io:1883';
const mqttClient = mqtt.connect(MQTT_BROKER, {
    username: 'bathanh0309',
    password: 'bathanh0309'
});

mqttClient.on('connect', () => {
    console.log('[MQTT]  Connected to Broker');
    mqttClient.subscribe('gate/status');
    mqttClient.subscribe('bienso/cmd');
    mqttClient.subscribe('gate/in/cmd');   // GPIO button IN
    mqttClient.subscribe('gate/out/cmd');  // GPIO button OUT
    console.log('[MQTT] ✓ Subscribed to: gate/status, bienso/cmd, gate/in/cmd, gate/out/cmd');
});

// Xử lý message từ MQTT - SERVER LÀ MASTER
mqttClient.on('message', (topic, message) => {
    const msg = message.toString();
    console.log(`[MQTT←] ${topic}: ${msg}`);

    // ===== XỬ LÝ TOGGLE TỪ GPIO BUTTONS =====
    if (topic === 'gate/in/cmd' && msg === 'TOGGLE') {
        console.log('[GPIO Button→Server] IN button pressed');

        const now = new Date();
        const offset = now.getTimezoneOffset() * 60000;
        const localTime = new Date(now.getTime() - offset).toISOString().slice(0, 19).replace('T', ' ');

        // Toggle trạng thái cổng IN
        const newState = currentGateState.in === 'ON' ? 'OFF' : 'ON';

        // Log event
        const stmt = db.prepare("INSERT INTO logs (timestamp, event_type, description) VALUES (?, ?, ?)");
        stmt.run(localTime, `GATE_IN_${newState}`, `GPIO Button - ${newState}`);
        stmt.finalize();

        // Publish gate status
        publishGateStatus('in', newState);

    } else if (topic === 'gate/out/cmd' && msg === 'TOGGLE') {
        console.log('[GPIO Button→Server] OUT button pressed');

        const now = new Date();
        const offset = now.getTimezoneOffset() * 60000;
        const localTime = new Date(now.getTime() - offset).toISOString().slice(0, 19).replace('T', ' ');

        // Toggle trạng thái cổng OUT
        const newState = currentGateState.out === 'ON' ? 'OFF' : 'ON';

        // Log event
        const stmt = db.prepare("INSERT INTO logs (timestamp, event_type, description) VALUES (?, ?, ?)");
        stmt.run(localTime, `GATE_OUT_${newState}`, `GPIO Button - ${newState}`);
        stmt.finalize();

        // Publish gate status
        publishGateStatus('out', newState);
    }

    // ===== XỬ LÝ BIỂN SỐ TỪ bienso/cmd =====
    else if (topic === 'bienso/cmd') {
        let plate;

        // Kiểm tra xem message là JSON hay plain text
        try {
            const parsed = JSON.parse(msg);
            plate = parsed.plate; // Extract plate từ JSON
            console.log(`[MQTT→Server] License plate from JSON: ${plate}`);
        } catch (e) {
            // Nếu không phải JSON, dùng trực tiếp
            plate = msg.trim();
            console.log(`[MQTT→Server] License plate from text: ${plate}`);
        }

        const now = new Date();
        const offset = now.getTimezoneOffset() * 60000;
        const localTime = new Date(now.getTime() - offset).toISOString().slice(0, 19).replace('T', ' ');

        // Kiểm tra xe trong DB (bao gồm cả EXITED)
        db.get("SELECT * FROM vehicles WHERE plate = ? ORDER BY id DESC LIMIT 1", [plate], (err, row) => {
            if (err) {
                console.error('[DB Error]', err);
                return;
            }

            if (!row || row.status === 'EXITED') {
                // CHƯA CÓ HOẶC ĐÃ RA - Xe vào - MỞ CỔNG IN
                if (!row) {
                    // Lần đầu - INSERT mới
                    const stmt = db.prepare("INSERT INTO vehicles (plate, status, entry_time) VALUES (?, 'IN_PARKING', ?)");
                    stmt.run(plate, localTime, (insertErr) => {
                        if (!insertErr) {
                            console.log(`[DB] ${plate} - ENTRY from MQTT at ${localTime}`);

                            const logStmt = db.prepare("INSERT INTO logs (timestamp, event_type, description) VALUES (?, ?, ?)");
                            logStmt.run(localTime, 'CAR_IN', `${plate} - IN (MQTT)`);
                            logStmt.finalize();

                            publishGateStatus('in', 'ON');
                        }
                    });
                    stmt.finalize();
                } else {
                    // Đã ra rồi - cho vào lại - UPDATE
                    db.run("UPDATE vehicles SET status = 'IN_PARKING', entry_time = ?, exit_time = NULL WHERE id = ?",
                        [localTime, row.id], (updateErr) => {
                            if (!updateErr) {
                                console.log(`[DB] ${plate} - RE-ENTRY from MQTT at ${localTime}`);

                                const logStmt = db.prepare("INSERT INTO logs (timestamp, event_type, description) VALUES (?, ?, ?)");
                                logStmt.run(localTime, 'CAR_IN', `${plate} - IN (MQTT)`);
                                logStmt.finalize();

                                publishGateStatus('in', 'ON');
                            }
                        });
                }

            } else if (row.status === 'IN_PARKING') {
                // ĐÃ CÓ TRONG BÃI - Xe ra - MỞ CỔNG OUT
                db.run("UPDATE vehicles SET exit_time = ?, status = 'EXITED' WHERE id = ?",
                    [localTime, row.id], (updateErr) => {
                        if (!updateErr) {
                            console.log(`[DB] ${plate} - EXIT from MQTT at ${localTime}`);

                            const duration = calculateDuration(row.entry_time, localTime);

                            const logStmt = db.prepare("INSERT INTO logs (timestamp, event_type, description) VALUES (?, ?, ?)");
                            logStmt.run(localTime, 'CAR_OUT', `${plate} - OUT (${duration}) (MQTT)`);
                            logStmt.finalize();

                            publishGateStatus('out', 'ON');
                        }
                    });
            }
        });
    }
});

// ===== HELPER FUNCTION: CALCULATE DURATION =====
function calculateDuration(entryTime, exitTime) {
    const entry = new Date(entryTime);
    const exit = new Date(exitTime);
    const diffMs = exit - entry;
    const diffMins = Math.floor(diffMs / 60000);
    const hours = Math.floor(diffMins / 60);
    const mins = diffMins % 60;

    if (hours > 0) {
        return `${hours}h ${mins}m`;
    } else {
        return `${mins}m`;
    }
}

// ===== GATE STATE TRACKING =====
let currentGateState = {
    in: 'OFF',
    out: 'OFF'
};

// Auto-close timers
let inCloseTimer = null;
let outCloseTimer = null;

// ===== HELPER FUNCTION: PUBLISH GATE STATUS =====
function publishGateStatus(gateType, state) {
    // gateType: 'in' hoặc 'out'
    // state: 'ON' hoặc 'OFF'

    currentGateState[gateType] = state;

    const statusJson = JSON.stringify({
        in: currentGateState.in,
        out: currentGateState.out
    });

    mqttClient.publish('gate/status', statusJson, { qos: 0, retain: true }, (err) => {
        if (err) {
            console.error('[MQTT Publish Error]', err);
        } else {
            console.log(`[MQTT→] gate/status: ${statusJson}`);
        }
    });

    // ===== AUTO-CLOSE AFTER 3 SECONDS =====
    if (state === 'ON') {
        if (gateType === 'in') {
            // Clear timer cũ nếu có
            if (inCloseTimer) clearTimeout(inCloseTimer);

            // Set timer mới để đóng cổng IN sau 3s
            inCloseTimer = setTimeout(() => {
                currentGateState.in = 'OFF';
                mqttClient.publish('gate/status', JSON.stringify(currentGateState), { qos: 0, retain: true });
                console.log(`[Auto-Close] IN gate OFF (3s)`);
            }, 3000);
        } else if (gateType === 'out') {
            if (outCloseTimer) clearTimeout(outCloseTimer);
            outCloseTimer = setTimeout(() => {
                currentGateState.out = 'OFF';
                mqttClient.publish('gate/status', JSON.stringify(currentGateState), { qos: 0, retain: true });
                console.log(`[Auto-Close] OUT gate OFF (3s)`);
            }, 3000);
        }
    }
}


// 3. SERVER CONFIG
app.use(express.static(path.join(__dirname, '../frontend')));
app.use(express.json());

// API: Lấy dữ liệu logs cho Frontend
app.get('/api/logs', (req, res) => {
    db.all("SELECT * FROM logs ORDER BY id DESC LIMIT 50", [], (err, rows) => {
        if (err) {
            res.status(400).json({ "error": err.message });
            return;
        }
        res.json({
            "message": "success",
            "data": rows
        });
    });
});

// API: Lấy danh sách xe đang trong bãi (status = IN_PARKING)
app.get('/api/vehicles', (req, res) => {
    db.all("SELECT * FROM vehicles WHERE status = 'IN_PARKING' ORDER BY entry_time DESC", [], (err, rows) => {
        if (err) {
            res.status(400).json({ "error": err.message });
            return;
        }
        res.json({
            "message": "success",
            "data": rows
        });
    });
});

// API: Lấy toàn bộ lịch sử xe (cả đã ra và đang trong bãi)
app.get('/api/vehicles/all', (req, res) => {
    db.all("SELECT * FROM vehicles ORDER BY entry_time DESC LIMIT 100", [], (err, rows) => {
        if (err) {
            res.status(400).json({ "error": err.message });
            return;
        }
        res.json({
            "message": "success",
            "data": rows
        });
    });
});

// ===== API: GỬI BIỂN SỐ TỪ WEB UI =====
app.post('/api/plate', (req, res) => {
    const { plate } = req.body;

    if (!plate || plate.trim() === '') {
        return res.json({ status: 'error', message: 'Biển số không hợp lệ' });
    }

    const plateTrimmed = plate.trim();
    console.log(`[Web→Server] Received from Web UI: ${plateTrimmed}`);

    // KHÔNG PUBLISH LÊN MQTT - Tránh loop
    // MQTT chỉ nhận từ MQTTX hoặc ESP32

    // Kiểm tra xe đang trong bãi chưa (status = 'IN_PARKING')
    db.get("SELECT * FROM vehicles WHERE plate = ? AND status = 'IN_PARKING'", [plateTrimmed], (err, row) => {
        if (err) {
            console.error('[DB Error]', err);
            return res.json({ status: 'error', message: 'Database error' });
        }

        const now = new Date();
        const offset = now.getTimezoneOffset() * 60000;
        const localTime = new Date(now.getTime() - offset).toISOString().slice(0, 19).replace('T', ' ');

        if (!row) {
            // ===== XE CHƯA CÓ TRONG DB - MỞ CỔNG IN =====
            const stmt = db.prepare("INSERT INTO vehicles (plate, status, entry_time) VALUES (?, 'IN_PARKING', ?)");
            stmt.run(plateTrimmed, localTime, (insertErr) => {
                if (insertErr) {
                    console.error('[DB] Insert failed:', insertErr);
                    return res.json({ status: 'error', message: 'Không thể lưu vào database' });
                }

                console.log(`[DB] ${plateTrimmed} - ENTRY at ${localTime}`);

                // Log event
                const logStmt = db.prepare("INSERT INTO logs (timestamp, event_type, description) VALUES (?, ?, ?)");
                logStmt.run(localTime, 'CAR_IN', `${plateTrimmed} - IN (Web)`);
                logStmt.finalize();

                // CHỈ MỞ CỔNG IN
                publishGateStatus('in', 'ON');

                // Trả response
                res.json({
                    status: 'success',
                    action: 'ENTRY',
                    gate: 'IN',
                    plate: plateTrimmed,
                    entry_time: localTime,
                    message: `Xe ${plateTrimmed} vào - Mở cổng IN`
                });
            });
            stmt.finalize();

        } else {
            // ===== XE ĐÃ CÓ TRONG DB - MỞ CỔNG OUT =====
            db.run("UPDATE vehicles SET exit_time = ?, status = 'EXITED' WHERE id = ?",
                [localTime, row.id], (updateErr) => {
                    if (updateErr) {
                        console.error('[DB] Update failed:', updateErr);
                        return res.json({ status: 'error', message: 'Không thể cập nhật database' });
                    }

                    console.log(`[DB] ${plateTrimmed} - EXIT at ${localTime}`);

                    // Tính duration
                    const duration = calculateDuration(row.entry_time, localTime);

                    // Log event
                    const logStmt = db.prepare("INSERT INTO logs (timestamp, event_type, description) VALUES (?, ?, ?)");
                    logStmt.run(localTime, 'CAR_OUT', `${plateTrimmed} - OUT (${duration}) (Web)`);
                    logStmt.finalize();

                    // CHỈ MỞ CỔNG OUT
                    publishGateStatus('out', 'ON');

                    // Trả response
                    res.json({
                        status: 'success',
                        action: 'EXIT',
                        gate: 'OUT',
                        plate: plateTrimmed,
                        entry_time: row.entry_time,
                        exit_time: localTime,
                        duration: duration,
                        message: `Xe ${plateTrimmed} ra - Mở cổng OUT`
                    });
                });
        }
    });
});

// ===== API: ĐIỀU KHIỂN CỔNG THỦ CÔNG =====
app.post('/api/gate/manual', (req, res) => {
    const { gate, state } = req.body;

    if (!gate || !state) {
        return res.json({ status: 'error', message: 'Invalid parameters' });
    }

    const now = new Date();
    const offset = now.getTimezoneOffset() * 60000;
    const localTime = new Date(now.getTime() - offset).toISOString().slice(0, 19).replace('T', ' ');

    const eventType = `GATE_${gate}_${state}`;
    const gateState = state; // Giữ nguyên ON/OFF
    const description = `Manual - ${gateState}`;

    console.log(`[Manual Control] ${eventType} at ${localTime}`);

    // Log event - GỌN 1 DÒNG
    const stmt = db.prepare("INSERT INTO logs (timestamp, event_type, description) VALUES (?, ?, ?)");
    stmt.run(localTime, eventType, description, (err) => {
        if (err) {
            console.error('[DB Error]', err);
            return res.json({ status: 'error', message: 'Database error' });
        }

        // PUBLISH GATE STATUS
        const gateType = gate.toLowerCase();
        publishGateStatus(gateType, gateState);

        res.json({
            status: 'success',
            gate: gate,
            state: state,
            timestamp: localTime
        });
    });
    stmt.finalize();
});

// Serve Frontend
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '../frontend/index.html'));
});

// Start Server
app.listen(PORT, () => {
    console.log('\n========================================');
    console.log('   VISION GATE BACKEND SYSTEM');
    console.log('========================================');
    console.log(`✓ Web Server : http://localhost:${PORT}`);
    console.log(`✓ Database   : database/gate_system.db`);
    console.log(`✓ MQTT Client: Connected`);
    console.log('========================================\n');
});