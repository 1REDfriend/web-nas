
export interface FileSystemEntry {
    isFile: boolean;
    isDirectory: boolean;
    name: string;
}

export interface FileSystemFileEntry extends FileSystemEntry {
    file: (
        successCallback: (file: File) => void,
        errorCallback?: (error: Error) => void
    ) => void;
}

export interface FileSystemDirectoryReader {
    readEntries: (
        successCallback: (entries: FileSystemEntry[]) => void,
        errorCallback?: (error: Error) => void
    ) => void;
}

export interface FileSystemDirectoryEntry extends FileSystemEntry {
    createReader: () => FileSystemDirectoryReader;
}