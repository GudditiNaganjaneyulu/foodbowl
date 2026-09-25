import { PrismaClient } from '@prisma/client';
import { access } from 'node:fs/promises';
import argon2 from 'argon2';
import {
  ALL_PERMISSIONS,
  ALL_ROLES,
  DEFAULT_ROLE_PERMISSIONS,
  ROLES,
  PERMISSIONS,
} from '@foodbowl/shared';
import { getStorage, usingSupabase } from '../src/lib/storage';
import { resolveStoragePath, uploadRoot } from '../src/lib/storage/local';

const prisma = new PrismaClient();
const DEV_PASSWORD = 'Password123!';

/**
 * The URL of a demo dish photo in file storage (the Supabase `menu-images`
 * bucket, folder `seed/` — credits in docs/MENU_PHOTO_CREDITS.md), or null if
 * it isn't actually there. The photos are NOT kept in this repository: they were
 * uploaded to the bucket once and the seed only references them, after checking
 * each exists, so a missing photo shows a placeholder rather than a broken image.
 */
const photoChecks = new Map<string, Promise<string | null>>();
function seedPhotoUrl(slug: string): Promise<string | null> {
  const storage = getStorage();
  if (!storage) return Promise.resolve(null);
  const url = storage.publicUrl('menu-images', `seed/${slug}.jpg`);
  if (!photoChecks.has(slug)) {
    photoChecks.set(
      slug,
      (async () => {
        if (/^https?:/.test(url)) {
          const res = await fetch(url, { method: 'HEAD' }).catch(() => null);
          return res?.ok ? url : null;
        }
        // Built-in storage: a path served by the API; check the file is on disk.
        const file = resolveStoragePath('menu-images', `seed/${slug}.jpg`);
        return file && (await access(file).then(() => true, () => false)) ? url : null;
      })(),
    );
  }
  return photoChecks.get(slug)!;
}

interface SeedModifier {
  name: string;
  priceDelta: number;
}
interface SeedModifierGroup {
  name: string;
  minSelect: number;
  maxSelect: number;
  required: boolean;
  modifiers: SeedModifier[];
}
interface SeedMenuItem {
  name: string;
  price: number;
  isVeg: boolean;
  description: string;
  /** Photo name in the storage bucket: menu-images/seed/<image>.jpg (credits: docs/MENU_PHOTO_CREDITS.md). */
  image?: string;
  modifierGroups?: SeedModifierGroup[];
}
interface SeedCategory {
  name: string;
  items: SeedMenuItem[];
}

const single = (name: string, options: [string, number][], required = true): SeedModifierGroup => ({
  name,
  minSelect: required ? 1 : 0,
  maxSelect: 1,
  required,
  modifiers: options.map(([n, priceDelta]) => ({ name: n, priceDelta })),
});
const multi = (name: string, options: [string, number][], maxSelect = options.length): SeedModifierGroup => ({
  name,
  minSelect: 0,
  maxSelect,
  required: false,
  modifiers: options.map(([n, priceDelta]) => ({ name: n, priceDelta })),
});

async function main() {
  console.log('Seeding roles + permissions...');
  const roles = new Map<string, string>();
  for (const key of ALL_ROLES) {
    const role = await prisma.role.upsert({
      where: { key },
      update: {},
      create: { key, name: key.replace(/_/g, ' ') },
    });
    roles.set(key, role.id);
  }

  const permissions = new Map<string, string>();
  for (const key of ALL_PERMISSIONS) {
    const permission = await prisma.permission.upsert({
      where: { key },
      update: {},
      create: { key, description: key },
    });
    permissions.set(key, permission.id);
  }

  for (const [roleKey, permissionKeys] of Object.entries(DEFAULT_ROLE_PERMISSIONS)) {
    const roleId = roles.get(roleKey)!;
    for (const permissionKey of permissionKeys) {
      await prisma.rolePermission.upsert({
        where: { roleId_permissionId: { roleId, permissionId: permissions.get(permissionKey)! } },
        update: {},
        create: { roleId, permissionId: permissions.get(permissionKey)! },
      });
    }
  }

  console.log('Seeding restaurant...');
  const restaurant = await prisma.restaurant.upsert({
    where: { id: 'seed-restaurant' },
    update: {},
    create: {
      id: 'seed-restaurant',
      name: 'FoodBowl Kitchen',
      description: 'Home-style comfort food, made fresh to order.',
      address: '221B Curry Lane, Flavor Town',
      phone: '+1-555-0100',
      isOpen: true,
      opensAt: '10:00',
      closesAt: '22:30',
      minOrderAmount: 5,
      deliveryFee: 2.5,
    },
  });

  console.log('Seeding demo users (dev password for all: %s)...', DEV_PASSWORD);
  const passwordHash = await argon2.hash(DEV_PASSWORD);

  const owner = await prisma.user.upsert({
    where: { email: 'owner@foodbowl.local' },
    update: {},
    create: {
      email: 'owner@foodbowl.local',
      name: 'Owner Olivia',
      passwordHash,
      roleId: roles.get(ROLES.RESTAURANT_OWNER)!,
    },
  });

  const staffOrders = await prisma.user.upsert({
    where: { email: 'staff.orders@foodbowl.local' },
    update: {},
    create: {
      email: 'staff.orders@foodbowl.local',
      name: 'Staff Sam (orders only)',
      passwordHash,
      roleId: roles.get(ROLES.STAFF)!,
    },
  });
  // "orders.manage only": the staff baseline is just orders.view, so without
  // this grant this account could see the queue but never act on it.
  await prisma.userPermission.upsert({
    where: {
      userId_permissionId: { userId: staffOrders.id, permissionId: permissions.get(PERMISSIONS.ORDERS_MANAGE)! },
    },
    update: { granted: true },
    create: { userId: staffOrders.id, permissionId: permissions.get(PERMISSIONS.ORDERS_MANAGE)!, granted: true },
  });
  // demonstrates per-user permission overrides: grant menu.manage beyond the staff baseline
  const staffMenuAndDelivery = await prisma.user.upsert({
    where: { email: 'staff.menu@foodbowl.local' },
    update: {},
    create: {
      email: 'staff.menu@foodbowl.local',
      name: 'Staff Priya (menu + delivery assign)',
      passwordHash,
      roleId: roles.get(ROLES.STAFF)!,
    },
  });
  for (const permKey of [PERMISSIONS.MENU_MANAGE, PERMISSIONS.DELIVERY_ASSIGN, PERMISSIONS.ORDERS_MANAGE]) {
    await prisma.userPermission.upsert({
      where: {
        userId_permissionId: { userId: staffMenuAndDelivery.id, permissionId: permissions.get(permKey)! },
      },
      update: { granted: true },
      create: { userId: staffMenuAndDelivery.id, permissionId: permissions.get(permKey)!, granted: true },
    });
  }

  const delivery1 = await prisma.user.upsert({
    where: { email: 'delivery1@foodbowl.local' },
    update: {},
    create: {
      email: 'delivery1@foodbowl.local',
      name: 'Delivery Dev',
      passwordHash,
      roleId: roles.get(ROLES.DELIVERY_PARTNER)!,
    },
  });
  const delivery2 = await prisma.user.upsert({
    where: { email: 'delivery2@foodbowl.local' },
    update: {},
    create: {
      email: 'delivery2@foodbowl.local',
      name: 'Delivery Dana',
      passwordHash,
      roleId: roles.get(ROLES.DELIVERY_PARTNER)!,
    },
  });

  const customers = [];
  for (const [i, name] of ['Casey Customer', 'Riley Regular', 'Jamie Jones'].entries()) {
    const customer = await prisma.user.upsert({
      where: { email: `customer${i + 1}@foodbowl.local` },
      update: {},
      create: {
        email: `customer${i + 1}@foodbowl.local`,
        name,
        passwordHash,
        roleId: roles.get(ROLES.CUSTOMER)!,
      },
    });
    await prisma.cart.upsert({
      where: { userId: customer.id },
      update: {},
      create: { userId: customer.id },
    });
    customers.push(customer);
  }

  console.log(
    'Seeding menu... photos are read from %s',
    usingSupabase() ? 'the Supabase menu-images bucket' : `built-in storage (${uploadRoot()})`,
  );
  // ORDER MATTERS within each category: item ids are `seed-item-<category>-<position>`,
  // so new dishes are appended to the end and never renumber existing ones.
  const categoryDefs: SeedCategory[] = [
    { name: 'Starters', items: [
      { name: 'Crispy Spring Rolls', price: 5.99, isVeg: true, image: 'crispy-spring-rolls',
        description: 'Golden, crunchy rolls stuffed with cabbage, carrot and glass noodles. Served with sweet chilli dip.' },
      { name: 'Chicken Wings', price: 7.49, isVeg: false, image: 'chicken-wings',
        description: 'Six juicy wings, fried crisp and tossed in your choice of sauce.',
        modifierGroups: [single('Sauce', [['Buffalo', 0], ['Smoky BBQ', 0], ['Honey Garlic', 0.5]]), single('Portion', [['6 pieces', 0], ['12 pieces', 6.5]])] },
      { name: 'Paneer Tikka', price: 8.49, isVeg: true, image: 'paneer-tikka',
        description: 'Cottage cheese cubes marinated in yoghurt and spices, charred in the tandoor with peppers and onion.',
        modifierGroups: [multi('Add-ons', [['Mint chutney', 0.5], ['Extra paneer', 2.5]])] },
      { name: 'Veg Samosa (2 pc)', price: 4.49, isVeg: true, image: 'veg-samosa',
        description: 'Flaky pastry filled with spiced potato and peas, served with green chutney.' },
    ] },
    { name: 'Mains', items: [
      {
        name: 'Butter Chicken', price: 12.99, isVeg: false, image: 'butter-chicken',
        description: 'Tandoori chicken simmered in a silky tomato-butter gravy. Our best seller.',
        // A required single-select group (radio-style) and an optional multi-select group (checkbox-style).
        modifierGroups: [
          single('Spice Level', [['Mild', 0], ['Medium', 0], ['Hot', 0]]),
          multi('Add-ons', [['Extra Chicken', 2.5], ['Extra Gravy', 1.5], ['Butter Naan on the side', 2.99]], 3),
        ],
      },
      { name: 'Paneer Tikka Masala', price: 11.49, isVeg: true, image: 'paneer-tikka-masala',
        description: 'Soft paneer in a rich, creamy tomato masala finished with kasuri methi.',
        modifierGroups: [single('Spice Level', [['Mild', 0], ['Medium', 0], ['Hot', 0]])] },
      { name: 'Veg Fried Rice', price: 9.99, isVeg: true, image: 'veg-fried-rice',
        description: 'Wok-tossed basmati rice with crunchy vegetables, spring onion and soy.',
        modifierGroups: [single('Portion Size', [['Regular', 0], ['Large', 3]])] },
      { name: 'Chicken Biryani', price: 13.49, isVeg: false, image: 'chicken-biryani',
        description: 'Fragrant basmati layered with marinated chicken, saffron and fried onions, slow-cooked dum style.',
        modifierGroups: [
          single('Spice Level', [['Mild', 0], ['Medium', 0], ['Hot', 0]]),
          multi('Add-ons', [['Boiled egg', 1], ['Raita', 1.5], ['Extra chicken', 3]]),
        ] },
      { name: 'Dal Makhani', price: 10.49, isVeg: true, image: 'dal-makhani',
        description: 'Black lentils and kidney beans simmered overnight with butter and cream.' },
      { name: 'Palak Paneer', price: 11.99, isVeg: true, image: 'palak-paneer',
        description: 'Cottage cheese in a smooth, lightly spiced spinach gravy.' },
      { name: 'Chole Bhature', price: 9.49, isVeg: true, image: 'chole-bhature',
        description: 'Spicy chickpea curry with two fluffy, deep-fried bhature. A Punjabi classic.',
        modifierGroups: [multi('Add-ons', [['Extra bhatura', 1.5], ['Pickled onions', 0.5]])] },
    ] },
    { name: 'Breads', items: [
      { name: 'Garlic Naan', price: 2.99, isVeg: true, image: 'garlic-naan',
        description: 'Soft tandoor-baked naan brushed with garlic butter and coriander.' },
      { name: 'Tandoori Roti', price: 1.99, isVeg: true, image: 'tandoori-roti',
        description: 'Whole-wheat flatbread baked fresh in the clay oven.' },
      { name: 'Butter Naan', price: 2.79, isVeg: true, image: 'butter-naan',
        description: 'Pillowy naan glazed with melted butter.' },
      { name: 'Aloo Paratha', price: 4.99, isVeg: true, image: 'aloo-paratha',
        description: 'Whole-wheat flatbread stuffed with spiced mashed potato, pan-fried with ghee.',
        modifierGroups: [multi('Add-ons', [['Extra butter', 0.5], ['Curd', 1], ['Pickle', 0.5]])] },
    ] },
    { name: 'Desserts', items: [
      { name: 'Gulab Jamun (2 pc)', price: 3.99, isVeg: true, image: 'gulab-jamun',
        description: 'Warm milk-solid dumplings soaked in cardamom-rose syrup.' },
      { name: 'Rasmalai (2 pc)', price: 4.99, isVeg: true, image: 'rasmalai',
        description: 'Soft paneer discs in chilled saffron-pistachio milk.' },
      { name: 'Jalebi', price: 3.99, isVeg: true, image: 'jalebi',
        description: 'Crisp, syrup-soaked spirals, fried fresh to order.' },
    ] },
    { name: 'Beverages', items: [
      { name: 'Mango Lassi', price: 3.49, isVeg: true, image: 'mango-lassi',
        description: 'Thick, chilled yoghurt drink blended with Alphonso mango.',
        modifierGroups: [single('Size', [['Regular', 0], ['Large', 1.5]])] },
      { name: 'Masala Chai', price: 2.49, isVeg: true, image: 'masala-chai',
        description: 'Assam tea simmered with milk, ginger and whole spices.',
        modifierGroups: [single('Sugar', [['Regular', 0], ['Less sugar', 0], ['No sugar', 0]])] },
      { name: 'Sweet Lassi', price: 2.99, isVeg: true, image: 'sweet-lassi',
        description: 'Classic chilled yoghurt lassi, lightly sweetened.',
        modifierGroups: [single('Size', [['Regular', 0], ['Large', 1.5]])] },
      { name: 'Cold Coffee', price: 3.99, isVeg: true, image: 'cold-coffee',
        description: 'Iced coffee blended thick with milk and a swirl of chocolate.',
        modifierGroups: [multi('Add-ons', [['Extra shot', 1], ['Ice cream', 1.5]])] },
    ] },
    // Appended last so it doesn't renumber the ids above; sortOrder still puts it first.
    { name: 'Breakfast', items: [
      { name: 'Masala Dosa', price: 6.49, isVeg: true, image: 'masala-dosa',
        description: 'Crisp fermented rice-and-lentil crêpe filled with spiced potato, with sambar and coconut chutney.',
        modifierGroups: [multi('Extra chutneys', [['Tomato chutney', 0.5], ['Mint chutney', 0.5]])] },
      { name: 'Idli Sambar (3 pc)', price: 5.49, isVeg: true, image: 'idli-sambar',
        description: 'Steamed, fluffy rice cakes with lentil sambar and coconut chutney.' },
    ] },
  ];
  // Where each category sits in the menu. Breakfast leads; the rest keep their original order.
  const categorySort: Record<string, number> = { Breakfast: -1 };

  const seededItems: { id: string; price: number; name: string }[] = [];
  for (const [i, cat] of categoryDefs.entries()) {
    // Match an existing category by NAME first, so re-seeding a database where someone
    // already created e.g. "Breakfast" through the admin screen adds to it instead of duplicating.
    const existingCategory = await prisma.category.findFirst({ where: { restaurantId: restaurant.id, name: cat.name } });
    const category =
      existingCategory ??
      (await prisma.category.create({
        data: { id: `seed-cat-${i}`, restaurantId: restaurant.id, name: cat.name, sortOrder: categorySort[cat.name] ?? i },
      }));

    for (const [j, item] of cat.items.entries()) {
      const existingItem = await prisma.menuItem.findFirst({ where: { categoryId: category.id, name: item.name } });
      const menuItem =
        existingItem ??
        (await prisma.menuItem.create({
          data: {
            id: `seed-item-${i}-${j}`,
            categoryId: category.id,
            name: item.name,
            description: item.description,
            price: item.price,
            isVeg: item.isVeg,
            sortOrder: j,
          },
        }));
      seededItems.push({ id: menuItem.id, price: item.price, name: menuItem.name });

      // Upgrade the old generic description, and fill in a missing photo — but never
      // overwrite a description or photo an owner has set themselves.
      await prisma.menuItem.updateMany({
        where: { id: menuItem.id, description: { startsWith: 'Delicious ', endsWith: 'made fresh to order.' } },
        data: { description: item.description },
      });
      if (item.image) {
        // Also replaces a legacy "/menu/…" path (photos used to ship inside the web app).
        const needsPhoto = await prisma.menuItem.count({
          where: { id: menuItem.id, OR: [{ imageUrl: null }, { imageUrl: { startsWith: '/menu/' } }] },
        });
        if (needsPhoto) {
          const url = await seedPhotoUrl(item.image);
          if (url) await prisma.menuItem.update({ where: { id: menuItem.id }, data: { imageUrl: url } });
          else console.warn('  ! no photo found in storage for %s (menu-images/seed/%s.jpg) — leaving it without one', item.name, item.image);
        }
      }

      for (const [k, group] of (item.modifierGroups ?? []).entries()) {
        const groupId = `seed-modgroup-${i}-${j}-${k}`;
        // Skip if this item already has a group with that name (e.g. from an earlier seed).
        const hasGroup = await prisma.modifierGroup.findFirst({ where: { menuItemId: menuItem.id, name: group.name } });
        if (hasGroup) continue;
        const modifierGroup = await prisma.modifierGroup.create({
          data: {
            id: groupId,
            menuItemId: menuItem.id,
            name: group.name,
            minSelect: group.minSelect,
            maxSelect: group.maxSelect,
            required: group.required,
          },
        });
        for (const [l, mod] of group.modifiers.entries()) {
          await prisma.modifier.create({
            data: {
              id: `seed-modifier-${i}-${j}-${k}-${l}`,
              modifierGroupId: modifierGroup.id,
              name: mod.name,
              priceDelta: mod.priceDelta,
            },
          });
        }
      }
    }
  }

  console.log('Seeding sample addresses + orders...');
  const address = await prisma.address.upsert({
    where: { id: 'seed-address-1' },
    update: {},
    create: {
      id: 'seed-address-1',
      userId: customers[0]!.id,
      label: 'Home',
      line1: '42 Wallaby Way',
      city: 'Flavor Town',
      state: 'CA',
      postalCode: '90210',
      isDefault: true,
    },
  });

  const item = seededItems[0]!;
  const existingOrder = await prisma.order.findUnique({ where: { id: 'seed-order-delivered' } });
  if (!existingOrder) {
    await prisma.order.create({
      data: {
        id: 'seed-order-delivered',
        orderNumber: 'FB-1001',
        userId: customers[0]!.id,
        addressId: address.id,
        status: 'DELIVERED',
        subtotal: item.price,
        deliveryFee: 2.5,
        total: item.price + 2.5,
        paymentStatus: 'COLLECTED',
        deliveredAt: new Date(),
        items: {
          create: [
            {
              menuItemId: item.id,
              nameSnapshot: item.name,
              priceSnapshot: item.price,
              quantity: 1,
              lineTotal: item.price,
            },
          ],
        },
        statusLogs: {
          create: [{ toStatus: 'DELIVERED', changedByUserId: delivery1.id, note: 'Seed data' }],
        },
      },
    });
  }

  const liveOrder = await prisma.order.findUnique({ where: { id: 'seed-order-live' } });
  if (!liveOrder) {
    await prisma.order.create({
      data: {
        id: 'seed-order-live',
        orderNumber: 'FB-1002',
        userId: customers[1]!.id,
        addressId: (await prisma.address.upsert({
          where: { id: 'seed-address-2' },
          update: {},
          create: {
            id: 'seed-address-2',
            userId: customers[1]!.id,
            label: 'Work',
            line1: '10 Downing Court',
            city: 'Flavor Town',
            state: 'CA',
            postalCode: '90211',
            isDefault: true,
          },
        })).id,
        status: 'PLACED',
        subtotal: item.price,
        deliveryFee: 2.5,
        total: item.price + 2.5,
        items: {
          create: [
            {
              menuItemId: item.id,
              nameSnapshot: item.name,
              priceSnapshot: item.price,
              quantity: 2,
              lineTotal: item.price * 2,
            },
          ],
        },
        statusLogs: { create: [{ toStatus: 'PLACED', changedByUserId: customers[1]!.id }] },
      },
    });
  }

  console.log('\nSeed complete. Dev accounts (all use password: %s):', DEV_PASSWORD);
  console.table([
    { role: 'restaurant_owner', email: owner.email },
    { role: 'staff (orders.manage only)', email: staffOrders.email },
    { role: 'staff (+ menu.manage, delivery.assign)', email: staffMenuAndDelivery.email },
    { role: 'delivery_partner', email: delivery1.email },
    { role: 'delivery_partner', email: delivery2.email },
    ...customers.map((c) => ({ role: 'customer', email: c.email })),
  ]);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
