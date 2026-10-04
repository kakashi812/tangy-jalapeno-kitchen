-- CreateEnum
CREATE TYPE "OrderStatus" AS ENUM ('DRAFT', 'PLACED', 'CONFIRMED', 'DELIVERED', 'CANCELLED', 'REJECTED');

-- CreateTable
CREATE TABLE "orders" (
    "id" UUID NOT NULL,
    "sequence" SERIAL NOT NULL,
    "employeeId" UUID NOT NULL,
    "employeeName" TEXT NOT NULL,
    "companyId" UUID NOT NULL,
    "companyName" TEXT NOT NULL,
    "deliveryDate" DATE NOT NULL,
    "deliveryTimeMinutes" INTEGER NOT NULL,
    "addressId" UUID NOT NULL,
    "addressText" TEXT NOT NULL,
    "packagingTypeId" UUID NOT NULL,
    "packagingName" TEXT NOT NULL,
    "notes" TEXT NOT NULL DEFAULT '',
    "driverInstructions" TEXT NOT NULL DEFAULT '',
    "dispatchLeadMinutes" INTEGER NOT NULL,
    "kitchenBufferMinutes" INTEGER NOT NULL,
    "plannedKitchenReadyAt" TIMESTAMPTZ(3) NOT NULL,
    "plannedDispatchReadyAt" TIMESTAMPTZ(3) NOT NULL,
    "cutoffAt" TIMESTAMPTZ(3) NOT NULL,
    "status" "OrderStatus" NOT NULL DEFAULT 'DRAFT',
    "totalCents" INTEGER NOT NULL,
    "invoiceId" UUID,
    "version" INTEGER NOT NULL DEFAULT 0,
    "kitchenStartedAt" TIMESTAMPTZ(3),
    "kitchenReadyAt" TIMESTAMPTZ(3),
    "outForDeliveryAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "order_lines" (
    "id" UUID NOT NULL,
    "orderId" UUID NOT NULL,
    "menuItemId" UUID NOT NULL,
    "dishId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "temperature" "Temperature" NOT NULL,
    "stationId" UUID,
    "stationName" TEXT,
    "minOrderQty" INTEGER,
    "quantity" INTEGER NOT NULL,
    "dishPriceCents" INTEGER NOT NULL,
    "groups" JSONB NOT NULL,
    "totalCents" INTEGER NOT NULL,
    "sortOrder" INTEGER NOT NULL,

    CONSTRAINT "order_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "order_combinations" (
    "id" UUID NOT NULL,
    "lineId" UUID NOT NULL,
    "quantity" INTEGER NOT NULL,
    "options" JSONB NOT NULL,
    "unitPriceCents" INTEGER NOT NULL,
    "totalCents" INTEGER NOT NULL,
    "sortOrder" INTEGER NOT NULL,

    CONSTRAINT "order_combinations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "prep_units" (
    "id" UUID NOT NULL,
    "combinationId" UUID NOT NULL,
    "stationId" UUID,
    "stationName" TEXT,
    "startedAt" TIMESTAMPTZ(3),
    "doneAt" TIMESTAMPTZ(3),
    "startedById" UUID,
    "doneById" UUID,

    CONSTRAINT "prep_units_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "order_events" (
    "id" UUID NOT NULL,
    "sequence" SERIAL NOT NULL,
    "orderId" UUID NOT NULL,
    "type" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "actorId" UUID,
    "at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "order_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "order_closures" (
    "deliveryDate" DATE NOT NULL,
    "closedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actorId" UUID NOT NULL,

    CONSTRAINT "order_closures_pkey" PRIMARY KEY ("deliveryDate")
);

-- CreateIndex
CREATE UNIQUE INDEX "orders_sequence_key" ON "orders"("sequence");

-- CreateIndex
CREATE INDEX "orders_status_cutoffAt_idx" ON "orders"("status", "cutoffAt");

-- CreateIndex
CREATE INDEX "orders_deliveryDate_deliveryTimeMinutes_idx" ON "orders"("deliveryDate", "deliveryTimeMinutes");

-- CreateIndex
CREATE INDEX "orders_companyId_deliveryDate_idx" ON "orders"("companyId", "deliveryDate");

-- CreateIndex
CREATE INDEX "orders_employeeId_idx" ON "orders"("employeeId");

-- CreateIndex
CREATE INDEX "order_lines_orderId_sortOrder_idx" ON "order_lines"("orderId", "sortOrder");

-- CreateIndex
CREATE INDEX "order_lines_dishId_idx" ON "order_lines"("dishId");

-- CreateIndex
CREATE INDEX "order_lines_stationId_idx" ON "order_lines"("stationId");

-- CreateIndex
CREATE INDEX "order_combinations_lineId_sortOrder_idx" ON "order_combinations"("lineId", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "prep_units_combinationId_key" ON "prep_units"("combinationId");

-- CreateIndex
CREATE INDEX "prep_units_stationId_idx" ON "prep_units"("stationId");

-- CreateIndex
CREATE INDEX "order_events_orderId_at_idx" ON "order_events"("orderId", "at");

CREATE UNIQUE INDEX "order_events_sequence_key" ON "order_events"("sequence");

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_addressId_fkey" FOREIGN KEY ("addressId") REFERENCES "company_addresses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_packagingTypeId_fkey" FOREIGN KEY ("packagingTypeId") REFERENCES "packaging_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_lines" ADD CONSTRAINT "order_lines_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_lines" ADD CONSTRAINT "order_lines_dishId_fkey" FOREIGN KEY ("dishId") REFERENCES "dishes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_lines" ADD CONSTRAINT "order_lines_stationId_fkey" FOREIGN KEY ("stationId") REFERENCES "kitchen_stations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_combinations" ADD CONSTRAINT "order_combinations_lineId_fkey" FOREIGN KEY ("lineId") REFERENCES "order_lines"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prep_units" ADD CONSTRAINT "prep_units_combinationId_fkey" FOREIGN KEY ("combinationId") REFERENCES "order_combinations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prep_units" ADD CONSTRAINT "prep_units_stationId_fkey" FOREIGN KEY ("stationId") REFERENCES "kitchen_stations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prep_units" ADD CONSTRAINT "prep_units_startedById_fkey" FOREIGN KEY ("startedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prep_units" ADD CONSTRAINT "prep_units_doneById_fkey" FOREIGN KEY ("doneById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_events" ADD CONSTRAINT "order_events_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_events" ADD CONSTRAINT "order_events_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_closures" ADD CONSTRAINT "order_closures_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- One non-cancelled/non-rejected order per employee and delivery date.
CREATE UNIQUE INDEX "orders_employee_date_open_key" ON "orders" ("employeeId", "deliveryDate") WHERE "status" NOT IN ('CANCELLED', 'REJECTED');

ALTER TABLE "orders" ADD CONSTRAINT "orders_values_check" CHECK ("totalCents" >= 0 AND "version" >= 0 AND "deliveryTimeMinutes" BETWEEN 0 AND 1439 AND "deliveryTimeMinutes" % 15 = 0 AND "dispatchLeadMinutes" >= 0 AND "kitchenBufferMinutes" >= 0);
ALTER TABLE "order_lines" ADD CONSTRAINT "order_lines_values_check" CHECK ("quantity" BETWEEN 1 AND 500 AND "dishPriceCents" > 0 AND "totalCents" > 0 AND ("minOrderQty" IS NULL OR "minOrderQty" >= 2) AND jsonb_typeof("groups") = 'array');
ALTER TABLE "order_combinations" ADD CONSTRAINT "order_combinations_values_check" CHECK ("quantity" BETWEEN 1 AND 500 AND "unitPriceCents" > 0 AND "totalCents" = "unitPriceCents"::bigint * "quantity" AND jsonb_typeof("options") = 'array');
ALTER TABLE "prep_units" ADD CONSTRAINT "prep_units_times_check" CHECK ("doneAt" IS NULL OR ("startedAt" IS NOT NULL AND "doneAt" >= "startedAt"));
