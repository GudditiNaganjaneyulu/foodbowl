export function dashboardHomeFor(role: string) {
  switch (role) {
    case 'restaurant_owner':
      return '/admin';
    case 'staff':
      return '/staff';
    case 'delivery_partner':
      return '/delivery';
    default:
      return '/';
  }
}
