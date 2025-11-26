export interface RFBConnection {
    disconnect: () => void;
    addEventListener: (event: string, handler: () => void) => void;
    scaleViewport: boolean;
    resizeSession: boolean;
    sendCtrlAltDel: () => void;
}