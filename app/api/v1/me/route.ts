import { prisma } from "@/lib/db";
import { getApiCaller } from "@/lib/api/v1/caller";
import { apiError, apiErrorFromException, apiOk } from "@/lib/api/v1/response";

// Lets a program check that its API key works and see what it is allowed to do
export async function GET() {
    try {
        const caller = await getApiCaller();
        if (!caller) return apiError(401, "UNAUTHORIZED", "Authentication required");

        const key = caller.keyId
            ? await prisma.apiKey.findUnique({
                  where: { id: caller.keyId },
                  select: {
                      id: true,
                      name: true,
                      prefix: true,
                      maxUploadBytes: true,
                      expiresAt: true,
                      createdAt: true,
                  },
              })
            : null;

        return apiOk({
            via: caller.via,
            user: { username: caller.username, role: caller.user.role },
            scopes: caller.scopes,
            rootPath: caller.rootPath,
            key,
        });
    } catch (err: unknown) {
        return apiErrorFromException(err, "me");
    }
}
