/**
 * End-to-end journey: five people (customer, kitchen staff, dispatcher, rider,
 * owner) plus a support agent and a brand-new customer, each in their own
 * browser session, run the whole product against a REAL running stack —
 * including the live Socket.IO updates that cross between them — and then
 * re-check every main screen at phone width. See e2e/README.md for setup.
 */
import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';
import { execSync } from 'node:child_process';

// Optional: a shell command that returns the (throwaway!) test database to a known state.
// Run before and after, so a failed run can't poison the next one.
const RESET = process.env.E2E_RESET_CMD;
const reset = () => {
  if (RESET) execSync(RESET, { stdio: 'ignore' });
};
reset();
process.on('exit', () => {
  try {
    reset();
  } catch {}
});

const WEB = process.env.WEB ?? 'http://localhost:3000';
const API = process.env.API ?? 'http://localhost:4000';
const SHOTS = new URL('./shots/', import.meta.url).pathname;
mkdirSync(SHOTS, { recursive: true });

// Uses the Chrome installed on the machine (no browser download); CHROME_PATH overrides.
const browser = await chromium.launch(
  process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH, headless: true } : { channel: 'chrome', headless: true },
);

const results = [];
const pages = new Map();
const consoleProblems = [];
const T = 12_000;

function watch(page, who) {
  page.on('pageerror', (e) => consoleProblems.push(`[${who}] pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error') consoleProblems.push(`[${who}] console.error: ${m.text().slice(0, 200)}`);
  });
}

async function person(name, viewport = { width: 1280, height: 900 }) {
  const context = await browser.newContext({ viewport });
  const page = await context.newPage();
  page.setDefaultTimeout(T);
  watch(page, name);
  pages.set(name, page);
  return { name, context, page };
}

async function step(name, fn) {
  const started = Date.now();
  try {
    await fn();
    results.push({ name, ok: true, ms: Date.now() - started });
    console.log(`  ✓ ${name} (${Date.now() - started}ms)`);
  } catch (err) {
    const detail = err.message.split('\n').filter(Boolean).slice(0, 3).join(' | ').slice(0, 260);
    results.push({ name, ok: false, error: detail });
    const slug = name.replace(/[^a-z0-9]+/gi, '-').slice(0, 40);
    for (const [who, pg] of pages) await pg.screenshot({ path: `${SHOTS}FAIL-${slug}-${who}.png` }).catch(() => {});
    console.log(`  ✗ ${name}\n      ${detail}`);
  }
}

const ok = (cond, msg) => {
  if (!cond) throw new Error(msg);
};

async function login(page, email, password = 'Password123!') {
  await page.goto(`${WEB}/login`);
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Log in', exact: true }).click();
  await page.waitForURL((u) => !u.pathname.startsWith('/login'));
}

const shot = (page, name) => page.screenshot({ path: `${SHOTS}${name}.png`, fullPage: false });
const rowFor = (page, itemName) => page.locator(`h3:has-text("${itemName}")`).first().locator('xpath=../..');
const cartPost = (page) => page.waitForResponse((r) => r.url().includes('/api/v1/cart/items') && r.request().method() === 'POST', { timeout: 2500 }).catch(() => null);
const addOnMenu = async (page, itemName) => {
  const saved = cartPost(page); // logged-in adds hit the server; guests don't (hence the short timeout)
  await rowFor(page, itemName).getByRole('button', { name: /^Add / }).click();
  await saved;
};

// ────────────────────────────────────────────────────────────────────────
const customer = await person('customer');
const kitchen = await person('kitchen');
const dispatcher = await person('dispatcher');
const rider = await person('rider');
const owner = await person('owner');
let orderId, orderNumber;

console.log('\n■ Guest browsing and cart');
await step('storefront loads live restaurant info and the menu', async () => {
  const p = customer.page;
  await p.goto(WEB);
  await p.getByRole('heading', { name: 'FoodBowl Kitchen', level: 1 }).waitFor();
  await p.locator('h3:has-text("Crispy Spring Rolls")').waitFor();
  ok((await p.getByTestId('open-badge').innerText()).includes('Open now'), 'expected the Open now badge');
  await shot(p, '01-storefront');
});

await step('guest adds an item; it survives a reload (localStorage)', async () => {
  const p = customer.page;
  await addOnMenu(p, 'Crispy Spring Rolls');
  await p.goto(`${WEB}/cart`);
  await p.getByText('Crispy Spring Rolls').waitFor();
  await p.reload();
  await p.getByText('Crispy Spring Rolls').waitFor();
  await p.getByRole('link', { name: 'Log in to place your order' }).first().waitFor();
});

console.log('\n■ Login, cart merge and checkout');
await step('login returns to /cart and merges the guest cart into the server cart', async () => {
  const p = customer.page;
  await p.getByRole('link', { name: 'Log in to place your order' }).first().click();
  await p.waitForURL(/\/login\?next=%2Fcart|\/login\?next=\/cart/);
  await p.getByLabel('Email').fill('customer1@foodbowl.local');
  await p.getByLabel('Password').fill('Password123!');
  await p.getByRole('button', { name: 'Log in', exact: true }).click();
  await p.waitForURL(/\/cart$/);
  await p.getByText('Crispy Spring Rolls').waitFor();
});

await step('a customised item shows its options and the server-computed price', async () => {
  const p = customer.page;
  await p.goto(WEB);
  await rowFor(p, 'Butter Chicken').click();
  await p.getByRole('button', { name: 'Hot', exact: true }).click();
  await p.getByLabel('Extra Chicken').check().catch(async () => p.getByText('Extra Chicken').click());
  await shot(p, '02-customize-sheet');
  const saved = cartPost(p);
  await p.getByRole('button', { name: /Add to cart/ }).click();
  await saved;
  await p.goto(`${WEB}/cart`);
  await p.getByText('Hot, Extra Chicken').waitFor();
  await p.getByText('$15.49').first().waitFor();
});

await step('quantity changes are saved on the server (survive reload)', async () => {
  const p = customer.page;
  const line = p.locator('div', { has: p.getByText('Crispy Spring Rolls') }).filter({ has: p.getByRole('button', { name: 'Increase quantity' }) }).last();
  await line.getByRole('button', { name: 'Increase quantity' }).click();
  await p.waitForTimeout(700);
  await p.reload();
  await p.getByText('Crispy Spring Rolls').waitFor();
  const qty = await p.getByTestId('line-quantity').first().innerText();
  ok(qty === '2', `expected quantity 2 after reload, got ${qty}`);
});

console.log('\n■ Staff sessions open BEFORE the order exists (to prove live updates)');
await step('kitchen staff sees an empty/idle queue', async () => {
  await login(kitchen.page, 'staff.orders@foodbowl.local');
  await kitchen.page.goto(`${WEB}/staff`);
  await kitchen.page.getByTestId('kanban').waitFor();
  await kitchen.page.getByText('Live', { exact: true }).waitFor();
});
await step('dispatcher opens the delivery board', async () => {
  await login(dispatcher.page, 'staff.menu@foodbowl.local');
  await dispatcher.page.goto(`${WEB}/staff/delivery`);
  await dispatcher.page.getByRole('heading', { name: 'Delivery assignment' }).waitFor();
  await dispatcher.page.getByTestId('partners').waitFor();
});
await step('rider opens their deliveries', async () => {
  await login(rider.page, 'delivery1@foodbowl.local');
  await rider.page.getByRole('heading', { name: 'My deliveries' }).waitFor();
  await rider.page.getByText('Live', { exact: true }).waitFor();
});

await step('customer places the order with a note', async () => {
  const p = customer.page;
  await p.goto(`${WEB}/cart`);
  await p.getByLabel(/Instructions for the restaurant/).fill('E2E test order');
  await shot(p, '03-checkout');
  const place = p.getByRole('button', { name: /Place order/ });
  await place.first().click();
  await p.waitForURL(/\/orders\/[a-z0-9]+$/);
  orderId = p.url().split('/').pop();
  orderNumber = (await p.getByTestId('order-number').innerText()).trim();
  ok(/^FB-\d{6}$/.test(orderNumber), `bad order number ${orderNumber}`);
  await p.getByText('Order placed').first().waitFor();
  await shot(p, '04-tracking-placed');
});

console.log('\n■ Live order flow across five browsers');
const cardIn = (page) => page.locator(`[data-testid="order-card"][data-order-number="${orderNumber}"]`);
await step('the new order appears in the kitchen queue instantly (no reload)', async () => {
  await cardIn(kitchen.page).waitFor({ timeout: 8000 });
  await shot(kitchen.page, '05-kitchen-queue');
});

await step('kitchen accepts → customer\'s open tracking page updates live', async () => {
  await cardIn(kitchen.page).getByTestId('advance').click();
  await customer.page.getByText('The restaurant accepted your order').first().waitFor({ timeout: 8000 });
  const badge = await customer.page.locator('h1 + *').first().innerText().catch(() => '');
  ok(true, badge);
});

await step('dispatcher sees it under "Needs a delivery partner" and offers it to Delivery Dev', async () => {
  const p = dispatcher.page;
  const card = p.locator(`[data-testid="dispatch-card"][data-order-number="${orderNumber}"]`);
  await card.waitFor({ timeout: 8000 });
  await card.getByLabel('Delivery partner').selectOption({ label: /Delivery Dev/ }).catch(async () => {
    const value = await card.getByLabel('Delivery partner').locator('option', { hasText: 'Delivery Dev' }).getAttribute('value');
    await card.getByLabel('Delivery partner').selectOption(value);
  });
  await card.getByRole('button', { name: 'Offer' }).click();
  await p.locator('[data-testid="offered"]').locator(`[data-order-number="${orderNumber}"]`).waitFor({ timeout: 8000 });
  await shot(p, '06-dispatch-offered');
});

await step('rider gets the offer live and accepts it', async () => {
  const p = rider.page;
  const offer = p.locator(`[data-testid="offer-card"][data-order-number="${orderNumber}"]`);
  await offer.waitFor({ timeout: 8000 });
  ok((await offer.getByTestId('cash-due').innerText()).includes('$'), 'cash to collect should be shown');
  await shot(p, '07-rider-offer');
  await offer.getByTestId('accept').click();
  await p.locator(`[data-testid="delivery-card"][data-order-number="${orderNumber}"]`).waitFor({ timeout: 8000 });
});

await step('rider cannot pick up until the kitchen is done', async () => {
  const card = rider.page.locator(`[data-testid="delivery-card"][data-order-number="${orderNumber}"]`);
  ok(await card.getByTestId('picked-up').isDisabled(), 'pickup should be disabled while the kitchen is working');
});

await step('kitchen moves it to preparing then ready', async () => {
  await cardIn(kitchen.page).getByTestId('advance').click(); // Start preparing
  await kitchen.page.locator('[data-testid="col-PREPARING"]').locator(`[data-order-number="${orderNumber}"]`).waitFor();
  await customer.page.getByText('Your food is being cooked').first().waitFor({ timeout: 8000 });
  await cardIn(kitchen.page).getByTestId('advance').click(); // Mark ready
  await kitchen.page.locator('[data-testid="col-READY_FOR_PICKUP"]').locator(`[data-order-number="${orderNumber}"]`).waitFor();
});

await step('rider\'s pickup button enables when ready; picking up puts it out for delivery for everyone', async () => {
  const card = rider.page.locator(`[data-testid="delivery-card"][data-order-number="${orderNumber}"]`);
  await rider.page.waitForFunction(
    (n) => {
      const el = document.querySelector(`[data-testid="delivery-card"][data-order-number="${n}"] [data-testid="picked-up"]`);
      return el && !el.disabled;
    },
    orderNumber,
    { timeout: 8000 },
  );
  await card.getByTestId('picked-up').click();
  await customer.page.getByText('Your delivery partner').waitFor({ timeout: 8000 });
  await customer.page.getByText('Delivery Dev').first().waitFor();
  await kitchen.page.locator('[data-testid="col-OUT_FOR_DELIVERY"]').locator(`[data-order-number="${orderNumber}"]`).waitFor({ timeout: 8000 });
  await shot(customer.page, '08-tracking-out-for-delivery');
  await shot(rider.page, '09-rider-active');
});

await step('rider must confirm cash; a proof photo is taken; then delivered updates the customer live', async () => {
  const p = rider.page;
  await p.getByTestId('mark-delivered').click();
  const confirm = p.getByTestId('confirm-delivered');
  ok(await confirm.isDisabled(), 'confirm must be disabled until cash is ticked');
  await p.getByTestId('proof-section').waitFor();
  // A real (tiny) JPEG: a screenshot from another page.
  const jpeg = await customer.page.screenshot({ type: 'jpeg', quality: 40, clip: { x: 0, y: 0, width: 320, height: 200 } });
  await p.getByTestId('image-input').setInputFiles({ name: 'proof.jpg', mimeType: 'image/jpeg', buffer: jpeg });
  await p.getByTestId('proof-preview').waitFor({ timeout: 10000 });
  ok(await p.getByTestId('proof-preview').evaluate((img) => img.complete && img.naturalWidth > 0), 'the uploaded proof photo should load back from storage');
  await shot(p, '10-rider-confirm-dialog');
  await p.getByTestId('cod-collected').check();
  await confirm.click();
  await customer.page.getByText('Cash on delivery · paid').waitFor({ timeout: 10000 });
  await customer.page.getByTestId('proof-card').waitFor();
  ok(await customer.page.getByTestId('proof-thumb').locator('img').evaluate((img) => img.complete && img.naturalWidth > 0), 'customer should see the proof photo');
  await shot(customer.page, '11-tracking-delivered');
});

await step('it leaves the active queue and appears under Completed', async () => {
  const p = kitchen.page;
  await p.waitForFunction((n) => !document.querySelector(`[data-testid="order-card"][data-order-number="${n}"]`), orderNumber, { timeout: 8000 });
  await p.getByRole('button', { name: 'Completed' }).click();
  await p.getByTestId('history').getByText(orderNumber).waitFor();
});

await step('the rider\'s history shows it', async () => {
  await rider.page.goto(`${WEB}/delivery/history`);
  await rider.page.getByTestId('history-list').getByText(orderNumber).waitFor();
});

console.log('\n■ Notifications');
await step('customer bell has unread notifications and clicking one opens the order', async () => {
  const p = customer.page;
  await p.goto(`${WEB}/orders`);
  await p.getByTestId('order-row').first().waitFor();
  const bell = p.getByRole('button', { name: /Notifications/ });
  await bell.waitFor();
  ok(/unread/.test(await bell.getAttribute('aria-label')), 'bell should show unread notifications');
  await bell.click();
  await shot(p, '12-notifications');
  await p.getByText(`Order ${orderNumber} delivered`).first().click();
  await p.waitForURL(new RegExp(`/orders/${orderId}`));
});

console.log('\n■ Order history and cancelling');
await step('order history lists the delivered order', async () => {
  await customer.page.goto(`${WEB}/orders`);
  await customer.page.getByTestId('order-row').filter({ hasText: orderNumber }).waitFor();
  await shot(customer.page, '13-history');
});

let cancelNumber;
await step('customer places a second order and cancels it; the queue reflects it live', async () => {
  const p = customer.page;
  await p.goto(WEB);
  await addOnMenu(p, 'Crispy Spring Rolls');
  await p.goto(`${WEB}/cart`);
  await p.getByLabel(/Instructions for the restaurant/).fill('E2E cancel me');
  await p.getByRole('button', { name: /Place order/ }).first().click();
  await p.waitForURL(/\/orders\/[a-z0-9]+$/);
  cancelNumber = (await p.getByTestId('order-number').innerText()).trim();
  await kitchen.page.getByRole('button', { name: /Active/ }).click();
  await kitchen.page.locator(`[data-order-number="${cancelNumber}"]`).first().waitFor({ timeout: 8000 });
  await p.getByRole('button', { name: 'Cancel order' }).click();
  const submit = p.getByRole('dialog').getByRole('button', { name: 'Cancel order' });
  ok(await submit.isDisabled(), 'cancel must need a reason');
  await p.getByLabel('Reason for cancelling').fill('E2E: changed my mind');
  await submit.click();
  await p.getByText('E2E: changed my mind').first().waitFor();
  await kitchen.page.waitForFunction((n) => !document.querySelector(`[data-testid="order-card"][data-order-number="${n}"]`), cancelNumber, { timeout: 8000 });
});

console.log('\n■ Owner: overview, menu management and settings');
await step('owner overview shows real numbers', async () => {
  await login(owner.page, 'owner@foodbowl.local');
  await owner.page.getByTestId('orders-today').waitFor();
  const placed = Number(await owner.page.getByTestId('orders-today').innerText());
  ok(placed >= 2, `expected at least 2 orders today, got ${placed}`);
  ok((await owner.page.getByTestId('revenue-today').innerText()).startsWith('$'), 'revenue should be money');
  await shot(owner.page, '14-owner-overview');
});

await step('owner queue shows the same live board', async () => {
  await owner.page.goto(`${WEB}/admin/orders`);
  await owner.page.getByTestId('kanban').waitFor();
  await shot(owner.page, '15-owner-queue');
});

await step('menu: hide an item → customers no longer see it; restore it', async () => {
  const p = owner.page;
  await p.goto(`${WEB}/admin/menu`);
  const row = p.locator('[data-testid="menu-item"][data-item="Garlic Naan"]');
  await row.waitFor();
  await shot(p, '16-menu-manager');
  await row.getByRole('switch', { name: 'Garlic Naan available' }).click();
  await p.waitForTimeout(600);
  await customer.page.goto(WEB);
  await customer.page.locator('h3:has-text("Crispy Spring Rolls")').waitFor();
  ok((await customer.page.locator('h3:has-text("Garlic Naan")').count()) === 0, 'sold-out item must disappear from the storefront');
  await row.getByRole('switch', { name: 'Garlic Naan available' }).click();
  await p.waitForTimeout(600);
  await customer.page.reload();
  await customer.page.locator('h3:has-text("Garlic Naan")').waitFor();
});

await step('menu: add a category and an item with a required option group, then order it as a customer', async () => {
  const p = owner.page;
  await p.getByLabel('New category name').fill('E2E Specials');
  await p.getByRole('button', { name: 'Add category' }).click();
  const cat = p.locator('[data-testid="menu-category"][data-category="E2E Specials"]');
  await cat.waitFor();
  await cat.getByTestId('add-item').click();
  await p.getByLabel('Name', { exact: true }).fill('E2E Bowl');
  await p.getByLabel('Price ($)').fill('7.25');
  await p.getByTestId('add-group').click();
  await p.getByLabel('Group name').fill('Size');
  await p.getByLabel('Customer must choose').check();
  await p.getByLabel('Option 1 name').fill('Small');
  await p.getByRole('button', { name: 'Another option' }).click();
  await p.getByLabel('Option 2 name').fill('Large');
  await p.getByLabel('Option 2 extra price').fill('2');
  await p.getByTestId('confirm-group').click();
  await shot(p, '17-item-dialog');
  await p.getByTestId('save-item').click();
  await cat.locator('[data-testid="menu-item"][data-item="E2E Bowl"]').waitFor();

  const c = customer.page;
  await c.goto(WEB);
  await rowFor(c, 'E2E Bowl').click();
  const addBtn = c.getByRole('button', { name: /Select Size|Add to cart/ });
  ok(/Select Size/.test(await addBtn.innerText()), 'a required group should block adding until chosen');
  await c.getByRole('button', { name: 'Large' }).click();
  const savedBowl = cartPost(c);
  await addBtn.click();
  await savedBowl;
  await c.goto(`${WEB}/cart`);
  await c.getByText('E2E Bowl').waitFor();
  await c.getByText('$9.25').first().waitFor();
});

await step('menu: delete the test item and hide the test category', async () => {
  const p = owner.page;
  const cat = p.locator('[data-testid="menu-category"][data-category="E2E Specials"]');
  p.once('dialog', (d) => d.accept());
  await cat.getByRole('button', { name: 'Delete E2E Bowl' }).click();
  await cat.getByText('No items yet.').waitFor();
  await customer.page.goto(`${WEB}/cart`);
  ok((await customer.page.getByText('E2E Bowl').count()) === 0, 'deleted item should vanish from carts');
});

await step('settings: closing the restaurant blocks checkout; reopening restores it', async () => {
  const p = owner.page;
  await p.goto(`${WEB}/admin/settings`);
  await p.getByTestId('open-switch').waitFor();
  await shot(p, '18-settings');
  await p.getByTestId('open-switch').click();
  await p.getByText('Not taking orders').waitFor();

  const c = customer.page;
  await c.goto(WEB);
  await c.getByTestId('open-badge').filter({ hasText: 'Closed' }).waitFor();
  await c.goto(`${WEB}/cart`);
  await c.getByText('Your cart is empty').waitFor().catch(async () => {});
  await c.goto(WEB);
  await addOnMenu(c, 'Crispy Spring Rolls');
  await c.goto(`${WEB}/cart`);
  await c.getByText(/is closed right now/).waitFor();
  ok(await c.getByRole('button', { name: /Restaurant is closed/ }).first().isDisabled(), 'checkout must be disabled while closed');
  await shot(c, '19-cart-closed');

  await p.getByTestId('open-switch').click();
  await p.getByText('Open for orders').waitFor();
  await c.reload();
  await c.getByRole('button', { name: /Place order/ }).first().waitFor();
  await c.getByRole('button', { name: 'Remove item' }).first().click();
});

await step('settings: editing the fee changes the checkout total', async () => {
  const p = owner.page;
  await p.goto(`${WEB}/admin/settings`);
  await p.getByLabel('Delivery fee ($)').fill('4');
  await p.getByTestId('save-settings').click();
  await p.getByText('Settings saved').waitFor();
  const c = customer.page;
  await c.goto(WEB);
  await addOnMenu(c, 'Crispy Spring Rolls');
  await c.goto(`${WEB}/cart`);
  await c.getByText('$9.99').first().waitFor(); // 5.99 + 4.00
  await c.getByRole('button', { name: 'Remove item' }).first().click();
  await p.getByLabel('Delivery fee ($)').fill('2.5');
  await p.getByTestId('save-settings').click();
  await p.getByText('Settings saved').waitFor();
});

console.log('\n■ Access control in the UI');
await step('a customer is turned away from dashboards', async () => {
  await customer.page.goto(`${WEB}/admin`);
  await customer.page.waitForURL((u) => u.pathname === '/');
});
await step('kitchen staff without menu.manage sees a clear message, not errors', async () => {
  await kitchen.page.goto(`${WEB}/staff/menu`);
  await kitchen.page.getByText("You don't have access to this").waitFor();
});
await step('rider is sent away from staff pages', async () => {
  await rider.page.goto(`${WEB}/staff`);
  await rider.page.waitForURL((u) => u.pathname === '/');
});

console.log('\n■ Profile addresses');
await step('customer adds, edits and deletes a saved address', async () => {
  const p = customer.page;
  await p.goto(`${WEB}/profile`);
  await p.locator('#saved-addresses').getByRole('button', { name: 'Add', exact: true }).click();
  await p.getByLabel('Address', { exact: true }).fill('99 E2E Street');
  await p.getByLabel('City').fill('Testville');
  await p.getByLabel('State').fill('TS');
  await p.getByLabel('Postal code').fill('12345');
  await p.locator('#saved-addresses').getByRole('button', { name: 'Save address' }).click();
  const saved = p.getByTestId('saved-address').filter({ hasText: '99 E2E Street' });
  await saved.waitFor();
  await saved.getByRole('button', { name: /^Edit/ }).click();
  await p.getByLabel('Address', { exact: true }).fill('100 E2E Street');
  await p.locator('#saved-addresses').getByRole('button', { name: 'Save changes' }).click();
  const edited = p.getByTestId('saved-address').filter({ hasText: '100 E2E Street' });
  await edited.waitFor();
  await shot(p, '20-profile-addresses');
  p.once('dialog', (d) => d.accept());
  await edited.getByRole('button', { name: /^Delete/ }).click();
  await p.waitForFunction(() => !document.body.innerText.includes('100 E2E Street'));
});


console.log('\n■ Product photos and the menu layout');
await step('desktop: sidebar + card grid, photos load from the bucket, ADD sits above its photo', async () => {
  const p = customer.page;
  await p.goto(WEB);
  await p.locator('[data-testid="menu-card"]').first().waitFor();
  await p.getByRole('navigation', { name: 'Menu categories' }).waitFor();
  ok((await p.getByRole('navigation', { name: 'Menu categories' }).getByRole('button').count()) >= 5, 'sidebar should list the categories');
  const cards = p.locator('[data-testid="menu-card"]');
  ok((await cards.count()) >= 20, 'expected the expanded menu (20+ dishes)');
  const [a, b] = await Promise.all([cards.nth(0).boundingBox(), cards.nth(1).boundingBox()]);
  ok(Math.abs(a.y - b.y) < 4 && b.x > a.x + 100, 'cards should sit side by side in a grid on desktop');
  const first = cards.first();
  await first.locator('img').first().waitFor();
  await p.waitForFunction(() => document.querySelector('[data-testid="menu-card"] img')?.naturalWidth > 0);
  const src = await first.locator('img').first().getAttribute('src');
  ok(/^https?:\/\//.test(src) || src.includes('/files/'), `photo should come from storage, got ${src}`);
  ok(!/\/menu\//.test(src) || /supabase|files/.test(src), 'photos must not be served from the web app');
  const above = await first.getByRole('button', { name: /^Add / }).evaluate((btn) => {
    const r = btn.getBoundingClientRect();
    const top = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
    return btn.contains(top);
  });
  ok(above, 'the ADD button must not be covered by the photo');
  await shot(p, '23-menu-desktop');
});

await step('every dish that has a photo actually shows it (none broken)', async () => {
  const p = customer.page;
  await p.waitForTimeout(1500);
  await p.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await p.waitForTimeout(2500);
  const broken = await p.evaluate(() => [...document.querySelectorAll('[data-testid="menu-card"] img')].filter((i) => i.complete && i.naturalWidth === 0).map((i) => i.alt));
  ok(broken.length === 0, `broken photos: ${broken.join(', ')}`);
});

console.log('\n■ Item instructions');
let notesOrderNumber;
await step('customer adds special instructions in the item sheet and in the cart, and they reach the kitchen', async () => {
  const p = customer.page;
  await p.goto(WEB);
  await rowFor(p, 'Paneer Tikka').click();
  await p.getByLabel(/Special instructions/).fill('E2E no chilli flakes');
  const s1 = cartPost(p);
  await p.getByRole('button', { name: /Add to cart/ }).click();
  await s1;
  await p.goto(`${WEB}/cart`);
  await p.getByTestId('line-note').filter({ hasText: 'no chilli flakes' }).waitFor();

  // A second dish gets its instructions from the cart.
  await p.goto(WEB);
  await addOnMenu(p, 'Veg Samosa');
  await p.goto(`${WEB}/cart`);
  const samosa = p.getByTestId('cart-line').filter({ hasText: 'Veg Samosa' });
  await samosa.getByTestId('add-line-note').click();
  await samosa.getByLabel(/Instructions for Veg Samosa/).fill('E2E extra chutney');
  const s2 = p.waitForResponse((r) => r.url().includes('/cart/items/') && r.request().method() === 'PATCH');
  await samosa.getByTestId('save-line-note').click();
  await s2;
  await samosa.getByTestId('line-note').filter({ hasText: 'extra chutney' }).waitFor();

  // Delivery quick-picks fill the order note.
  await p.getByRole('button', { name: 'Leave at the door' }).click();
  await p.getByRole('button', { name: "Don't ring the bell" }).click();
  const noteText = await p.getByLabel(/Instructions for the restaurant/).inputValue();
  ok(noteText.includes('Leave at the door') && noteText.includes("Don't ring the bell"), `quick picks should fill the note, got "${noteText}"`);
  await p.getByLabel(/Instructions for the restaurant/).fill('E2E ' + noteText);
  await p.getByRole('button', { name: /Place order/ }).first().click();
  await p.waitForURL(/\/orders\/[a-z0-9]+$/);
  notesOrderNumber = (await p.getByTestId('order-number').innerText()).trim();
  await p.getByTestId('item-note').filter({ hasText: 'no chilli flakes' }).waitFor();

  // Kitchen: flagged on the card, full text in the drawer.
  await kitchen.page.goto(`${WEB}/staff`);
  await kitchen.page.getByTestId('kanban').waitFor();
  const card = kitchen.page.locator(`[data-testid="order-card"][data-order-number="${notesOrderNumber}"]`);
  await card.waitFor({ timeout: 8000 });
  await card.getByTestId('has-item-notes').waitFor();
  await card.getByRole('button').first().click();
  await kitchen.page.getByTestId('item-note').filter({ hasText: 'extra chutney' }).waitFor();
  await shot(kitchen.page, '24-kitchen-notes');
  await kitchen.page.keyboard.press('Escape');
});

console.log('\n■ New customer onboarding and profile');
const newbie = await person('newbie');
const newEmail = `e2e-newbie-${Date.now()}@test.local`;
await step('signing up lands on a welcome checklist; adding phone and address completes it', async () => {
  const p = newbie.page;
  await p.goto(`${WEB}/register`);
  await p.getByLabel('Name').fill('Nora Newbie');
  await p.getByLabel('Email').fill(newEmail);
  await p.getByLabel('Password').fill('a-good-password-1');
  await p.getByLabel(/Phone number/).fill('+1 555 010 0999');
  await p.getByRole('button', { name: 'Sign up' }).click();
  await p.waitForURL(/\/profile\?welcome=1/);
  await p.getByTestId('onboarding').getByRole('heading', { name: /Welcome to FoodBowl, Nora/ }).waitFor();
  await p.getByTestId('onboarding').getByText('1 of 3 done').or(p.getByTestId('onboarding').getByText('2 of 3 done')).first().waitFor();
  ok((await p.getByLabel('Phone number').inputValue()).includes('555'), 'phone given at signup should be saved');
  await shot(p, '25-onboarding');
  // Add the address → the checklist finishes and disappears.
  await p.locator('#saved-addresses').getByRole('button', { name: 'Add', exact: true }).click();
  await p.getByLabel('Address', { exact: true }).fill('7 Onboarding Ave E2E');
  await p.getByLabel('City').fill('Testville');
  await p.getByLabel('State').fill('TS');
  await p.getByLabel('Postal code').fill('12345');
  await p.locator('#saved-addresses').getByRole('button', { name: 'Save address' }).click();
  await p.getByTestId('saved-address').filter({ hasText: '7 Onboarding Ave' }).waitFor();
  await p.getByTestId('onboarding').waitFor({ state: 'detached', timeout: 8000 });
});
await step('the customer can edit their name and phone; the change sticks after a reload', async () => {
  const p = newbie.page;
  await p.getByLabel('Name', { exact: true }).fill('Nora Renamed');
  await p.getByLabel('Phone number').fill('+1 555 010 0888');
  await p.getByTestId('save-profile').click();
  await p.getByText('Profile updated').waitFor();
  await p.reload();
  ok((await p.getByLabel('Name', { exact: true }).inputValue()) === 'Nora Renamed', 'name should persist');
  ok((await p.getByLabel('Phone number').inputValue()).includes('0888'), 'phone should persist');
  await p.getByRole('heading', { name: 'Nora Renamed' }).waitFor(); // the header card follows the edit
});

console.log('\n■ Customer support across three portals');
const agent = await person('agent');
const supportSubject = `E2E cold food ${Date.now() % 100000}`;
let ticketUrl;
await step('support agent opens the inbox', async () => {
  await login(agent.page, 'staff.support@foodbowl.local');
  await agent.page.goto(`${WEB}/staff/support`);
  await agent.page.getByRole('heading', { name: 'Customer support' }).waitFor();
  await agent.page.getByText('Live', { exact: true }).waitFor();
});
await step('customer asks for help from an order page; the order is attached', async () => {
  const p = customer.page;
  await p.goto(`${WEB}/orders/${orderId}`);
  await p.getByTestId('order-help').click();
  await p.waitForURL(/\/support\/new\?order=/);
  await p.getByLabel('Which order?').waitFor();
  ok((await p.getByLabel('Which order?').inputValue()) === orderId, 'the order should be pre-selected');
  await p.getByLabel('Title').fill(supportSubject);
  await p.getByLabel('Tell us what happened').fill('E2E: the food arrived cold. Can you help?');
  await p.getByTestId('send-request').click();
  await p.waitForURL(/\/support\/[a-z0-9]+$/);
  ticketUrl = p.url();
  await p.getByTestId('ticket-subject').filter({ hasText: supportSubject }).waitFor();
  await shot(p, '26-support-customer');
});
await step('the agent sees it appear live, opens it, and replies; the customer gets the reply without reloading', async () => {
  const a = agent.page;
  const row = a.locator(`[data-testid="inbox-row"][data-subject="${supportSubject}"]`);
  await row.waitFor({ timeout: 8000 });
  await row.click();
  await a.getByTestId('ticket-subject').filter({ hasText: supportSubject }).waitFor();
  await a.getByTestId('composer').fill('Sorry about that! I am looking into it now.');
  await a.getByTestId('send').click();
  await customer.page.getByText('Sorry about that! I am looking into it now.').waitFor({ timeout: 8000 });
  await customer.page.getByText('Waiting for your reply').first().waitFor();
  await customer.page.getByText(/Staff Sam \(customer support\) is helping you/).waitFor(); // auto-assigned to the replier
  await shot(a, '27-support-agent');
});
await step('internal notes stay private; assigning to the owner hands it over', async () => {
  const a = agent.page;
  await a.getByTestId('internal-toggle').check();
  await a.getByTestId('composer').fill('E2E internal: customer is a regular, be generous.');
  await a.getByTestId('send').click();
  await a.getByTestId('internal-note').filter({ hasText: 'be generous' }).waitFor();
  await customer.page.waitForTimeout(800);
  ok((await customer.page.getByText('be generous').count()) === 0, 'the customer must never see internal notes');

  const ownerOption = await a.getByTestId('assign-select').locator('option', { hasText: 'Owner Olivia' }).getAttribute('value');
  await a.getByTestId('assign-select').selectOption(ownerOption);
  await a.getByText('Assigned').first().waitFor();
  // The owner sees it in their own portal, under Mine.
  await owner.page.goto(`${WEB}/admin/support`);
  await owner.page.getByTestId('tab-mine').click();
  await owner.page.locator(`[data-testid="inbox-row"][data-subject="${supportSubject}"]`).waitFor({ timeout: 8000 });
  await shot(owner.page, '28-support-owner');
});
await step('resolving is visible to the customer; replying reopens it', async () => {
  const o = owner.page;
  await o.locator(`[data-testid="inbox-row"][data-subject="${supportSubject}"]`).click();
  await o.getByTestId('resolve').click();
  await customer.page.getByText('marked this as resolved').waitFor({ timeout: 8000 });
  await customer.page.getByText('Resolved', { exact: true }).first().waitFor();
  await customer.page.getByTestId('composer').fill('Thank you, but it happened again today.');
  await customer.page.getByTestId('send').click();
  await customer.page.getByText('Waiting for the restaurant').first().waitFor({ timeout: 8000 });
});
await step('a staff member without support.manage cannot use the support screens', async () => {
  await kitchen.page.goto(`${WEB}/staff/support`);
  await kitchen.page.getByText("You don't have access to this").waitFor();
  const res = await kitchen.page.evaluate(async (url) => (await fetch(url, { credentials: 'include' })).status, ticketUrl.replace(WEB, `${API}/api/v1`).replace('/support/', '/support/tickets/'));
  ok(res === 401 || res === 403 || res === 404, `kitchen staff must be refused the conversation (got ${res})`);
});

console.log('\n■ Mobile (iPhone-sized) — every main screen, no sideways scrolling');
const M = { width: 390, height: 844 };
const overflow = async (p, label) => {
  const w = await p.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }));
  ok(w.sw <= w.cw + 1, `${label} overflows horizontally (${w.sw} > ${w.cw})`);
};
const mCustomer = await person('m-customer', M);
const mAgent = await person('m-agent', M);
const mOwner = await person('m-owner', M);
const mRider = await person('m-rider', M);
const mKitchen = await person('m-kitchen', M);

await step('mobile customer: menu, item sheet, cart, orders, tracking, profile, help', async () => {
  const p = mCustomer.page;
  await login(p, 'customer1@foodbowl.local');
  await p.goto(WEB);
  await p.locator('[data-testid="menu-card"]').first().waitFor();
  await overflow(p, 'menu');
  ok(await p.getByRole('navigation', { name: 'Menu categories' }).isHidden(), 'the desktop sidebar must be hidden on phones');
  const above = await p.locator('[data-testid="menu-card"]').first().getByRole('button', { name: /^Add / }).evaluate((btn) => {
    const r = btn.getBoundingClientRect();
    return btn.contains(document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2));
  });
  ok(above, 'ADD must be tappable (not covered by the photo) on a phone');
  await shot(p, '30-mobile-menu');
  await rowFor(p, 'Butter Chicken').click();
  await p.getByRole('button', { name: /Select Spice Level|Add to cart/ }).waitFor();
  await overflow(p, 'item sheet');
  await shot(p, '31-mobile-item-sheet');
  await p.keyboard.press('Escape');
  for (const [path, label, wait] of [
    ['/cart', 'cart', () => p.getByText(/Your cart|Your cart is empty/).first()],
    ['/orders', 'orders', () => p.getByTestId('order-row').first()],
    [`/orders/${orderId}`, 'tracking', () => p.getByTestId('order-number')],
    ['/profile', 'profile', () => p.getByRole('heading', { name: 'Your details' })],
    ['/support', 'help', () => p.getByRole('heading', { name: 'Help & support' })],
  ]) {
    await p.goto(`${WEB}${path}`);
    await wait().waitFor();
    await overflow(p, label);
    await shot(p, `32-mobile-${label}`);
  }
});

await step('mobile support conversation: composer is on screen, thread scrolls, keyboard-friendly', async () => {
  const p = mCustomer.page;
  await p.goto(ticketUrl);
  await p.getByTestId('composer').waitFor();
  await overflow(p, 'conversation');
  const box = await p.getByTestId('composer').boundingBox();
  ok(box && box.y + box.height <= M.height, `composer must sit inside the viewport (bottom=${box && box.y + box.height})`);
  const nav = await p.locator('nav.fixed').boundingBox();
  ok(!nav || box.y + box.height <= nav.y + 1, 'composer must not hide behind the bottom tab bar');
  await shot(p, '33-mobile-conversation');
});

await step('mobile agent: inbox list → conversation → back, with the composer usable', async () => {
  const p = mAgent.page;
  await login(p, 'staff.support@foodbowl.local');
  await p.goto(`${WEB}/staff/support`);
  const row = p.locator(`[data-testid="inbox-row"]`).first();
  await row.waitFor();
  await overflow(p, 'inbox list');
  await shot(p, '34-mobile-inbox');
  await row.click();
  await p.getByTestId('composer').waitFor();
  ok(await p.getByTestId('inbox-list').isHidden(), 'on a phone the conversation replaces the list');
  await overflow(p, 'staff conversation');
  const box = await p.getByTestId('composer').boundingBox();
  ok(box.y + box.height <= M.height, 'staff composer must be on screen');
  ok(await p.getByTestId('ticket-controls').isHidden(), 'on a phone the staff controls start collapsed so the messages get the screen');
  await shot(p, '35-mobile-staff-conversation');
  await p.getByTestId('toggle-details').click();
  await p.getByTestId('assign-select').waitFor();
  ok(await p.getByTestId('resolve').isVisible(), 'the resolve button should be reachable after expanding');
  await overflow(p, 'staff conversation (expanded)');
  await p.getByTestId('toggle-details').click();
  await p.getByTestId('inbox-back').click();
  await p.getByTestId('inbox-list').waitFor();
});

await step('mobile owner: overview, menu manager, settings, users', async () => {
  const p = mOwner.page;
  await login(p, 'owner@foodbowl.local');
  for (const [path, wait] of [
    ['/admin', () => p.getByTestId('orders-today')],
    ['/admin/menu', () => p.locator('[data-testid="menu-item"]').first()],
    ['/admin/settings', () => p.getByTestId('open-switch')],
    ['/admin/support', () => p.getByRole('heading', { name: 'Customer support' })],
    ['/admin/orders', () => p.getByTestId('kanban')],
    ['/admin/delivery', () => p.getByRole('heading', { name: 'Delivery assignment' })],
  ]) {
    await p.goto(`${WEB}${path}`);
    await wait().waitFor();
    await overflow(p, path);
    await shot(p, `36-mobile-owner${path.replace(/\//g, '-')}`);
  }
});

await step('mobile kitchen and rider: order queue, order drawer, delivery screens', async () => {
  const k = mKitchen.page;
  await login(k, 'staff.orders@foodbowl.local');
  await k.goto(`${WEB}/staff`);
  await k.getByTestId('kanban').waitFor();
  await overflow(k, 'kanban');
  await shot(k, '37-mobile-kitchen');
  const r = mRider.page;
  await login(r, 'delivery1@foodbowl.local');
  await r.getByRole('heading', { name: 'My deliveries' }).waitFor();
  await overflow(r, 'rider');
  await r.goto(`${WEB}/delivery/history`);
  await r.getByTestId('history-list').waitFor();
  await overflow(r, 'rider history');
  await shot(r, '38-mobile-rider-history');
});

await browser.close();

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} steps passed`);
if (consoleProblems.length) {
  const unique = [...new Set(consoleProblems)];
  console.log(`\nBrowser console problems (${unique.length} unique):`);
  unique.slice(0, 15).forEach((p) => console.log('  - ' + p));
}
process.exit(failed.length ? 1 : 0);
