# Webcam Server với OpenCV 📹

## Cách Sử Dụng

### Bước 1: Cài đặt Python dependencies
```bash
cd d:\Final
pip install -r requirements_webcam.txt
```

### Bước 2: Chạy Webcam Server
```bash
# Cách 1: Dùng batch file
start_webcam.bat

# Cách 2: Chạy trực tiếp
python webcam_server.py
```

Server sẽ chạy tại: **http://localhost:5000/stream**

### Bước 3: Mở Web Interface
```bash
# Terminal khác
cd d:\Final
node backend/server.js
```

Mở browser: **http://localhost:3000**

---

## Ưu Điểm So Với WebRTC

| Tiêu Chí | WebRTC (getUserMedia) | OpenCV + Flask |
|----------|----------------------|----------------|
| Permission | Cần cho phép mỗi lần | Không cần |
| Tương thích | Chỉ Chrome/Firefox | Mọi browser |
| Xung đột | Bị lỗi nếu app khác dùng camera | OK |
| Tương lai YOLO | Khó tích hợp | Dễ dàng |
| Xử lý ảnh | Không | Có (Python) |

---

## Architecture

```
┌──────────────┐
│   Webcam     │
└──────┬───────┘
       │
       ▼
┌──────────────────┐    HTTP Stream
│ Python OpenCV    │────────────────┐
│ Flask Server     │                │
│ (Port 5000)      │                │
└──────────────────┘                │
                                    ▼
                             ┌──────────────┐
                             │ Web Browser  │
                             │ localhost:3000│
                             └──────────────┘
```

---

## Troubleshooting

### Lỗi: `ModuleNotFoundError: No module named 'cv2'`
```bash
pip install opencv-python
```

### Lỗi: Webcam đang được sử dụng
```bash
# Tắt tất cả app dùng camera (Zoom, Teams, Skype...)
# Rồi chạy lại start_webcam.bat
```

### Lỗi: Port 5000 đã được sử dụng
Sửa file `webcam_server.py`, dòng cuối:
```python
app.run(host='0.0.0.0', port=5001, debug=False)  # Đổi 5000 → 5001
```

---

## Tương Lai: Thêm YOLO

Khi cần thêm YOLO detection, chỉ cần sửa hàm `generate_frames()`:

```python
def generate_frames():
    model = YOLO('yolov8n.pt')  # Load YOLO model
    
    while True:
        success, frame = camera.read()
        if not success:
            break
        
        # YOLO detection
        results = model(frame)
        annotated_frame = results[0].plot()
        
        # Encode và stream
        ret, buffer = cv2.imencode('.jpg', annotated_frame)
        frame = buffer.tobytes()
        yield (b'--frame\r\n'
               b'Content-Type: image/jpeg\r\n\r\n' + frame + b'\r\n')
```

Perfect cho Raspberry Pi sau này! 🚀
