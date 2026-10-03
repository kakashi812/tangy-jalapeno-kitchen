-- CreateEnum
CREATE TYPE "Temperature" AS ENUM ('HOT', 'COLD');

-- CreateTable
CREATE TABLE "dishes" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "sku" TEXT NOT NULL,
    "temperature" "Temperature" NOT NULL,
    "costCents" INTEGER NOT NULL,
    "imageUrl" TEXT,
    "stationId" UUID,
    "minOrderQty" INTEGER,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "dishes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dish_allergens" (
    "dishId" UUID NOT NULL,
    "allergenId" UUID NOT NULL,

    CONSTRAINT "dish_allergens_pkey" PRIMARY KEY ("dishId","allergenId")
);

-- CreateTable
CREATE TABLE "dish_dietary_tags" (
    "dishId" UUID NOT NULL,
    "dietaryTagId" UUID NOT NULL,

    CONSTRAINT "dish_dietary_tags_pkey" PRIMARY KEY ("dishId","dietaryTagId")
);

-- CreateTable
CREATE TABLE "options" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "costCents" INTEGER NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "options_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "option_allergens" (
    "optionId" UUID NOT NULL,
    "allergenId" UUID NOT NULL,

    CONSTRAINT "option_allergens_pkey" PRIMARY KEY ("optionId","allergenId")
);

-- CreateTable
CREATE TABLE "option_dietary_tags" (
    "optionId" UUID NOT NULL,
    "dietaryTagId" UUID NOT NULL,

    CONSTRAINT "option_dietary_tags_pkey" PRIMARY KEY ("optionId","dietaryTagId")
);

-- CreateTable
CREATE TABLE "option_groups" (
    "id" UUID NOT NULL,
    "dishId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "minSelect" INTEGER NOT NULL,
    "maxSelect" INTEGER NOT NULL,
    "sortOrder" INTEGER NOT NULL,

    CONSTRAINT "option_groups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "option_group_items" (
    "groupId" UUID NOT NULL,
    "dishId" UUID NOT NULL,
    "optionId" UUID NOT NULL,
    "sortOrder" INTEGER NOT NULL,

    CONSTRAINT "option_group_items_pkey" PRIMARY KEY ("groupId","optionId")
);

-- CreateIndex
CREATE UNIQUE INDEX "dishes_sku_key" ON "dishes"("sku");

-- CreateIndex
CREATE INDEX "dishes_stationId_idx" ON "dishes"("stationId");

-- CreateIndex
CREATE INDEX "dish_allergens_allergenId_idx" ON "dish_allergens"("allergenId");

-- CreateIndex
CREATE INDEX "dish_dietary_tags_dietaryTagId_idx" ON "dish_dietary_tags"("dietaryTagId");

-- CreateIndex
CREATE UNIQUE INDEX "options_name_key" ON "options"("name");

-- CreateIndex
CREATE INDEX "option_allergens_allergenId_idx" ON "option_allergens"("allergenId");

-- CreateIndex
CREATE INDEX "option_dietary_tags_dietaryTagId_idx" ON "option_dietary_tags"("dietaryTagId");

-- CreateIndex
CREATE INDEX "option_groups_dishId_idx" ON "option_groups"("dishId");

-- CreateIndex
CREATE UNIQUE INDEX "option_groups_id_dishId_key" ON "option_groups"("id", "dishId");

-- CreateIndex
CREATE INDEX "option_group_items_optionId_idx" ON "option_group_items"("optionId");

-- CreateIndex
CREATE UNIQUE INDEX "option_group_items_dishId_optionId_key" ON "option_group_items"("dishId", "optionId");

-- AddForeignKey
ALTER TABLE "dishes" ADD CONSTRAINT "dishes_stationId_fkey" FOREIGN KEY ("stationId") REFERENCES "kitchen_stations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dish_allergens" ADD CONSTRAINT "dish_allergens_dishId_fkey" FOREIGN KEY ("dishId") REFERENCES "dishes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dish_allergens" ADD CONSTRAINT "dish_allergens_allergenId_fkey" FOREIGN KEY ("allergenId") REFERENCES "allergens"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dish_dietary_tags" ADD CONSTRAINT "dish_dietary_tags_dishId_fkey" FOREIGN KEY ("dishId") REFERENCES "dishes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dish_dietary_tags" ADD CONSTRAINT "dish_dietary_tags_dietaryTagId_fkey" FOREIGN KEY ("dietaryTagId") REFERENCES "dietary_tags"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "option_allergens" ADD CONSTRAINT "option_allergens_optionId_fkey" FOREIGN KEY ("optionId") REFERENCES "options"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "option_allergens" ADD CONSTRAINT "option_allergens_allergenId_fkey" FOREIGN KEY ("allergenId") REFERENCES "allergens"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "option_dietary_tags" ADD CONSTRAINT "option_dietary_tags_optionId_fkey" FOREIGN KEY ("optionId") REFERENCES "options"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "option_dietary_tags" ADD CONSTRAINT "option_dietary_tags_dietaryTagId_fkey" FOREIGN KEY ("dietaryTagId") REFERENCES "dietary_tags"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "option_groups" ADD CONSTRAINT "option_groups_dishId_fkey" FOREIGN KEY ("dishId") REFERENCES "dishes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "option_group_items" ADD CONSTRAINT "option_group_items_groupId_dishId_fkey" FOREIGN KEY ("groupId", "dishId") REFERENCES "option_groups"("id", "dishId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "option_group_items" ADD CONSTRAINT "option_group_items_optionId_fkey" FOREIGN KEY ("optionId") REFERENCES "options"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Hand-written: rules the database itself guarantees.
ALTER TABLE "dishes" ADD CONSTRAINT "dishes_name_not_blank" CHECK (btrim("name") <> '');
ALTER TABLE "dishes" ADD CONSTRAINT "dishes_sku_format" CHECK ("sku" ~ '^[A-Z0-9]+(-[A-Z0-9]+)*$');
ALTER TABLE "dishes" ADD CONSTRAINT "dishes_cost_non_negative" CHECK ("costCents" >= 0);
ALTER TABLE "dishes" ADD CONSTRAINT "dishes_min_order_qty" CHECK ("minOrderQty" IS NULL OR "minOrderQty" >= 2);
ALTER TABLE "options" ADD CONSTRAINT "options_name_not_blank" CHECK (btrim("name") <> '');
ALTER TABLE "options" ADD CONSTRAINT "options_cost_non_negative" CHECK ("costCents" >= 0);
ALTER TABLE "option_groups" ADD CONSTRAINT "option_groups_name_not_blank" CHECK (btrim("name") <> '');
ALTER TABLE "option_groups" ADD CONSTRAINT "option_groups_select_range"
  CHECK ("minSelect" >= 0 AND "maxSelect" >= 1 AND "maxSelect" >= "minSelect");
