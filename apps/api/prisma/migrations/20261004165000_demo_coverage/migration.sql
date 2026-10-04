CREATE TABLE "demo_weeks" (
  "startDate" DATE NOT NULL,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "orderCount" INTEGER NOT NULL,
  CONSTRAINT "demo_weeks_pkey" PRIMARY KEY ("startDate"),
  CONSTRAINT "demo_weeks_count_check" CHECK ("orderCount" >= 0),
  CONSTRAINT "demo_weeks_monday_check" CHECK (EXTRACT(ISODOW FROM "startDate") = 1)
);
