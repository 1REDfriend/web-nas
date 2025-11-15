-- CreateTable
CREATE TABLE "star_paths" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "root_path" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    CONSTRAINT "star_paths_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_users" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "username" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "gmail" TEXT,
    "role" TEXT NOT NULL DEFAULT 'GUEST',
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO "new_users" ("created_at", "id", "password_hash", "username") SELECT "created_at", "id", "password_hash", "username" FROM "users";
DROP TABLE "users";
ALTER TABLE "new_users" RENAME TO "users";
CREATE UNIQUE INDEX "users_username_key" ON "users"("username");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "idx_star_path_user_id" ON "star_paths"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "star_paths_user_id_root_path_key" ON "star_paths"("user_id", "root_path");
