-- CreateTable
CREATE TABLE "upload_sessions" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "kind" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "size" BIGINT NOT NULL,
    "received" BIGINT NOT NULL DEFAULT 0,
    "temp_path" TEXT NOT NULL,
    "meta" TEXT NOT NULL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL
);

-- CreateIndex
CREATE INDEX "idx_upload_session_user_id" ON "upload_sessions"("user_id");

-- CreateIndex
CREATE INDEX "idx_upload_session_updated_at" ON "upload_sessions"("updated_at");

