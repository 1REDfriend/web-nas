-- CreateTable
CREATE TABLE "drops" (
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
    CONSTRAINT "drops_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "idx_drop_user_id" ON "drops"("user_id");

-- CreateIndex
CREATE INDEX "idx_drop_expires_at" ON "drops"("expires_at");
