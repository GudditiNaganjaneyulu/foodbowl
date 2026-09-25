import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';
import '../styles/globals.css';
import { ThemeProvider } from '@/components/theme-provider';
import { AuthProvider } from '@/lib/auth-context';
import { CartProvider } from '@/lib/cart-context';
import { SocketProvider } from '@/lib/socket';
import { ToastProvider } from '@/components/ui/toaster';

const inter = Inter({ subsets: ['latin'], variable: '--font-sans' });

export const metadata: Metadata = {
  title: {
    default: 'FoodBowl',
    template: '%s · FoodBowl',
  },
  description: 'Order fresh, home-style food from FoodBowl Kitchen.',
};

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#fef7f0' },
    { media: '(prefers-color-scheme: dark)', color: '#1c1512' },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${inter.variable} font-sans antialiased`}>
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
          <ToastProvider>
            <AuthProvider>
              <SocketProvider>
                <CartProvider>{children}</CartProvider>
              </SocketProvider>
            </AuthProvider>
          </ToastProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
