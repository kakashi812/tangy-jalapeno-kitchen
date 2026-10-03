'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  formatCents,
  type PriceGridRow,
  type PriceItemKind,
  type TierSummary,
} from '@fernleaf/shared';
import { FormError } from '@/components/form/field';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ApiRequestError } from '@/lib/api/api-error';
import { apiSend } from '@/lib/api/client';
import { centsToDollarInput, DollarInputSchema, dollarsToCents } from '@/lib/money-input';
import { cn } from '@/lib/utils';

/** The typed price on this tier (manual price or override), or '' if the cell follows the rule. */
function typedValue(row: PriceGridRow): string {
  return row.price && row.price.source !== 'derived' ? centsToDollarInput(row.price.cents) : '';
}

function SourceBadge({ row, manual }: { row: PriceGridRow; manual: boolean }) {
  if (!row.price) {
    return (
      <Badge variant="destructive">{row.isActive ? 'No price: not offered' : 'No price'}</Badge>
    );
  }
  if (row.price.source === 'override') return <Badge>Override</Badge>;
  if (row.price.source === 'derived') return <Badge variant="secondary">From rule</Badge>;
  return manual ? <Badge variant="secondary">Typed</Badge> : null;
}

/**
 * Fast editing of a whole tier: type prices in the column, then save them all at once. On a
 * derived tier an empty cell follows the rule (shown greyed as the placeholder) and a typed value
 * is an override; on a typed-in tier an empty cell means "no price", so the item isn't offered.
 */
export function PriceGrid({
  tier,
  kind,
  rows,
  canEdit,
}: {
  tier: TierSummary;
  kind: PriceItemKind;
  rows: PriceGridRow[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const manual = tier.rule === 'MANUAL';
  const fromRows = () => Object.fromEntries(rows.map((row) => [row.id, typedValue(row)]));
  const [values, setValues] = useState<Record<string, string>>(fromRows);
  // After a save the page refreshes with new rows: take their values, but keep the "Saved" note.
  // (Adjusting state during render when a prop changes, as React recommends, instead of remounting.)
  const signature = JSON.stringify(rows.map((row) => [row.id, typedValue(row)]));
  const [seenSignature, setSeenSignature] = useState(signature);
  if (seenSignature !== signature) {
    setSeenSignature(signature);
    setValues(fromRows());
  }
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string>();
  const [saving, setSaving] = useState(false);
  const [savedCount, setSavedCount] = useState<number>();

  const changed = rows.filter((row) => (values[row.id] ?? '') !== typedValue(row));

  async function save() {
    const nextErrors: Record<string, string> = {};
    const prices = changed.map((row) => {
      const text = (values[row.id] ?? '').trim();
      if (text === '') return { itemId: row.id, priceCents: null };
      if (!DollarInputSchema.safeParse(text).success)
        nextErrors[row.id] = 'Enter an amount like 7.45';
      return { itemId: row.id, priceCents: nextErrors[row.id] ? 0 : dollarsToCents(text) };
    });
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) {
      setFormError('Fix the highlighted prices, then save.');
      return;
    }
    setSaving(true);
    setFormError(undefined);
    try {
      await apiSend('PUT', `/price-tiers/${tier.id}/prices`, { kind, prices });
      setSavedCount(prices.length);
      router.refresh();
    } catch (error) {
      if (error instanceof ApiRequestError) {
        const byRow: Record<string, string> = {};
        for (const [path, messages] of Object.entries(error.fieldErrors)) {
          const index = Number(path.split('.')[1]);
          const row = changed[index];
          if (row) byRow[row.id] = messages.join(' ');
        }
        setErrors(byRow);
        setFormError(error.message);
      } else {
        setFormError('Could not reach the server. Check your connection and try again.');
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-3">
      <FormError message={formError} />
      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead className="border-b bg-muted/40 text-left">
            <tr>
              <th className="px-3 py-2 font-medium">{kind === 'dishes' ? 'Dish' : 'Option'}</th>
              <th className="px-3 py-2 text-right font-medium">Cost</th>
              {!manual ? <th className="px-3 py-2 text-right font-medium">Rule gives</th> : null}
              <th className="px-3 py-2 font-medium">{manual ? 'Price' : 'Override'}</th>
              <th className="px-3 py-2 text-right font-medium">Price here</th>
              <th className="px-3 py-2 font-medium" />
            </tr>
          </thead>
          <tbody className="divide-y">
            {rows.map((row) => {
              const isChanged = (values[row.id] ?? '') !== typedValue(row);
              return (
                <tr
                  key={row.id}
                  className={cn(
                    !row.isActive && 'text-muted-foreground',
                    isChanged && 'bg-amber-50 dark:bg-amber-950/20',
                  )}
                >
                  <td className="px-3 py-2">
                    <div className="font-medium">{row.name}</div>
                    <div className="text-xs text-muted-foreground">
                      {row.sku ? <span className="font-mono">{row.sku}</span> : null}
                      {!row.isActive ? `${row.sku ? ' · ' : ''}inactive` : null}
                    </div>
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {formatCents(row.costCents)}
                  </td>
                  {!manual ? (
                    <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">
                      {row.ruleCents === null ? '—' : formatCents(row.ruleCents)}
                    </td>
                  ) : null}
                  <td className="px-3 py-2">
                    <div className="relative w-28">
                      <span className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-muted-foreground">
                        $
                      </span>
                      <Input
                        aria-label={`${manual ? 'Price' : 'Override'} for ${row.name}`}
                        inputMode="decimal"
                        disabled={!canEdit}
                        className="pl-6 tabular-nums placeholder:text-muted-foreground/45 placeholder:italic"
                        aria-invalid={!!errors[row.id]}
                        placeholder={
                          !manual && row.ruleCents !== null ? centsToDollarInput(row.ruleCents) : ''
                        }
                        value={values[row.id] ?? ''}
                        onChange={(e) => {
                          setSavedCount(undefined);
                          setValues({ ...values, [row.id]: e.target.value });
                        }}
                      />
                    </div>
                    {errors[row.id] ? (
                      <p className="mt-1 text-xs text-destructive">{errors[row.id]}</p>
                    ) : null}
                  </td>
                  <td className="px-3 py-2 text-right font-medium tabular-nums">
                    {row.price ? formatCents(row.price.cents) : '—'}
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-2">
                      <SourceBadge row={row} manual={manual} />
                      {canEdit && typedValue(row) !== '' ? (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => setValues({ ...values, [row.id]: '' })}
                        >
                          {manual ? 'Remove' : 'Use rule'}
                        </Button>
                      ) : null}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {canEdit ? (
        <div className="flex flex-wrap items-center gap-3">
          <Button type="button" onClick={save} disabled={saving || changed.length === 0}>
            {saving
              ? 'Saving…'
              : `Save ${changed.length || ''} change${changed.length === 1 ? '' : 's'}`.replace(
                  '  ',
                  ' ',
                )}
          </Button>
          {changed.length > 0 ? (
            <Button
              type="button"
              variant="ghost"
              onClick={() =>
                setValues(Object.fromEntries(rows.map((row) => [row.id, typedValue(row)])))
              }
            >
              Discard
            </Button>
          ) : null}
          {savedCount !== undefined && changed.length === 0 ? (
            <span className="text-sm text-muted-foreground" role="status">
              Saved {savedCount} price{savedCount === 1 ? '' : 's'}. New orders use them; existing
              orders keep theirs.
            </span>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
