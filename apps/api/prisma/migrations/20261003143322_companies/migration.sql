-- AlterTable
ALTER TABLE "platform_settings" ADD COLUMN     "deliveryWindowEndMinutes" INTEGER NOT NULL DEFAULT 1200,
ADD COLUMN     "deliveryWindowStartMinutes" INTEGER NOT NULL DEFAULT 480;

-- CreateTable
CREATE TABLE "companies" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "priceTierId" UUID,
    "billingContactName" TEXT NOT NULL,
    "billingEmail" TEXT NOT NULL,
    "billingPhone" TEXT NOT NULL DEFAULT '',
    "workingDays" INTEGER[],
    "defaultDeliveryTimeMinutes" INTEGER NOT NULL,
    "dispatchLeadMinutes" INTEGER NOT NULL DEFAULT 60,
    "defaultPackagingTypeId" UUID NOT NULL,
    "driverInstructions" TEXT NOT NULL DEFAULT '',
    "defaultDriverId" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "companies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "company_domains" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "domain" TEXT NOT NULL,

    CONSTRAINT "company_domains_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "company_addresses" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "label" TEXT NOT NULL,
    "line1" TEXT NOT NULL,
    "line2" TEXT NOT NULL DEFAULT '',
    "city" TEXT NOT NULL,
    "postcode" TEXT NOT NULL,
    "deliveryNotes" TEXT NOT NULL DEFAULT '',
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "company_addresses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "company_holidays" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "startDate" DATE NOT NULL,
    "endDate" DATE NOT NULL,

    CONSTRAINT "company_holidays_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "companies_name_key" ON "companies"("name");

-- CreateIndex
CREATE INDEX "companies_priceTierId_idx" ON "companies"("priceTierId");

-- CreateIndex
CREATE UNIQUE INDEX "company_domains_domain_key" ON "company_domains"("domain");

-- CreateIndex
CREATE INDEX "company_domains_companyId_idx" ON "company_domains"("companyId");

-- CreateIndex
CREATE INDEX "company_addresses_companyId_idx" ON "company_addresses"("companyId");

-- CreateIndex
CREATE INDEX "company_holidays_companyId_startDate_idx" ON "company_holidays"("companyId", "startDate");

-- AddForeignKey
ALTER TABLE "companies" ADD CONSTRAINT "companies_priceTierId_fkey" FOREIGN KEY ("priceTierId") REFERENCES "price_tiers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "companies" ADD CONSTRAINT "companies_defaultPackagingTypeId_fkey" FOREIGN KEY ("defaultPackagingTypeId") REFERENCES "packaging_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "companies" ADD CONSTRAINT "companies_defaultDriverId_fkey" FOREIGN KEY ("defaultDriverId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "company_domains" ADD CONSTRAINT "company_domains_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "company_addresses" ADD CONSTRAINT "company_addresses_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "company_holidays" ADD CONSTRAINT "company_holidays_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Hand-written: rules the database itself guarantees.
ALTER TABLE "platform_settings" ADD CONSTRAINT "platform_settings_delivery_window"
  CHECK ("deliveryWindowEndMinutes" > "deliveryWindowStartMinutes" AND "deliveryWindowStartMinutes" >= 0 AND "deliveryWindowEndMinutes" <= 1439);
ALTER TABLE "companies" ADD CONSTRAINT "companies_name_not_blank" CHECK (btrim("name") <> '');
ALTER TABLE "companies" ADD CONSTRAINT "companies_working_days"
  CHECK (cardinality("workingDays") >= 1 AND "workingDays" <@ ARRAY[0,1,2,3,4,5,6]);
ALTER TABLE "companies" ADD CONSTRAINT "companies_delivery_time"
  CHECK ("defaultDeliveryTimeMinutes" BETWEEN 0 AND 1439 AND "defaultDeliveryTimeMinutes" % 15 = 0);
ALTER TABLE "companies" ADD CONSTRAINT "companies_dispatch_lead" CHECK ("dispatchLeadMinutes" BETWEEN 0 AND 480);
-- Domains are stored lowercase, so uniqueness ignores case.
ALTER TABLE "company_domains" ADD CONSTRAINT "company_domains_lowercase" CHECK ("domain" = lower("domain"));
-- At most one default address per company.
CREATE UNIQUE INDEX "company_addresses_one_default" ON "company_addresses" ("companyId") WHERE "isDefault";
ALTER TABLE "company_holidays" ADD CONSTRAINT "company_holidays_range" CHECK ("endDate" >= "startDate");
