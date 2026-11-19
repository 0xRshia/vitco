import { all, hydrate } from './database';
import type { Product } from './types';

export function topOrderedProducts(): Product[] {
  return all(`
    WITH sales AS (
      SELECT o.cafe_id, item.value ->> '$.product_id' AS product_id,
             SUM(item.value ->> '$.quantity') AS quantity
      FROM orders o JOIN json_each(o.items) AS item
      WHERE o.kind='menu' AND o.status='completed'
      GROUP BY o.cafe_id, product_id
    )
    SELECT p.*, c.name AS cafe_name FROM sales
    JOIN products p ON p.id=sales.product_id AND p.cafe_id=sales.cafe_id
    JOIN cafes c ON c.id=p.cafe_id
    LEFT JOIN menu_categories m ON m.cafe_id=p.cafe_id AND m.name=p.category
    WHERE c.owner_id IS NOT NULL AND c.active=1 AND c.is_demo=0
      AND p.available=1 AND p.vip_only=0 AND COALESCE(m.visible,1)=1
    ORDER BY sales.quantity DESC, p.id
    LIMIT 4
  `).map(hydrate<Product>);
}
