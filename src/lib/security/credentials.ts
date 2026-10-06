import bcrypt from "bcrypt";
import { randomInt } from "crypto";

export const BCRYPT_ROUNDS = 11;

const USERNAME_PATTERN = /^[A-Za-z0-9._-]{3,32}$/;
const PASSWORD_MIN_LENGTH = 8;
// bcrypt ignores everything after 72 bytes
const PASSWORD_MAX_BYTES = 72;

export function validateUsername(username: unknown): string | null {
    if (typeof username !== "string" || !USERNAME_PATTERN.test(username)) {
        return "Username must be 3-32 characters: letters, numbers, dot, dash or underscore";
    }
    return null;
}

export function validatePassword(password: unknown): string | null {
    if (typeof password !== "string" || password.length < PASSWORD_MIN_LENGTH) {
        return `Password must be at least ${PASSWORD_MIN_LENGTH} characters long`;
    }
    if (Buffer.byteLength(password, "utf8") > PASSWORD_MAX_BYTES) {
        return `Password must be at most ${PASSWORD_MAX_BYTES} bytes long`;
    }
    return null;
}

export function hashPassword(password: string): Promise<string> {
    return bcrypt.hash(password, BCRYPT_ROUNDS);
}

// Hash of a random string, compared against when the username does not exist so a
// failed login takes the same time either way (no username probing by timing)
const DUMMY_HASH = bcrypt.hashSync(randomInt(0, 2 ** 31).toString(36), BCRYPT_ROUNDS);

export async function verifyPassword(password: string, hash: string | null | undefined): Promise<boolean> {
    const ok = await bcrypt.compare(password, hash ?? DUMMY_HASH);
    return ok && !!hash;
}

const TEMP_PASSWORD_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";

// Readable (no 0/O/1/l/I) cryptographically random password for admin-created accounts
export function generateTempPassword(length = 16): string {
    let password = "";
    for (let i = 0; i < length; i++) {
        password += TEMP_PASSWORD_ALPHABET[randomInt(TEMP_PASSWORD_ALPHABET.length)];
    }
    return password;
}
