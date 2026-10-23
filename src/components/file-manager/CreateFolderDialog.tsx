"use client"

import { Suspense, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { FolderPlus } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { createFolderApi } from "@/lib/api/folder/create.service"
import { cn } from "@/lib/utils"

interface CreateFolderDialogProps {
    currentPath: string;
    onSuccess?: () => void;
    // Optional outside control, e.g. the mobile "+" button; uncontrolled when omitted
    open?: boolean;
    onOpenChange?: (open: boolean) => void;
    triggerClassName?: string;
}

export function CreateFolderDialog({ onSuccess, open: openProp, onOpenChange, triggerClassName }: CreateFolderDialogProps) {
    const [openState, setOpenState] = useState(false)
    const open = openProp ?? openState
    const setOpen = (value: boolean) => {
        setOpenState(value)
        onOpenChange?.(value)
    }
    const [folderName, setFolderName] = useState("")
    const [isLoading, setIsLoading] = useState(false)
    const router = useRouter()
    const params = useSearchParams()

    const currentPath = params?.get("path") || ""

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()

        if (!folderName.trim()) return

        setIsLoading(true)

        try {
            const data = await createFolderApi(currentPath, folderName)

            if (data.success) {
                toast.success("Folder created successfully", {
                    description: `Folder "${folderName}" Already built`,
                })
            } else {
                toast.error("Folder created Failed", {
                    description: data.error || `Folder "${folderName}"`,
                })
            }


            setFolderName("")
            setOpen(false)

            if (onSuccess) {
                onSuccess()
            } else {
                router.refresh()
            }

        } catch (error) {
            toast.error("An error occurred.", {
                description: error instanceof Error ? error.message : "Unable to create folder",
            })
        } finally {
            setIsLoading(false)
        }
    }

    return (
        <Suspense>
            <Dialog open={open} onOpenChange={setOpen}>
                <DialogTrigger asChild>
                    <Button variant="outline" className={cn("gap-2", triggerClassName)}>
                        <FolderPlus size={16} />
                        New Folder
                    </Button>
                </DialogTrigger>
                <DialogContent className="sm:max-w-[425px]">
                    <form onSubmit={handleSubmit}>
                        <DialogHeader>
                            <DialogTitle>Create New Folder</DialogTitle>
                            <DialogDescription>
                                Create a new folder in the location: <code className="bg-muted px-1 rounded">{currentPath || "/"}</code>
                            </DialogDescription>
                        </DialogHeader>

                        <div className="grid gap-4 py-4">
                            <div className="grid grid-cols-4 items-center gap-4">
                                <Label htmlFor="name" className="text-right">
                                    Name
                                </Label>
                                <Input
                                    id="name"
                                    value={folderName}
                                    onChange={(e) => setFolderName(e.target.value)}
                                    placeholder="New Folder Name"
                                    className="col-span-3"
                                    autoFocus
                                    disabled={isLoading}
                                />
                            </div>
                        </div>

                        <DialogFooter>
                            <Button type="button" variant="secondary" onClick={() => setOpen(false)} disabled={isLoading}>
                                Cancel
                            </Button>
                            <Button type="submit" disabled={isLoading}>
                                {isLoading ? "Creating..." : "Create"}
                            </Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>
        </Suspense>
    )
}