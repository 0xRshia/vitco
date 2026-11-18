import { randomUUID } from 'node:crypto';
import { findMemberByContact, notify } from './auth';
import { cafeAccess, requireCafeAccess } from './cafe-access';
import { cafeById } from './commerce';
import { all, one, run, transaction } from './database';
import type { User } from './types';
import * as v from './validation';

type Status = 'pending' | 'scheduled' | 'rejected' | 'cancelled';
type Visibility = 'public' | 'unlisted' | 'private';
type MeetingRow = {
  id: string;
  host_id: string;
  cafe_id: string | null;
  title: string;
  description: string;
  starts_at: string;
  ends_at: string;
  capacity: number;
  visibility: Visibility;
  status: Status;
  reason: string;
  host_name: string;
  cafe_name: string | null;
  members: number;
};
export type MeetingSummary = Omit<MeetingRow, 'host_id'> & {
  phase: Status | 'live' | 'ended';
  joined: boolean;
  host: boolean;
  manager: boolean;
};
export type MeetingMessage = {
  id: number;
  name: string;
  body: string;
  created_at: string;
  own: boolean;
};

const select = `SELECT m.*,u.name host_name,c.name cafe_name,
  (SELECT COUNT(*) FROM meeting_members j WHERE j.meeting_id=m.id AND j.status='active') members
  FROM meetings m JOIN users u ON u.id=m.host_id LEFT JOIN cafes c ON c.id=m.cafe_id`;
function member(id: string, user: Pick<User, 'id'> | null) {
  return user
    ? one<{ status: string }>(
        'SELECT status FROM meeting_members WHERE meeting_id=? AND user_id=?',
        id,
        user.id,
      )?.status
    : undefined;
}
function organizer(row: MeetingRow, user: User | null) {
  return Boolean(row.cafe_id && cafeAccess(user, cafeById(row.cafe_id), 'meetings'));
}
function available(row: MeetingRow) {
  return row.status === 'scheduled' && Date.parse(row.ends_at) > Date.now();
}
function summary(
  row: MeetingRow,
  user: User | null,
  manage = organizer(row, user),
): MeetingSummary {
  const { host_id, reason, ...rest } = row;
  const host = host_id === user?.id;
  let phase: MeetingSummary['phase'] = row.status;
  if (phase === 'scheduled' && Date.parse(row.ends_at) <= Date.now()) phase = 'ended';
  else if (phase === 'scheduled' && Date.parse(row.starts_at) <= Date.now()) phase = 'live';
  return {
    ...rest,
    reason: host || manage ? reason : '',
    phase,
    host,
    manager: manage,
    joined: member(row.id, user) === 'active',
  };
}
function meetingRow(id: string) {
  const row = one<MeetingRow>(select + ' WHERE m.id=?', id);
  v.ensure(row, 'دورهمی پیدا نشد.', 404);
  return row;
}
export function meetingDetail(id: string, user: User | null) {
  const row = meetingRow(id),
    manager = organizer(row, user);
  const visible = row.status === 'scheduled' && row.visibility !== 'private';
  v.ensure(
    visible || row.host_id === user?.id || manager || member(id, user) === 'active',
    'دورهمی پیدا نشد.',
    404,
  );
  return summary(row, user, manager);
}
export function meetings(user: User | null, cafeId: string | null, mine = false, forCafe = false) {
  if (forCafe) {
    v.ensure(user && cafeId, 'کافه را انتخاب کنید.');
    requireCafeAccess(user, cafeById(cafeId), 'meetings');
    return all<MeetingRow>(
      select + ' WHERE m.cafe_id=? ORDER BY m.starts_at DESC LIMIT 150',
      cafeId,
    ).map((row) => summary(row, user, true));
  }
  if (mine) {
    v.ensure(user, 'برای ادامه وارد حساب خود شوید.', 401);
    return all<MeetingRow>(
      select +
        ` WHERE m.host_id=? OR EXISTS(
      SELECT 1 FROM meeting_members j WHERE j.meeting_id=m.id AND j.user_id=? AND j.status='active')
      ORDER BY m.starts_at DESC LIMIT 150`,
      user.id,
      user.id,
    ).map((row) => summary(row, user));
  }
  return all<MeetingRow>(
    select +
      ` WHERE m.status='scheduled' AND m.visibility='public'
    AND m.ends_at>? AND (? IS NULL OR m.cafe_id=?) ORDER BY m.starts_at LIMIT 150`,
    new Date().toISOString(),
    cafeId,
    cafeId,
  ).map((row) => summary(row, user));
}
function meetingFields(input: Record<string, unknown>) {
  const title = v.text(input.title, 'عنوان دورهمی', 3, 120);
  const description = v.text(input.description, 'توضیحات', 3, 2500);
  const date = v.date(input.date),
    start = v.time(input.time),
    end = v.time(input.end_time);
  const startsAt = new Date(date + 'T' + start + ':00+03:30');
  const endsAt = new Date(date + 'T' + end + ':00+03:30');
  v.ensure(
    startsAt.getTime() > Date.now() && endsAt > startsAt,
    'زمان پایان باید بعد از شروع و تاریخ در آینده باشد.',
  );
  const capacity = v.integer(input.capacity, 'ظرفیت', 2, 500);
  const visibility = v.text(input.visibility, 'نوع نمایش', 1, 20);
  v.ensure(['public', 'unlisted', 'private'].includes(visibility), 'نوع نمایش معتبر نیست.');
  return {
    title,
    description,
    starts_at: startsAt.toISOString(),
    ends_at: endsAt.toISOString(),
    capacity,
    visibility,
  };
}
export function saveMeeting(user: User, input: Record<string, unknown>, id = '') {
  const form = meetingFields(input);
  return transaction(() => {
    if (id) {
      const row = meetingRow(id);
      const manage = organizer(row, user);
      v.ensure(row.host_id === user.id || manage, 'دسترسی مجاز نیست.', 403);
      v.ensure(
        ['pending', 'scheduled'].includes(row.status) && Date.parse(row.starts_at) > Date.now(),
        'این دورهمی قابل ویرایش نیست.',
        409,
      );
      v.ensure(form.capacity >= row.members, 'ظرفیت کمتر از اعضای فعلی است.', 409);
      const needsApproval = row.cafe_id && !manage;
      run(
        `UPDATE meetings SET title=?,description=?,starts_at=?,ends_at=?,capacity=?,visibility=?,status=?,reason='' WHERE id=?`,
        form.title,
        form.description,
        form.starts_at,
        form.ends_at,
        form.capacity,
        form.visibility,
        needsApproval ? 'pending' : row.status,
        id,
      );
      return id;
    }
    const cafeId = v.text(input.cafe_id ?? '', 'کافه', 0, 100);
    const cafe = cafeId ? cafeById(cafeId) : null;
    v.ensure(
      !cafe || (cafe.active && cafe.owner_id && !cafe.is_demo),
      'این کافه دورهمی نمی‌پذیرد.',
      409,
    );
    const status = cafe && !cafeAccess(user, cafe, 'meetings') ? 'pending' : 'scheduled';
    const key = randomUUID();
    run(
      `INSERT INTO meetings(id,host_id,cafe_id,title,description,starts_at,ends_at,capacity,visibility,status,created_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
      key,
      user.id,
      cafeId || null,
      form.title,
      form.description,
      form.starts_at,
      form.ends_at,
      form.capacity,
      form.visibility,
      status,
      new Date().toISOString(),
    );
    run(
      "INSERT INTO meeting_members(meeting_id,user_id,status) VALUES (?,?,'active')",
      key,
      user.id,
    );
    if (cafe?.owner_id && status === 'pending')
      notify(
        cafe.owner_id,
        'درخواست دورهمی تازه',
        form.title,
        '/operations/' + cafe.id + '?tab=meetings',
      );
    return key;
  });
}
export function changeMeeting(
  user: User,
  id: string,
  action: string,
  input: Record<string, unknown>,
) {
  transaction(() => {
    const row = meetingRow(id),
      own = row.host_id === user.id,
      manager = organizer(row, user);
    const current = member(id, user);
    if (action === 'join') {
      v.ensure(available(row), 'زمان پیوستن به دورهمی به پایان رسیده یا هنوز تأیید نشده است.', 409);
      v.ensure(
        row.visibility !== 'private' || own || manager || current === 'active',
        'این دورهمی خصوصی است.',
        403,
      );
      v.ensure(current !== 'removed', 'امکان پیوستن دوباره وجود ندارد.', 403);
      if (current === 'active') return;
      v.ensure(row.members < row.capacity, 'ظرفیت دورهمی تکمیل است.', 409);
      run(
        "INSERT INTO meeting_members(meeting_id,user_id,status) VALUES (?,?,'active') ON CONFLICT(meeting_id,user_id) DO UPDATE SET status='active'",
        id,
        user.id,
      );
      return;
    }
    if (action === 'leave') {
      v.ensure(!own && current === 'active', 'عضویت فعالی برای خروج وجود ندارد.', 409);
      run("UPDATE meeting_members SET status='left' WHERE meeting_id=? AND user_id=?", id, user.id);
      return;
    }
    if (action === 'invite' || action === 'remove-member') {
      v.ensure(own || manager, 'دسترسی مجاز نیست.', 403);
      v.ensure(available(row), 'دورهمی در حال پذیرش عضو نیست.', 409);
      const invited = findMemberByContact(input.contact ?? input.email);
      v.ensure(invited && invited.id !== row.host_id, 'حساب کاربر پیدا نشد.', 404);
      const target = member(id, invited);
      if (action === 'invite') {
        if (target === 'active') return;
        v.ensure(row.members < row.capacity, 'ظرفیت دورهمی تکمیل است.', 409);
        run(
          "INSERT INTO meeting_members(meeting_id,user_id,status) VALUES (?,?,'active') ON CONFLICT(meeting_id,user_id) DO UPDATE SET status='active'",
          id,
          invited.id,
        );
        notify(invited.id, 'دعوت به دورهمی', row.title, '/meetings/' + id);
      } else {
        v.ensure(target === 'active', 'عضو فعال پیدا نشد.', 404);
        run(
          "UPDATE meeting_members SET status='removed' WHERE meeting_id=? AND user_id=?",
          id,
          invited.id,
        );
      }
      return;
    }
    let next: Status;
    let reason = '';
    if (action === 'approve' || action === 'reject') {
      v.ensure(manager, 'دسترسی مجاز نیست.', 403);
      v.ensure(row.status === 'pending', 'این دورهمی دیگر در انتظار بررسی نیست.', 409);
      v.ensure(Date.parse(row.starts_at) > Date.now(), 'زمان دورهمی گذشته است.', 409);
      next = action === 'approve' ? 'scheduled' : 'rejected';
      if (next === 'rejected') reason = v.text(input.reason ?? '', 'دلیل رد', 0, 500);
    } else {
      v.ensure(action === 'cancel', 'عملیات نامعتبر است.');
      v.ensure(own || manager, 'دسترسی مجاز نیست.', 403);
      v.ensure(
        ['pending', 'scheduled'].includes(row.status) && Date.parse(row.ends_at) > Date.now(),
        'دورهمی پایان یافته است.',
        409,
      );
      next = 'cancelled';
    }
    run('UPDATE meetings SET status=?,reason=? WHERE id=?', next, reason, id);
    if (!own) notify(row.host_id, 'وضعیت دورهمی تغییر کرد', row.title, '/meetings/' + id);
    if (next === 'cancelled')
      for (const m of all<{ user_id: string }>(
        "SELECT user_id FROM meeting_members WHERE meeting_id=? AND user_id<>? AND status='active'",
        id,
        row.host_id,
      ))
        notify(m.user_id, 'دورهمی لغو شد', row.title, '/meetings/' + id);
  });
}
function chatAccess(user: User, id: string) {
  const row = meetingRow(id);
  const manage = row.host_id === user.id || organizer(row, user);
  v.ensure(
    manage || (row.status === 'scheduled' && member(id, user) === 'active'),
    'گفتگو مخصوص اعضای دورهمی است.',
    403,
  );
  return { row, manage };
}
export function meetingChat(user: User, id: string, before?: string | null) {
  chatAccess(user, id);
  const max = before
    ? v.integer(before, 'شناسه پیام', 1, Number.MAX_SAFE_INTEGER)
    : Number.MAX_SAFE_INTEGER;
  return all<MeetingMessage>(
    `SELECT m.id,u.name,m.body,m.created_at,m.user_id=? own
    FROM meeting_messages m JOIN users u ON u.id=m.user_id WHERE m.meeting_id=? AND m.hidden=0 AND m.id<?
    ORDER BY m.id DESC LIMIT 50`,
    user.id,
    id,
    max,
  ).reverse();
}
export function writeMeetingChat(user: User, id: string, input: Record<string, unknown>) {
  transaction(() => {
    const { row, manage } = chatAccess(user, id);
    if (input.hide !== undefined) {
      v.ensure(manage, 'دسترسی مدیریت گفتگو لازم است.', 403);
      run(
        'UPDATE meeting_messages SET hidden=1 WHERE meeting_id=? AND id=?',
        id,
        v.integer(input.hide, 'پیام', 1, Number.MAX_SAFE_INTEGER),
      );
      return;
    }
    v.ensure(available(row), 'گفتگو فقط در دورهمی تأییدشده فعال است.', 409);
    run(
      'INSERT INTO meeting_messages(meeting_id,user_id,body,created_at) VALUES (?,?,?,?)',
      id,
      user.id,
      v.text(input.body, 'پیام', 1, 2000),
      new Date().toISOString(),
    );
  });
}
