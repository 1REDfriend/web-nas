import { createDownloadResponse } from "@/lib/routes/filesystem/download-response";
import { assertShareRateLimit } from "@/lib/security/share-access";
import { deleteItem, findItemFile, findMember } from "@/lib/pin/rooms";
import { noStore, pinErrorResponse } from "@/lib/pin/http";

// Public (no login), for members of a PIN room:
//   GET     downloads a file in the room (always as an attachment; Range works)
//   DELETE  removes a file or note — whoever added it, or the room's maker

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
    try {
        assertShareRateLimit(request, "download");
        const { id } = await params;
        const member = await findMember(request.headers.get("cookie"));
        const { item, filePath } = await findItemFile(member, id);
        const response = await createDownloadResponse(filePath, { fileName: item.name ?? "file", rangeHeader: request.headers.get("range") });
        response.headers.set("Cache-Control", "private, no-store");
        return response;
    } catch (err: unknown) {
        return pinErrorResponse(err, "download");
    }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
    try {
        const { id } = await params;
        const member = await findMember(request.headers.get("cookie"));
        await deleteItem(member, id);
        return noStore({ deleted: true });
    } catch (err: unknown) {
        return pinErrorResponse(err, "delete item");
    }
}
