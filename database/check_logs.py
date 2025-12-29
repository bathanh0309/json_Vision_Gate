
import sqlite3
import pandas as pd

# Kết nối đến Database
db_path = 'gate_system.db'
conn = sqlite3.connect(db_path)

try:
    print(f"--- Đang đọc dữ liệu từ: {db_path} ---")
    
    # 1. Lấy 10 dòng mới nhất (LIMIT 10)
    query = "SELECT * FROM logs ORDER BY id DESC LIMIT 10"
    df = pd.read_sql_query(query, conn)
    
    if df.empty:
        print("Database chưa có dữ liệu!")
    else:
        # 2. Format cột timestamp: Ngày-Tháng-Năm Giờ:Phút:Giây
        # Chuyển đổi sang kiểu datetime trước
        df['timestamp'] = pd.to_datetime(df['timestamp'])
        
        # Định dạng lại
        df['timestamp'] = df['timestamp'].dt.strftime('%d-%m-%Y %H:%M:%S')
        
        # Hiển thị bảng ra màn hình console (dạng string đẹp)
        # index=False để không in cột index số thứ tự dòng 0,1,2...
        print(df.to_string(index=False))
        
except Exception as e:
    print(f"Lỗi: {e}")

finally:
    conn.close()
    print("\n--- Hoàn tất ---")
