import { Server } from 'http';
import { WebSocketServer, WebSocket, RawData } from 'ws';
import net from 'net';
import { parse } from 'url';
import { log, logerror } from '../logger';
import { setting } from '../ENV';

const VNC_TARGET_HOST = setting.vnc_host;
const VNC_TARGET_PORT = setting.vnc_port;

export function setupVncProxy(server: Server) {
    const wss = new WebSocketServer({ noServer: true });

    wss.on('connection', (ws: WebSocket) => {
        log(`🔌 VNC Client Connecting... Target: ${VNC_TARGET_HOST}:${VNC_TARGET_PORT}`);

        ws.binaryType = 'arraybuffer';

        const tcpClient = net.createConnection({ host: VNC_TARGET_HOST, port: Number(VNC_TARGET_PORT) }, () => {
            log(`✅ Connected to VNC Target: ${VNC_TARGET_HOST}:${VNC_TARGET_PORT}`);
        });

        ws.on('message', (data: RawData) => {
            tcpClient.write(new Uint8Array(data as ArrayBuffer));
        });

        tcpClient.on('data', (data) => {
            if (ws.readyState === WebSocket.OPEN) {
                ws.send(data);
            }
        });

        tcpClient.on('error', (err) => {
            logerror('❌ VNC Target Connection Error:', err.message);
            ws.close();
        });

        tcpClient.on('close', () => {
            log('⚠️ VNC Target TCP closed');
            ws.close();
        });

        ws.on('close', () => {
            log('🔌 Client WebSocket closed');
            tcpClient.end();
        });

        ws.on('error', (e) => {
            logerror('❌ Client WebSocket Error:', e.message);
            tcpClient.end();
        });
    });

    server.on('upgrade', (req, socket, head) => {
        // const { pathname } = parse(req.url || '', true);
        wss.handleUpgrade(req, socket, head, (ws) => {
            wss.emit('connection', ws, req);
        });
    });

    log('✅ VNC Proxy module loaded (listening on /vnc)');
}