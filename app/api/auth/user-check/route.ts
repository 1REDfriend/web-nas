import { xUserPayload } from "@/lib/api/user/x-user-payload";
import { NextResponse } from "next/server";

export async function GET() {
    const userPayload = await xUserPayload()

    if (!userPayload) {
        return NextResponse.json(
            { error: 'Unauthorized' },
            { status: 401 }
        );
    } else {
        return NextResponse.json(
            { message: 'User is Login'}
        );
    }
}