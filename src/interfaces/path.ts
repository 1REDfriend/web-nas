export interface PathMapCategory {
    id: string,
    rootPath: string
}

export interface categoryPath {
    id: string,
    rootPath: string,
    pathMapCategory: PathMapCategory[]
}