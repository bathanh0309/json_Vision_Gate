import cv2
import numpy as np
import time
from datetime import datetime
import paho.mqtt.client as mqtt
from ultralytics import YOLO
from util import read_license_plate, preprocess_plate
from flask import Flask, Response, render_template_string
import threading

# ====================================================
# 1. CẤU HÌNH HỆ THỐNG
# ====================================================
# --- CẤU HÌNH CAMERA ---
CAMERA_SOURCE = 0  # 0: Webcam mặc định

# --- CẤU HÌNH AI ---
CONFIDENCE_THRESHOLD = 0.5
OCR_SKIP_FRAMES = 5

# --- CẤU HÌNH MQTT ---
MQTT_BROKER = "broker.emqx.io"
MQTT_PORT = 1883
MQTT_TOPIC = "bienso/cmd"
MQTT_USERNAME = "bathanh0309"
MQTT_PASSWORD = "bathanh0309"

# --- CẤU HÌNH FLASK ---
FLASK_PORT = 5000

# ====================================================
# 2. KHỞI TẠO MQTT CLIENT
# ====================================================
print("[INFO] Dang ket noi MQTT...")
import random
client_id = f"ALPR_Flask_{random.randint(1000, 9999)}_{int(time.time())}"
client = mqtt.Client(client_id=client_id)
client.username_pw_set(MQTT_USERNAME, MQTT_PASSWORD)

def on_connect(client, userdata, flags, rc):
    if rc == 0:
        print(f"[MQTT] Ket noi thanh cong toi {MQTT_BROKER}!")
    else:
        print(f"[MQTT] Ket noi that bai! Ma loi: {rc}")

def on_publish(client, userdata, mid):
    """Callback khi tin nhắn được gửi thành công"""
    print(f"[MQTT] Message ID {mid} da duoc gui thanh cong")

client.on_connect = on_connect
client.on_publish = on_publish

try:
    client.connect(MQTT_BROKER, MQTT_PORT, 60)
    client.loop_start()
    print(f"[MQTT] Client ID: {client_id}")
except Exception as e:
    print(f"[MQTT] Loi ket noi: {e}")

# ====================================================
# 3. KHỞI TẠO MODELS
# ====================================================
print("[INFO] Dang tai models YOLO & EasyOCR...")
try:
    coco_model = YOLO('./yolov8n.pt')
    lp_detector = YOLO('./license_plate_detector.pt')
    print("[INFO] Models da san sang!")
except Exception as e:
    print(f"[ERROR] Khong tim thay file model: {e}")
    exit()

VEHICLE_CLASSES = [2, 3, 5, 7]

# ====================================================
# 4. BIẾN GLOBAL CHO VIDEO STREAM
# ====================================================
output_frame = None
lock = threading.Lock()

# ====================================================
# 5. HÀM XỬ LÝ WEBCAM & AI DETECTION
# ====================================================
def webcam_processor():
    global output_frame
    
    print(f"[KET NOI] Dang mo Camera (Source: {CAMERA_SOURCE})...")
    
    cap = cv2.VideoCapture(CAMERA_SOURCE, cv2.CAP_DSHOW)
    cap.set(cv2.CAP_PROP_FRAME_WIDTH, 1280)
    cap.set(cv2.CAP_PROP_FRAME_HEIGHT, 720)
    
    if not cap.isOpened():
        print(f"[LOI] Khong the mo Camera {CAMERA_SOURCE}.")
        return

    print("[THANH CONG] He thong da san sang!")
    
    frame_count = 0
    prev_time = 0
    
    # Biến kiểm soát (Debounce)
    last_processed_plate = ""
    last_processed_time = 0

    while True:
        try:
            ret, frame = cap.read()
            if not ret:
                print("[CANH BAO] Khong doc duoc frame.")
                break

            frame_count += 1
            curr_time = time.time()
            fps = 1 / (curr_time - prev_time) if prev_time > 0 else 0
            prev_time = curr_time

            # --- XỬ LÝ AI ---
            detections = coco_model.track(frame, persist=True, classes=VEHICLE_CLASSES, verbose=False)[0]
            
            if detections.boxes.id is not None:
                track_ids = detections.boxes.id.int().cpu().tolist()
                boxes = detections.boxes.xyxy.cpu().tolist()  # FIX: Convert to list instead of numpy
                
                for box, track_id in zip(boxes, track_ids):
                    x1, y1, x2, y2 = map(int, box)
                    
                    # Vẽ khung xe
                    cv2.rectangle(frame, (x1, y1), (x2, y2), (0, 255, 0), 2)

                    h, w, _ = frame.shape
                    y1_safe = max(0, y1)
                    y2_safe = min(h, y2)
                    x1_safe = max(0, x1)
                    x2_safe = min(w, x2)
                    
                    if y2_safe <= y1_safe or x2_safe <= x1_safe: continue
                    
                    car_crop = frame[y1_safe:y2_safe, x1_safe:x2_safe]

                    lp_results = lp_detector(car_crop, verbose=False)[0]
                    for lp in lp_results.boxes.data.tolist():
                        lx1, ly1, lx2, ly2, score, _ = lp
                        px1 = int(lx1) + x1_safe
                        py1 = int(ly1) + y1_safe
                        px2 = int(lx2) + x1_safe
                        py2 = int(ly2) + y1_safe
                        
                        cv2.rectangle(frame, (px1, py1), (px2, py2), (0, 0, 255), 2)

                        if score > CONFIDENCE_THRESHOLD and frame_count % OCR_SKIP_FRAMES == 0:
                            py1_s = max(0, py1)
                            py2_s = min(h, py2)
                            px1_s = max(0, px1)
                            px2_s = min(w, px2)

                            if py2_s > py1_s and px2_s > px1_s:
                                lp_crop = frame[py1_s:py2_s, px1_s:px2_s]
                                lp_text, lp_score = read_license_plate(lp_crop)
                                
                                if lp_text:
                                    label = f"{lp_text}"
                                    
                                    # Hiển thị
                                    print(f"[XE #{track_id}] Bien so: {label}")
                                    (tw, th), _ = cv2.getTextSize(label, cv2.FONT_HERSHEY_SIMPLEX, 0.8, 2)
                                    cv2.rectangle(frame, (px1, py1 - 30), (px1 + tw, py1), (0, 0, 0), -1)
                                    cv2.putText(frame, label, (px1, py1 - 5), 
                                                cv2.FONT_HERSHEY_SIMPLEX, 0.8, (255, 255, 255), 2)
                                    
                                    # --- XỬ LÝ SỰ KIỆN (MQTT) ---
                                    current_time_now = time.time()
                                    
                                    # Chỉ xử lý nếu biển số KHÁC lần trước HOẶC đã qua 5 giây
                                    if label != last_processed_plate or (current_time_now - last_processed_time > 5):
                                        
                                        # Gửi MQTT
                                        try:
                                            result = client.publish(MQTT_TOPIC, label, qos=1)
                                            if result.rc == mqtt.MQTT_ERR_SUCCESS:
                                                print(f"📡 [MQTT] Sent to '{MQTT_TOPIC}': {label}")
                                            else:
                                                print(f"⚠️ [MQTT] Failed to send! Error code: {result.rc}")
                                        except Exception as mqtt_err:
                                            print(f"❌ [MQTT ERROR] {mqtt_err}")

                                        # Cập nhật trạng thái
                                        last_processed_plate = label
                                        last_processed_time = current_time_now

            # Hiển thị FPS
            cv2.putText(frame, f"FPS: {int(fps)}", (20, 50), cv2.FONT_HERSHEY_SIMPLEX, 1, (0, 255, 255), 2)
            
            # Lưu frame vào biến global để Flask stream
            with lock:
                output_frame = frame.copy()

        except Exception as e:
            print(f"[LOI VONG LAP] {e}")
            break

    cap.release()
    client.loop_stop()
    client.disconnect()
    print("[INFO] Webcam processor da dung.")

# ====================================================
# 6. FLASK WEB SERVER
# ====================================================
app = Flask(__name__)

def generate_frames():
    """Generator function để stream MJPEG frames"""
    global output_frame, lock
    
    while True:
        with lock:
            if output_frame is None:
                continue
            
            # Encode frame sang JPEG
            (flag, encodedImage) = cv2.imencode(".jpg", output_frame)
            
            if not flag:
                continue
        
        # Yield frame dưới dạng MJPEG
        yield(b'--frame\r\n'
              b'Content-Type: image/jpeg\r\n\r\n' + bytearray(encodedImage) + b'\r\n')

@app.route('/')
def index():
    """Trang chủ đơn giản để test stream"""
    return render_template_string('''
    <!DOCTYPE html>
    <html>
    <head>
        <title>AI Webcam Stream</title>
        <style>
            body {
                font-family: Arial, sans-serif;
                background: #1a1a1a;
                color: white;
                display: flex;
                flex-direction: column;
                align-items: center;
                padding: 20px;
            }
            h1 { color: #00ff88; }
            img { 
                max-width: 90%; 
                border: 3px solid #00ff88;
                border-radius: 10px;
                box-shadow: 0 0 20px rgba(0,255,136,0.3);
            }
        </style>
    </head>
    <body>
        <h1>🚗 AI License Plate Detection Stream</h1>
        <img src="{{ url_for('video_feed') }}" />
        <p>Stream endpoint: <code>/video_feed</code></p>
    </body>
    </html>
    ''')

@app.route('/video_feed')
def video_feed():
    """Video streaming route. Đây là endpoint cho frontend"""
    return Response(generate_frames(),
                    mimetype='multipart/x-mixed-replace; boundary=frame')

# ====================================================
# 7. MAIN - CHẠY WEBCAM THREAD & FLASK SERVER
# ====================================================
if __name__ == "__main__":
    # Start webcam processor trong thread riêng
    webcam_thread = threading.Thread(target=webcam_processor, daemon=True)
    webcam_thread.start()
    
    print("\n========================================")
    print("   AI WEBCAM FLASK STREAMING SERVER")
    print("========================================")
    print(f"✓ Webcam AI : Running")
    print(f"✓ MQTT      : {MQTT_BROKER}:{MQTT_PORT}")
    print(f"✓ Web Stream: http://localhost:{FLASK_PORT}")
    print(f"✓ Endpoint  : http://localhost:{FLASK_PORT}/video_feed")
    print("========================================\n")
    
    # Start Flask server (blocking)
    app.run(host='0.0.0.0', port=FLASK_PORT, debug=False, threaded=True)
