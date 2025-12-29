import pandas as pd
import numpy as np
import cv2

VIDEO_PATH = './sample.mp4'
INPUT_CSV = 'test.csv'
OUTPUT_CSV = 'test_interpolated.csv'

def parse_bbox_string(bbox_str):
    if pd.isna(bbox_str) or bbox_str == 'nan': return [np.nan]*4
    try:
        cleaned = bbox_str.strip('[]').replace(',', ' ')
        parts = cleaned.split()
        return [float(p) for p in parts] if len(parts)==4 else [np.nan]*4
    except: return [np.nan]*4

def reconstruct_bbox_string(row, prefix):
    try:
        coords = [row[f'{prefix}_x1'], row[f'{prefix}_y1'], row[f'{prefix}_x2'], row[f'{prefix}_y2']]
        if any(pd.isna(c) for c in coords): return np.nan
        return f"[{int(coords[0])} {int(coords[1])} {int(coords[2])} {int(coords[3])}]"
    except: return np.nan

def process_data(df, total_frames):
    final_data = []
    car_ids = df['car_id'].unique()
    print(f"Tìm thấy {len(car_ids)} xe. Đang xử lý bầu chọn & nội suy...")

    for car_id in car_ids:
        car_df = df[df['car_id'] == car_id].copy()
        
        # --- BƯỚC 1: THUẬT TOÁN BẦU CHỌN (WEIGHTED VOTING) ---
        # Thay vì lấy max score, ta tính tổng score cho từng biển số xuất hiện
        car_df['license_number_score'] = pd.to_numeric(car_df['license_number_score'], errors='coerce')
        
        # Nhóm theo nội dung biển số và cộng dồn điểm score
        # Ví dụ: '21A...' xuất hiện 5 lần, tổng điểm là 4.5 -> Win
        #        '20O...' xuất hiện 1 lần, tổng điểm là 0.94 -> Thua
        vote_counts = car_df.groupby('license_number')['license_number_score'].sum()
        
        if not vote_counts.empty:
            best_license_text = vote_counts.idxmax() # Lấy biển có tổng điểm cao nhất
            best_license_score = car_df.loc[car_df['license_number'] == best_license_text, 'license_number_score'].max()
            
            print(f" - Car {int(car_id)}: Bầu chọn thắng cuộc -> '{best_license_text}' (Tổng điểm vote: {vote_counts.max():.2f})")
        else:
            best_license_text = ""
            best_license_score = 0.0

        # --- CÁC BƯỚC CÒN LẠI GIỮ NGUYÊN ---
        car_df['frame_nmr'] = car_df['frame_nmr'].astype(int)
        min_frame, max_frame = car_df['frame_nmr'].min(), car_df['frame_nmr'].max()
        full_index = pd.RangeIndex(start=min_frame, stop=max_frame + 1, name='frame_nmr')
        car_df = car_df.set_index('frame_nmr').reindex(full_index).reset_index()

        car_df['car_id'] = car_id
        car_df['license_number'] = best_license_text
        car_df['license_number_score'] = best_license_score

        # Tách tọa độ và nội suy
        car_bbox_data = car_df['car_bbox'].apply(parse_bbox_string).tolist()
        lp_bbox_data = car_df['license_plate_bbox'].apply(parse_bbox_string).tolist()
        
        car_coords = pd.DataFrame(car_bbox_data, columns=['car_x1', 'car_y1', 'car_x2', 'car_y2'])
        lp_coords = pd.DataFrame(lp_bbox_data, columns=['lp_x1', 'lp_y1', 'lp_x2', 'lp_y2'])
        
        car_df = pd.concat([car_df, car_coords, lp_coords], axis=1)
        cols = ['car_x1', 'car_y1', 'car_x2', 'car_y2', 'lp_x1', 'lp_y1', 'lp_x2', 'lp_y2']
        car_df[cols] = car_df[cols].interpolate(method='linear', limit_direction='both')

        car_df['car_bbox'] = car_df.apply(lambda row: reconstruct_bbox_string(row, 'car'), axis=1)
        car_df['license_plate_bbox'] = car_df.apply(lambda row: reconstruct_bbox_string(row, 'lp'), axis=1)

        final_data.append(car_df)

    return pd.concat(final_data) if final_data else pd.DataFrame()

# Main execution
try:
    cap = cv2.VideoCapture(VIDEO_PATH)
    total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    cap.release()

    df = pd.read_csv(INPUT_CSV)
    processed_df = process_data(df, total_frames)

    if not processed_df.empty:
        processed_df = processed_df.sort_values(by=['frame_nmr', 'car_id'])
        processed_df.to_csv(OUTPUT_CSV, index=False)
        print(f"\nĐã xong! Chạy visualize.py để xem kết quả ổn định nhất.")
    else:
        print("Không có dữ liệu.")
except Exception as e:
    print(f"Lỗi: {e}")