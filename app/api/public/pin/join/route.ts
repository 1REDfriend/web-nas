import { isSecureRequest } from "@/lib/drops/request-sharing";
import { joinRoom, roomView } from "@/lib/pin/rooms";
import { noStore, pinErrorResponse, readBody } from "@/lib/pin/http";

// Public (no login): joins the room with this PIN. Body: { pin }. Wrong PINs are rate limited.
export async function POST(request: Request) {
    try {
        const body = await readBody(request);
        const { member, setCookie } = await joinRoom(request.headers, body.pin, isSecureRequest(request.headers));
        return noStore(await roomView(member), {}, setCookie);
    } catch (err: unknown) {
        return pinErrorResponse(err, "join room");
    }
}
