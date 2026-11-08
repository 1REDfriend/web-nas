-- AlterTable
ALTER TABLE "drops" ADD COLUMN "sender_key_hash" TEXT;
ALTER TABLE "drops" ADD COLUMN "share_id" TEXT;

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_drop_requests" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "slug" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "require_name" BOOLEAN NOT NULL DEFAULT false,
    "show_received" BOOLEAN NOT NULL DEFAULT false,
    "share_mode" TEXT,
    "show_senders" BOOLEAN NOT NULL DEFAULT false,
    "download_day" TEXT,
    "download_count" INTEGER NOT NULL DEFAULT 0,
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
INSERT INTO "new_drop_requests" ("allowed_ext", "closed_at", "created_at", "description", "expires_at", "file_count", "id", "keep_hours", "max_file_bytes", "max_files", "max_total_bytes", "password_hash", "require_name", "show_received", "slug", "title", "used_bytes", "user_id") SELECT "allowed_ext", "closed_at", "created_at", "description", "expires_at", "file_count", "id", "keep_hours", "max_file_bytes", "max_files", "max_total_bytes", "password_hash", "require_name", "show_received", "slug", "title", "used_bytes", "user_id" FROM "drop_requests";
DROP TABLE "drop_requests";
ALTER TABLE "new_drop_requests" RENAME TO "drop_requests";
CREATE UNIQUE INDEX "drop_requests_slug_key" ON "drop_requests"("slug");
CREATE INDEX "idx_drop_request_user_id" ON "drop_requests"("user_id");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "drops_share_id_key" ON "drops"("share_id");

