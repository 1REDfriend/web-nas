// Runs once when the server starts
export async function register() {
    if (process.env.NEXT_RUNTIME === "nodejs") {
        // Expired drops must go away on time even when nobody opens the app
        const { startDropSweeper } = await import("@/lib/drops/maintenance");
        startDropSweeper();
    }
}
