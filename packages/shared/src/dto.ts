import type { OrderStatus } from './constants/order-status';

/**
 * Response shapes shared by the API (which builds them) and the web app
 * (which consumes them). Money is always a decimal *string* with two places
 * ("12.50") — that is how Prisma Decimal columns serialize, and it avoids
 * float rounding; parse with Number() only for display.
 */

export interface AddressDTO {
  id: string;
  label: string;
  line1: string;
  line2: string | null;
  city: string;
  state: string;
  postalCode: string;
  lat: number | null;
  lng: number | null;
  isDefault: boolean;
}

export interface RestaurantDTO {
  id: string;
  name: string;
  description: string | null;
  logoUrl: string | null;
  address: string | null;
  phone: string | null;
  /** Owner's open/closed switch — the only thing that gates order placement. */
  isOpen: boolean;
  /** "HH:MM", informational only (no timezone handling in v1). */
  opensAt: string | null;
  closesAt: string | null;
  minOrderAmount: string;
  deliveryFee: string;
}

export interface CartModifierDTO {
  modifierGroupId: string;
  modifierId: string;
  name: string;
  priceDelta: string;
}

export interface CartItemDTO {
  id: string;
  menuItemId: string;
  name: string;
  isVeg: boolean;
  imageUrl: string | null;
  quantity: number;
  note: string | null;
  modifiers: CartModifierDTO[];
  /** Base price plus selected modifiers, at current menu prices. */
  unitPrice: string;
  lineTotal: string;
  /** False when the item was hidden/disabled after being added to the cart. */
  available: boolean;
}

export interface CartDTO {
  items: CartItemDTO[];
  /** Sum of quantities of available items. */
  itemCount: number;
  /** Available items only. */
  subtotal: string;
}

export interface OrderItemDTO {
  id: string;
  menuItemId: string;
  name: string;
  /** The dish's current photo (not a snapshot), for display. */
  imageUrl: string | null;
  /** The customer's special instructions for this item. */
  note: string | null;
  unitPrice: string;
  quantity: number;
  modifiers: { name: string; priceDelta: string }[];
  lineTotal: string;
}

export interface OrderStatusLogDTO {
  id: string;
  fromStatus: OrderStatus | null;
  toStatus: OrderStatus;
  note: string | null;
  createdAt: string;
  changedBy: { id: string; name: string; role: string } | null;
}

export type DeliveryAssignmentStatus = 'OFFERED' | 'ACCEPTED' | 'REJECTED' | 'PICKED_UP' | 'DELIVERED';

export interface DeliveryDTO {
  id: string;
  status: DeliveryAssignmentStatus;
  deliveryPartner: { id: string; name: string; phone: string | null };
  assignedAt: string;
  acceptedAt: string | null;
  pickedUpAt: string | null;
  deliveredAt: string | null;
  codCollected: boolean;
  proofImageUrl: string | null;
}

export interface OrderDTO {
  id: string;
  orderNumber: string;
  status: OrderStatus;
  subtotal: string;
  deliveryFee: string;
  discount: string;
  total: string;
  paymentMethod: 'COD';
  paymentStatus: 'PENDING' | 'COLLECTED';
  placedAt: string;
  deliveredAt: string | null;
  cancelledAt: string | null;
  cancellationReason: string | null;
  notes: string | null;
  customer: { id: string; name: string; email: string; phone: string | null };
  address: Omit<AddressDTO, 'isDefault'>;
  items: OrderItemDTO[];
  delivery: DeliveryDTO | null;
  /** Present on the detail endpoint only. */
  statusLogs?: OrderStatusLogDTO[];
}

export interface DeliveryAssignmentWithOrderDTO extends DeliveryDTO {
  order: OrderDTO;
}

export interface DeliveryPartnerDTO {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  /** Assignments currently OFFERED, ACCEPTED or PICKED_UP. */
  activeAssignments: number;
}

export interface NotificationDTO {
  id: string;
  type: string;
  title: string;
  body: string;
  isRead: boolean;
  metadata: Record<string, unknown>;
  createdAt: string;
}

export interface ReportSummaryDTO {
  generatedAt: string;
  /** "Today" and every day below are UTC calendar days. */
  today: { ordersPlaced: number; ordersDelivered: number; ordersCancelled: number; revenue: string };
  /** Oldest first, always 7 entries (days with no orders show zeros). */
  last7Days: { date: string; ordersPlaced: number; revenue: string }[];
  /** Orders currently in progress, by status. */
  activeByStatus: { status: OrderStatus; count: number }[];
  /** Best sellers among delivered orders in the last 30 days. */
  topItems: { name: string; quantity: number; revenue: string }[];
  menu: { items: number; available: number };
  staff: { active: number };
}

export interface NotificationListDTO {
  items: NotificationDTO[];
  unreadCount: number;
}

/** Socket.IO contract — names live here so server and client cannot drift. */
export const REALTIME = {
  NAMESPACE: '/orders',
  /** Server → client. */
  EVENTS: {
    ORDER_UPDATED: 'order:updated',
    ORDER_PLACED: 'order:placed',
    NOTIFICATION: 'notification:new',
  },
  /** Client → server. */
  ACTIONS: {
    JOIN_ORDER: 'order:join',
    LEAVE_ORDER: 'order:leave',
    JOIN_QUEUE: 'queue:join',
  },
  rooms: {
    order: (orderId: string) => `order:${orderId}`,
    queue: 'restaurant:orders',
    user: (userId: string) => `user:${userId}`,
  },
} as const;
