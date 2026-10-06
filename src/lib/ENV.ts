export const ENV = ({
    DATABASE_URL: process.env.DATABASE_URL || "",
    JWT_SECRET: process.env.JWT_SECRET || "",
    TOKEN_COOKIE: process.env.TOKEN_COOKIE || "",
    STORAGE_ROOT: process.env.STORAGE_ROOT || "",
    STORAGE_INTERNAL: process.env.STORAGE_INTERNAL || "storage",
    TERMINAL_HOST: process.env.NEXT_PUBLIC_TERMINAL_HOST || "localhost",
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