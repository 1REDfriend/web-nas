'use client'
import LoginCheck from "@/components/auth/loginCheck"
import { FileItem } from "@/components/file-manager/config"
import { FileManagerPreviewPanel } from "@/components/file-manager/FileManagerPreviewPanel"
import { FileManagerSidebarNav } from "@/components/file-manager/FileManagerSidebarNav"
import { FileManagerTopBar } from "@/components/file-manager/FileManagerTopBar"
import { FileShareGrid } from "@/components/file-manager/FileShareGrid"
import { fetchShareLinkId } from "@/lib/api/user/share"
import { useParams } from "next/navigation"
import { useEffect, useState } from "react"

export default function ShareFilePage() {
    const params = useParams<{ id: string }>()

    const [fileData, setFileData] = useState<FileItem[]>([]);
    const [isLoading, setIsloading] = useState(true);
    const [selectFolderBar, setSelectFolderBar] = useState<string>('');

    const [selectFile, setSelectFile] = useState('')

    const [shareLinkID, setShareLinkID] = useState('')

    useEffect(() => {
        async function fetch() {
            if (params?.id) {
                const data = await fetchShareLinkId(params.id)
                setFileData(data.data)
                setIsloading(false)
                setShareLinkID(params.id)
            }
        }

        fetch()
    }, [params?.id])

    return (
        <div>
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

                    <FileManagerTopBar />

                    <div className="flex flex-1 overflow-hidden">
                        <FileManagerSidebarNav
                            selectedFolder={selectFolderBar}
                            onSelectFolder={(folderId) => {
                                setSelectFolderBar(folderId);
                            }} />

                        <FileShareGrid
                            files={fileData}
                            activeFilePath={null}
                            ShareLinkID={shareLinkID}
                            listLoading={isLoading}
                            onSelectFile={(path: string) => {
                                setSelectFile(path)
                            }} 
                            onOpenDirectory={function (path: string): void {
                                throw new Error("Function not implemented.")
                            }}
                        />

                        {/* <FileManagerPreviewPanel
                            activeFile={null}
                            previewContent={selectFile}
                            previewSize={null}
                            previewLoading={false}
                            previewError={null}
                            onDownload={function (file: FileItem): void {
                                throw new Error("Function not implemented.")
                            }} onToggleStar={function (file: FileItem): void {
                                throw new Error("Function not implemented.")
                            }} onDelete={function (file: FileItem): void {
                                throw new Error("Function not implemented.")
                            }} /> */}
                    </div>
                </section>
            </div>
        </div >
    )
}