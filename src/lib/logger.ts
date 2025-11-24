
export function log(...args: unknown[]) {
    if (typeof window === 'undefined') {
        console.log(...args);
    }
}

export function logwarn(...args: unknown[]) {
    if (typeof window === 'undefined') {
        console.warn(...args);
    }
}

export function logerror(...args: unknown[]) {
    if (typeof window === 'undefined') {
        console.error(...args);
    }
}