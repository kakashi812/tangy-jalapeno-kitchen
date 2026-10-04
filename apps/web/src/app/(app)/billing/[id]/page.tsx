import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
  PageQuerySchema,
  formatCents,
  formatKitchenDate,
  formatKitchenDateTime,
  type InvoiceDetail,
} from '@fernleaf/shared';
import { NoAccess } from '@/components/no-access';
import { PageHeader } from '@/components/page-header';
import { Pagination } from '@/components/pagination';
import { Badge } from '@/components/ui/badge';
import { apiGet } from '@/lib/api/server';
import { ApiRequestError } from '@/lib/api/api-error';
import { can, getSessionUser } from '@/lib/session';
import { PayInvoice, ReportShort } from '../invoice-actions';
export const metadata: Metadata = { title: 'Invoice' };
export default async function InvoicePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const user = await getSessionUser();
  if (!can(user, 'billing.read')) return <NoAccess />;
  const { id } = await params;
  const parsed = PageQuerySchema.safeParse(await searchParams);
  const query = parsed.success ? parsed.data : PageQuerySchema.parse({});
  let invoice: InvoiceDetail;
  try {
    invoice = await apiGet<InvoiceDetail>(
      `/billing/invoices/${id}?page=${query.page}&pageSize=${query.pageSize}`,
    );
  } catch (e) {
    if (e instanceof ApiRequestError && e.status === 404) notFound();
    throw e;
  }
  return (
    <div className="space-y-6">
      <Link href="/billing" className="text-sm text-primary hover:underline">
        ← Company billing
      </Link>
      <PageHeader
        title={invoice.number}
        description={`${invoice.company.name} · Issued ${formatKitchenDateTime(new Date(invoice.issuedAt))}`}
        actions={can(user, 'billing.manage') ? <PayInvoice invoice={invoice} /> : null}
      />
      <div className="rounded-lg border p-5">
        <div className="flex flex-wrap justify-between gap-4">
          <div>
            <p className="text-2xl font-semibold tabular-nums">{formatCents(invoice.totalCents)}</p>
            <p className="text-sm text-muted-foreground">
              {invoice.orderCount} orders · USD · pre-tax
            </p>
          </div>
          <div>
            <Badge variant="outline">{invoice.paidAt ? 'Paid' : 'Unpaid'}</Badge>
            {invoice.paidAt && (
              <p className="mt-1 text-sm">
                Recorded {formatKitchenDateTime(new Date(invoice.paidAt))}
              </p>
            )}
          </div>
        </div>
        <p className="mt-4 text-sm">
          Billing contact: {invoice.billingContactName} · {invoice.billingEmail}
        </p>
      </div>
      {invoice.needsReview && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
          Orders changed after this invoice was issued. Review the flagged orders below. Issued
          amounts are unchanged; no refunds or financial adjustments are automated.
        </div>
      )}
      <div className="divide-y rounded-lg border">
        {invoice.orders.items.map((o) => (
          <div key={o.id} className="p-4">
            <div className="flex flex-wrap justify-between gap-3">
              <div>
                {can(user, 'orders.read') ? (
                  <Link
                    href={`/orders/${o.id}`}
                    className="font-medium text-primary hover:underline"
                  >
                    {o.number} · {o.employeeName}
                  </Link>
                ) : (
                  <p className="font-medium">
                    {o.number} · {o.employeeName}
                  </p>
                )}
                <p className="text-sm text-muted-foreground">
                  {formatKitchenDate(o.deliveryDate)} · {o.status}
                </p>
              </div>
              <p className="tabular-nums">{formatCents(o.totalCents)}</p>
            </div>
            {o.billingReviewReason && (
              <p className="mt-2 text-sm text-amber-700">Staff review: {o.billingReviewReason}</p>
            )}
            {o.shortDeliveryNote && (
              <p className="mt-2 text-sm">Short delivery: {o.shortDeliveryNote}</p>
            )}
            {can(user, 'billing.manage') && <ReportShort key={`${o.id}-${o.version}`} order={o} />}
          </div>
        ))}
      </div>
      <Pagination
        pathname={`/billing/${id}`}
        params={{}}
        page={invoice.orders.page}
        pageSize={invoice.orders.pageSize}
        total={invoice.orders.total}
      />
      <p className="text-sm text-muted-foreground">
        This is an internal billing record, not a payment service. No editing, voiding, re-invoicing
        or partial payments.
      </p>
    </div>
  );
}
