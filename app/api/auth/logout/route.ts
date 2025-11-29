import { ENV } from "@/lib/ENV";
import { logerror } from "@/lib/logger";
import { NextResponse } from "next/server";

export async function GET() {
    try {
        const response = NextResponse.json(
            { message : "Logout Successful"},
            { status : 200}
        );

        response.cookies.set({
            name: ENV.TOKEN_COOKIE,
            value: '',
            maxAge: 0,
            httpOnly: true,
            secure: true,
            sameSite: 'strict',
            path: '/',
        });

        return response;
    } catch (err : unknown) {
        logerror("[Logout Failed] : " + err)
        return NextResponse.json(
            { error : "Internal Error"},
            { status : 500}
        )
    }
}