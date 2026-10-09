// Shape of the x-user-payload header set by proxy.ts for a valid session
export interface UserJwtPayload {
    sub: string;
    sid: string;
    username: string;
    role: "ADMIN" | "USER" | "GUEST";
}
