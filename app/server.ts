// server.js (อยู่ที่ root ของโปรเจกต์)
import { createServer } from 'http';
import { parse } from 'url';
import next from 'next';
import { Server } from 'socket.io';
import pty from 'node-pty';

const dev = process.env.NODE_ENV !== 'production';
const app = next({ dev });
const handle = app.getRequestHandler();

const port = process.env.PORT || 3000;
import os from 'os';
const shell = os.platform() === 'win32' ? 'cmd.exe' : 'bash';

app.prepare().then(() => {
    const server = createServer((req, res) => {
        const parsedUrl = parse(req.url || '', true);
        handle(req, res, parsedUrl);
    });

    const io = new Server(server);

    io.on('connection', (socket) => {
        console.log('New client connected to terminal');

        const ptyProcess = pty.spawn(shell, [], {
            name: 'xterm-color',
            cols: 80,
            rows: 30,
            cwd: process.cwd(),
            env: process.env,
        });

        ptyProcess.onData((data) => {
            socket.emit('message', data);
        });

        socket.on('message', (data) => {
            ptyProcess.write(data);
        });

        socket.on('resize', ({ cols, rows }) => {
            ptyProcess.resize(cols, rows);
        });

        socket.on('disconnect', () => {
            console.log('Client disconnected, killing shell');
            ptyProcess.kill();
        });
    });

    server.listen(port, () => {
        console.log(`> Ready on http://localhost:${port}`);
    });
});