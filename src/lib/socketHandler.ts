import { Server, Socket } from 'socket.io';
import os from 'os';
import jwt from 'jsonwebtoken';
import * as pty from 'node-pty';
import { prisma } from '@/lib/db';
import { constTrue } from 'effect/Function';
import { ENV } from './ENV';

const shell = os.platform() === 'win32' ? 'cmd.exe' : 'bash';
const JWT_SECRET = ENV.JWT_SECRET;

interface JwtPayload {
    userId: string;
}

export function initializeSocketIO(io: Server) {

    io.on('connection', async (socket: Socket) => {
        try {
            const token = socket.handshake.auth.token;
            if (!token) {
                throw new Error('Authentication failed: No token provided');
            }

            const payload = jwt.verify(token, JWT_SECRET) as JwtPayload;
            const userId = payload.userId;

            const pathMap = await prisma.path_maps.findFirst({
                where: {
                    userId: userId
                },
                select: {
                    root_path: constTrue
                }
            });

            if (!pathMap || !pathMap.root_path) {
                throw new Error('Authorization failed: No valid path map found for user');
            }

            const userRootDir = pathMap.root_path;
            console.log(`Client ${userId} connected to terminal at ${userRootDir}`);

            const ptyProcess = pty.spawn(shell, [], {
                name: 'xterm-color',
                cols: 80,
                rows: 30,
                cwd: userRootDir,
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
                console.log(`Client ${userId} disconnected, killing shell`);
                ptyProcess.kill();
            });

        } catch (error: unknown) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            console.error('Socket connection error:', errorMessage);
            socket.emit('message', `\r\nConnection failed: ${errorMessage}\r\n`);
            socket.disconnect(true);
        }
    });
}