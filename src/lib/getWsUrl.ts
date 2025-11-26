export const getWsUrl = () => {
    if (typeof window === 'undefined') return '';
    const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
    const hostname = window.location.hostname;
    return `${protocol}://${hostname}:3001/vnc`;
};