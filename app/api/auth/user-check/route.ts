import { getRequestUser } from "@/lib/security/path-guard";
import { NextResponse } from "next/server";

export async function GET() {
    const user = await getRequestUser()

    if (!user) {
        return NextResponse.json(
            { error: 'Unauthorized' },
            { status: 401 }
        );
    } else {
        return NextResponse.json(
            { message: 'User is Login', role: user.role }
        );
    }
}
