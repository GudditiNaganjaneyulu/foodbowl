import { StorefrontHeader } from './storefront-header';
import { StorefrontFooter } from './storefront-footer';

/**
 * Shared chrome for the (public) and (customer) route groups — both are
 * "consumer-facing" surfaces, they just differ in whether a route requires
 * auth. Keeping one layout component avoids duplicating header/footer markup
 * across the two route group layout.tsx files.
 */
export function StorefrontLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col">
      <StorefrontHeader />
      <main className="flex-1">{children}</main>
      <StorefrontFooter />
    </div>
  );
}
