import { logerror } from "@/lib/logger";
import { NextResponse } from "next/server";
import { authorizePath, fileAccessErrorResponse, getRequestUser } from "@/lib/security/path-guard";
import { createDownloadResponse } from "@/lib/routes/filesystem/download-response";
import { recordRecent } from "@/lib/service/tracked-paths";

// Share-link downloads live in /api/public/share/[id]/download
export async function POST(request: Request) {
    const body = await request.json()
    const { reqFile } = body;

    const user = await getRequestUser();
    if (!user) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    try {
        if (!reqFile) {
            return NextResponse.json(
                { error: "Download Error : please input file" },
                { status: 400 }
            )
        }

        const { physicalPath, virtualPath } = await authorizePath(user, reqFile, "DOWNLOAD", { includeSubtree: true });

        const response = await createDownloadResponse(physicalPath);
        await recordRecent(user.id, virtualPath, "downloaded");
        return response;
    } catch (err: unknown) {
        const accessResponse = fileAccessErrorResponse(err);
        if (accessResponse) return accessResponse;

        logerror("[File Downoad Failed] : " + err);
        if (err instanceof Error && (err as NodeJS.ErrnoException).code === 'ENOENT') {
            return NextResponse.json(
                { error: 'Path not found' },
                { status: 404 }
            );
        }
        return NextResponse.json(
            { error: 'Internal Server Error' },
            { status: 500 }
        );
    }
}
