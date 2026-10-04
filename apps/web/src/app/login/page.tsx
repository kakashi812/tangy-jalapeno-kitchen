import type { Metadata } from 'next';
import { safeNextPath } from '@/lib/forms';
import { LoginForm } from './login-form';

export const metadata: Metadata = { title: 'Sign in' };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;
  return (
    <main className="flex min-h-dvh items-center justify-center bg-sidebar p-4">
      <div className="w-full max-w-sm space-y-6 rounded-xl border bg-card p-6 shadow-sm">
        <div className="space-y-1">
          <h1 className="font-heading text-2xl font-bold">Fernleaf Kitchen</h1>
          <p className="text-sm text-muted-foreground">Sign in to the operations panel.</p>
        </div>
        <LoginForm next={safeNextPath(next)} />
      </div>
    </main>
  );
}
