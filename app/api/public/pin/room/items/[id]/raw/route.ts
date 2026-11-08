import { createMediaResponse } from "@/lib/routes/filesystem/media-response";
import { assertShareRateLimit } from "@/lib/security/share-access";
import { findItemFile, findMember } from "@/lib/pin/rooms";
import { pinErrorResponse } from "@/lib/pin/http";

// Public (no login), for members of a PIN room: shows an image, video or audio file
// inline. Other types are refused by createMediaResponse.
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
    try {
        assertShareRateLimit(request, "media");
        const { id } = await params;
        const member = await findMember(request.headers.get("cookie"));
        const { item, filePath } = await findItemFile(member, id);
        const response = await createMediaResponse(request, filePath, item.name ?? "file");
        response.headers.set("Cache-Control", "private, no-store");
        return response;
    } catch (err: unknown) {
        return pinErrorResponse(err, "preview");
    }
}
