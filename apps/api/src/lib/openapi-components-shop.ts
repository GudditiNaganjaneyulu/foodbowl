import { ALL_PERMISSIONS, ALL_ROLES, ORDER_STATUS, SUPPORT_CATEGORIES, SUPPORT_STATUSES } from '@foodbowl/shared';
import { ref, type JsonSchema } from './openapi';

const ORDER_STATUSES = Object.values(ORDER_STATUS);
const cuid = (description: string): JsonSchema => ({ type: 'string', description, example: 'cm0abc123def456' });
const money = (description: string, example: string): JsonSchema => ({
  type: 'string',
  description: `${description} Two-place decimal string.`,
  example,
});
const timestamp = (description: string): JsonSchema => ({ type: 'string', format: 'date-time', description });
const nullableTimestamp = (description: string): JsonSchema => ({ ...timestamp(description), nullable: true });

/** Schemas for the cart / order / delivery / notification endpoints. Mirrors packages/shared/src/dto.ts. */
export const shopComponentSchemas: Record<string, JsonSchema> = {
  Me: {
    type: 'object',
    properties: {
      id: cuid('User id.'),
      email: { type: 'string', format: 'email' },
      name: { type: 'string' },
      phone: { type: 'string', nullable: true },
      role: { type: 'string', enum: ALL_ROLES },
      permissions: { type: 'array', items: { type: 'string', enum: ALL_PERMISSIONS } },
    },
  },

  Address: {
    type: 'object',
    properties: {
      id: cuid('Address id.'),
      label: { type: 'string', example: 'Home' },
      line1: { type: 'string', example: '42 Wallaby Way' },
      line2: { type: 'string', nullable: true },
      city: { type: 'string' },
      state: { type: 'string' },
      postalCode: { type: 'string' },
      lat: { type: 'number', nullable: true },
      lng: { type: 'number', nullable: true },
      isDefault: { type: 'boolean' },
    },
  },

  Restaurant: {
    type: 'object',
    properties: {
      id: cuid('Restaurant id.'),
      name: { type: 'string', example: 'FoodBowl Kitchen' },
      description: { type: 'string', nullable: true },
      logoUrl: { type: 'string', nullable: true },
      address: { type: 'string', nullable: true },
      phone: { type: 'string', nullable: true },
      isOpen: {
        type: 'boolean',
        description: "The owner's open/closed switch. This alone decides whether orders are accepted.",
      },
      opensAt: { type: 'string', nullable: true, example: '10:00', description: 'Informational 24h HH:MM.' },
      closesAt: { type: 'string', nullable: true, example: '22:30' },
      minOrderAmount: money('Minimum item subtotal to place an order.', '5.00'),
      deliveryFee: money('Flat delivery fee added to every order.', '2.50'),
    },
  },

  CartModifier: {
    type: 'object',
    properties: {
      modifierGroupId: cuid('Modifier group id.'),
      modifierId: cuid('Modifier id.'),
      name: { type: 'string', example: 'Extra cheese' },
      priceDelta: money('Added to the unit price.', '1.50'),
    },
  },

  CartItem: {
    type: 'object',
    properties: {
      id: cuid('Cart line id — use this in PATCH/DELETE /cart/items/{id}.'),
      menuItemId: cuid('Menu item id.'),
      name: { type: 'string' },
      isVeg: { type: 'boolean' },
      imageUrl: { type: 'string', nullable: true },
      quantity: { type: 'integer', example: 2 },
      note: { type: 'string', nullable: true },
      modifiers: { type: 'array', items: ref('CartModifier') },
      unitPrice: money('Base price plus modifiers, at current menu prices.', '15.49'),
      lineTotal: money('unitPrice × quantity.', '30.98'),
      available: {
        type: 'boolean',
        description:
          'False when the item was hidden or disabled (or its chosen options removed) after it was added. Unavailable lines are excluded from the subtotal and block checkout until removed.',
      },
    },
  },

  Cart: {
    type: 'object',
    properties: {
      items: { type: 'array', items: ref('CartItem') },
      itemCount: { type: 'integer', description: 'Sum of quantities of available items.' },
      subtotal: money('Sum of available line totals.', '30.98'),
    },
  },

  OrderItem: {
    type: 'object',
    description: 'A snapshot taken when the order was placed — later menu edits never change it.',
    properties: {
      id: cuid('Order item id.'),
      menuItemId: cuid('Menu item id.'),
      name: { type: 'string' },
      imageUrl: { type: 'string', nullable: true, description: "The dish's current photo." },
      note: { type: 'string', nullable: true, description: "The customer's special instructions for this item." },
      unitPrice: money('Unit price including modifiers, at order time.', '15.49'),
      quantity: { type: 'integer' },
      modifiers: {
        type: 'array',
        items: {
          type: 'object',
          properties: { name: { type: 'string' }, priceDelta: money('Price delta.', '1.50') },
        },
      },
      lineTotal: money('unitPrice × quantity.', '30.98'),
    },
  },

  OrderStatusLog: {
    type: 'object',
    properties: {
      id: cuid('Log entry id.'),
      fromStatus: { type: 'string', enum: ORDER_STATUSES, nullable: true },
      toStatus: { type: 'string', enum: ORDER_STATUSES },
      note: { type: 'string', nullable: true },
      createdAt: timestamp('When the change happened.'),
      changedBy: {
        type: 'object',
        nullable: true,
        properties: {
          id: cuid('User id.'),
          name: { type: 'string' },
          role: { type: 'string', enum: ALL_ROLES },
        },
      },
    },
  },

  Delivery: {
    type: 'object',
    properties: {
      id: cuid('Assignment id.'),
      status: { type: 'string', enum: ['OFFERED', 'ACCEPTED', 'REJECTED', 'PICKED_UP', 'DELIVERED'] },
      deliveryPartner: {
        type: 'object',
        properties: { id: cuid('Partner user id.'), name: { type: 'string' }, phone: { type: 'string', nullable: true } },
      },
      assignedAt: timestamp('When it was offered.'),
      acceptedAt: nullableTimestamp('When the partner accepted.'),
      pickedUpAt: nullableTimestamp('When the partner collected the order.'),
      deliveredAt: nullableTimestamp('When it was handed over.'),
      codCollected: { type: 'boolean' },
      proofImageUrl: { type: 'string', nullable: true },
    },
  },

  Order: {
    type: 'object',
    properties: {
      id: cuid('Order id.'),
      orderNumber: { type: 'string', example: 'FB-482913', description: 'Human-friendly number shown to customers.' },
      status: { type: 'string', enum: ORDER_STATUSES },
      subtotal: money('Items total.', '30.98'),
      deliveryFee: money('Delivery fee.', '2.50'),
      discount: money('Discount (always 0 in v1).', '0.00'),
      total: money('subtotal + deliveryFee − discount. Payable in cash on delivery.', '33.48'),
      paymentMethod: { type: 'string', enum: ['COD'] },
      paymentStatus: { type: 'string', enum: ['PENDING', 'COLLECTED'] },
      placedAt: timestamp('When the order was placed.'),
      deliveredAt: nullableTimestamp('When it was delivered.'),
      cancelledAt: nullableTimestamp('When it was cancelled.'),
      cancellationReason: { type: 'string', nullable: true },
      notes: { type: 'string', nullable: true },
      customer: {
        type: 'object',
        properties: {
          id: cuid('Customer user id.'),
          name: { type: 'string' },
          email: { type: 'string', format: 'email' },
          phone: { type: 'string', nullable: true },
        },
      },
      address: {
        type: 'object',
        properties: {
          id: cuid('Address id.'),
          label: { type: 'string' },
          line1: { type: 'string' },
          line2: { type: 'string', nullable: true },
          city: { type: 'string' },
          state: { type: 'string' },
          postalCode: { type: 'string' },
          lat: { type: 'number', nullable: true },
          lng: { type: 'number', nullable: true },
        },
      },
      items: { type: 'array', items: ref('OrderItem') },
      delivery: { allOf: [ref('Delivery')], nullable: true },
      statusLogs: {
        type: 'array',
        description: 'Full status history, oldest first. Present on `GET /orders/{id}` and realtime events only.',
        items: ref('OrderStatusLog'),
      },
    },
  },

  DeliveryAssignment: {
    type: 'object',
    allOf: [ref('Delivery'), { type: 'object', properties: { order: ref('Order') } }],
  },

  DeliveryPartner: {
    type: 'object',
    properties: {
      id: cuid('Partner user id.'),
      name: { type: 'string' },
      email: { type: 'string', format: 'email' },
      phone: { type: 'string', nullable: true },
      activeAssignments: {
        type: 'integer',
        description: 'Assignments currently OFFERED, ACCEPTED or PICKED_UP.',
      },
    },
  },

  Notification: {
    type: 'object',
    properties: {
      id: cuid('Notification id.'),
      type: { type: 'string', example: 'order.status_changed' },
      title: { type: 'string' },
      body: { type: 'string' },
      isRead: { type: 'boolean' },
      metadata: { type: 'object', additionalProperties: true },
      createdAt: timestamp('When it was created.'),
    },
  },

  SupportMessage: {
    type: 'object',
    properties: {
      id: cuid('Message id.'),
      ticketId: cuid('Conversation id.'),
      kind: { type: 'string', enum: ['TEXT', 'SYSTEM'], description: 'SYSTEM = an event ("marked as resolved"), not written by a person.' },
      body: { type: 'string' },
      isInternal: { type: 'boolean', description: 'Staff-only note. Never returned to customers.' },
      sender: {
        type: 'object',
        nullable: true,
        properties: { id: cuid('User id.'), name: { type: 'string' }, role: { type: 'string', enum: ALL_ROLES } },
      },
      fromStaff: { type: 'boolean', description: 'Written by the restaurant rather than the customer.' },
      createdAt: timestamp('When it was sent.'),
    },
  },

  SupportTicket: {
    type: 'object',
    properties: {
      id: cuid('Conversation id.'),
      number: { type: 'string', example: 'SUP-482913' },
      subject: { type: 'string' },
      category: { type: 'string', enum: [...SUPPORT_CATEGORIES] },
      status: { type: 'string', enum: [...SUPPORT_STATUSES], description: 'OPEN = waiting on the restaurant, PENDING = waiting on the customer.' },
      requester: {
        type: 'object',
        properties: { id: cuid('User id.'), name: { type: 'string' }, email: { type: 'string', format: 'email' }, phone: { type: 'string', nullable: true } },
      },
      order: {
        type: 'object',
        nullable: true,
        properties: { id: cuid('Order id.'), orderNumber: { type: 'string' }, status: { type: 'string', enum: ORDER_STATUSES } },
      },
      assignedTo: { type: 'object', nullable: true, properties: { id: cuid('User id.'), name: { type: 'string' } } },
      lastMessageAt: timestamp('Latest customer-visible activity.'),
      createdAt: timestamp('When it was opened.'),
      resolvedAt: nullableTimestamp('When it was resolved.'),
      unread: { type: 'boolean', description: 'New activity the viewing side has not opened yet.' },
      lastMessage: {
        type: 'object',
        nullable: true,
        properties: { body: { type: 'string' }, fromStaff: { type: 'boolean' }, senderName: { type: 'string' }, createdAt: timestamp('Sent at.') },
      },
    },
  },

  SupportTicketDetail: {
    type: 'object',
    allOf: [ref('SupportTicket'), { type: 'object', properties: { messages: { type: 'array', items: ref('SupportMessage') } } }],
  },

  SupportAgent: {
    type: 'object',
    properties: {
      id: cuid('User id.'),
      name: { type: 'string' },
      role: { type: 'string', enum: ALL_ROLES },
      openAssigned: { type: 'integer', description: 'Unresolved conversations currently assigned to them.' },
    },
  },

  SupportSummary: {
    type: 'object',
    properties: {
      open: { type: 'integer' },
      waitingOnCustomer: { type: 'integer' },
      unassigned: { type: 'integer' },
      mine: { type: 'integer' },
      unread: { type: 'integer' },
    },
  },
};
