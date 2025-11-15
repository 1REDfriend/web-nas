import { ENV } from "@/lib/ENV";
import { logerror } from "@/lib/logger";
import { NextResponse } from "next/server";

export async function GET(request:Request) {
    try {
        return NextResponse.json(
            { message : "Logout Successful"},
            { status : 200}
        )
            .cookies.set({
                name: ENV.TOKEN_COOKIE,
                value: '',
                maxAge: 0,
                httpOnly: true,
                secure: true,
                sameSite: 'strict',
                path: '/',
            })
    } catch (err : unknown) {
        logerror("[Logout Failed] : " + err)
        return NextResponse.json(
            { error : "Internal Error"},
            { status : 500}
        )
    }
}