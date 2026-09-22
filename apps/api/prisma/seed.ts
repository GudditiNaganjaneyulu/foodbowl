import { PrismaClient } from '@prisma/client';
import argon2 from 'argon2';
import {
  ALL_PERMISSIONS,
  ALL_ROLES,
  DEFAULT_ROLE_PERMISSIONS,
  ROLES,
  PERMISSIONS,
} from '@foodbowl/shared';

const prisma = new PrismaClient();
const DEV_PASSWORD = 'Password123!';

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
  modifierGroups?: SeedModifierGroup[];
}
interface SeedCategory {
  name: string;
  items: SeedMenuItem[];
}

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

  console.log('Seeding menu...');
  const categoryDefs: SeedCategory[] = [
    { name: 'Starters', items: [
      { name: 'Crispy Spring Rolls', price: 5.99, isVeg: true },
      { name: 'Chicken Wings', price: 7.49, isVeg: false },
    ] },
    { name: 'Mains', items: [
      {
        name: 'Butter Chicken',
        price: 12.99,
        isVeg: false,
        // Demonstrates both a required single-select group (radio-style —
        // maxSelect 1) and an optional multi-select group (checkbox-style)
        // for the frontend's item customization sheet.
        modifierGroups: [
          {
            name: 'Spice Level',
            minSelect: 1,
            maxSelect: 1,
            required: true,
            modifiers: [
              { name: 'Mild', priceDelta: 0 },
              { name: 'Medium', priceDelta: 0 },
              { name: 'Hot', priceDelta: 0 },
            ],
          },
          {
            name: 'Add-ons',
            minSelect: 0,
            maxSelect: 3,
            required: false,
            modifiers: [
              { name: 'Extra Chicken', priceDelta: 2.5 },
              { name: 'Extra Gravy', priceDelta: 1.5 },
              { name: 'Butter Naan on the side', priceDelta: 2.99 },
            ],
          },
        ],
      },
      { name: 'Paneer Tikka Masala', price: 11.49, isVeg: true },
      {
        name: 'Veg Fried Rice',
        price: 9.99,
        isVeg: true,
        modifierGroups: [
          {
            name: 'Portion Size',
            minSelect: 1,
            maxSelect: 1,
            required: true,
            modifiers: [
              { name: 'Regular', priceDelta: 0 },
              { name: 'Large', priceDelta: 3.0 },
            ],
          },
        ],
      },
    ] },
    { name: 'Breads', items: [
      { name: 'Garlic Naan', price: 2.99, isVeg: true },
      { name: 'Tandoori Roti', price: 1.99, isVeg: true },
    ] },
    { name: 'Desserts', items: [
      { name: 'Gulab Jamun (2 pc)', price: 3.99, isVeg: true },
    ] },
    { name: 'Beverages', items: [
      { name: 'Mango Lassi', price: 3.49, isVeg: true },
      { name: 'Masala Chai', price: 2.49, isVeg: true },
    ] },
  ];

  const seededItems: { id: string; price: number; name: string }[] = [];
  for (const [i, cat] of categoryDefs.entries()) {
    const category = await prisma.category.upsert({
      where: { id: `seed-cat-${i}` },
      update: {},
      create: { id: `seed-cat-${i}`, restaurantId: restaurant.id, name: cat.name, sortOrder: i },
    });
    for (const [j, item] of cat.items.entries()) {
      const menuItem = await prisma.menuItem.upsert({
        where: { id: `seed-item-${i}-${j}` },
        update: {},
        create: {
          id: `seed-item-${i}-${j}`,
          categoryId: category.id,
          name: item.name,
          description: `Delicious ${item.name.toLowerCase()}, made fresh to order.`,
          price: item.price,
          isVeg: item.isVeg,
          sortOrder: j,
        },
      });
      seededItems.push({ id: menuItem.id, price: item.price, name: menuItem.name });

      for (const [k, group] of (item.modifierGroups ?? []).entries()) {
        const modifierGroup = await prisma.modifierGroup.upsert({
          where: { id: `seed-modgroup-${i}-${j}-${k}` },
          update: {},
          create: {
            id: `seed-modgroup-${i}-${j}-${k}`,
            menuItemId: menuItem.id,
            name: group.name,
            minSelect: group.minSelect,
            maxSelect: group.maxSelect,
            required: group.required,
          },
        });
        for (const [l, mod] of group.modifiers.entries()) {
          await prisma.modifier.upsert({
            where: { id: `seed-modifier-${i}-${j}-${k}-${l}` },
            update: {},
            create: {
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
