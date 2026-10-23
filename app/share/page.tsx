"use client"

import { useEffect, useState } from "react"
import {
    MoreHorizontal,
    Copy,
    Trash2,
    ExternalLink,
    FileText,
    Folder,
    Clock,
    Eye
} from "lucide-react"

import { Button } from "@/components/ui/button"
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { toast } from "sonner"
import LoginCheck from "@/components/auth/loginCheck"
import { FileManagerTopBar } from "@/components/file-manager/FileManagerTopBar"
import { deleteShareLink, getShareLink } from "@/lib/api/user/share"
import { FileManagerSidebarNav } from "@/components/file-manager/FileManagerSidebarNav"
import { useRouter } from "next/navigation"
import { formatDate } from "@/lib/file-manager/format"

type ShareItem = {
    id: string
    name: string
    type: "file" | "folder" | null
    url: string
    view: number
    expiresAt: string | null
    status: "Active" | "Expired" | "Unavailable"
    createAt: string
}

export default function ShareManagementPage() {
    const [shares, setShares] = useState<ShareItem[]>([])

    const router = useRouter()

    const copyToClipboard = (url: string) => {
        navigator.clipboard.writeText(url)
        toast.success("Copied to clipboard", {
            description: "Link has been copied successfully.",
            duration: 3000,
        })
    }

    const revokeLink = async (id: string) => {
        const itemToDelete = shares.find(s => s.id === id)
        setShares(shares.filter((item) => item.id !== id))

        const data = await deleteShareLink(id);
        if (!data || data.error) {
            toast.error('Link Revoked', {
                description: `Error to remove ${itemToDelete?.name}.`
            })

            if (itemToDelete) setShares(prev => [...prev, itemToDelete]);
            return
        }

        toast("Link Revoked", {
            description: `${itemToDelete?.name} is no longer accessible.`,
            duration: 3000
        })
    }

    // Same menu for the desktop table and the phone cards
    const actionsMenu = (item: ShareItem) => (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="h-11 w-11 p-0 md:h-8 md:w-8">
                    <span className="sr-only">Open menu</span>
                    <MoreHorizontal className="h-4 w-4" />
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
                <DropdownMenuLabel>Actions</DropdownMenuLabel>

                <DropdownMenuItem onClick={() => copyToClipboard(window.location.origin + item.url)}>
                    <Copy className="mr-2 h-4 w-4" />
                    Copy Link
                </DropdownMenuItem>

                <DropdownMenuItem onClick={() => window.open(item.url, '_self')}>
                    <ExternalLink className="mr-2 h-4 w-4" />
                    View Page
                </DropdownMenuItem>

                <DropdownMenuSeparator />

                <DropdownMenuItem
                    className="text-red-600 focus:text-red-600"
                    onClick={() => revokeLink(item.id)}
                >
                    <Trash2 className="mr-2 h-4 w-4" />
                    Revoke Access
                </DropdownMenuItem>
            </DropdownMenuContent>
        </DropdownMenu>
    )

    const statusBadge = (item: ShareItem) =>
        item.status === "Active" ? (
            <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
                Active
            </Badge>
        ) : (
            <Badge variant="secondary">{item.status}</Badge>
        )

    useEffect(() => {
        const fetchData = async () => {
            const data = await getShareLink();

            if (data.error) {
                toast.error(data.error)
                return
            }

            setShares(data.share)
        }

        fetchData()
    }, [])

    return (
        <div className="relative space-y-8 bg-linear-to-br from-slate-950 via-slate-900 to-slate-950 h-screen">
            {/* <div className="fixed inset-0 z-0 opacity-10 pointer-events-none">
                <Image
                    src="/texture1.jpg"
                    alt="background texture"
                    fill
                    className="object-cover"
                    priority
                />
            </div> */}
            <LoginCheck />

            <section className="min-h-screen flex flex-col">

                <FileManagerTopBar nav={{ selectedFolder: "", onSelectFolder: () => router.push('/') }} />

                <div className="flex flex-1 overflow-hidden">
                    <FileManagerSidebarNav
                        selectedFolder={""}
                        onSelectFolder={() => {
                            router.push('/')
                        }}
                    />
                    <section className="relative z-10 w-full overflow-y-auto px-3 py-4 sm:p-10 lg:px-40">
                        <div className="flex justify-between items-center py-2 sm:py-5">
                            <div>
                                <h2 className="text-2xl sm:text-3xl font-bold tracking-tight">Shared Links</h2>
                                <p className="text-muted-foreground">
                                    Manage the links you share, check views, or unshare.
                                </p>
                            </div>
                        </div>

                        {/* Main Table Card */}
                        <Card className="bg-card/10 bg-linear-to-tl from-slate-50/5 to-rose-700/5 backdrop-blur-xs">
                            <CardHeader>
                                <CardTitle>Active Shares</CardTitle>
                                <CardDescription>
                                    List of files and folders currently being shared
                                </CardDescription>
                            </CardHeader>
                            <CardContent className="px-3 sm:px-6">
                                {/* Phones: one card per link instead of a table that scrolls sideways */}
                                <ul className="space-y-2 md:hidden">
                                    {shares.map((item) => (
                                        <li key={item.id} className="rounded-xl border border-white/10 bg-slate-900/60 p-3">
                                            <div className="flex items-start gap-3">
                                                {item.type === "folder" ? (
                                                    <Folder className="mt-0.5 h-5 w-5 shrink-0 text-blue-500" />
                                                ) : (
                                                    <FileText className="mt-0.5 h-5 w-5 shrink-0 text-gray-500" />
                                                )}
                                                <div className="min-w-0 flex-1">
                                                    <p className="break-all text-sm font-medium">{item.name}</p>
                                                    <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                                                        {statusBadge(item)}
                                                        <span className="flex items-center gap-1">
                                                            <Eye className="h-3 w-3" />
                                                            {item.view}
                                                        </span>
                                                        <span className="flex items-center gap-1">
                                                            <Clock className="h-3 w-3" />
                                                            {item.expiresAt ? formatDate(item.expiresAt) : "Never"}
                                                        </span>
                                                    </div>
                                                </div>
                                                <div className="-mr-2 -mt-2 flex shrink-0 items-center">
                                                    <Button
                                                        variant="ghost"
                                                        className="h-11 w-11 p-0"
                                                        aria-label="Copy link"
                                                        onClick={() => copyToClipboard(window.location.origin + item.url)}
                                                    >
                                                        <Copy className="h-4 w-4" />
                                                    </Button>
                                                    {actionsMenu(item)}
                                                </div>
                                            </div>
                                        </li>
                                    ))}
                                </ul>

                                <Table className="hidden md:table">
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead className="w-[300px]">Name</TableHead>
                                            <TableHead>Status</TableHead>
                                            <TableHead>Views</TableHead>
                                            <TableHead>Expires</TableHead>
                                            <TableHead className="text-right">Actions</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {shares.map((item) => (
                                            <TableRow key={item.id}>

                                                {/* Column: Name & Icon */}
                                                <TableCell className="font-medium">
                                                    <div className="flex items-center gap-2">
                                                        {item.type === "folder" ? (
                                                            <Folder className="h-4 w-4 text-blue-500" />
                                                        ) : (
                                                            <FileText className="h-4 w-4 text-gray-500" />
                                                        )}
                                                        <span className="truncate max-w-[200px]">{item.name}</span>
                                                    </div>
                                                    <div className="text-xs text-muted-foreground ml-6 mt-1">
                                                        Created: {new Date(item.createAt).toLocaleString()}
                                                    </div>
                                                </TableCell>

                                                {/* Column: Status */}
                                                <TableCell>
                                                    {statusBadge(item)}
                                                </TableCell>

                                                {/* Column: Views */}
                                                <TableCell>
                                                    <div className="flex items-center gap-1 text-muted-foreground">
                                                        <Eye className="h-3 w-3" />
                                                        <span>{item.view}</span>
                                                    </div>
                                                </TableCell>

                                                {/* Column: Expiration */}
                                                <TableCell>
                                                    <div className="flex items-center gap-1">
                                                        <Clock className="h-3 w-3 text-muted-foreground" />
                                                        <span className="text-sm">
                                                            {item.expiresAt ? new Date(item.expiresAt).toLocaleString() : "Never"}
                                                        </span>
                                                    </div>
                                                </TableCell>

                                                {/* Column: Actions */}
                                                <TableCell className="text-right">
                                                    {actionsMenu(item)}
                                                </TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>

                                {/* Empty State Handle */}
                                {shares.length === 0 && (
                                    <div className="text-center py-10 text-muted-foreground">
                                        No shared links found.
                                    </div>
                                )}
                            </CardContent>
                        </Card>
                    </section>
                </div>

            </section>

        </div>
    )
}