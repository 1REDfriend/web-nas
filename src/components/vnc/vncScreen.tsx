export default function VncPage() {
    const params = new URLSearchParams({
        host: 'localhost',
        port: '3001',
        encrypt: '0',
        path: 'vnc',
        autoconnect: '1',
    });

    return (
        <div className="w-full h-[calc(100vh-64px)] bg-black">
            <iframe
                src={`/novnc/vnc.html?${params.toString()}`}
                className="w-full h-full border-0"
            />
        </div>
    );
}
