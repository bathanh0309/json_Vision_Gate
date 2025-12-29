# LOGIC MỚI - MQTT MASTER CONTROL

## Kiến Trúc

**MQTTX = MASTER (Trung tâm điều khiển)**
- Gửi biển số vào topic `bienso/cmd` → **Luôn mở cổng IN**
- Web UI phải nghe theo MQTT

---

## 3 Luồng Điều Khiển

### 1️⃣ MQTTX → Server (Ưu tiên cao nhất - Luôn mở IN)

**Khi nào:** Gửi biển số từ MQTTX vào topic `bienso/cmd`

**Flow:**
```
[MQTTX Publish] bienso/cmd: "ABC123"
    ↓
[Server Subscribe] Nhận "ABC123"
    ↓
[Kiểm tra DB] Đã có trong bãi chưa?
    ├─ Chưa có → INSERT vào DB (status: IN_PARKING)
    │            Log: CAR_IN - ABC123 - IN (MQTT)
    │
    └─ Đã có → Chỉ log thông báo
               (Không update DB)
    ↓
[LUÔN MỞ CỔNG IN] Publish gate/status: {"in":"OPEN","out":"CLOSE"}
```

**Server Console:**
```
[MQTT] bienso/cmd: ABC123
[MQTTX→Server] License plate from MQTT: ABC123
[DB] ABC123 - ENTRY from MQTT at 2025-12-17 12:00:00
[MQTT→] gate/status: {"in":"OPEN","out":"CLOSE"}
```

**Web UI:** Không có tương tác trực tiếp, chỉ hiển thị logs

---

### 2️⃣ Web UI → Server (Check DB để quyết định IN/OUT)

**Khi nào:** Nhập biển số trên giao diện Web

**Flow A - Xe chưa có trong DB (Mở IN):**
```
[User nhập] "XYZ789"
    ↓
[Web POST] /api/plate {"plate": "XYZ789"}
    ↓
[Server] Kiểm tra DB: SELECT ... WHERE plate='XYZ789' AND status='IN_PARKING'
    ↓ (Không tìm thấy)
[INSERT DB] plate=XYZ789, status=IN_PARKING, entry_time=NOW
    ↓
[Log] CAR_IN - XYZ789 - IN (Web)
    ↓
[Publish] gate/status: {"in":"OPEN","out":"CLOSE"}
    ↓
[Response] { gate: "IN", action: "ENTRY", ... }
    ↓
[Web UI] Mở animation cổng IN (2 giây)
```

**Flow B - Xe đã có trong DB (Mở OUT):**
```
[User nhập] "XYZ789" (lần 2)
    ↓
[Web POST] /api/plate {"plate": "XYZ789"}
    ↓
[Server] Kiểm tra DB: Tìm thấy XYZ789 với status='IN_PARKING'
    ↓
[UPDATE DB] SET exit_time=NOW, status='EXITED' WHERE plate=XYZ789
    ↓
[Log] CAR_OUT - XYZ789 - OUT (15m) (Web)
    ↓
[Publish] gate/status: {"in":"CLOSE","out":"OPEN"}
    ↓
[Response] { gate: "OUT", action: "EXIT", duration: "15m", ... }
    ↓
[Web UI] Mở animation cổng OUT (2 giây)
```

**Server Console:**
```
# Lần 1 (IN):
[Web→Server] Received from Web UI: XYZ789
[DB] XYZ789 - ENTRY at 2025-12-17 12:05:00
[MQTT→] gate/status: {"in":"OPEN","out":"CLOSE"}

# Lần 2 (OUT):
[Web→Server] Received from Web UI: XYZ789
[DB] XYZ789 - EXIT at 2025-12-17 12:20:00
[MQTT→] gate/status: {"in":"CLOSE","out":"OPEN"}
```

---

### 3️⃣ Nút Manual (Ưu tiên tuyệt đối)

**Khi nào:** Nhấn nút GATE IN / GATE OUT trên Web UI

**Flow:**
```
[User click] Nút GATE IN
    ↓
[Web POST] /api/gate/manual { gate: "IN", state: "ON" }
    ↓
[Server] Log: GATE_IN_ON - Manual - OPEN
    ↓
[Publish] gate/status: {"in":"OPEN","out":"CLOSE"}
    ↓
[Response] { gate: "IN", state: "ON", ... }
    ↓
[Web UI] Mở cổng IN (vô thời hạn - không auto close)
```

---

## So Sánh 3 Luồng

| Nguồn | Topic MQTT | Check DB | Cổng Mở | DB Action | Log Prefix |
|-------|-----------|----------|---------|-----------|------------|
| **MQTTX** | bienso/cmd | Có (để log) | Luôn IN | INSERT nếu chưa có | (MQTT) |
| **Web Input** | Không publish | Có (quyết định) | IN hoặc OUT | INSERT hoặc UPDATE | (Web) |
| **Nút Manual** | Không | Không | Theo nút nhấn | Không | - |

---

## Test Scenarios

### Scenario 1: MQTTX Master Control

1. Mở MQTTX
2. Publish `bienso/cmd`: `TEST001`
3. **Kết quả:**
   - Server log: `[MQTTX→Server] License plate from MQTT: TEST001`
   - DB: Thêm record mới với status `IN_PARKING`
   - MQTT `gate/status`: `{"in":"OPEN","out":"CLOSE"}`
   - Web logs table: `CAR_IN` - `TEST001 - IN (MQTT)`

### Scenario 2: Web UI - Xe vào

1. Nhập `ABC123` trên Web UI
2. **Kết quả:**
   - Server log: `[Web→Server] Received from Web UI: ABC123`
   - DB: Thêm record mới
   - MQTT `gate/status`: `{"in":"OPEN","out":"CLOSE"}`
   - Web: Alert "Xe ABC123 VÀO - Mở cổng IN" + Animation IN 2s
   - Logs: `CAR_IN` - `ABC123 - IN (Web)`

### Scenario 3: Web UI - Xe ra

1. Nhập lại `ABC123` (đã có trong DB)
2. **Kết quả:**
   - Server log: `[Web→Server] Received from Web UI: ABC123`
   - DB: UPDATE record với status `EXITED`, exit_time
   - MQTT `gate/status`: `{"in":"CLOSE","out":"OPEN"}`
   - Web: Alert "Xe ABC123 RA - Mở cổng OUT" + Animation OUT 2s
   - Logs: `CAR_OUT` - `ABC123 - OUT (15m) (Web)`

### Scenario 4: Manual Control

1. Click nút GATE IN
2. **Kết quả:**
   - Server log: `[Manual Control] GATE_IN_ON`
   - DB: Không thay đổi
   - MQTT `gate/status`: `{"in":"OPEN","out":"CLOSE"}`
   - Web: Cổng IN mở vô thời hạn
   - Logs: `GATE_IN_ON` - `Manual - OPEN`

---

## Lưu Ý Quan Trọng

1. **Không có vòng lặp MQTT:**
   - Web UI không publish lên `bienso/cmd`
   - Chỉ MQTTX hoặc ESP32 mới publish lên topic này

2. **Mỗi action chỉ mở 1 cổng:**
   - MQTTX → Luôn IN
   - Web (chưa có DB) → IN
   - Web (đã có DB) → OUT
   - Manual → Theo nút nhấn

3. **Database không xóa:**
   - Xe ra chỉ UPDATE `status='EXITED'`
   - Giữ lại toàn bộ lịch sử

4. **Nút manual ưu tiên nhất:**
   - Không phụ thuộc DB
   - Không phụ thuộc MQTT input
   - Bảo vệ có thể cưỡng chế mở/đóng bất cứ lúc nào

---

## Chạy Test

```bash
# 1. Start server
cd d:\Final
run.bat

# 2. Mở Web
http://localhost:3000

# 3. Mở MQTTX
Connect: broker.emqx.io:1883
Subscribe: gate/status
Publish: bienso/cmd → Gửi số bất kỳ → Xem cổng IN mở

# 4. Test Web UI
Nhập số lần 1 → IN
Nhập số lần 2 → OUT

# 5. Test Manual
Click nút GATE IN → Mở
Click lại → Đóng
```

✅ Hoàn tất!
