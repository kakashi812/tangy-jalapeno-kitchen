'use client';
import { useEffect, useTransition } from 'react';
import { useRouter } from 'next/navigation';
export function RefreshDashboard() {
  const router = useRouter();
  const [pending, transition] = useTransition();
  useEffect(() => {
    const timer = setInterval(() => {
      if (!pending && document.visibilityState === 'visible') transition(() => router.refresh());
    }, 30000);
    return () => clearInterval(timer);
  }, [pending, router]);
  return null;
}
