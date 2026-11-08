// Runs once when the server starts
export async function register() {
    if (process.env.NEXT_RUNTIME === "nodejs") {
        // Expired drops must go away on time even when nobody opens the app
        const { startDropSweeper } = await import("@/lib/drops/maintenance");
        startDropSweeper();
        // Big uploads sent in pieces and then abandoned are cleaned up the same way
        const { startUploadSweeper } = await import("@/lib/uploads/sessions");
        startUploadSweeper();
        // PIN rooms are deleted, files and all, when they expire
        const { startPinSweeper } = await import("@/lib/pin/rooms");
        startPinSweeper();
    }
}
