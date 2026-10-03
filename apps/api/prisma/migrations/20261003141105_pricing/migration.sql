-- CreateEnum
CREATE TYPE "PriceRule" AS ENUM ('MANUAL', 'COST_MULTIPLIER', 'TIER_PERCENT');

-- CreateTable
CREATE TABLE "price_tiers" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "rule" "PriceRule" NOT NULL,
    "multiplierBp" INTEGER,
    "baseTierId" UUID,
    "percentBp" INTEGER,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "price_tiers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dish_prices" (
    "tierId" UUID NOT NULL,
    "dishId" UUID NOT NULL,
    "priceCents" INTEGER NOT NULL,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "dish_prices_pkey" PRIMARY KEY ("tierId","dishId")
);

-- CreateTable
CREATE TABLE "option_prices" (
    "tierId" UUID NOT NULL,
    "optionId" UUID NOT NULL,
    "priceCents" INTEGER NOT NULL,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "option_prices_pkey" PRIMARY KEY ("tierId","optionId")
);

-- CreateIndex
CREATE UNIQUE INDEX "price_tiers_name_key" ON "price_tiers"("name");

-- CreateIndex
CREATE INDEX "dish_prices_dishId_idx" ON "dish_prices"("dishId");

-- CreateIndex
CREATE INDEX "option_prices_optionId_idx" ON "option_prices"("optionId");

-- AddForeignKey
ALTER TABLE "price_tiers" ADD CONSTRAINT "price_tiers_baseTierId_fkey" FOREIGN KEY ("baseTierId") REFERENCES "price_tiers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dish_prices" ADD CONSTRAINT "dish_prices_tierId_fkey" FOREIGN KEY ("tierId") REFERENCES "price_tiers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dish_prices" ADD CONSTRAINT "dish_prices_dishId_fkey" FOREIGN KEY ("dishId") REFERENCES "dishes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "option_prices" ADD CONSTRAINT "option_prices_tierId_fkey" FOREIGN KEY ("tierId") REFERENCES "price_tiers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "option_prices" ADD CONSTRAINT "option_prices_optionId_fkey" FOREIGN KEY ("optionId") REFERENCES "options"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Hand-written: rules the database itself guarantees.
-- Exactly one default tier at most (the app ensures there is always one).
CREATE UNIQUE INDEX "price_tiers_one_default" ON "price_tiers" ("isDefault") WHERE "isDefault";
ALTER TABLE "price_tiers" ADD CONSTRAINT "price_tiers_name_not_blank" CHECK (btrim("name") <> '');
-- Each rule carries exactly its own fields.
ALTER TABLE "price_tiers" ADD CONSTRAINT "price_tiers_rule_fields" CHECK (
  ("rule" = 'MANUAL' AND "multiplierBp" IS NULL AND "baseTierId" IS NULL AND "percentBp" IS NULL) OR
  ("rule" = 'COST_MULTIPLIER' AND "multiplierBp" BETWEEN 10000 AND 200000 AND "baseTierId" IS NULL AND "percentBp" IS NULL) OR
  ("rule" = 'TIER_PERCENT' AND "multiplierBp" IS NULL AND "baseTierId" IS NOT NULL AND "baseTierId" <> "id" AND "percentBp" BETWEEN -9000 AND 50000)
);
ALTER TABLE "dish_prices" ADD CONSTRAINT "dish_prices_non_negative" CHECK ("priceCents" >= 0);
ALTER TABLE "option_prices" ADD CONSTRAINT "option_prices_non_negative" CHECK ("priceCents" >= 0);
