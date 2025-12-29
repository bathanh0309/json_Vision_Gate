// Migration script: Thêm cột status và exit_time vào bảng vehicles
const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('gate_system.db');

console.log('[Migration] Starting database migration...');

// Kiểm tra xem cột status đã tồn tại chưa
db.all("PRAGMA table_info(vehicles)", [], (err, columns) => {
    if (err) {
        console.error('[Error]', err);
        db.close();
        return;
    }

    const hasStatus = columns.some(col => col.name === 'status');
    const hasExitTime = columns.some(col => col.name === 'exit_time');

    if (hasStatus && hasExitTime) {
        console.log('[Migration] ✓ Database already up-to-date!');
        db.close();
        return;
    }

    console.log('[Migration] Adding new columns...');

    // Thêm cột status nếu chưa có
    if (!hasStatus) {
        db.run("ALTER TABLE vehicles ADD COLUMN status TEXT DEFAULT 'IN_PARKING'", (err) => {
            if (err) {
                console.error('[Error] Cannot add status column:', err);
            } else {
                console.log('[Migration] ✓ Added column: status');
            }
        });
    }

    // Thêm cột exit_time nếu chưa có
    if (!hasExitTime) {
        db.run("ALTER TABLE vehicles ADD COLUMN exit_time DATETIME", (err) => {
            if (err) {
                console.error('[Error] Cannot add exit_time column:', err);
            } else {
                console.log('[Migration] ✓ Added column: exit_time');
            }

            // Đóng database sau khi hoàn tất
            setTimeout(() => {
                console.log('[Migration] ✓ Migration completed!');
                console.log('[Info] You can now run: node server.js');
                db.close();
            }, 500);
        });
    }
});
