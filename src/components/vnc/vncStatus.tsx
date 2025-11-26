'use client';

import { Badge } from '@/components/ui/badge';
import { Loader2, Wifi, WifiOff, AlertCircle } from 'lucide-react';

type VncStatusType = 'connecting' | 'connected' | 'disconnected' | 'error';

interface VncStatusProps {
    status: VncStatusType;
}

export default function VncStatus({ status }: VncStatusProps) {
    const getStatusConfig = () => {
        switch (status) {
            case 'connected':
                return {
                    color: 'bg-green-500 hover:bg-green-600',
                    icon: <Wifi className="w-3 h-3 mr-1" />,
                    text: 'Connected',
                };
            case 'connecting':
                return {
                    color: 'bg-yellow-500 hover:bg-yellow-600',
                    icon: <Loader2 className="w-3 h-3 mr-1 animate-spin" />,
                    text: 'Connecting...',
                };
            case 'error':
                return {
                    color: 'bg-red-500 hover:bg-red-600',
                    icon: <AlertCircle className="w-3 h-3 mr-1" />,
                    text: 'Error',
                };
            case 'disconnected':
            default:
                return {
                    color: 'bg-slate-500 hover:bg-slate-600',
                    icon: <WifiOff className="w-3 h-3 mr-1" />,
                    text: 'Disconnected',
                };
        }
    };

    const config = getStatusConfig();

    return (
        <Badge className={`${config.color} text-white transition-colors`}>
            {config.icon}
            {config.text}
        </Badge>
    );
}