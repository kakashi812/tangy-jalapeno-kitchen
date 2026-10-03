'use client';

import { useRouter } from 'next/navigation';
import { KeyRound } from 'lucide-react';
import { Button } from '@/components/ui/button';

/**
 * "Show secret items": asks for a category's access code and reloads the menu with it. The API
 * decides whether the code opens anything (decision 21); a wrong code shows a message.
 */
export function SecretButton({ employeeId }: { employeeId: string }) {
  const router = useRouter();
  return (
    <Button
      variant="outline"
      onClick={() => {
        const code = window.prompt('Enter the access code for a secret category');
        if (code?.trim()) {
          router.push(
            `/menu/preview?employeeId=${employeeId}&code=${encodeURIComponent(code.trim())}`,
          );
        }
      }}
    >
      <KeyRound className="size-4" aria-hidden />
      Show secret items
    </Button>
  );
}
