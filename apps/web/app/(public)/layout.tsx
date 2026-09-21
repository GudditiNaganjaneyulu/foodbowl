import { StorefrontLayout } from '@/components/layout/storefront-layout';

export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return <StorefrontLayout>{children}</StorefrontLayout>;
}
