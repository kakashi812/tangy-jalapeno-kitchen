'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { TierSummary } from '@fernleaf/shared';
import { FormError } from '@/components/form/field';
import { Button } from '@/components/ui/button';
import { ApiRequestError } from '@/lib/api/api-error';
import { apiSend } from '@/lib/api/client';

/** Make default / delete, with the server's reason shown when it refuses. */
export function TierActions({ tier }: { tier: TierSummary }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();

  async function run(action: () => Promise<unknown>, after: () => void) {
    setPending(true);
    setError(undefined);
    try {
      await action();
      after();
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Could not reach the server.');
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {!tier.isDefault ? (
          <Button
            variant="outline"
            disabled={pending}
            onClick={() =>
              run(
                () => apiSend('POST', `/price-tiers/${tier.id}/make-default`),
                () => router.refresh(),
              )
            }
          >
            Make default tier
          </Button>
        ) : null}
        <Button
          variant="destructive"
          disabled={pending}
          onClick={() =>
            window.confirm(`Delete the ${tier.name} tier and its typed prices?`) &&
            run(
              () => apiSend('DELETE', `/price-tiers/${tier.id}`),
              () => {
                router.push('/pricing');
                router.refresh();
              },
            )
          }
        >
          Delete tier
        </Button>
      </div>
      <FormError message={error} />
    </div>
  );
}
