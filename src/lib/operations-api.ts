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
import { qrMappings, saveQrMapping } from './qr-mappings';
import { qrScanHistory } from './qr-activity';
import { tableStatusList, updateTableState } from './table-states';
import { paymentActivity } from './payment-activity';
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
    if (action === 'payments')
      return {
        payments: paymentActivity(user, cafeId, request.nextUrl.searchParams.get('status') || ''),
      };
    if (action === 'qr-mappings') return { mappings: qrMappings(user, cafeId) };
    if (action === 'qr-activity') return qrScanHistory(user, cafeId, request.nextUrl.searchParams);
    if (action === 'export' && itemId)
      return new Response(readFinancialExport(user, cafeId, itemId), {
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': 'attachment; filename="vitco-accounting.csv"',
          'Cache-Control': 'no-store',
        },
      });
    if (action === 'qr') {
      v.ensure(access.owner, 'دسترسی به کد QR کافه مجاز نیست.', 403);
      let href = '/cafes/' + encodeURIComponent(cafeId);
      if (itemId) {
        const table = tableCodesFor(user, cafeId).find((item) => item.id === itemId);
        v.ensure(table?.code, 'کد میز پیدا نشد.', 404);
        href = '/t/' + table.code;
      }
      const url = new URL(href, process.env.APP_ORIGIN || request.nextUrl.origin);
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
        ...(access.cashier && {
          tables: access.owner ? tableCodesFor(user, cafeId) : tableStatusList(cafe),
        }),
        ...(access.owner && {
          hours: workingHours(cafeId),
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
    else if (action === 'qr-mappings')
      saveQrMapping(user, cafeId, process.env.APP_ORIGIN || request.nextUrl.origin, input);
    else if (action === 'tables' && itemId)
      updateTableState(user, cafeById(cafeId), itemId, input.state);
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
