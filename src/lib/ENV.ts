export const ENV = ({
    DATABASE_URL: process.env.DATABASE_URL || "",
    TURSO_DATABASE_URL: process.env.TURSO_DATABASE_URL || "",
    TURSO_AUTH_TOKEN: process.env.TURSO_AUTH_TOKEN || "",
    JWT_SECRET: process.env.JWT_SECRET || "",
    GMAIL: process.env.GMAIL || "",
    GMAIL_PASSWORD: process.env.GMAIL_PASSWORD || "",
    TOKEN_COOKIE: process.env.TOKEN_COOKIE || "",
    STORAGE_ROOT: process.env.STORAGE_ROOT || ""
})