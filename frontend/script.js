// ===== File: data/script.js =====
// Frontend kết nối TRỰC TIẾP tới EMQX qua WebSocket

// ================= MQTT CONNECTION =================
console.log('[MQTT] Connecting to broker.emqx.io via WebSocket...');

const mqttClient = mqtt.connect('ws://broker.emqx.io:8083/mqtt', {
    clientId: 'VisionGate_Web_' + Math.random().toString(16).substr(2, 8),
    username: 'bathanh0309',
    password: 'bathanh0309',
    reconnectPeriod: 1000,
    connectTimeout: 30 * 1000,
    clean: true
});

// Trạng thái cổng hiện tại (chỉ để hiển thị, KHÔNG dùng để tính toán)
let gateStates = {
    in: 'OFF',
    out: 'OFF'
};

// ===== MQTT EVENTS =====
mqttClient.on('connect', () => {
    console.log(' [MQTT] Connected to EMQX!');
    document.getElementById('mqtt-status-text').textContent = '🟢 MQTT: Connected';
    document.getElementById('mqtt-status-text').style.color = '#4caf50';

    // Subscribe topic trạng thái
    mqttClient.subscribe('gate/status', { qos: 1 });

    console.log('[MQTT] ✓ Subscribed to:');
    console.log('  - gate/status');
});

mqttClient.on('error', (err) => {
    console.error('[MQTT] ❌ Error:', err);
    document.getElementById('mqtt-status-text').textContent = '🔴 MQTT: Error';
    document.getElementById('mqtt-status-text').style.color = '#f44336';
});

mqttClient.on('offline', () => {
    console.log('[MQTT]  Offline');
    document.getElementById('mqtt-status-text').textContent = '🟡 MQTT: Offline';
    document.getElementById('mqtt-status-text').style.color = '#ff9800';
});

mqttClient.on('reconnect', () => {
    console.log('[MQTT]  Reconnecting...');
    document.getElementById('mqtt-status-text').textContent = '🟡 MQTT: Reconnecting...';
    document.getElementById('mqtt-status-text').style.color = '#ff9800';
});

// ===== NHẬN MESSAGE TỪ MQTT =====
mqttClient.on('message', (topic, message) => {
    const msg = message.toString();
    console.log(`[MQTT←ESP] ${topic}: ${msg}`);

    // Nhận trạng thái tổng hợp JSON
    if (topic === 'gate/status') {
        try {
            const status = JSON.parse(msg);
            updateGateUI('in', status.in);
            updateGateUI('out', status.out);
        } catch (err) {
            console.error('[Parse Error]', err);
        }
    }
});

// ================= CẬP NHẬT UI GATE =================
function updateGateUI(gateType, stateStr) {
    const state = stateStr.toUpperCase();
    const isOpen = (state === 'ON');

    console.log(`[UI] Updating ${gateType.toUpperCase()} gate to ${state}`);

    // Lưu trạng thái (chỉ để hiển thị)
    gateStates[gateType] = state;

    // Lấy elements
    const barrier = document.getElementById(`barrier-${gateType}`);
    const btn = document.getElementById(`btn-${gateType}`);
    const btnState = document.getElementById(`btn-${gateType}-state`);

    if (!barrier || !btn || !btnState) {
        console.error(`[UI Error] Cannot find elements for gate ${gateType}`);
        return;
    }

    // Cập nhật barie
    if (isOpen) {
        barrier.classList.add('open');
        btn.classList.add('active');
        btnState.textContent = 'ON';
    } else {
        barrier.classList.remove('open');
        btn.classList.remove('active');
        btnState.textContent = 'OFF';
    }
}

// ================= ĐIỀU KHIỂN GATE THỦ CÔNG =================
// Nút IN/OUT cho bảo vệ mở cửa thủ công

// Hàm điều khiển cổng IN
function toggleGateIN() {
    console.log('[User] Manual IN button clicked');

    const btn = document.getElementById('btn-in');
    const isCurrentlyOpen = btn.classList.contains('active');
    const newState = isCurrentlyOpen ? 'OFF' : 'ON';

    // Gửi lệnh manual control lên server
    fetch('/api/gate/manual', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gate: 'IN', state: newState })
    })
        .then(res => res.json())
        .then(data => {
            if (data.status === 'success') {
                console.log(`[Manual Control] Gate IN → ${newState}`);

                // Cập nhật UI
                if (newState === 'ON') {
                    openGate('in', 999999); // Mở vô thời hạn (không auto-close)
                } else {
                    closeGate('in');
                }

                // Reload logs
                setTimeout(fetchLogs, 300);
            }
        })
        .catch(err => console.error('[API Error]', err));
}

// Hàm điều khiển cổng OUT
function toggleGateOUT() {
    console.log('[User] Manual OUT button clicked');

    const btn = document.getElementById('btn-out');
    const isCurrentlyOpen = btn.classList.contains('active');
    const newState = isCurrentlyOpen ? 'OFF' : 'ON';

    fetch('/api/gate/manual', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gate: 'OUT', state: newState })
    })
        .then(res => res.json())
        .then(data => {
            if (data.status === 'success') {
                console.log(`[Manual Control] Gate OUT → ${newState}`);

                if (newState === 'ON') {
                    openGate('out', 999999);
                } else {
                    closeGate('out');
                }

                setTimeout(fetchLogs, 300);
            }
        })
        .catch(err => console.error('[API Error]', err));
}

// ================= CAMERA STREAM =================

// Toggle camera input controls based on selected source
function updateCameraInputs() {
    const source = document.getElementById('camera-source').value;
    const aiControls = document.getElementById('ai-webcam-controls');
    const esp32Controls = document.getElementById('esp32-controls');

    if (source === 'ai-webcam') {
        aiControls.style.display = 'flex';
        esp32Controls.style.display = 'none';
    } else if (source === 'esp32') {
        aiControls.style.display = 'none';
        esp32Controls.style.display = 'flex';
    }
}

// Start AI Webcam streaming from Flask server
function startAIWebcam() {
    const port = document.getElementById('flask-port').value || '5000';
    const streamImg = document.getElementById('stream');

    const flaskURL = `http://localhost:${port}/video_feed`;

    console.log(`[AI Webcam] Connecting to Flask server at ${flaskURL}...`);

    // Set image source to Flask endpoint
    streamImg.src = flaskURL;
    streamImg.style.display = 'block';

    // Handle errors
    streamImg.onerror = () => {
        console.error('[AI Webcam] Cannot connect to Flask server!');
        alert('⚠️ Không thể kết nối Flask Server!\n\nVui lòng chạy:\npython run_webcam_flask.py');
        streamImg.src = '';
    };

    streamImg.onload = () => {
        console.log('[AI Webcam] ✓ Connected successfully!');
    };
}

// Start ESP32-CAM stream
function startStream() {
    const ip = document.getElementById('esp-ip').value.trim();
    const streamImg = document.getElementById('stream');

    if (!ip) {
        alert('⚠️ Vui lòng nhập IP của ESP32-CAM!');
        return;
    }

    const esp32URL = `http://${ip}/stream`;
    console.log(`[ESP32-CAM] Connecting to ${esp32URL}...`);

    streamImg.src = esp32URL;
    streamImg.style.display = 'block';

    streamImg.onerror = () => {
        console.error('[ESP32-CAM] Cannot connect!');
        alert('⚠️ Không thể kết nối ESP32-CAM!\nKiểm tra IP address.');
        streamImg.src = '';
    };

    streamImg.onload = () => {
        console.log('[ESP32-CAM] ✓ Connected successfully!');
    };
}

// Stop camera stream
function stopStream() {
    const streamImg = document.getElementById('stream');
    streamImg.src = '';
    streamImg.style.display = 'none';
    console.log('[Camera] Stream stopped');
}


// ================= THAO TÁC BIỂN SỐ (WEB ONLY - HTTP API) =================
function sendManualPlate() {
    const input = document.getElementById('manual-plate');
    const plate = input.value.trim();

    if (!plate) {
        console.warn('⚠️ Vui lòng nhập biển số!');
        return;
    }

    // Gửi biển số lên Server qua HTTP POST
    fetch('/api/plate', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ plate: plate })
    })
        .then(res => res.json())
        .then(data => {
            console.log('[API Response]', data);

            if (data.status === 'success') {
                // Xóa ô nhập
                input.value = '';

                // Xử lý theo gate được mở (IN hoặc OUT)
                if (data.gate === 'IN') {
                    console.log(`✅ Xe ${plate} VÀO - Cổng IN mở 3s`);
                    // Mở cổng IN trên UI (animation) - 3 giây
                    openGate('in', 3000);

                } else if (data.gate === 'OUT') {
                    console.log(`✅ Xe ${plate} RA - Thời gian: ${data.duration} - Cổng OUT mở 3s`);
                    // Mở cổng OUT trên UI (animation) - 3 giây
                    openGate('out', 3000);
                }

                // Tải lại logs và vehicles sau 500ms
                setTimeout(() => {
                    fetchLogs();
                    fetchVehicles();
                }, 500);

            } else {
                console.error('❌ Lỗi:', data.message);
            }
        })
        .catch(err => {
            console.error('[API Error]', err);
        });
}

// ===== HÀM MỞ CỔNG VỚI ANIMATION (WEB UI) =====
function openGate(gateType, duration = 3000) {
    const barrier = document.getElementById(`barrier-${gateType}`);
    const btn = document.getElementById(`btn-${gateType}`);
    const btnState = document.getElementById(`btn-${gateType}-state`);

    if (!barrier || !btn || !btnState) {
        console.error(`[UI Error] Cannot find elements for gate ${gateType}`);
        return;
    }

    // Mở cổng
    barrier.classList.add('open');
    btn.classList.add('active');
    btnState.textContent = 'OPEN';
    console.log(`[UI] Gate ${gateType.toUpperCase()} opened`);

    // Tự động đóng sau duration (nếu không phải manual mode - duration < 999999)
    if (duration < 999999) {
        setTimeout(() => {
            closeGate(gateType);
        }, duration);
    }
}

// ===== HÀM ĐÓNG CỔNG =====
function closeGate(gateType) {
    const barrier = document.getElementById(`barrier-${gateType}`);
    const btn = document.getElementById(`btn-${gateType}`);
    const btnState = document.getElementById(`btn-${gateType}-state`);

    if (!barrier || !btn || !btnState) return;

    barrier.classList.remove('open');
    btn.classList.remove('active');
    btnState.textContent = 'CLOSE';
    console.log(`[UI] Gate ${gateType.toUpperCase()} closed`);
}

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

// ================= LOAD VEHICLES IN PARKING ==================
function fetchVehicles() {
    fetch('/api/vehicles')
        .then(res => res.json())
        .then(data => {
            if (data.message === 'success') {
                const tbody = document.querySelector('#vehicles-table tbody');
                tbody.innerHTML = '';

                if (data.data.length === 0) {
                    tbody.innerHTML = '<tr><td colspan="3" style="text-align:center; color:#999;">No vehicles</td></tr>';
                    return;
                }

                data.data.forEach(vehicle => {
                    const row = document.createElement('tr');

                    // Plate
                    const tdPlate = document.createElement('td');
                    tdPlate.textContent = vehicle.plate;
                    tdPlate.style.fontWeight = '600';
                    tdPlate.style.color = '#2196F3';
                    row.appendChild(tdPlate);

                    // Entry Time
                    const tdEntry = document.createElement('td');
                    tdEntry.textContent = vehicle.entry_time;
                    tdEntry.style.fontSize = '0.9em';
                    row.appendChild(tdEntry);

                    // Duration (calculate from entry_time to now)
                    const tdDuration = document.createElement('td');
                    const entryTime = new Date(vehicle.entry_time);
                    const now = new Date();
                    const diffMs = now - entryTime;
                    const diffMins = Math.floor(diffMs / 60000);
                    const hours = Math.floor(diffMins / 60);
                    const mins = diffMins % 60;

                    if (hours > 0) {
                        tdDuration.textContent = `${hours}h ${mins}m`;
                    } else {
                        tdDuration.textContent = `${mins}m`;
                    }
                    tdDuration.style.color = '#4CAF50';
                    row.appendChild(tdDuration);

                    tbody.appendChild(row);
                });
            }
        })
        .catch(err => console.error('[API Error]', err));
}

// ================= EXPORT CSV =================
function exportLogsToCSV() {
    fetch('/api/logs')
        .then(res => res.json())
        .then(data => {
            if (data.message !== 'success') {
                alert('❌ Không thể tải dữ liệu!');
                return;
            }

            const logs = data.data;

            // Tạo CSV header
            let csv = 'Timestamp,Event/State,Description\n';

            // Thêm dữ liệu
            logs.forEach(log => {
                const timestamp = log.timestamp || '';
                const eventType = log.event_type || '';
                const description = log.description || '';

                // Escape dấu phẩy và quotes trong CSV
                const escapedDesc = `"${description.replace(/"/g, '""')}"`;

                csv += `${timestamp},${eventType},${escapedDesc}\n`;
            });

            // Tạo blob và download
            const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
            const link = document.createElement('a');
            const url = URL.createObjectURL(blob);

            const now = new Date();
            const filename = `gate_logs_${now.getFullYear()}${(now.getMonth() + 1).toString().padStart(2, '0')}${now.getDate().toString().padStart(2, '0')}_${now.getHours().toString().padStart(2, '0')}${now.getMinutes().toString().padStart(2, '0')}.csv`;

            link.setAttribute('href', url);
            link.setAttribute('download', filename);
            link.style.visibility = 'hidden';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);

            console.log(`[Export] CSV downloaded: ${filename}`);
        })
        .catch(err => {
            console.error('[Export Error]', err);
            alert('❌ Lỗi khi export CSV!');
        });
}

// ================= AUTO LOAD ON PAGE LOAD =================
window.addEventListener('DOMContentLoaded', () => {
    console.log('[Page] DOM loaded, initializing...');

    // Don't auto-start webcam - let user choose camera source and start manually

    fetchLogs(); // Tải dữ liệu ngay
    fetchVehicles();
    // Tự động cập nhật bảng mỗi 3 giây
    setInterval(() => {
        fetchLogs();
        fetchVehicles();
    }, 3000);

    // Thêm sự kiện nhấn Enter cho ô nhập biển số
    const plateInput = document.getElementById('manual-plate');
    if (plateInput) {
        plateInput.addEventListener('keypress', function (e) {
            if (e.key === 'Enter') sendManualPlate();
        });
    }
});