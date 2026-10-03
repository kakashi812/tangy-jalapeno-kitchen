-- CreateTable
CREATE TABLE "menu_categories" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isSecret" BOOLEAN NOT NULL DEFAULT false,
    "accessCode" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "menu_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "menu_items" (
    "id" UUID NOT NULL,
    "categoryId" UUID NOT NULL,
    "dishId" UUID NOT NULL,
    "sortOrder" INTEGER NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "menu_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "company_hidden_categories" (
    "companyId" UUID NOT NULL,
    "categoryId" UUID NOT NULL,

    CONSTRAINT "company_hidden_categories_pkey" PRIMARY KEY ("companyId","categoryId")
);

-- CreateTable
CREATE TABLE "company_hidden_menu_items" (
    "companyId" UUID NOT NULL,
    "menuItemId" UUID NOT NULL,

    CONSTRAINT "company_hidden_menu_items_pkey" PRIMARY KEY ("companyId","menuItemId")
);

-- CreateIndex
CREATE UNIQUE INDEX "menu_categories_name_key" ON "menu_categories"("name");

-- CreateIndex
CREATE UNIQUE INDEX "menu_categories_accessCode_key" ON "menu_categories"("accessCode");

-- CreateIndex
CREATE INDEX "menu_items_dishId_idx" ON "menu_items"("dishId");

-- CreateIndex
CREATE UNIQUE INDEX "menu_items_categoryId_dishId_key" ON "menu_items"("categoryId", "dishId");

-- CreateIndex
CREATE INDEX "company_hidden_categories_categoryId_idx" ON "company_hidden_categories"("categoryId");

-- CreateIndex
CREATE INDEX "company_hidden_menu_items_menuItemId_idx" ON "company_hidden_menu_items"("menuItemId");

-- AddForeignKey
ALTER TABLE "menu_items" ADD CONSTRAINT "menu_items_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "menu_categories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "menu_items" ADD CONSTRAINT "menu_items_dishId_fkey" FOREIGN KEY ("dishId") REFERENCES "dishes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "company_hidden_categories" ADD CONSTRAINT "company_hidden_categories_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "company_hidden_categories" ADD CONSTRAINT "company_hidden_categories_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "menu_categories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "company_hidden_menu_items" ADD CONSTRAINT "company_hidden_menu_items_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "company_hidden_menu_items" ADD CONSTRAINT "company_hidden_menu_items_menuItemId_fkey" FOREIGN KEY ("menuItemId") REFERENCES "menu_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Hand-written: rules the database itself guarantees.
ALTER TABLE "menu_categories" ADD CONSTRAINT "menu_categories_name_not_blank" CHECK (btrim("name") <> '');
-- A secret category has an uppercase access code; a listed one has none.
ALTER TABLE "menu_categories" ADD CONSTRAINT "menu_categories_secret_code" CHECK (
  ("isSecret" AND "accessCode" ~ '^[A-Z0-9]{4,20}$') OR (NOT "isSecret" AND "accessCode" IS NULL)
);
