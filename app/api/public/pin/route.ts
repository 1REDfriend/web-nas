import { enabledSettings, limitsFor } from "@/lib/pin/rooms";
import { noStore, pinErrorResponse } from "@/lib/pin/http";

// Public (no login): whether PIN rooms are on, and the limits the page shows. 404 when off.
export async function GET() {
    try {
        return noStore({ enabled: true, limits: limitsFor(await enabledSettings()) });
    } catch (err: unknown) {
        return pinErrorResponse(err, "status");
    }
}
