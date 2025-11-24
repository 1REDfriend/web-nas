-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "username" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "gmail" TEXT,
    "role" TEXT NOT NULL DEFAULT 'GUEST',
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "active_session" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "token" TEXT NOT NULL,
    "userAgent" TEXT NOT NULL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "user_id" TEXT NOT NULL,
    CONSTRAINT "active_session_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "path_maps" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "root_path" TEXT NOT NULL,
    "description" TEXT,
    "user_id" TEXT NOT NULL,
    CONSTRAINT "path_maps_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "path_maps_cetagory" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "root_path" TEXT NOT NULL,
    "path_map_id" TEXT NOT NULL,
    CONSTRAINT "path_maps_cetagory_path_map_id_fkey" FOREIGN KEY ("path_map_id") REFERENCES "CategoryPath" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CategoryPath" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "root_path" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    CONSTRAINT "CategoryPath_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "star_paths" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "root_path" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    CONSTRAINT "star_paths_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "users_username_key" ON "users"("username");

-- CreateIndex
CREATE INDEX "dix_active_session_user_id" ON "active_session"("user_id");

-- CreateIndex
CREATE INDEX "idx_path_maps_user_id" ON "path_maps"("user_id");

-- CreateIndex
CREATE INDEX "idx_path_maps_category_category_path" ON "path_maps_cetagory"("path_map_id");

-- CreateIndex
CREATE INDEX "idx_star_path_user_id" ON "star_paths"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "star_paths_user_id_root_path_key" ON "star_paths"("user_id", "root_path");
