-- AlterTable
ALTER TABLE "companies" ADD COLUMN     "ownerId" UUID;

-- CreateTable
CREATE TABLE "employees" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT NOT NULL DEFAULT '',
    "canChooseAddress" BOOLEAN NOT NULL DEFAULT false,
    "canChangeDeliveryTime" BOOLEAN NOT NULL DEFAULT false,
    "canChangePackaging" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "employees_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "employee_allergens" (
    "employeeId" UUID NOT NULL,
    "allergenId" UUID NOT NULL,

    CONSTRAINT "employee_allergens_pkey" PRIMARY KEY ("employeeId","allergenId")
);

-- CreateTable
CREATE TABLE "employee_dietary_tags" (
    "employeeId" UUID NOT NULL,
    "dietaryTagId" UUID NOT NULL,

    CONSTRAINT "employee_dietary_tags_pkey" PRIMARY KEY ("employeeId","dietaryTagId")
);

-- CreateIndex
CREATE UNIQUE INDEX "employees_email_key" ON "employees"("email");

-- CreateIndex
CREATE INDEX "employees_companyId_name_idx" ON "employees"("companyId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "employees_id_companyId_key" ON "employees"("id", "companyId");

-- CreateIndex
CREATE INDEX "employee_allergens_allergenId_idx" ON "employee_allergens"("allergenId");

-- CreateIndex
CREATE INDEX "employee_dietary_tags_dietaryTagId_idx" ON "employee_dietary_tags"("dietaryTagId");

-- AddForeignKey
ALTER TABLE "companies" ADD CONSTRAINT "companies_ownerId_id_fkey" FOREIGN KEY ("ownerId", "id") REFERENCES "employees"("id", "companyId") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "employees" ADD CONSTRAINT "employees_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_allergens" ADD CONSTRAINT "employee_allergens_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_allergens" ADD CONSTRAINT "employee_allergens_allergenId_fkey" FOREIGN KEY ("allergenId") REFERENCES "allergens"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_dietary_tags" ADD CONSTRAINT "employee_dietary_tags_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_dietary_tags" ADD CONSTRAINT "employee_dietary_tags_dietaryTagId_fkey" FOREIGN KEY ("dietaryTagId") REFERENCES "dietary_tags"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Hand-written: rules the database itself guarantees.
ALTER TABLE "employees" ADD CONSTRAINT "employees_email_lowercase" CHECK ("email" = lower("email"));
ALTER TABLE "employees" ADD CONSTRAINT "employees_name_not_blank" CHECK (btrim("name") <> '');
