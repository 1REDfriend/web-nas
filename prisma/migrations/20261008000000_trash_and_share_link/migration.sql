-- The init migration never created trash_schedule or share_link (installs made
-- with `prisma db push` got them from the schema), so a fresh `migrate deploy`
-- failed at 20261009000000_trash_original_path. Every statement is guarded with
-- IF [NOT] EXISTS so this is a no-op on databases that already have these tables.

-- CreateTable
CREATE TABLE IF NOT EXISTS "trash_schedule" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "item" TEXT NOT NULL,
    "return_path" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "addDate" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expireDate" DATETIME NOT NULL,
    CONSTRAINT "trash_schedule_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "share_link" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "root_path" TEXT NOT NULL,
    "view" INTEGER NOT NULL DEFAULT 0,
    "recursive" BOOLEAN NOT NULL DEFAULT false,
    "user_id" TEXT NOT NULL,
    "createAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expireAt" DATETIME,
    CONSTRAINT "share_link_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "idx_trash_schedule_user_id" ON "trash_schedule"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "trash_schedule_user_id_item_key" ON "trash_schedule"("user_id", "item");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "idx_share_link_user_id" ON "share_link"("user_id");

-- DropTable
-- Left over from the init migration; no model or code uses them.
DROP TABLE IF EXISTS "path_maps_cetagory";

-- DropTable
DROP TABLE IF EXISTS "CategoryPath";
