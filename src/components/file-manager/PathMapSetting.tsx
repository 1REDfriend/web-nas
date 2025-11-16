import { useCallback, useEffect, useState } from "react";
import { Trash2 } from "lucide-react";

import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "../ui/table";
import { Button } from "../ui/button";
import { getImport } from "@/lib/api/admin/file.service";

type PathItem = {
    id: string;
    rootPath: string;
    userId: string;
};

type GroupedData = Record<string, { id: string; rootPath: string }[]>;

type GetImportResponse = {
    success: boolean;
    pathMap: PathItem[];
    error?: string;
    message?: string;
};

type DeleteResponse = {
    success?: boolean;
    error?: string;
    message?: string;
};

function groupByUserId(items: PathItem[]): GroupedData {
    if (!Array.isArray(items) || items.length === 0) {
        return {};
    }

    return items.reduce<GroupedData>((acc, item) => {
        if (!acc[item.userId]) {
            acc[item.userId] = [];
        }

        acc[item.userId].push({
            id: item.id,
            rootPath: item.rootPath,
        });

        return acc;
    }, {});
}

export function PathMapSetting() {
    const [importData, setImportData] = useState<GroupedData>({});
    const [message, setMessage] = useState<string | null>(null);
    const [loading, setLoading] = useState<boolean>(false);

    const fetchData = useCallback(async () => {
        try {
            setLoading(true);

            const res = (await getImport()) as GetImportResponse;

            const items = Array.isArray(res.pathMap) ? res.pathMap : [];
            const grouped = groupByUserId(items);

            setImportData(grouped);
            setMessage(res.message ?? null);
        } catch {
            setMessage("Failed to load path map data");
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        void fetchData();
    }, []);

    const handleEdit = (userId: string, path: string) => {
        // TODO: open edit dialog or form
    };

    const handleDelete = useCallback(
        async (userId: string, reqPath: string) => {
            try {
                const res = (await getImport(
                    userId,
                    reqPath,
                )) as DeleteResponse | undefined;

                const text = res?.error ?? res?.message ?? "";
                if (text) {
                    setMessage(text);
                }

                await fetchData();
            } catch {
                setMessage("Failed to delete path");
            }
        },
        [fetchData],
    );

    const hasData = Object.keys(importData).length > 0;

    return (
        <div className="space-y-4">
            {message && (
                <p className="text-sm text-muted-foreground">{message}</p>
            )}

            {loading && (
                <p className="text-sm text-muted-foreground">Loading...</p>
            )}

            {!loading && !hasData && (
                <p className="text-sm text-muted-foreground">
                    No paths to display.
                </p>
            )}

            {!loading &&
                Object.entries(importData).map(([userId, paths]) => (
                    <div key={userId} className="space-y-2">
                        <h2 className="text-sm font-semibold text-muted-foreground">
                            {userId}
                        </h2>

                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead className="w-full">Path</TableHead>
                                    <TableHead className="w-[120px] text-right">
                                        Actions
                                    </TableHead>
                                </TableRow>
                            </TableHeader>

                            <TableBody>
                                {paths.map((item) => (
                                    <TableRow key={item.id}>
                                        <TableCell className="font-mono text-xs">
                                            {item.rootPath}
                                        </TableCell>
                                        <TableCell>
                                            <div className="flex justify-end gap-2">
                                                <Button
                                                    size="icon"
                                                    variant="ghost"
                                                    onClick={() =>
                                                        handleDelete(
                                                            userId,
                                                            item.rootPath,
                                                        )
                                                    }
                                                >
                                                    <Trash2 className="h-4 w-4" />
                                                </Button>
                                            </div>
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </div>
                ))}
        </div>
    );
}
