# SỬA NHANH 3 PHẦN (3 phút)

## 1. SỬA MQTT HANDLER - TOGGLE LOGIC (server.js)

**File:** `d:\Final\backend\server.js`

**TÌM dòng 64-95** (từ `// Kiểm tra xem` đến `});`)

**THAY TOÀN BỘ BẰNG:**

```javascript
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
                            
                            publishGateStatus('in', 'OPEN');
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
                            
                            publishGateStatus('in', 'OPEN');
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
                        
                        publishGateStatus('out', 'OPEN');
                    }
                });
            }
        });
```

---

## 2. THÊM MÀU CHỮ CHO LOGS (script.js)

**File:** `d:\Final\frontend\script.js`

**TÌM function `fetchLogs()` (khoảng dòng 267-290)**

**THAY BẰNG:**

```javascript
// ================= LOAD LOGS TỪ DB API ==================
function fetchLogs() {
    fetch('/api/logs')
        .then(res => res.json())
        .then(data => {
            if (data.message === 'success') {
                const tbody = document.querySelector('#log-table tbody');
                tbody.innerHTML = '';

                data.data.forEach(log => {
                    const row = document.createElement('tr');
                    
                    // Timestamp
                    const tdTime = document.createElement('td');
                    tdTime.textContent = log.timestamp;
                    row.appendChild(tdTime);

                    // Event Type với màu
                    const tdEvent = document.createElement('td');
                    tdEvent.textContent = log.event_type;
                    
                    // Thêm màu cho CAR_IN (blue) và CAR_OUT (red)
                    if (log.event_type === 'CAR_IN') {
                        tdEvent.style.color = '#2196F3';
                        tdEvent.style.fontWeight = '600';
                    } else if (log.event_type === 'CAR_OUT') {
                        tdEvent.style.color = '#f44336';
                        tdEvent.style.fontWeight = '600';
                    }
                    row.appendChild(tdEvent);

                    // Description với màu cho (Web) và (MQTT)
                    const tdDesc = document.createElement('td');
                    tdDesc.textContent = log.description;
                    
                    if (log.description.includes('(Web)')) {
                        tdDesc.style.color = '#FFC107'; // Yellow
                    } else if (log.description.includes('(MQTT)')) {
                        tdDesc.style.color = '#4CAF50'; // Green
                    }
                    row.appendChild(tdDesc);

                    tbody.appendChild(row);
                });
            }
        })
        .catch(err => console.error('[API Error]', err));
}
```

---

## 3. TEST

**Chạy lại server:**
```bash
run.bat
```

**Test MQTTX:**
```
Publish bienso/cmd: "TEST99"

Lần 1: IN mở 3s  (status: IN_PARKING)
Lần 2: OUT mở 3s (status: EXITED)
Lần 3: IN mở 3s  (status: IN_PARKING lại)
Lần 4: OUT mở 3s (status: EXITED)
...cứ thế lặp lại
```

**Kiểm tra Web UI:**
- CAR_IN: Chữ màu XANH DƯƠNG (#2196F3)
- CAR_OUT: Chữ màu ĐỎ (#f44336)
- (Web): Màu VÀNG (#FFC107)
- (MQTT): Màu XANH LÁ (#4CAF50)

---

## Tóm Tắt Thay Đổi

1. **Toggle Logic:**
   - Lần 1 (chưa có): INSERT → IN_PARKING → Mở IN
   - Lần 2 (IN_PARKING): UPDATE → EXITED → Mở OUT
   - Lần 3 (EXITED): UPDATE → IN_PARKING → Mở IN
   - Lần 4: ...lặp lại

2. **Query mới:**
   - `ORDER BY id DESC LIMIT 1` - Lấy record mới nhất
   - Check `!row || row.status === 'EXITED'` - Cho vào nếu chưa có hoặc đã ra

3. **Màu chữ:**
   - JavaScript inline styles thay vì CSS selector
   - Dùng `includes()` để check (Web) hoặc (MQTT)

✅ Xong rồi test ngay!
