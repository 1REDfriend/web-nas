-- CreateTable
CREATE TABLE "path_rules" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "path" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "actions" TEXT NOT NULL,
    "recursive" BOOLEAN NOT NULL DEFAULT true,
    "note" TEXT,
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "app_settings" (
    "key" TEXT NOT NULL PRIMARY KEY,
    "value" TEXT NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "path_rules_path_role_key" ON "path_rules"("path", "role");

