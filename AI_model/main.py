import cv2
from ultralytics import YOLO
import os
import numpy as np
import json
# Import các hàm từ file util.py
from util import get_car, read_license_plate, write_csv

# ==========================================================================================
# <<< CÁC THIẾT LẬP >>>
video_path = './sample.mp4'
coco_model_path = './yolov8n.pt'  # Hoặc yolov8m.pt tùy cấu hình máy
lp_detector_path = './license_plate_detector.pt' 

# ID của class biển số trong model license_plate_detector (thường là 0)
LP_CLASS_ID = 0 

# Các class xe trong COCO model: 2=car, 3=motorcycle, 5=bus, 7=truck
VEHICLE_CLASSES = [2, 3, 5, 7]
# ==========================================================================================

# TẠO THƯ MỤC DEBUG (Tùy chọn)
debug_dir = './debug_crops'
if not os.path.exists(debug_dir):
    os.makedirs(debug_dir)

# 1. KHỞI TẠO MODEL
print("[INFO] Loading models...")
coco_model = YOLO(coco_model_path)
license_plate_detector = YOLO(lp_detector_path)
print("[INFO] Models loaded.")

# 2. ĐỌC VIDEO
cap = cv2.VideoCapture(video_path)
results = {}
frame_nmr = -1

# Kernel làm nét ảnh (giúp OCR đọc tốt hơn)
sharpen_kernel = np.array([[-1, -1, -1],
                           [-1,  9, -1],
                           [-1, -1, -1]])

while cap.isOpened():
    frame_nmr += 1
    ret, frame = cap.read()
    if not ret:
        break

    print(f"\n--- Processing frame {frame_nmr} ---")
    results[frame_nmr] = {}

    # 3. PHÁT HIỆN VÀ THEO DÕI XE (TRACKING)
    detections = coco_model.track(frame, persist=True, classes=VEHICLE_CLASSES, verbose=False)[0]
    
    if detections.boxes.id is None:
        continue

    # Lấy danh sách các xe
    track_ids = detections.boxes.id.cpu().numpy()
    boxes = detections.boxes.xyxy.cpu().numpy()

    # 4. DUYỆT QUA TỪNG XE
    for box, track_id in zip(boxes, track_ids):
        xcar1, ycar1, xcar2, ycar2 = box
        vehicle_id = int(track_id)

        # Cắt ảnh xe (Vehicle Crop)
        # Thêm padding nhẹ cho xe để không bị mất chi tiết viền
        vp = 10 # vehicle padding
        h_img, w_img, _ = frame.shape
        
        ycar1_pad = max(0, int(ycar1) - vp)
        ycar2_pad = min(h_img, int(ycar2) + vp)
        xcar1_pad = max(0, int(xcar1) - vp)
        xcar2_pad = min(w_img, int(xcar2) + vp)
        
        car_crop = frame[ycar1_pad:ycar2_pad, xcar1_pad:xcar2_pad, :]
        
        # Làm nét ảnh xe trước khi đưa vào model tìm biển số
        car_crop_sharpened = cv2.filter2D(car_crop, -1, sharpen_kernel)

        if car_crop.size == 0: continue

        # 5. PHÁT HIỆN BIỂN SỐ TRONG ẢNH XE
        lp_results = license_plate_detector(car_crop_sharpened, classes=[LP_CLASS_ID], verbose=False)[0]

        # 6. XỬ LÝ BIỂN SỐ TÌM ĐƯỢC
        for lp in lp_results.boxes.data.tolist():
            x1_crop, y1_crop, x2_crop, y2_crop, score, _ = lp
            
            # Chuyển tọa độ từ ảnh crop (local) ra ảnh gốc (global)
            x1 = x1_crop + xcar1_pad
            y1 = y1_crop + ycar1_pad
            x2 = x2_crop + xcar1_pad
            y2 = y2_crop + ycar1_pad
            
            print(f"[DETECT] Xe #{vehicle_id}: Found plate at coords [{int(x1)}, {int(y1)}]")

            # === [QUAN TRỌNG] THÊM PADDING CHO BIỂN SỐ ===
            # Giúp lấy trọn vẹn biển 2 dòng (đặc biệt là dòng trên chữ nhỏ)
            h_plate = int(y2) - int(y1)
            w_plate = int(x2) - int(x1)
            
            # Mở rộng 15% chiều cao (lên trên và xuống dưới) và 5% chiều rộng
            y_pad = int(h_plate * 0.15)
            x_pad = int(w_plate * 0.05)

            y1_lp = max(0, int(y1) - y_pad)
            y2_lp = min(h_img, int(y2) + y_pad)
            x1_lp = max(0, int(x1) - x_pad)
            x2_lp = min(w_img, int(x2) + x_pad)

            # Cắt ảnh biển số (License Plate Crop)
            license_plate_crop = frame[y1_lp:y2_lp, x1_lp:x2_lp, :]
            
            # 7. ĐỌC KÝ TỰ (OCR)
            # Hàm read_license_plate trong util.py mới đã xử lý resize và threshold
            lp_text, lp_score = read_license_plate(license_plate_crop)
            
            # Lưu kết quả tạm thời
            entry = {
                'car': {'bbox': [int(xcar1), int(ycar1), int(xcar2), int(ycar2)]},
                'license_plate': {
                    'bbox': [int(x1), int(y1), int(x2), int(y2)], # Lưu bbox gốc (chưa pad) để vẽ cho đẹp
                    'bbox_score': float(score),
                    'text': '',
                    'text_score': 0.0
                }
            }

            if lp_text is not None:
                print(f"   >>> [OCR SUCCESS] Text: '{lp_text}' | Score: {lp_score:.2f}")
                entry['license_plate']['text'] = lp_text
                entry['license_plate']['text_score'] = float(lp_score)
            else:
                print(f"   >>> [OCR FAILED] Could not read text.")

            # Lưu vào dictionary tổng
            results[frame_nmr][vehicle_id] = entry
            
            # Mỗi xe chỉ lấy 1 biển số có confidence cao nhất trong frame đó (thường chỉ có 1)
            break 

cap.release()

# 8. GHI KẾT QUẢ RA CSV
output_csv_path = './test.csv'
print(f"\n=======================================================")
print(f"Processing complete. Writing results to {output_csv_path}...")
write_csv(results, output_csv_path)
print("Done!")