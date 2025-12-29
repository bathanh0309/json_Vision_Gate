const fs = require('fs');

const filePath = 'd:/Final/backend/server.js';
let content = fs.readFileSync(filePath, 'utf8');

// Find and replace the buggy MQTT handler code
const oldCode = `            } else {
                // Xe đã trong bãi - chỉ log thông báo, không update DB
                console.log(\`[MQTT] \${plate} already in parking - Opening IN gate anyway\`);
            }
            
            // LUÔN MỞ CỔNG IN khi nhận từ MQTT (bất kể đã có trong DB hay chưa)
            publishGateStatus('in', 'OPEN');
        });`;

const newCode = `            } else {
                // XE ĐÃ CÓ - Xe ra - UPDATE DB và MỞ CỔNG OUT
                db.run("UPDATE vehicles SET exit_time = ?, status = 'EXITED' WHERE id = ?", 
                    [localTime, row.id], (updateErr) => {
                    if (!updateErr) {
                        console.log(\`[DB] \${plate} - EXIT from MQTT at \${localTime}\`);
                        const duration = calculateDuration(row.entry_time, localTime);
                        const logStmt = db.prepare("INSERT INTO logs (timestamp, event_type, description) VALUES (?, ?, ?)");
                        logStmt.run(localTime, 'CAR_OUT', \`\${plate} - OUT (\${duration}) (MQTT)\`);
                        logStmt.finalize();
                        publishGateStatus('out', 'OPEN');
                    }
                });
            }
        });`;

content = content.replace(oldCode, newCode);

fs.writeFileSync(filePath, content, 'utf8');
console.log('✅ Fixed MQTT handler - now opens OUT gate for existing vehicles!');
