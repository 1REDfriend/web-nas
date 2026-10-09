'use client'
import { FileItem } from "@/components/file-manager/config"
import { FileManagerTopBar } from "@/components/file-manager/FileManagerTopBar"
import { FileShareGrid } from "@/components/file-manager/FileShareGrid"
import { Button } from "@/components/ui/button"
import { fetchPublicShare, publicShareDownloadUrl, PublicShareResponse } from "@/lib/api/user/share"
import { ArrowUp, DownloadCloud, Link2Off } from "lucide-react"
import { useParams } from "next/navigation"
import { useEffect, useState } from "react"

function parentOf(subPath: string) {
    const parts = subPath.split("/").filter(Boolean)
    parts.pop()
    return "/" + parts.join("/")
}

export default function ShareFilePage() {
    const params = useParams<{ id: string }>()
    const shareId = params?.id ?? ""

    const [subPath, setSubPath] = useState("/")
    const [share, setShare] = useState<PublicShareResponse["share"] | null>(null)
    const [fileData, setFileData] = useState<FileItem[]>([])
    const [isLoading, setIsloading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [selectFile, setSelectFile] = useState('')

    useEffect(() => {
        if (!shareId) return

        async function load() {
            setIsloading(true)
            const data = await fetchPublicShare(shareId, subPath)

            if ("error" in data) {
                setError(data.error)
                setFileData([])
            } else {
                setError(null)
                setShare(data.share)
                setFileData(data.data)
            }
            setIsloading(false)
        }

        load()
    }, [shareId, subPath])

    return (
        <div>
            <div className="relative space-y-8 bg-linear-to-br from-slate-950 via-slate-900 to-slate-950 h-screen">
                <section className="min-h-screen flex flex-col">

                    <FileManagerTopBar />

                    {error ? (
                        <div className="flex flex-1 flex-col items-center justify-center gap-3 text-slate-400">
                            <Link2Off className="w-10 h-10 text-slate-600" />
                            <p className="text-sm">{error}</p>
                        </div>
                    ) : (
                        <>
                            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 px-6 py-3">
                                <div className="flex items-center gap-2 min-w-0">
                                    {subPath !== "/" && (
                                        <Button size="icon" variant="ghost" onClick={() => setSubPath(parentOf(subPath))}>
                                            <ArrowUp className="w-4 h-4" />
                                        </Button>
                                    )}
                                    <p className="truncate text-sm text-slate-300">
                                        <span className="font-semibold">{share?.name}</span>
                                        <span className="text-slate-500">{subPath === "/" ? "" : subPath}</span>
                                    </p>
                                </div>
                                <div className="flex items-center gap-3">
                                    {share?.expireAt && (
                                        <span className="text-xs text-slate-500">
                                            Expires {new Date(share.expireAt).toLocaleString()}
                                        </span>
                                    )}
                                    {share?.isDirectory && (
                                        <Button asChild size="sm" variant="outline" className="gap-2">
                                            <a href={publicShareDownloadUrl(shareId, subPath)}>
                                                <DownloadCloud className="w-4 h-4" />
                                                Download all
                                            </a>
                                        </Button>
                                    )}
                                </div>
                            </div>

                            <div className="flex flex-1 overflow-hidden">
                                <FileShareGrid
                                    files={fileData}
                                    activeFilePath={selectFile}
                                    ShareLinkID={shareId}
                                    listLoading={isLoading}
                                    onSelectFile={(path) => {
                                        setSelectFile(path)
                                    }}
                                    onOpenDirectory={(path) => {
                                        setSelectFile('')
                                        setSubPath(path)
                                    }}
                                />
                            </div>
                        </>
                    )}
                </section>
            </div>
        </div >
    )
}
