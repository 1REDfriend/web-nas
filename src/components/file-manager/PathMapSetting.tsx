import { Pencil, Trash2 } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../ui/table";
import { Button } from "../ui/button";

type PathMapData = Record<string, string[]>;

export function PathMapSetting() {
    const importData: PathMapData = {
        userA: [
            "/path1",
            "/path2",
        ],
        userB: [
            "/another/path",
            "/more/path",
        ],
    };

    const handleEdit = (userId: string, path: string) => {
        console.log("[edit]", { userId, path });
    };

    const handleDelete = (userId: string, path: string) => {
        console.log("[delete]", { userId, path });
    };

    return (
        <div className="space-y-6">
            {Object.entries(importData).map(([userId, paths]) => (
                <div key={userId} className="space-y-2">
                    {/* header per user */}
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
                            {paths.map((path) => (
                                <TableRow key={path}>
                                    <TableCell className="font-mono text-xs">
                                        {path}
                                    </TableCell>
                                    <TableCell>
                                        <div className="flex justify-end gap-2">
                                            <Button
                                                size="icon"
                                                variant="ghost"
                                                onClick={() => handleEdit(userId, path)}
                                            >
                                                <Pencil className="h-4 w-4" />
                                            </Button>
                                            <Button
                                                size="icon"
                                                variant="ghost"
                                                onClick={() => handleDelete(userId, path)}
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
    )
}