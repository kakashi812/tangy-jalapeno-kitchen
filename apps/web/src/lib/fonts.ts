import { Inter, Lusitana } from 'next/font/google';

/**
 * next/font downloads the fonts at build time and serves them from our own domain (no request to
 * Google from the browser, no layout shift). Each font is exposed as a CSS variable that
 * globals.css maps to Tailwind's font-sans (body) and font-heading (headings).
 */
export const inter = Inter({ subsets: ['latin'], variable: '--font-inter' });

export const lusitana = Lusitana({
  subsets: ['latin'],
  weight: ['400', '700'],
  variable: '--font-lusitana',
});
