-- DropIndex
DROP INDEX "inboxes_slug_key";

-- DropIndex
DROP INDEX "idx_inbox_user_id";

-- DropIndex
DROP INDEX "idx_inbox_upload_inbox_id";

-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "inboxes";
PRAGMA foreign_keys=on;

-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "inbox_uploads";
PRAGMA foreign_keys=on;

-- CreateTable
CREATE TABLE "drop_requests" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "slug" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "require_name" BOOLEAN NOT NULL DEFAULT false,
    "show_received" BOOLEAN NOT NULL DEFAULT false,
    "allowed_ext" TEXT,
    "max_file_bytes" BIGINT,
    "max_total_bytes" BIGINT,
    "max_files" INTEGER,
    "keep_hours" INTEGER NOT NULL,
    "password_hash" TEXT,
    "used_bytes" BIGINT NOT NULL DEFAULT 0,
    "file_count" INTEGER NOT NULL DEFAULT 0,
    "expires_at" DATETIME,
    "closed_at" DATETIME,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "user_id" TEXT NOT NULL,
    CONSTRAINT "drop_requests_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_drops" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "file_name" TEXT NOT NULL,
    "size" BIGINT NOT NULL DEFAULT 0,
    "mime_type" TEXT,
    "base_dir" TEXT NOT NULL,
    "expires_at" DATETIME NOT NULL,
    "max_downloads" INTEGER,
    "downloads" INTEGER NOT NULL DEFAULT 0,
    "completed_at" DATETIME,
    "deleted_at" DATETIME,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "user_id" TEXT NOT NULL,
    "key_id" TEXT,
    "request_id" TEXT,
    "sender_name" TEXT,
    "sender_ip" TEXT,
    CONSTRAINT "drops_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "drops_request_id_fkey" FOREIGN KEY ("request_id") REFERENCES "drop_requests" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_drops" ("base_dir", "completed_at", "created_at", "deleted_at", "downloads", "expires_at", "file_name", "id", "key_id", "max_downloads", "mime_type", "size", "user_id") SELECT "base_dir", "completed_at", "created_at", "deleted_at", "downloads", "expires_at", "file_name", "id", "key_id", "max_downloads", "mime_type", "size", "user_id" FROM "drops";
DROP TABLE "drops";
ALTER TABLE "new_drops" RENAME TO "drops";
CREATE INDEX "idx_drop_user_id" ON "drops"("user_id");
CREATE INDEX "idx_drop_request_id" ON "drops"("request_id");
CREATE INDEX "idx_drop_expires_at" ON "drops"("expires_at");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "drop_requests_slug_key" ON "drop_requests"("slug");

-- CreateIndex
CREATE INDEX "idx_drop_request_user_id" ON "drop_requests"("user_id");

