import { createServer } from 'http';
import { parse } from 'url';
import next from 'next';
import { setting } from './src/lib/ENV';
import { setupVncProxy } from './src/lib/vnc/vnc-proxy';
import { log, logerror } from './src/lib/logger';

const dev = process.env.NODE_ENV !== 'production';

// Config
const NEXT_PORT = 3000;
const VNC_PROXY_PORT = 3001;

// Next.js App Setup
const app = next({ dev, hostname: 'localhost', port: NEXT_PORT });
const handle = app.getRequestHandler();

app.prepare().then(() => {
    
    // -------------------------------------------------
    // 1. สร้าง Server หลักสำหรับหน้าเว็บ Next.js (Port 3000)
    // -------------------------------------------------
    const httpServer = createServer(async (req, res) => {
        try {
            const parsedUrl = parse(req.url!, true);
            await handle(req, res, parsedUrl);
        } catch (err) {
            logerror('Error occurred handling', req.url, err);
            res.statusCode = 500;
            res.end('internal server error');
        }
    });

    // จุดที่หายไป: ต้องสั่ง Listen ด้วย! และใช้ 0.0.0.0 เพื่อความชัวร์
    httpServer.listen(NEXT_PORT, '0.0.0.0', () => {
        log(`> 🌐 Website ready on http://0.0.0.0:${NEXT_PORT}`);
    });


    // -------------------------------------------------
    // 2. สร้าง Server แยกสำหรับ VNC Proxy (Port 3001)
    // -------------------------------------------------
    const vncServer = createServer((req, res) => {
        // VNC Server ไม่ต้องตอบ HTTP Request ปกติ
        res.writeHead(404);
        res.end();
    });

    setupVncProxy(vncServer);

    vncServer.listen(VNC_PROXY_PORT, '0.0.0.0', () => {
        log(`> 🔌 VNC Proxy ready on port ${VNC_PROXY_PORT}`);
    });
});