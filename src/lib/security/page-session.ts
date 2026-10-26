import { cache } from "react";
import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { RuleRole } from "@/lib/security/file-actions";
import { ENV } from "@/lib/ENV";
import { verifySessionToken } from "@/lib/security/session";

// proxy.ts only guards /api, so server-rendered pages check the session here.
// cache() lets a layout and its page share one lookup per request.
const currentPageUser = cache(async () => {
    const token = (await cookies()).get(ENV.TOKEN_COOKIE)?.value;
    return verifySessionToken(token);
});

// Sends visitors without a usable session to the login (or password change) page,
// and answers 404 when the role may not see the page. The API routes still enforce
// the same rules; this only keeps people off pages they cannot use.
export async function requirePageUser(roles?: readonly RuleRole[]) {
    const user = await currentPageUser();
    if (!user) redirect("/auth/login");
    if (user.mustChangePassword) redirect("/auth/pass-change");
    if (roles && !roles.includes(user.role)) notFound();
    return user;
}
