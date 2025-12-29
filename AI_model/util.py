import string
import easyocr
import cv2
import numpy as np
import re
import csv

# --- TỪ ĐIỂN ÁNH XẠ ---
dict_char_to_int = {'O': '0', 'Q': '0', 'D': '0', 'I': '1', 'L': '1', 'Z': '2', 'J': '3', 'A': '4', 'S': '5', 'G': '6', 'B': '8', 'T': '1'}
dict_int_to_char = {'0': 'O', '1': 'I', '2': 'Z', '3': 'J', '4': 'A', '5': 'S', '6': 'G', '8': 'B'}
allow_list = string.ascii_uppercase + string.digits

print("Đang khởi tạo EasyOCR...")
try:
    reader = easyocr.Reader(['en'], gpu=False) # Đổi gpu=True nếu có card rời
    print("EasyOCR đã sẵn sàng!")
except Exception as e:
    print(f"Lỗi khởi tạo EasyOCR: {e}")
    exit()

def format_license(text):
    return text.upper().replace(' ', '').replace('-', '').replace('.', '').replace('_', '')

def comply_format(text):
    """
    Logic sửa lỗi ký tự dựa trên vị trí:
    - Ký tự 1,2: Số
    - Ký tự 3: Chữ
    - Ký tự 4: Tự do
    - Ký tự 5+: Số
    """
    if len(text) < 5: return text 
    text_list = list(text)
    length = len(text_list)

    # 1. Hai ký tự đầu: Số
    for i in [0, 1]:
        if i < length and text_list[i] in dict_char_to_int:
            text_list[i] = dict_char_to_int[text_list[i]]
    
    # 2. Ký tự thứ 3: Chữ
    if 2 < length and text_list[2] in dict_int_to_char:
        text_list[2] = dict_int_to_char[text_list[2]]

    # 3. Ký tự thứ 5 trở đi: Số (Bỏ qua ký tự thứ 4)
    for i in range(4, length):
        if text_list[i] in dict_char_to_int:
            text_list[i] = dict_char_to_int[text_list[i]]

    return "".join(text_list)

def preprocess_plate(image):
    """Tiền xử lý ảnh chuyên dụng cho biển 2 dòng"""
    if image is None: return None
    if len(image.shape) == 3:
        gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    else:
        gray = image
        
    h, w = gray.shape
    if h == 0 or w == 0: return None
    
    # --- CẢI TIẾN: Tăng kích thước ảnh lớn hơn để đọc chữ nhỏ ---
    # Thay vì 100px, tăng lên 200px chiều cao
    scale = 200.0 / h
    new_w = int(w * scale)
    gray_resized = cv2.resize(gray, (new_w, 200), interpolation=cv2.INTER_CUBIC)
    
    # Tăng độ tương phản
    _, thresh = cv2.threshold(gray_resized, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
    
    # (Tùy chọn) Dilation nhẹ để nét chữ dày hơn nếu cần
    # kernel = np.ones((2,2), np.uint8)
    # thresh = cv2.dilate(thresh, kernel, iterations=1)
    
    return thresh

def read_license_plate(license_plate_crop):
    processed_img = preprocess_plate(license_plate_crop)
    if processed_img is None: return None, None

    # --- CẢI TIẾN: Thêm tham số mag_ratio và width_ths ---
    # mag_ratio=1.5: Phóng to ảnh nội bộ để đọc chữ nhỏ tốt hơn
    # width_ths=0.5: Giúp tách các ký tự dính nhau
    detections = reader.readtext(processed_img, 
                                 detail=1, 
                                 paragraph=False, 
                                 allowlist=allow_list,
                                 mag_ratio=1.5, 
                                 width_ths=0.5)
    
    if not detections: return None, None

    # Sắp xếp theo chiều dọc (Y coordinate) để lấy dòng trên trước
    sorted_detections = sorted(detections, key=lambda x: x[0][0][1])

    full_text_arr = []
    total_score = 0
    count = 0

    for bbox, text, score in sorted_detections:
        # Hạ ngưỡng score xuống thấp hơn một chút (0.15) để bắt được cả những chữ mờ
        if score > 0.15:
            clean_part = format_license(text)
            # Loại bỏ nhiễu quá ngắn (như dấu chấm, dấu gạch đơn lẻ)
            if len(clean_part) > 1 or (len(clean_part) == 1 and clean_part.isalnum()):
                full_text_arr.append(clean_part)
                total_score += score
                count += 1
    
    full_text = "".join(full_text_arr)
    avg_score = total_score / count if count > 0 else 0.0

    corrected_text = comply_format(full_text)

    # Biển xe máy thường từ 7 ký tự trở lên (Ví dụ: 24X112442 là 9 ký tự)
    if len(corrected_text) >= 5 and avg_score > 0.15:
        return corrected_text, avg_score
    
    return None, None

# ... (Hàm get_car và write_csv giữ nguyên như cũ) ...
def get_car(license_plate, vehicle_track_ids):
    x1, y1, x2, y2, score, class_id = license_plate
    cx, cy = (x1 + x2) / 2, (y1 + y2) / 2
    for vehicle in vehicle_track_ids:
        vx1, vy1, vx2, vy2, car_id = vehicle
        if vx1 < cx < vx2 and vy1 < cy < vy2:
            return vehicle
    return -1, -1, -1, -1, -1

def write_csv(results, output_path):
    with open(output_path, 'w', newline='') as f:
        writer = csv.writer(f)
        writer.writerow(['frame_nmr', 'car_id', 'car_bbox', 'license_plate_bbox', 
                         'license_plate_bbox_score', 'license_number', 'license_number_score'])
        for frame_nmr in results.keys():
            for car_id in results[frame_nmr].keys():
                entry = results[frame_nmr][car_id]
                if 'car' in entry and 'license_plate' in entry and 'text' in entry['license_plate']:
                    writer.writerow([
                        frame_nmr, car_id,
                        f"[{entry['car']['bbox'][0]} {entry['car']['bbox'][1]} {entry['car']['bbox'][2]} {entry['car']['bbox'][3]}]",
                        f"[{entry['license_plate']['bbox'][0]} {entry['license_plate']['bbox'][1]} {entry['license_plate']['bbox'][2]} {entry['license_plate']['bbox'][3]}]",
                        entry['license_plate']['bbox_score'],
                        entry['license_plate']['text'],
                        entry['license_plate']['text_score']
                    ])