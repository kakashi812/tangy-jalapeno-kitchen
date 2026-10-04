CREATE TYPE "DropStatus" AS ENUM ('WAITING', 'DISPATCH_READY', 'OUT_FOR_DELIVERY', 'DELIVERED');
ALTER TABLE "orders" ADD COLUMN "dropId" UUID;
CREATE TABLE "drops" (
  "id" UUID NOT NULL,
  "companyId" UUID NOT NULL,
  "addressId" UUID NOT NULL,
  "deliveryDate" DATE NOT NULL,
  "deliveryTimeMinutes" INTEGER NOT NULL,
  "driverId" UUID,
  "status" "DropStatus" NOT NULL DEFAULT 'WAITING',
  "version" INTEGER NOT NULL DEFAULT 0,
  "dispatchReadyAt" TIMESTAMPTZ(3),
  "outForDeliveryAt" TIMESTAMPTZ(3),
  "deliveredAt" TIMESTAMPTZ(3),
  "deliveryNote" TEXT NOT NULL DEFAULT '',
  "photoUrl" TEXT,
  "onTime" BOOLEAN,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "drops_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "drops_time_check" CHECK ("deliveryTimeMinutes" BETWEEN 0 AND 1439 AND "deliveryTimeMinutes" % 15 = 0),
  CONSTRAINT "drops_version_check" CHECK ("version" >= 0),
  CONSTRAINT "drops_state_check" CHECK (
    ("status" = 'WAITING' AND "dispatchReadyAt" IS NULL AND "outForDeliveryAt" IS NULL AND "deliveredAt" IS NULL AND "onTime" IS NULL) OR
    ("status" = 'DISPATCH_READY' AND "dispatchReadyAt" IS NOT NULL AND "outForDeliveryAt" IS NULL AND "deliveredAt" IS NULL AND "onTime" IS NULL) OR
    ("status" = 'OUT_FOR_DELIVERY' AND "dispatchReadyAt" IS NOT NULL AND "outForDeliveryAt" IS NOT NULL AND "driverId" IS NOT NULL AND "deliveredAt" IS NULL AND "onTime" IS NULL) OR
    ("status" = 'DELIVERED' AND "dispatchReadyAt" IS NOT NULL AND "outForDeliveryAt" IS NOT NULL AND "driverId" IS NOT NULL AND "deliveredAt" IS NOT NULL AND "onTime" IS NOT NULL)
  )
);
CREATE INDEX "drops_deliveryDate_deliveryTimeMinutes_idx" ON "drops"("deliveryDate", "deliveryTimeMinutes");
CREATE INDEX "drops_driverId_deliveryDate_idx" ON "drops"("driverId", "deliveryDate");
CREATE UNIQUE INDEX "drops_companyId_addressId_deliveryDate_deliveryTimeMinutes_key" ON "drops"("companyId", "addressId", "deliveryDate", "deliveryTimeMinutes");
CREATE INDEX "orders_dropId_idx" ON "orders"("dropId");
ALTER TABLE "orders" ADD CONSTRAINT "orders_dropId_fkey" FOREIGN KEY ("dropId") REFERENCES "drops"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "drops" ADD CONSTRAINT "drops_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "drops" ADD CONSTRAINT "drops_addressId_fkey" FOREIGN KEY ("addressId") REFERENCES "company_addresses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "drops" ADD CONSTRAINT "drops_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Preserve pre-M10 confirmed orders, if any. No existing order is deleted or repriced.
INSERT INTO "drops" ("id", "companyId", "addressId", "deliveryDate", "deliveryTimeMinutes", "driverId", "updatedAt")
SELECT gen_random_uuid(), o."companyId", o."addressId", o."deliveryDate", o."deliveryTimeMinutes",
  CASE WHEN u."isActive" AND 'deliveries.own' = ANY(r.permissions) THEN c."defaultDriverId" ELSE NULL END,
  CURRENT_TIMESTAMP
FROM "orders" o JOIN "companies" c ON c.id = o."companyId"
LEFT JOIN "users" u ON u.id = c."defaultDriverId" LEFT JOIN "roles" r ON r.id = u."roleId"
WHERE o.status = 'CONFIRMED'
GROUP BY o."companyId", o."addressId", o."deliveryDate", o."deliveryTimeMinutes", c."defaultDriverId", u."isActive", r.permissions;
UPDATE "orders" o SET "dropId" = d.id FROM "drops" d
WHERE o.status = 'CONFIRMED' AND o."companyId" = d."companyId" AND o."addressId" = d."addressId"
AND o."deliveryDate" = d."deliveryDate" AND o."deliveryTimeMinutes" = d."deliveryTimeMinutes";
