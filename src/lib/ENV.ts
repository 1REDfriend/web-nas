export const ENV = ({
    DATABASE_URL: process.env.DATABASE_URL || "",
    JWT_SECRET: process.env.JWT_SECRET || "",
    TOKEN_COOKIE: process.env.TOKEN_COOKIE || "",
    STORAGE_ROOT: process.env.STORAGE_ROOT || "",
    STORAGE_INTERNAL: process.env.STORAGE_INTERNAL || "storage"
})

export const setting = {
    expireTrash: 30, // day only

    ws_port: 6080,
    vnc_host: '127.0.0.1',
    vnc_port: 5900
}