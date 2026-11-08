import { isSecureRequest } from "@/lib/drops/request-sharing";
import { createRoom, roomView } from "@/lib/pin/rooms";
import { assertJson, noStore, pinErrorResponse } from "@/lib/pin/http";

// Public (no login): makes a new PIN room. The caller becomes its maker and gets the member cookie.
export async function POST(request: Request) {
    try {
        assertJson(request);
        const { member, setCookie } = await createRoom(request.headers, isSecureRequest(request.headers));
        return noStore(await roomView(member), { status: 201 }, setCookie);
    } catch (err: unknown) {
        return pinErrorResponse(err, "create room");
    }
}
