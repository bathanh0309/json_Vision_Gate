import pandas as pd
import cv2
import ast
import numpy as np

def parse_bbox(bbox_str):
    """Hàm trợ giúp để đọc chuỗi bbox từ CSV."""
    if isinstance(bbox_str, float) or pd.isna(bbox_str):
        return None
    try:
        # Xử lý chuỗi dạng "[100 200 300 400]" (không có dấu phẩy)
        # hoặc "[100, 200, 300, 400]" (có dấu phẩy)
        clean_str = bbox_str.strip('[]').replace(',', ' ')
        return [int(float(num)) for num in clean_str.split()]
    except Exception as e:
        return None

# Đọc file CSV đã nội suy
input_csv_path = 'test_interpolated.csv'
video_path = './sample.mp4'

try:
    results = pd.read_csv(input_csv_path)
except FileNotFoundError:
    print(f"Lỗi: Không tìm thấy file '{input_csv_path}'. Hãy chạy add_missing_data.py trước.")
    exit()

cap = cv2.VideoCapture(video_path)
if not cap.isOpened():
    print(f"Lỗi: Không thể mở video tại {video_path}")
    exit()

# Lấy thông số video
frame_width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
frame_height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
fps = int(cap.get(cv2.CAP_PROP_FPS))

output_video_path = './sample_output.mp4'
out = cv2.VideoWriter(output_video_path, cv2.VideoWriter_fourcc(*'mp4v'), fps, (frame_width, frame_height))

frame_nmr = -1
max_frames = len(results)

print(f"Đang xử lý video... Tổng số frame dữ liệu: {max_frames}")

while cap.isOpened():
    frame_nmr += 1
    ret, frame = cap.read()
    if not ret:
        break

    if frame_nmr >= max_frames:
        break
        
    # Lấy dữ liệu cho khung hình hiện tại
    try:
        row = results.iloc[frame_nmr]
    except IndexError:
        break
    
    # 1. VẼ KHUNG XE (Màu Xanh Lá)
    car_bbox = parse_bbox(row['car_bbox'])
    if car_bbox:
        x1, y1, x2, y2 = car_bbox
        # Thay draw_border bằng rectangle đơn giản
        cv2.rectangle(frame, (x1, y1), (x2, y2), (0, 255, 0), 2)
        
        # (Tùy chọn) Hiển thị ID xe nếu có
        car_id = row.get('car_id', '')
        if pd.notna(car_id) and car_id != '':
             cv2.putText(frame, f"Car #{int(float(car_id))}", (x1, y1 - 10), 
                         cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 255, 0), 2)

    # 2. VẼ KHUNG BIỂN SỐ (Màu Xanh Dương)
    license_plate_bbox = parse_bbox(row['license_plate_bbox'])
    license_number = row['license_number']
    
    if license_plate_bbox and isinstance(license_number, str) and license_number != 'nan':
        lp_x1, lp_y1, lp_x2, lp_y2 = license_plate_bbox
        
        # Vẽ khung hình chữ nhật quanh biển số
        cv2.rectangle(frame, (lp_x1, lp_y1), (lp_x2, lp_y2), (255, 0, 0), 2)
        
        # Chuẩn bị text hiển thị
        text = f"{license_number}"
        
        # Tính toán kích thước text để vẽ nền đen cho chữ dễ đọc
        (text_width, text_height), baseline = cv2.getTextSize(text, cv2.FONT_HERSHEY_SIMPLEX, 0.8, 2)
        
        # Xác định vị trí vẽ text (ưu tiên vẽ bên trên biển số)
        text_y = lp_y1 - 10
        if text_y < text_height: # Nếu sát mép trên quá thì vẽ xuống dưới
            text_y = lp_y2 + text_height + 10

        # Vẽ nền đen cho text
        cv2.rectangle(frame, (lp_x1, text_y - text_height - 5), (lp_x1 + text_width, text_y + 5), (0, 0, 0), -1)
        
        # Vẽ nội dung biển số (Màu Trắng)
        cv2.putText(frame, text, (lp_x1, text_y), cv2.FONT_HERSHEY_SIMPLEX, 0.8, (255, 255, 255), 2)

    # Ghi frame vào video output
    out.write(frame)
    
    if frame_nmr % 50 == 0:
        print(f"Đã xử lý: {frame_nmr}/{max_frames}")

cap.release()
out.release()
print(f"\nHoàn tất! Video đã lưu tại: {output_video_path}")