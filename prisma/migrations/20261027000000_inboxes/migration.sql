-- CreateTable
CREATE TABLE "inboxes" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "slug" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "target_path" TEXT NOT NULL,
    "split_by_sender" BOOLEAN NOT NULL DEFAULT false,
    "require_name" BOOLEAN NOT NULL DEFAULT false,
    "show_received" BOOLEAN NOT NULL DEFAULT false,
    "allowed_ext" TEXT,
    "max_file_bytes" BIGINT,
    "max_total_bytes" BIGINT,
    "max_files" INTEGER,
    "password_hash" TEXT,
    "used_bytes" BIGINT NOT NULL DEFAULT 0,
    "file_count" INTEGER NOT NULL DEFAULT 0,
    "expires_at" DATETIME,
    "closed_at" DATETIME,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "user_id" TEXT NOT NULL,
    CONSTRAINT "inboxes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "inbox_uploads" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "file_name" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "size" BIGINT NOT NULL,
    "sender_name" TEXT,
    "sender_ip" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "inbox_id" TEXT NOT NULL,
    CONSTRAINT "inbox_uploads_inbox_id_fkey" FOREIGN KEY ("inbox_id") REFERENCES "inboxes" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "inboxes_slug_key" ON "inboxes"("slug");

-- CreateIndex
CREATE INDEX "idx_inbox_user_id" ON "inboxes"("user_id");

-- CreateIndex
CREATE INDEX "idx_inbox_upload_inbox_id" ON "inbox_uploads"("inbox_id");

