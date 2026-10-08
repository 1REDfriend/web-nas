export const ENV = ({
    DATABASE_URL: process.env.DATABASE_URL || "",
    JWT_SECRET: process.env.JWT_SECRET || "",
    TOKEN_COOKIE: process.env.TOKEN_COOKIE || "",
    // Optional parent domain (e.g. "example.com") so the login cookie also reaches the
    // terminal when it runs on another subdomain; empty = cookie for this host only
    COOKIE_DOMAIN: process.env.COOKIE_DOMAIN || "",
    STORAGE_ROOT: process.env.STORAGE_ROOT || "",
    STORAGE_INTERNAL: process.env.STORAGE_INTERNAL || "storage",
    // Optional host of the web terminal, read at runtime and sent to the browser by
    // /api/auth/user-check; when empty the browser uses "<current host>:7255".
    // NEXT_PUBLIC_TERMINAL_HOST is still accepted for older .env files.
    TERMINAL_HOST: process.env.TERMINAL_HOST || process.env.NEXT_PUBLIC_TERMINAL_HOST || "",
    // Absolute paths under STORAGE_ROOT that are real, persistent storage (comma-separated).
    // When set, nothing can be written anywhere else. Docker sets it to the mounted folder,
    // because everything else under /host_root lives inside the container and is lost on rebuild.
    STORAGE_WRITABLE_PATHS: (process.env.STORAGE_WRITABLE_PATHS || "")
        .split(",")
        .map((p) => p.trim())
        .filter(Boolean),
    // Extra absolute paths nobody may touch through the web UI (comma-separated)
    PROTECTED_PATHS: (process.env.PROTECTED_PATHS || "")
        .split(",")
        .map((p) => p.trim())
        .filter(Boolean),
})

// default setting
export const setting = {
    expireTrash: 30, // day only
    expireShareLink: 3, //day only
    frontend : {
        shareURL: '/share/'
    }
}