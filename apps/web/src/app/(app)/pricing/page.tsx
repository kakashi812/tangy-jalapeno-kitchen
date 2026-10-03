import type { Metadata } from 'next';
import Link from 'next/link';
import { AlertTriangle } from 'lucide-react';
import type { TierSummary } from '@fernleaf/shared';
import { NoAccess } from '@/components/no-access';
import { PageHeader } from '@/components/page-header';
import { Badge } from '@/components/ui/badge';
import { buttonVariants } from '@/components/ui/button';
import { apiGet } from '@/lib/api/server';
import { can, getSessionUser } from '@/lib/session';

export const metadata: Metadata = { title: 'Pricing' };

export default async function PricingPage() {
  const user = await getSessionUser();
  if (!can(user, 'pricing.read')) return <NoAccess />;
  const tiers = await apiGet<TierSummary[]>('/price-tiers');

  return (
    <div className="space-y-6">
      <PageHeader
        title="Price tiers"
        description="The same dish can cost different amounts for different companies. Each company is on one tier (or the default). A dish with no price on a tier doesn't appear on that tier's menus."
        actions={
          can(user, 'pricing.manage') ? (
            <Link href="/pricing/new" className={buttonVariants()}>
              New tier
            </Link>
          ) : null
        }
      />
      <ul className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {tiers.map((tier) => (
          <li key={tier.id} className="flex">
            <Link
              href={`/pricing/${tier.id}`}
              className="flex w-full flex-col gap-3 rounded-xl border bg-card p-5 transition-shadow hover:shadow-md"
            >
              <div className="flex items-start justify-between gap-2">
                <h2 className="font-heading text-xl font-bold">{tier.name}</h2>
                {tier.isDefault ? <Badge>Default</Badge> : null}
              </div>
              <p className="text-sm font-medium">{tier.ruleLabel}</p>
              {tier.description ? (
                <p className="text-sm text-muted-foreground">{tier.description}</p>
              ) : null}
              <div className="mt-auto flex flex-wrap items-center gap-x-4 gap-y-1 pt-2 text-sm">
                {tier.missingDishes > 0 ? (
                  <span className="flex items-center gap-1 font-medium text-destructive">
                    <AlertTriangle className="size-4" aria-hidden />
                    {tier.missingDishes} of {tier.activeDishes} dishes have no price
                  </span>
                ) : (
                  <span className="text-muted-foreground">
                    All {tier.activeDishes} active dishes priced
                  </span>
                )}
                <span className="text-muted-foreground">
                  {tier.companyCount} compan{tier.companyCount === 1 ? 'y' : 'ies'}
                </span>
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
