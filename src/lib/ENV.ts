export const ENV = ({
    DATABASE_URL: process.env.DATABASE_URL || "",
    JWT_SECRET: process.env.JWT_SECRET || "",
    TOKEN_COOKIE: process.env.TOKEN_COOKIE || "",
    STORAGE_ROOT: process.env.STORAGE_ROOT || "",
})

// default setting
export const setting = {
    expireTrash: 30, // day only
    expireShareLink: 3 //day only
}