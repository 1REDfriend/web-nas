-- CreateTable
CREATE TABLE "pin_rooms" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "pin" TEXT NOT NULL,
    "base_dir" TEXT NOT NULL,
    "creator_key_hash" TEXT NOT NULL,
    "creator_ip" TEXT NOT NULL,
    "locked" BOOLEAN NOT NULL DEFAULT false,
    "total_bytes" BIGINT NOT NULL DEFAULT 0,
    "item_count" INTEGER NOT NULL DEFAULT 0,
    "version" INTEGER NOT NULL DEFAULT 0,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "pin_items" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "room_id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "name" TEXT,
    "size" BIGINT NOT NULL DEFAULT 0,
    "text" TEXT,
    "sender_key_hash" TEXT NOT NULL,
    "completed_at" DATETIME,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "pin_items_room_id_fkey" FOREIGN KEY ("room_id") REFERENCES "pin_rooms" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "pin_rooms_pin_key" ON "pin_rooms"("pin");

-- CreateIndex
CREATE INDEX "idx_pin_room_expires_at" ON "pin_rooms"("expires_at");

-- CreateIndex
CREATE INDEX "idx_pin_room_creator_ip" ON "pin_rooms"("creator_ip");

-- CreateIndex
CREATE INDEX "idx_pin_item_room_id" ON "pin_items"("room_id");

