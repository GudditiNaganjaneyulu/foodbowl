/**
 * Every Redis key this app writes, in one place. Not just tidiness: a cache's
 * writer and its invalidators are often in different modules (e.g. an order
 * event invalidates the reports and delivery-partners caches), and importing
 * a key from the module that *owns* that cache would create circular
 * imports between modules/orders, modules/delivery and modules/reports. This
 * file has no imports of its own, so nothing importing from it can cycle.
 */
export const MENU_CACHE_KEY = 'menu:public';
export const RESTAURANT_CACHE_KEY = 'restaurant:public';
export const REPORTS_CACHE_KEY = 'reports:summary';
export const PARTNERS_CACHE_KEY = 'delivery:partners';
