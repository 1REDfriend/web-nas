
export function log(msg : string) {
    if (typeof window === 'undefined') {
        console.log(msg);
    }
}

export function logwarn(msg : string) {
    if (typeof window === 'undefined') {
        console.warn(msg);
    }
}

export function logerror(msg : string) {
    if (typeof window === 'undefined') {
        console.error(msg);
    }
}