"use client";

import { useEffect, useState } from "react";
import * as fileService from "@/lib/api/file.service";
import { logerror } from "@/lib/logger";
import { FileItem } from "@/components/file-manager/config";
import { mediaTypeOf } from "./media";

type UseFilePreviewParams = {
    activeFile: FileItem | null;
};

type UseFilePreviewResult = {
    previewContent: string | null;
    previewSize: number | null;
    previewLoading: boolean;
    previewError: string | null;
};

export function useFilePreview({
    activeFile,
}: UseFilePreviewParams): UseFilePreviewResult {
    const [previewContent, setPreviewContent] = useState<string | null>(null);
    const [previewSize, setPreviewSize] = useState<number | null>(null);
    const [previewLoading, setPreviewLoading] = useState(false);
    const [previewError, setPreviewError] = useState<string | null>(null);

    const activePath = activeFile?.path || "";
    // Folders and trash items have nothing to preview
    // Images, video and audio are shown from /api/files/raw instead of as text
    const canPreview =
        !!activePath &&
        activeFile?.type !== "directory" &&
        !activePath.startsWith("/trash") &&
        !mediaTypeOf(activePath);

    useEffect(() => {
        if (!canPreview) return;

        const controller = new AbortController();

        async function loadPreview() {
            try {
                setPreviewLoading(true);
                setPreviewError(null);

                const { content, size } = await fileService.fetchFilePreview(
                    activePath,
                    controller.signal
                );

                setPreviewContent(content);
                setPreviewSize(size);
            } catch (err: unknown) {
                if (err instanceof Error && err.name === "AbortError") {
                    return;
                }
                logerror(err instanceof Error ? err.message : String(err));
                setPreviewError(
                    err instanceof Error
                        ? err.message
                        : "An error occurred while loading the file."
                );
                setPreviewContent(null);
                setPreviewSize(null);
            } finally {
                setPreviewLoading(false);
            }
        }

        loadPreview();
        return () => controller.abort();
    }, [activePath, canPreview]);

    return {
        previewContent: canPreview ? previewContent : null,
        previewSize: canPreview ? previewSize : null,
        previewLoading: canPreview && previewLoading,
        previewError: canPreview ? previewError : null,
    };
}
