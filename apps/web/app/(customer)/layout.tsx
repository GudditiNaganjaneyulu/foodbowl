import { StorefrontLayout } from '@/components/layout/storefront-layout';

export default function CustomerLayout({ children }: { children: React.ReactNode }) {
  return <StorefrontLayout>{children}</StorefrontLayout>;
}
