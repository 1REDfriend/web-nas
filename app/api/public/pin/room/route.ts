import { isSecureRequest } from "@/lib/drops/request-sharing";
import { clearMemberCookie, closeOwnRoom, findMember, roomView, setLocked } from "@/lib/pin/rooms";
import { noStore, pinErrorResponse, readBody } from "@/lib/pin/http";

// Public (no login), for members of a PIN room (the wn_pin cookie):
//
//   GET     the room and its items; ?v=<version> answers { unchanged: true } when nothing changed
//   PATCH   { locked } — the room's maker only
//   DELETE  close the room now, deleting everything in it — the room's maker only

export async function GET(request: Request) {
    try {
        const member = await findMember(request.headers.get("cookie"));
        const raw = new URL(request.url).searchParams.get("v");
        const known = raw !== null && /^\d+$/.test(raw) ? Number(raw) : undefined;
        return noStore(await roomView(member, known));
    } catch (err: unknown) {
        return pinErrorResponse(err, "read room");
    }
}

export async function PATCH(request: Request) {
    try {
        const member = await findMember(request.headers.get("cookie"));
        const body = await readBody(request);
        await setLocked(member, body.locked);
        return noStore(await roomView(await findMember(request.headers.get("cookie"))));
    } catch (err: unknown) {
        return pinErrorResponse(err, "lock room");
    }
}

export async function DELETE(request: Request) {
    try {
        const member = await findMember(request.headers.get("cookie"));
        await closeOwnRoom(member);
        return noStore({ closed: true }, {}, clearMemberCookie(isSecureRequest(request.headers)));
    } catch (err: unknown) {
        return pinErrorResponse(err, "close room");
    }
}
