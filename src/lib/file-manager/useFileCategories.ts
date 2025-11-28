"use client";

import { useEffect, useState } from "react";
import * as fileService from "@/lib/api/file.service";
import { categoryPath as CategoryPath } from "@/interfaces/path";
import { logerror } from "@/lib/logger";

export function useFileCategories() {
    const [categoryPaths, setCategoryPaths] = useState<CategoryPath[]>([]);

    useEffect(() => {
        const fetchCategoryPaths = async () => {
            try {
                const result = await fileService.addFolderFavorite();
                let paths: CategoryPath[] = [];

                if (result && typeof result === "object" && "categoryPath" in result) {
                    const cp = (result as { categoryPath: unknown }).categoryPath;
                    if (Array.isArray(cp)) {
                        paths = cp as CategoryPath[];
                    }
                }

                setCategoryPaths(paths);
            } catch (err: unknown) {
                logerror(
                    err instanceof Error
                        ? `Error fetching categoryPath: ${err.message}`
                        : "Error fetching categoryPath"
                );
                setCategoryPaths([]);
            }
        };

        fetchCategoryPaths();
    }, []);

    return { categoryPaths };
}
