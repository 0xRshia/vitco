import type { NextRequest } from 'next/server';
import { serviceLocations } from './cafe-access';
import {
  cafeTour,
  deleteMenuCategory,
  kitchenOrders,
  manageStaff,
  menuCategoriesFor,
  operationAccess,
  rescheduleOptions,
  rescheduleReservation,
  saveMenuCategory,
  setWorkingHours,
  staffMembers,
  staffReservations,
  workingHours,
} from './cafe-operations';
import { cashierQueue, changeTableCode, tableCodesFor, updateCashierCall } from './table-service';
import { cafeById } from './commerce';
import { meetings } from './meetings';
import { today } from './format';
import {
  accountingOverview,
  createFinancialExport,
  readFinancialExport,
  recordManualEntry,
  saveExportProfile,
} from './accounting';
import { loyaltyManagement, saveLoyalty } from './loyalty';
import { cafeFeatures } from './cafe-features';
import type { User } from './types';
import * as v from './validation';

export async function operationsApi(
  request: NextRequest,
  user: User,
  path: string[],
  input: Record<string, unknown>,
) {
  const [, cafeId, action, itemId] = path;
  if (!cafeId && request.method === 'GET') return { locations: serviceLocations(user) };
  const access = operationAccess(user, cafeId);
  if (request.method === 'GET') {
    if (action === 'accounting')
      return accountingOverview(user, cafeId, request.nextUrl.searchParams);
    if (action === 'loyalty') return loyaltyManagement(user, cafeId);
    if (action === 'export' && itemId)
      return new Response(readFinancialExport(user, cafeId, itemId), {
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': 'attachment; filename="vitco-accounting.csv"',
          'Cache-Control': 'no-store',
        },
      });
    if (action === 'qr' && itemId) {
      const table = tableCodesFor(user, cafeId).find((item) => item.id === itemId);
      v.ensure(table?.code, 'کد میز پیدا نشد.', 404);
      const url = new URL('/t/' + table.code, process.env.APP_ORIGIN || request.nextUrl.origin);
      const { toString } = await import('qrcode');
      const svg = await toString(url.href, { type: 'svg', width: 384, margin: 4 });
      return new Response(svg, {
        headers: {
          'Content-Type': 'image/svg+xml; charset=utf-8',
          'Cache-Control': 'no-store',
          'Content-Security-Policy': "default-src 'none'",
        },
      });
    }
    if (action === 'kitchen') return { orders: kitchenOrders(user, cafeId) };
    if (action === 'cashier') return { calls: cashierQueue(user, cafeId) };
    if (action === 'calendar')
      return itemId
        ? rescheduleOptions(user, cafeId, itemId, request.nextUrl.searchParams)
        : {
            reservations: staffReservations(
              user,
              cafeId,
              v.date(request.nextUrl.searchParams.get('date') || today()),
            ),
          };
    if (action === 'meetings') return { meetings: meetings(user, cafeId, false, true) };
    if (!action) {
      const cafe = cafeById(cafeId);
      return {
        cafe: {
          id: cafe.id,
          name: cafe.name,
          opens: cafe.opens,
          closes: cafe.closes,
          tour_url: cafe.tour_url,
        },
        access,
        ...(access.owner && {
          hours: workingHours(cafeId),
          tables: tableCodesFor(user, cafeId),
          staff: staffMembers(user, cafeId),
          categories: menuCategoriesFor(cafeId, true),
          features: cafeFeatures(cafeId),
        }),
      };
    }
  }
  if (request.method === 'POST') {
    if (action === 'staff') manageStaff(user, cafeId, input);
    else if (action === 'hours') setWorkingHours(user, cafeId, input.hours);
    else if (action === 'tour') cafeTour(user, cafeId, input.url);
    else if (action === 'categories') {
      if (input.remove === true)
        deleteMenuCategory(user, cafeId, v.text(input.id, 'دسته‌بندی', 1, 100));
      else saveMenuCategory(user, cafeId, input);
    } else if (action === 'qr')
      changeTableCode(user, cafeId, v.text(input.table_id, 'میز', 1, 100), input.revoke !== true);
    else if (action === 'cashier' && itemId) updateCashierCall(user, cafeId, itemId, input.status);
    else if (action === 'calendar' && itemId) rescheduleReservation(user, cafeId, itemId, input);
    else if (action === 'accounting') recordManualEntry(user, cafeId, input);
    else if (action === 'loyalty') saveLoyalty(user, cafeId, input);
    else if (action === 'export-profile') saveExportProfile(user, cafeId, input);
    else if (action === 'export') return { id: createFinancialExport(user, cafeId, input) };
    else throw new v.AppError('مسیر پیدا نشد.', 404);
    return { ok: true };
  }
  throw new v.AppError('مسیر پیدا نشد.', 404);
}
