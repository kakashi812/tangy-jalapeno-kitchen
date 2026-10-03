import type { Metadata } from 'next';
import { inter, lusitana } from '@/lib/fonts';
import { cn } from '@/lib/utils';
import './globals.css';

export const metadata: Metadata = {
  title: { default: 'Fernleaf Kitchen', template: '%s · Fernleaf Kitchen' },
  description: 'Kitchen operations admin panel',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={cn(inter.variable, lusitana.variable)}>
      <body className="min-h-dvh antialiased">{children}</body>
    </html>
  );
}
