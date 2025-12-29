# ESP32-C3 Simple Gate Control 🚦

## Tổng Quan

Hệ thống điều khiển cổng đơn giản với ESP32-C3:
- **Nhấn nút** → Đèn sáng/tắt
- **Đồng bộ Web** qua MQTT
- **Không cần camera**, không cần FreeRTOS

---

## Tính Năng ✨

### 1. Điều khiển đơn giản
- Nhấn nút IN → LED IN sáng/tắt
- Nhấn nút OUT → LED OUT sáng/tắt
- Tự động tắt sau 3 giây

### 2. Đồng bộ Web
- Nhấn nút vật lý → Web cập nhật
- Nhấn nút Web → LED ESP32-C3 sáng/tắt
- MQTT làm trung gian

---

## GPIO Pinout 📌

| Chức năng | GPIO | Loại |
|-----------|------|------|
| LED/Relay IN | GPIO 2 | Output |
| LED/Relay OUT | GPIO 3 | Output |
| Nút IN | GPIO 4 | Input (Pull-up) |
| Nút OUT | GPIO 5 | Input (Pull-up) |

> ⚠️ **Lưu ý:** GPIO trên ESP32-C3 khác ESP32-CAM. Kiểm tra board của anh nhé!

---

## Cài Đặt & Nạp Firmware 🚀

### Bước 1: Chuẩn bị

Cài đặt ESP32 board support trong Arduino IDE:
```
File → Preferences → Additional Board URLs:
https://raw.githubusercontent.com/espressif/arduino-esp32/gh-pages/package_esp32_index.json
```

### Bước 2: Nạp firmware

```bash
cd d:\Final\firmware
firmware.bat
```

**Hướng dẫn nạp:**
1. Kết nối ESP32-C3 vào COM7
2. Nhấn giữ nút **BOOT** (nếu cần)
3. Kết nối GPIO9 với GND (một số board cần)
4. Chạy `firmware.bat`
5. Sau khi upload xong, nhấn **RESET**

### Bước 3: Kiểm tra

Mở Serial Monitor (115200 baud) sẽ thấy:
```
========================================
   ESP32-C3 Simple Gate Control v1.0
========================================

[GPIO] ✓ Pins initialized
  - LED IN: GPIO 2
  - LED OUT: GPIO 3
  - BTN IN: GPIO 4
  - BTN OUT: GPIO 5

[WiFi] Connecting to 'WIFI_ESP_CAM'...... ✓ Connected!
[WiFi] IP: 192.168.1.100

[MQTT] Configured
  - Broker: broker.emqx.io:1883
  - User: bathanh0309

========================================
   System Ready!
========================================
```

---

## Cấu Hình WiFi 📡

Mở file `firmware.ino`, sửa dòng 7-8:

```cpp
const char* ssid = "TEN_WIFI_CUA_ANH";
const char* password = "MAT_KHAU_WIFI";
```

---

## Cách Dùng 🎮

### Test nút vật lý

1. **Nhấn nút IN** → LED IN sáng → Web hiển thị OPEN
2. **Đợi 3 giây** → LED tắt → Web hiển thị CLOSE
3. **Nhấn nút OUT** → Tương tự

### Test từ Web

1. Mở `http://localhost:3000`
2. Click nút **IN** trên web
3. Kiểm tra LED trên ESP32-C3 sáng
4. Đợi 3 giây → LED tắt

### Test MQTT (tùy chọn)

```bash
# Mở cổng IN
mosquitto_pub -h broker.emqx.io -t "gate/in/cmd" -m "OPEN" -u bathanh0309 -P bathanh0309

# Toggle cổng OUT
mosquitto_pub -h broker.emqx.io -t "gate/out/cmd" -m "TOGGLE" -u bathanh0309 -P bathanh0309
```

---

## MQTT Topics 📡

| Topic | Mục đích | Format |
|-------|----------|--------|
| `gate/in/cmd` | Lệnh cổng IN | `TOGGLE` / `OPEN` |
| `gate/out/cmd` | Lệnh cổng OUT | `TOGGLE` / `OPEN` |
| `gate/status` | Trạng thái tổng hợp | `{"in":"OPEN","out":"CLOSE"}` |
| `bienso/cmd` | Biển số xe | `29A-12345` |

---

## Sơ Đồ Hệ Thống

```
┌─────────────┐           ┌──────────────┐           ┌─────────────┐
│   Nút GPIO  │──────────▶│  ESP32-C3    │──────────▶│  LED/Relay  │
│  (Physical) │           │   Firmware   │           │   Control   │
└─────────────┘           └──────┬───────┘           └─────────────┘
                                 │
                                 │ MQTT
                                 ▼
                          ┌──────────────┐
                          │ MQTT Broker  │
                          │ (broker.emqx)│
                          └──────┬───────┘
                                 │
                                 ▼
                          ┌──────────────┐
                          │ Web Interface│
                          │ (localhost)  │
                          └──────────────┘
```

---

## Troubleshooting 🔧

### ESP32-C3 không kết nối WiFi
- Kiểm tra SSID/password trong code
- Đảm bảo WiFi 2.4GHz (không phải 5GHz)
- Reset lại ESP32-C3

### Không compile được
```bash
# Cài đặt ESP32 board
arduino-cli core update-index
arduino-cli core install esp32:esp32
```

### Nút nhấn không hoạt động
- Kiểm tra GPIO có đúng không (GPIO 4, 5)
- Kiểm tra nút có pull-up không
- Kiểm tra kết nối dây

### LED không sáng
- Kiểm tra LED nối đúng GPIO (GPIO 2, 3)
- Kiểm tra điện áp phù hợp (3.3V)
- Kiểm tra kết nối GND

---

## So Sánh v4.1 vs Simple v1.0

| Feature | v4.1 (ESP32-CAM) | v1.0 (ESP32-C3) |
|---------|------------------|-----------------|
| Board | ESP32-CAM | ESP32-C3 |
| Camera | ✅ | ❌ |
| FreeRTOS | ✅ | ❌ |
| GPIO Interrupt | ✅ | ❌ (polling) |
| Code Size | ~20KB | ~7KB |
| Phức tạp | Cao | Rất đơn giản |
| Dễ hiểu | Trung bình | Rất dễ |

---

## Code Đơn Giản 💡

File `firmware.ino` chỉ có:
- ✅ WiFi connection
- ✅ MQTT pub/sub
- ✅ GPIO read/write
- ✅ Debounce logic
- ✅ Auto-close timer

**Tổng cộng:** ~280 dòng code (so với 650+ dòng v4.1)

---

## Tác Giả

**ESP32-C3 Simple Gate Control v1.0**  
Đơn giản hóa từ ESP32-CAM v4.1  
© 2025
