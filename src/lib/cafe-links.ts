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
    return '/cart?cafe=' + cafeId;
  if (!action && (area === 'cafe' || (area === 'cafes' && cafeId !== requested)))
    return '/cafes/' + cafeId;
  return null;
}
