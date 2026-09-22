import { StorefrontHeader } from './storefront-header';
import { StorefrontFooter } from './storefront-footer';
import { MobileBottomNav } from './mobile-bottom-nav';
import { StickyCartBar } from '@/components/menu/sticky-cart-bar';

/**
 * Shared chrome for the (public) and (customer) route groups — both are
 * "consumer-facing" surfaces, they just differ in whether a route requires
 * auth. Keeping one layout component avoids duplicating header/footer markup
 * across the two route group layout.tsx files.
 *
 * Mobile gets a fixed bottom tab bar (Swiggy/Zomato-style primary nav)
 * instead of relying on the header's hamburger menu; `pb-16` on the content
 * area keeps it from sitting underneath that fixed bar, and the footer is
 * hidden on mobile since it'd otherwise be squeezed between page content and
 * the nav bar.
 */
export function StorefrontLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col">
      <StorefrontHeader />
      <main className="flex-1 pb-16 md:pb-0">{children}</main>
      <div className="hidden md:block">
        <StorefrontFooter />
      </div>
      <StickyCartBar />
      <MobileBottomNav />
    </div>
  );
}
