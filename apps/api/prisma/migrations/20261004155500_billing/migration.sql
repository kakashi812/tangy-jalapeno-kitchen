ALTER TABLE "orders" ADD COLUMN "billingReviewReason" TEXT NOT NULL DEFAULT '',
ADD COLUMN "shortDeliveryNote" TEXT NOT NULL DEFAULT '';
CREATE TABLE "invoices" (
  "id" UUID NOT NULL,
  "sequence" SERIAL NOT NULL,
  "companyId" UUID NOT NULL,
  "companyName" TEXT NOT NULL,
  "billingContactName" TEXT NOT NULL,
  "billingEmail" TEXT NOT NULL,
  "totalCents" INTEGER NOT NULL,
  "orderCount" INTEGER NOT NULL,
  "version" INTEGER NOT NULL DEFAULT 0,
  "issuedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "paidAt" TIMESTAMPTZ(3),
  CONSTRAINT "invoices_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "invoices_amount_count_check" CHECK ("totalCents" >= 0 AND "orderCount" > 0 AND "version" >= 0),
  CONSTRAINT "invoices_paid_time_check" CHECK ("paidAt" IS NULL OR "paidAt" >= "issuedAt")
);
CREATE UNIQUE INDEX "invoices_sequence_key" ON "invoices"("sequence");
CREATE INDEX "invoices_companyId_issuedAt_idx" ON "invoices"("companyId", "issuedAt");
CREATE INDEX "invoices_paidAt_idx" ON "invoices"("paidAt");
CREATE INDEX "orders_invoiceId_idx" ON "orders"("invoiceId");
ALTER TABLE "orders" ADD CONSTRAINT "orders_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "invoices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Issued amounts/membership are historical; status and delivery details can still change.
CREATE FUNCTION preserve_invoiced_order() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD."invoiceId" IS NOT NULL AND
     (NEW."invoiceId" IS DISTINCT FROM OLD."invoiceId" OR NEW."totalCents" <> OLD."totalCents") THEN
    RAISE EXCEPTION 'Invoiced order amount and invoice membership are immutable' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER preserve_invoiced_order BEFORE UPDATE ON "orders"
FOR EACH ROW EXECUTE FUNCTION preserve_invoiced_order();

CREATE FUNCTION preserve_issued_invoice() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."totalCents" <> OLD."totalCents" OR NEW."orderCount" <> OLD."orderCount" OR
     NEW."companyId" <> OLD."companyId" OR NEW."issuedAt" <> OLD."issuedAt" OR
     NEW."companyName" <> OLD."companyName" OR NEW."billingContactName" <> OLD."billingContactName" OR
     NEW."billingEmail" <> OLD."billingEmail" OR NEW."sequence" <> OLD."sequence" OR
     (OLD."paidAt" IS NOT NULL AND NEW."paidAt" IS DISTINCT FROM OLD."paidAt") THEN
    RAISE EXCEPTION 'Issued invoice details are immutable' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER preserve_issued_invoice BEFORE UPDATE ON "invoices"
FOR EACH ROW EXECUTE FUNCTION preserve_issued_invoice();
