export const ENV = ({
    DATABASE_URL: process.env.DATABASE_URL || "",
    JWT_SECRET: process.env.JWT_SECRET || "",
    TOKEN_COOKIE: process.env.TOKEN_COOKIE || "",
    // Optional parent domain (e.g. "example.com") so the login cookie also reaches the
    // terminal when it runs on another subdomain; empty = cookie for this host only
    COOKIE_DOMAIN: process.env.COOKIE_DOMAIN || "",
    STORAGE_ROOT: process.env.STORAGE_ROOT || "",
    STORAGE_INTERNAL: process.env.STORAGE_INTERNAL || "storage",
    // Optional; when empty the browser uses "<current host>:7255" (see vncScreen.tsx)
    TERMINAL_HOST: process.env.NEXT_PUBLIC_TERMINAL_HOST || "",
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