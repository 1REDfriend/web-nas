-- CreateTable
CREATE TABLE "recent_items" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "path" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "used_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "user_id" TEXT NOT NULL,
    CONSTRAINT "recent_items_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "idx_recent_user_used_at" ON "recent_items"("user_id", "used_at");

-- CreateIndex
CREATE UNIQUE INDEX "recent_items_user_id_path_key" ON "recent_items"("user_id", "path");

