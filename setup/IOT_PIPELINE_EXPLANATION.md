# IOT/WEB PIPELINE - LUỒNG XỬ LÝ BIỂN SỐ XE

## 📊 File Diagram
**File:** [iot_pipeline.drawio](file:///d:/Final/setup/iot_pipeline.drawio)

Mở bằng: https://app.diagrams.net hoặc Draw.io Desktop

---

## 🔄 LUỒNG XỬ LÝ HOÀN CHỈNH

### **Bước 1: AI Publish Biển Số**
```
Flask AI Webcam (run_webcam_flask.py)
│
└─→ MQTT Publish
    Topic: bienso/cmd
    Message: "59A12345"
    QoS: 1
```

---

### **Bước 2: Backend Subscribe & Nhận**
```
Backend Server (server.js)
│
├─→ mqttClient.on('message', ...)
│
└─→ Nhận: topic = "bienso/cmd"
          message = "59A12345"
```

**Code:**
```javascript
mqttClient.on('message', (topic, message) => {
    if (topic === 'bienso/cmd') {
        const plate = message.toString().trim();
        // Xử lý tiếp...
    }
});
```

---

### **Bước 3: Kiểm tra Database**
```
Backend → SQLite Database
│
└─→ Query:
    SELECT * FROM vehicles 
    WHERE plate = '59A12345' 
    AND status = 'IN_PARKING'
```

**Kết quả:**
- `row = null` → Xe CHƯA CÓ (hoặc đã ra) → **XE VÀO**
- `row exists` → Xe ĐANG Ở TRONG BÃI → **XE RA**

---

### **Bước 4a: Trường hợp XE VÀO (Entry)**

```sql
-- Insert vào vehicles table
INSERT INTO vehicles (plate, status, entry_time) 
VALUES ('59A12345', 'IN_PARKING', '2025-12-18 10:15:00');

-- Log event
INSERT INTO logs (timestamp, event_type, description) 
VALUES ('2025-12-18 10:15:00', 'CAR_IN', '59A12345 - IN (MQTT)');
```

**Backend publish gate status:**
```javascript
publishGateStatus('in', 'ON');
// → Publish: topic = "gate/status"
//            message = {"in": "ON", "out": "OFF"}
//            retain = true
```

---

### **Bước 4b: Trường hợp XE RA (Exit)**

```sql
-- Update vehicles table
UPDATE vehicles 
SET exit_time = '2025-12-18 10:20:00', 
    status = 'EXITED' 
WHERE plate = '59A12345';

-- Log event
INSERT INTO logs (timestamp, event_type, description) 
VALUES ('2025-12-18 10:20:00', 'CAR_OUT', '59A12345 - OUT (5m) (MQTT)');
```

**Backend publish gate status:**
```javascript
publishGateStatus('out', 'ON');
// → Publish: topic = "gate/status"
//            message = {"in": "OFF", "out": "ON"}
//            retain = true
```

---

### **Bước 5: MQTT Broker Broadcast**

```
MQTT Broker (broker.emqx.io)
│
├─→ Topic: gate/status
│   Message: {"in": "ON", "out": "OFF"}
│   Retain: true
│
└─→ Broadcast đến tất cả subscribers:
    ├─ Frontend (WebSocket)
    └─ Firmware ESP32 (MQTT)
```

---

### **Bước 6: Auto-close Timer (Backend)**

```javascript
// Trong publishGateStatus()
if (state === 'ON') {
    setTimeout(() => {
        mqttClient.publish('gate/status', 
            JSON.stringify({in: 'OFF', out: 'OFF'}),
            {retain: true});
        console.log('[Auto-Close] Gate OFF (3s)');
    }, 3000);
}
```

**Thời gian:** 3 giây sau khi mở → Tự động đóng

---

### **Bước 7a: Frontend Nhận & Hiển thị**

**WebSocket Subscribe:**
```javascript
// script.js
mqttClient.on('message', (topic, message) => {
    if (topic === 'gate/status') {
        const status = JSON.parse(message.toString());
        updateGateUI('in', status.in);
        updateGateUI('out', status.out);
    }
});
```

**updateGateUI() Function:**
```javascript
function updateGateUI(gateType, state) {
    const barrier = document.getElementById(`barrier-${gateType}`);
    
    if (state === 'ON') {
        barrier.classList.add('open');  // Animation: rotate 70deg
    } else {
        barrier.classList.remove('open');
    }
}
```

**CSS Animation:**
```css
.barrier-new.in.open {
    transform: rotate(-70deg);  /* Barie xoay lên */
    transition: transform 0.7s;
}
```

---

### **Bước 7b: Firmware ESP32 Nhận & Điều khiển**

**MQTT Callback (firmware.ino):**
```cpp
void callback(char* topic, byte* payload, unsigned int length) {
    if (strcmp(topic, "gate/status") == 0) {
        StaticJsonDocument<200> doc;
        deserializeJson(doc, payload, length);
        
        String in_state = doc["in"];
        String out_state = doc["out"];
        
        // Điều khiển LED
        digitalWrite(LED_IN, (in_state == "ON") ? HIGH : LOW);
        digitalWrite(LED_OUT, (out_state == "ON") ? HIGH : LOW);
        
        Serial.println("[GPIO] LED_IN: " + in_state);
        Serial.println("[GPIO] LED_OUT: " + out_state);
    }
}
```

**Hardware:**
```
ESP32 GPIO:
├─ LED_IN  (GPIO 2) → Sáng khi cổng IN mở
└─ LED_OUT (GPIO 3) → Sáng khi cổng OUT mở
```

---

### **Bước 8: Frontend Fetch Data (HTTP API)**

**Automatic polling (3 giây 1 lần):**
```javascript
setInterval(() => {
    fetchLogs();      // GET /api/logs
    fetchVehicles();  // GET /api/vehicles
}, 3000);
```

**Backend API:**
```javascript
// GET /api/logs - Lấy 50 logs gần nhất
app.get('/api/logs', (req, res) => {
    db.all("SELECT * FROM logs ORDER BY id DESC LIMIT 50", 
        (err, rows) => res.json({data: rows}));
});

// GET /api/vehicles - Lấy xe đang trong bãi
app.get('/api/vehicles', (req, res) => {
    db.all("SELECT * FROM vehicles WHERE status = 'IN_PARKING'", 
        (err, rows) => res.json({data: rows}));
});
```

**Frontend Render:**
```javascript
function fetchLogs() {
    fetch('/api/logs')
        .then(res => res.json())
        .then(data => {
            const tbody = document.querySelector('#log-table tbody');
            tbody.innerHTML = '';
            data.data.forEach(log => {
                // Render row với timestamp, event, description
            });
        });
}
```

---

## ⏱️ TIMING BREAKDOWN

| Bước | Thời gian | Tổng tích lũy |
|------|-----------|---------------|
| 1. AI → MQTT publish | ~10ms | 10ms |
| 2. MQTT → Backend | ~5ms | 15ms |
| 3. Database query | ~5ms | 20ms |
| 4. Insert/Update DB | ~10ms | 30ms |
| 5. MQTT publish gate | ~10ms | 40ms |
| 6. MQTT → Frontend/Firmware | ~50ms | 90ms |
| 7. UI Animation | ~100ms | 190ms |
| **8. Auto-close timer** | **3000ms** | **3190ms** |

**Tổng thời gian xử lý:** ~3.2 giây/biển số

---

## 🗄️ DATABASE SCHEMA

### **Table: vehicles**
```sql
CREATE TABLE vehicles (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    plate TEXT NOT NULL,
    status TEXT DEFAULT 'IN_PARKING',  -- IN_PARKING / EXITED
    entry_time DATETIME DEFAULT CURRENT_TIMESTAMP,
    exit_time DATETIME
);
```

### **Table: logs**
```sql
CREATE TABLE logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    event_type TEXT,  -- CAR_IN, CAR_OUT, GATE_IN_ON, ...
    description TEXT
);
```

---

## 📡 MQTT TOPICS

| Topic | Publisher | Subscriber | Message Format | Retain |
|-------|-----------|------------|----------------|--------|
| `bienso/cmd` | AI Webcam | Backend | Plain text: "59A12345" | No |
| `gate/status` | Backend | Frontend, Firmware | JSON: `{"in":"ON","out":"OFF"}` | **Yes** |
| `gate/in/cmd` | Firmware (GPIO button) | Backend | Plain text: "TOGGLE" | No |
| `gate/out/cmd` | Firmware (GPIO button) | Backend | Plain text: "TOGGLE" | No |

---

## 🔀 FLOW DIAGRAM

```
AI Webcam
    ↓ (1. Publish bienso/cmd)
MQTT Broker
    ↓ (2. Subscribe)
Backend Server
    ↓ (3. Check DB)
Database (SQLite)
    ↓ (4a. Entry OR 4b. Exit)
Backend Logic
    ↓ (5. Publish gate/status)
MQTT Broker
    ├─→ (7a) Frontend → UI Animation
    └─→ (7b) Firmware → GPIO Control
    ↓
(6. Auto-close after 3s)
    ↓
MQTT Broker → gate/status OFF
    ├─→ Frontend: Close animation
    └─→ Firmware: LED OFF
```

---

## 🎯 COMPONENTS INTERACTION

```
┌─────────────┐
│ AI WEBCAM   │───MQTT───┐
└─────────────┘          │
                         ▼
                  ┌─────────────┐
                  │ MQTT BROKER │
                  └─────────────┘
                         │
        ┌────────────────┼────────────────┐
        │                │                │
        ▼                ▼                ▼
┌─────────────┐  ┌─────────────┐  ┌─────────────┐
│  BACKEND    │  │  FRONTEND   │  │  FIRMWARE   │
│  (server.js)│  │ (index.html)│  │ (ESP32-C3)  │
└─────────────┘  └─────────────┘  └─────────────┘
        │                │                │
        ▼                │                ▼
┌─────────────┐         │         ┌─────────────┐
│  DATABASE   │         │         │  GPIO/LED   │
│  (SQLite)   │         │         │  Hardware   │
└─────────────┘         │         └─────────────┘
                        ▼
                ┌─────────────┐
                │  HTTP API   │
                │  /api/logs  │
                │  /api/...   │
                └─────────────┘
```

---

## ✅ SUMMARY

1. **AI phát hiện** → Publish `bienso/cmd`
2. **Backend nhận** → Kiểm tra database
3. **Logic xử lý** → Entry hoặc Exit
4. **Cập nhật DB** → Insert/Update vehicles & logs
5. **Publish status** → `gate/status` (JSON)
6. **Frontend render** → Animation + Fetch data
7. **Firmware control** → GPIO LED
8. **Auto-close** → 3 giây sau đóng cổng

**Kết quả:** Hệ thống tự động hoàn toàn, từ phát hiện đến điều khiển hardware!
