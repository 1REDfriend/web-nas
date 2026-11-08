import { addNote, assertAddRateLimit, findMember, roomView } from "@/lib/pin/rooms";
import { noStore, pinErrorResponse, readBody } from "@/lib/pin/http";

// Public (no login), for members of a PIN room: adds a note. Body: { text }.
export async function POST(request: Request) {
    try {
        const member = await findMember(request.headers.get("cookie"));
        assertAddRateLimit(request.headers);
        const body = await readBody(request);
        await addNote(member, body.text);
        return noStore(await roomView(await findMember(request.headers.get("cookie"))), { status: 201 });
    } catch (err: unknown) {
        return pinErrorResponse(err, "add note");
    }
}
