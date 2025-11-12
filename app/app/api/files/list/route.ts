// src/app/api/files/list/route.ts
import { NextResponse } from 'next/server';
import { readdir, stat } from 'fs/promises';
import path from 'path';
import { sanitizePath } from '@/lib/security';

const ROOT_DIR = process.cwd();

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const reqPath = searchParams.get('path') || '.';

    try {
        const safePath = sanitizePath(ROOT_DIR, reqPath);
        const files = await readdir(safePath);

        const fileDetails = await Promise.all(
            files.map(async (file) => {
                const filePath = path.join(safePath, file);
                const stats = await stat(filePath);
                return {
                    name: file,
                    isDir: stats.isDirectory(),
                    size: stats.size,
                };
            })
        );
        return NextResponse.json(fileDetails);
    } catch (error) {
        return NextResponse.json({ error: 'Path not found' }, { status: 404 });
    }
}