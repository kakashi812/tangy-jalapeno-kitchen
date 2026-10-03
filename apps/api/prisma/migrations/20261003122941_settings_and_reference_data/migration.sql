-- CreateTable
CREATE TABLE "platform_settings" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "kitchenWorkingDays" INTEGER[],
    "cutoffDaysBefore" INTEGER NOT NULL,
    "cutoffTimeMinutes" INTEGER NOT NULL,
    "kitchenReadyBufferMinutes" INTEGER NOT NULL,
    "atRiskMinutes" INTEGER NOT NULL,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "platform_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "kitchen_holidays" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "startDate" DATE NOT NULL,
    "endDate" DATE NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "kitchen_holidays_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "allergens" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "allergens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dietary_tags" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "dietary_tags_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "kitchen_stations" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "kitchen_stations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "portion_sizes" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "portion_sizes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "packaging_types" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "packaging_types_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "kitchen_holidays_startDate_endDate_idx" ON "kitchen_holidays"("startDate", "endDate");

-- CreateIndex
CREATE UNIQUE INDEX "allergens_name_key" ON "allergens"("name");

-- CreateIndex
CREATE UNIQUE INDEX "dietary_tags_name_key" ON "dietary_tags"("name");

-- CreateIndex
CREATE UNIQUE INDEX "kitchen_stations_name_key" ON "kitchen_stations"("name");

-- CreateIndex
CREATE UNIQUE INDEX "portion_sizes_name_key" ON "portion_sizes"("name");

-- CreateIndex
CREATE UNIQUE INDEX "packaging_types_name_key" ON "packaging_types"("name");

-- Hand-written: rules the database itself guarantees.
-- Settings is a single row.
ALTER TABLE "platform_settings" ADD CONSTRAINT "platform_settings_single_row" CHECK ("id" = 1);
ALTER TABLE "platform_settings" ADD CONSTRAINT "platform_settings_working_days"
  CHECK (cardinality("kitchenWorkingDays") >= 1 AND "kitchenWorkingDays" <@ ARRAY[0,1,2,3,4,5,6]);
ALTER TABLE "platform_settings" ADD CONSTRAINT "platform_settings_cutoff_days" CHECK ("cutoffDaysBefore" BETWEEN 0 AND 14);
ALTER TABLE "platform_settings" ADD CONSTRAINT "platform_settings_cutoff_time" CHECK ("cutoffTimeMinutes" BETWEEN 0 AND 1439);
ALTER TABLE "platform_settings" ADD CONSTRAINT "platform_settings_buffer" CHECK ("kitchenReadyBufferMinutes" BETWEEN 0 AND 240);
ALTER TABLE "platform_settings" ADD CONSTRAINT "platform_settings_at_risk" CHECK ("atRiskMinutes" BETWEEN 0 AND 240);

-- A holiday ends on or after it starts, and has a name.
ALTER TABLE "kitchen_holidays" ADD CONSTRAINT "kitchen_holidays_range" CHECK ("endDate" >= "startDate");
ALTER TABLE "kitchen_holidays" ADD CONSTRAINT "kitchen_holidays_name_not_blank" CHECK (btrim("name") <> '');

-- Reference items have a name.
ALTER TABLE "allergens" ADD CONSTRAINT "allergens_name_not_blank" CHECK (btrim("name") <> '');
ALTER TABLE "dietary_tags" ADD CONSTRAINT "dietary_tags_name_not_blank" CHECK (btrim("name") <> '');
ALTER TABLE "kitchen_stations" ADD CONSTRAINT "kitchen_stations_name_not_blank" CHECK (btrim("name") <> '');
ALTER TABLE "portion_sizes" ADD CONSTRAINT "portion_sizes_name_not_blank" CHECK (btrim("name") <> '');
ALTER TABLE "packaging_types" ADD CONSTRAINT "packaging_types_name_not_blank" CHECK (btrim("name") <> '');
