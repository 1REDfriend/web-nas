import { xUserPayload } from '@/lib/api/user/x-user-payload';
import { getRemainStorage } from '@/lib/utils/storage/getRemainStorage';
import { NextResponse } from 'next/server';

export async function GET() {
    const userPayload = await xUserPayload()
    if (!userPayload) return NextResponse.json(
        {error : "Unauthorization"},
        { status: 401}
    )

    try {
        const data = await getRemainStorage()

        return NextResponse.json(
            { total: data?.total, free: data?.free, used: data?.used }
        );
    } catch {
        return NextResponse.json(
            { total: 0, free: 0, used: 0 },
            { status: 500 }
        );
    }
}