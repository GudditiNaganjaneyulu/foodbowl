import Link from 'next/link';

export function StorefrontFooter() {
  return (
    <footer className="border-t border-border">
      <div className="container flex flex-col items-center justify-between gap-4 py-8 text-sm text-muted-foreground md:flex-row">
        <p>© {new Date().getFullYear()} FoodBowl Kitchen. Testing/learning project — not a real business.</p>
        <div className="flex items-center gap-4">
          <Link href="/" className="hover:text-foreground">
            Menu
          </Link>
          <Link href="/login" className="hover:text-foreground">
            Staff login
          </Link>
        </div>
      </div>
    </footer>
  );
}
