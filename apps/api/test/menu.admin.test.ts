import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { deleteSince, resetBaseline } from './cleanup';
import { ACCOUNTS, SEED, describeDb, login, type Session } from './helpers';

let app: FastifyInstance;
let prisma: typeof import('../src/db/prisma').prisma;
let menu: Session, kitchen: Session, c1: Session;
const startedAt = new Date();
const createdCategoryIds: string[] = [];

const publicMenu = async () => (JSON.parse((await app.inject({ method: 'GET', url: '/api/v1/menu' })).body).categories as any[]);
const adminMenu = async () => (await menu.req('GET', '/api/v1/menu/admin')).body.categories as any[];
const allItems = (cats: any[]) => cats.flatMap((c) => c.menuItems);

describeDb('menu management (needs TEST_DATABASE_URL)', () => {
  beforeAll(async () => {
    const { buildApp } = await import('../src/app');
    ({ prisma } = await import('../src/db/prisma'));
    await resetBaseline(prisma);
    app = await buildApp();
    await app.ready();
    [menu, kitchen, c1] = await Promise.all([login(app, ACCOUNTS.staffMenu), login(app, ACCOUNTS.staffOrders), login(app, ACCOUNTS.customer1)]);
  });

  afterAll(async () => {
    await prisma.cartItem.deleteMany({ where: { cart: { userId: c1.userId } } });
    await prisma.category.deleteMany({ where: { id: { in: createdCategoryIds } } });
    await deleteSince(prisma, startedAt);
    await app.close();
  });

  it('requires menu.manage for the admin view and every write', async () => {
    for (const s of [kitchen, c1]) {
      expect((await s.req('GET', '/api/v1/menu/admin')).status).toBe(403);
      expect((await s.req('POST', '/api/v1/menu/categories', { name: 'x' })).status).toBe(403);
      expect((await s.req('PATCH', '/api/v1/menu/categories/seed-cat-0', { name: 'x' })).status).toBe(403);
      expect((await s.req('POST', '/api/v1/menu/items/seed-item-0-0/modifier-groups', {})).status).toBe(403);
      expect((await s.req('DELETE', '/api/v1/menu/modifier-groups/x')).status).toBe(403);
    }
    expect((await app.inject({ method: 'GET', url: '/api/v1/menu/admin' })).statusCode).toBe(401);
  });

  it('shows hidden categories and unavailable items to admins but not to the public', async () => {
    const created = await menu.req('POST', '/api/v1/menu/categories', { name: 'Test Specials', sortOrder: 99 });
    expect(created.status).toBe(201);
    createdCategoryIds.push(created.body.id);
    const catId = created.body.id as string;

    const item = await menu.req('POST', '/api/v1/menu/items', { categoryId: catId, name: 'Test Dish', price: 4.5, isAvailable: false });
    expect(item.status, JSON.stringify(item.body)).toBe(201);

    // Unavailable item: hidden from customers, visible to admins.
    expect(allItems(await publicMenu()).some((i) => i.id === item.body.id)).toBe(false);
    expect(allItems(await adminMenu()).find((i) => i.id === item.body.id)).toMatchObject({ name: 'Test Dish', isAvailable: false, price: '4.50' });

    // Make it available: now customers see it immediately.
    await menu.req('PATCH', `/api/v1/menu/items/${item.body.id}`, { isAvailable: true });
    expect(allItems(await publicMenu()).some((i) => i.id === item.body.id)).toBe(true);

    // Hide the whole category: gone from the public menu, still in the admin one.
    const hidden = await menu.req('PATCH', `/api/v1/menu/categories/${catId}`, { isActive: false, name: 'Renamed' });
    expect(hidden.body).toMatchObject({ isActive: false, name: 'Renamed' });
    expect((await publicMenu()).some((c) => c.id === catId)).toBe(false);
    expect((await adminMenu()).find((c) => c.id === catId)).toMatchObject({ isActive: false, name: 'Renamed' });
  });

  it('validates category updates and reports unknown ids as 404', async () => {
    expect((await menu.req('PATCH', '/api/v1/menu/categories/seed-cat-0', {})).status).toBe(400);
    expect((await menu.req('PATCH', '/api/v1/menu/categories/nope', { name: 'x' })).status).toBe(404);
    expect((await menu.req('PATCH', '/api/v1/menu/items/nope', { price: 1 })).status).toBe(404);
  });

  it('rejects an item in an unknown category', async () => {
    const res = await menu.req('POST', '/api/v1/menu/items', { categoryId: 'nope', name: 'x', price: 1 });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Unknown category/);
  });

  it('adds and removes modifier groups, and validates their rules', async () => {
    const cat = await menu.req('POST', '/api/v1/menu/categories', { name: 'Modifier Test' });
    createdCategoryIds.push(cat.body.id);
    const item = await menu.req('POST', '/api/v1/menu/items', { categoryId: cat.body.id, name: 'Custom Bowl', price: 8 });
    const itemId = item.body.id as string;
    const groupsUrl = `/api/v1/menu/items/${itemId}/modifier-groups`;

    expect((await menu.req('POST', groupsUrl, { name: 'Bad', minSelect: 3, maxSelect: 1, modifiers: [{ name: 'a' }] })).status).toBe(400);
    expect((await menu.req('POST', groupsUrl, { name: 'Empty required', required: true, modifiers: [] })).status).toBe(400);
    expect((await menu.req('POST', '/api/v1/menu/items/nope/modifier-groups', { name: 'x', modifiers: [] })).status).toBe(404);

    const group = await menu.req('POST', groupsUrl, {
      name: 'Size', minSelect: 1, maxSelect: 1, required: true,
      modifiers: [{ name: 'Small', priceDelta: 0 }, { name: 'Large', priceDelta: 2.5 }],
    });
    expect(group.status, JSON.stringify(group.body)).toBe(201);
    expect(group.body.modifiers.map((m: any) => [m.name, m.priceDelta])).toEqual(expect.arrayContaining([['Small', '0.00'], ['Large', '2.50']]));

    // The customer-facing flow now requires the choice…
    const noChoice = await c1.req('POST', '/api/v1/cart/items', { menuItemId: itemId });
    expect(noChoice.status).toBe(400);
    const large = group.body.modifiers.find((m: any) => m.name === 'Large').id;
    const withChoice = await c1.req('POST', '/api/v1/cart/items', {
      menuItemId: itemId, selectedModifiers: [{ modifierGroupId: group.body.id, modifierId: large }],
    });
    expect(withChoice.body.items[0]).toMatchObject({ unitPrice: '10.50' });

    // …and deleting the group leaves the cart line flagged, not broken.
    expect((await menu.req('DELETE', `/api/v1/menu/modifier-groups/${group.body.id}`)).status).toBe(204);
    const cart = (await c1.req('GET', '/api/v1/cart')).body;
    expect(cart.items[0]).toMatchObject({ available: false });
    expect(cart.subtotal).toBe('0.00');
    expect((await menu.req('DELETE', `/api/v1/menu/modifier-groups/${group.body.id}`)).status).toBe(404);
  });

  it('deletes an item and quietly removes it from carts', async () => {
    const cat = await menu.req('POST', '/api/v1/menu/categories', { name: 'Delete Test' });
    createdCategoryIds.push(cat.body.id);
    const item = await menu.req('POST', '/api/v1/menu/items', { categoryId: cat.body.id, name: 'Short Lived', price: 6 });
    await c1.req('DELETE', '/api/v1/cart');
    await c1.req('POST', '/api/v1/cart/items', { menuItemId: item.body.id });

    expect((await menu.req('DELETE', `/api/v1/menu/items/${item.body.id}`)).status).toBe(204);
    expect((await c1.req('GET', '/api/v1/cart')).body.items).toEqual([]);
    expect((await menu.req('DELETE', `/api/v1/menu/items/${item.body.id}`)).status).toBe(404);
  });

  it('refuses to delete an item that appears in past orders', async () => {
    const res = await menu.req('DELETE', `/api/v1/menu/items/${SEED.springRolls}`); // the seeded orders use it
    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/mark it unavailable/);
    expect(await prisma.menuItem.count({ where: { id: SEED.springRolls } })).toBe(1);
  });
});
