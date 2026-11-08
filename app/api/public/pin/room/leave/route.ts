import { isSecureRequest } from "@/lib/drops/request-sharing";
import { clearMemberCookie } from "@/lib/pin/rooms";
import { assertJson, noStore, pinErrorResponse } from "@/lib/pin/http";

// Public (no login): forgets the PIN room on this browser. The room itself stays open.
export async function POST(request: Request) {
    try {
        assertJson(request);
        return noStore({ left: true }, {}, clearMemberCookie(isSecureRequest(request.headers)));
    } catch (err: unknown) {
        return pinErrorResponse(err, "leave room");
    }
}
