import reference from './source-catalog.json';

const localId = /^[a-zA-Z0-9_-]{1,100}$/;
const sourceId = 'vitrin-aala';
const cafeIdentifiers = new Set([
  reference.cafe.slug,
  reference.cafe.uuid,
  String(reference.cafe.id),
]);
const branchIdentifiers = new Set(
  reference.cafe.branches.flatMap((branch) => [branch.uuid, branch.slug, String(branch.id)]),
);

export function cafeLinkId(value: string, branch = false) {
  if (!localId.test(value)) return null;
  return (branch ? branchIdentifiers : cafeIdentifiers).has(value) ? sourceId : value;
}

export function storefrontRedirect(path: string[], knownReferenceOnly = false) {
  const [area, requested, action] = path;
  if (!requested || path.length > 3) return null;
  const isBranch = area === 'branches';
  if (knownReferenceOnly && !(isBranch ? branchIdentifiers : cafeIdentifiers).has(requested))
    return null;
  const cafeId = cafeLinkId(requested, isBranch);
  if (!cafeId) return null;

  if (isBranch) {
    if (action === 'menu') return '/cafes/' + cafeId;
    if (action === 'reservations') return '/reserve?cafe=' + cafeId;
    if (action === 'cart') return '/cart?cafe=' + cafeId;
  }
  if (area === 'cafes' && (action === 'cart' || action === 'checkout'))
    return '/cart?cafe=' + cafeId + (action === 'checkout' ? '&step=checkout' : '');
  if (!action && (area === 'cafe' || (area === 'cafes' && cafeId !== requested)))
    return '/cafes/' + cafeId;
  return null;
}

export function dashboardRedirect(path: string[]) {
  const [area, group, cafe, section, branch, operation] = path;
  if (area === 'admin' && group === 'settings' && cafe === 'payments' && path.length === 3)
    return '/admin/payments';
  if (area !== 'dashboard') return null;
  if (group === 'cafe' && path.length === 2) return '/dashboard';
  if (group === 'admin') {
    if (!cafe && path.length === 2) return '/admin';
    if (cafe === 'payments' && section === 'settings' && path.length === 4)
      return '/admin/payments';
    if (
      ['cafes', 'orders', 'users', 'articles', 'testimonials', 'reviews', 'tickets'].includes(
        cafe,
      ) &&
      path.length === 3
    )
      return '/admin/' + cafe;
  }
  if (group !== 'cafes' || !cafe) return null;
  const id = cafeLinkId(cafe);
  if (!id) return null;
  if (section === 'branches') {
    if (!branch) return '/operations/' + id;
    const location = cafeLinkId(branch, true);
    if (!location) return null;
    const tabs: Record<string, string> = {
      hours: 'hours',
      kitchen: 'kitchen',
      menu: 'catalog',
      tables: 'tables',
      'qr-analytics': 'tables',
    };
    if (operation && Object.hasOwn(tabs, operation))
      return '/operations/' + location + '?tab=' + tabs[operation];
    if (!operation) return '/operations/' + location;
  }
  const tab: Record<string, string> = {
    orders: 'orders',
    reservations: 'reservations',
    events: 'events',
    analytics: 'sales',
  };
  if (section && Object.hasOwn(tab, section)) return '/dashboard?tab=' + tab[section];
  const operations: Record<string, string> = {
    cashier: 'cashier',
    meetings: 'meetings',
    staff: 'staff',
    loyalty: 'loyalty',
    accounting: 'accounting',
    payments: 'payments',
  };
  if (section && Object.hasOwn(operations, section))
    return '/operations/' + id + '?tab=' + operations[section];
  return null;
}
