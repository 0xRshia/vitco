export const cafeServiceSchema = `
  CREATE INDEX IF NOT EXISTS cafes_parent ON cafes(parent_id);
  CREATE UNIQUE INDEX IF NOT EXISTS event_registration_order ON event_registrations(order_id) WHERE order_id IS NOT NULL;
  CREATE TABLE IF NOT EXISTS cafe_staff (
    cafe_id TEXT NOT NULL REFERENCES cafes(id), user_id TEXT NOT NULL REFERENCES users(id),
    role TEXT NOT NULL CHECK(role IN ('manager','cashier','waiter','kitchen')),
    PRIMARY KEY(cafe_id,user_id)
  );
  CREATE TABLE IF NOT EXISTS cafe_entitlements (
    cafe_id TEXT PRIMARY KEY REFERENCES cafes(id), package TEXT NOT NULL,
    vip_cafe INTEGER NOT NULL DEFAULT 0, vip_tables INTEGER NOT NULL DEFAULT 0,
    vip_menu INTEGER NOT NULL DEFAULT 0, tour INTEGER NOT NULL DEFAULT 0,
    recommendations INTEGER NOT NULL DEFAULT 0
  );
  CREATE TABLE IF NOT EXISTS home_cafe_placements (
    cafe_id TEXT PRIMARY KEY REFERENCES cafes(id) ON DELETE CASCADE,
    position INTEGER NOT NULL CHECK(position>0)
  );
  CREATE TABLE IF NOT EXISTS payment_intake (
    id INTEGER PRIMARY KEY CHECK(id=1), enabled INTEGER NOT NULL CHECK(enabled IN (0,1))
  );
  CREATE INDEX IF NOT EXISTS cafe_staff_user ON cafe_staff(user_id);
  CREATE TABLE IF NOT EXISTS cafe_hours (
    cafe_id TEXT NOT NULL REFERENCES cafes(id), weekday INTEGER NOT NULL CHECK(weekday BETWEEN 0 AND 6),
    opens TEXT NOT NULL, closes TEXT NOT NULL, PRIMARY KEY(cafe_id,weekday)
  );
  CREATE TABLE IF NOT EXISTS table_codes (
    code TEXT PRIMARY KEY, cafe_id TEXT NOT NULL REFERENCES cafes(id), table_id TEXT NOT NULL,
    created_at TEXT NOT NULL, revoked_at TEXT NOT NULL DEFAULT '', scans INTEGER NOT NULL DEFAULT 0
  );
  CREATE UNIQUE INDEX IF NOT EXISTS table_code_active ON table_codes(cafe_id,table_id) WHERE revoked_at='';
  CREATE TABLE IF NOT EXISTS table_visits (
    token_hash TEXT PRIMARY KEY, code TEXT NOT NULL REFERENCES table_codes(code),
    guest_id TEXT REFERENCES users(id), expires INTEGER NOT NULL, bound INTEGER NOT NULL DEFAULT 1
  );
  CREATE INDEX IF NOT EXISTS table_visits_expiry ON table_visits(expires);
  CREATE TABLE IF NOT EXISTS table_states (
    cafe_id TEXT NOT NULL REFERENCES cafes(id), table_id TEXT NOT NULL,
    state TEXT NOT NULL CHECK(state IN ('available','occupied','reserved','disabled')),
    PRIMARY KEY(cafe_id, table_id)
  );
  CREATE TABLE IF NOT EXISTS qr_aliases (
    id TEXT PRIMARY KEY, cafe_id TEXT NOT NULL REFERENCES cafes(id),
    url_hash TEXT NOT NULL UNIQUE, display_url TEXT NOT NULL,
    target TEXT NOT NULL CHECK(target IN ('menu','reservation','table','cashier')),
    table_id TEXT NOT NULL DEFAULT '', enabled INTEGER NOT NULL DEFAULT 1
  );
  CREATE INDEX IF NOT EXISTS qr_aliases_cafe ON qr_aliases(cafe_id);
  CREATE TABLE IF NOT EXISTS qr_scan_counts (
    cafe_id TEXT NOT NULL REFERENCES cafes(id), day TEXT NOT NULL,
    target TEXT NOT NULL, table_id TEXT NOT NULL, label TEXT NOT NULL,
    count INTEGER NOT NULL DEFAULT 1,
    PRIMARY KEY(cafe_id, day, target, table_id)
  );
  CREATE TABLE IF NOT EXISTS cashier_calls (
    id TEXT PRIMARY KEY, cafe_id TEXT NOT NULL REFERENCES cafes(id), table_id TEXT NOT NULL,
    table_name TEXT NOT NULL, code TEXT NOT NULL REFERENCES table_codes(code),
    status TEXT NOT NULL CHECK(status IN ('pending','accepted','completed','cancelled')),
    created_at TEXT NOT NULL, updated_at TEXT NOT NULL
  );
  CREATE UNIQUE INDEX IF NOT EXISTS cashier_call_active ON cashier_calls(cafe_id,table_id)
    WHERE status IN ('pending','accepted');
  CREATE TABLE IF NOT EXISTS menu_categories (
    id TEXT PRIMARY KEY, cafe_id TEXT NOT NULL REFERENCES cafes(id), name TEXT NOT NULL,
    image TEXT NOT NULL DEFAULT '', position INTEGER NOT NULL, visible INTEGER NOT NULL DEFAULT 1,
    kind TEXT NOT NULL DEFAULT 'other' CHECK(kind IN ('food','drink','dessert','other')),
    UNIQUE(cafe_id,name)
  );
  CREATE TABLE IF NOT EXISTS meetings (
    id TEXT PRIMARY KEY, host_id TEXT NOT NULL REFERENCES users(id), cafe_id TEXT REFERENCES cafes(id),
    title TEXT NOT NULL, description TEXT NOT NULL, starts_at TEXT NOT NULL, ends_at TEXT NOT NULL,
    capacity INTEGER NOT NULL, visibility TEXT NOT NULL CHECK(visibility IN ('public','unlisted','private')),
    status TEXT NOT NULL CHECK(status IN ('pending','scheduled','rejected','cancelled')),
    reason TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS meetings_discovery ON meetings(status,visibility,starts_at);
  CREATE INDEX IF NOT EXISTS meetings_cafe ON meetings(cafe_id,starts_at);
  CREATE TABLE IF NOT EXISTS meeting_members (
    meeting_id TEXT NOT NULL REFERENCES meetings(id), user_id TEXT NOT NULL REFERENCES users(id),
    status TEXT NOT NULL CHECK(status IN ('active','left','removed')),
    PRIMARY KEY(meeting_id,user_id)
  );
  CREATE TABLE IF NOT EXISTS meeting_messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT, meeting_id TEXT NOT NULL REFERENCES meetings(id),
    user_id TEXT NOT NULL REFERENCES users(id), body TEXT NOT NULL, created_at TEXT NOT NULL,
    hidden INTEGER NOT NULL DEFAULT 0
  );
  CREATE INDEX IF NOT EXISTS meeting_messages_meeting ON meeting_messages(meeting_id,id);
  CREATE TABLE IF NOT EXISTS accounting_entries (
    id TEXT PRIMARY KEY, cafe_id TEXT NOT NULL REFERENCES cafes(id), actor_id TEXT NOT NULL REFERENCES users(id),
    date TEXT NOT NULL, amount INTEGER NOT NULL, description TEXT NOT NULL, created_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS accounting_entries_date ON accounting_entries(cafe_id,date);
  CREATE TABLE IF NOT EXISTS accounting_profiles (
    id TEXT PRIMARY KEY, cafe_id TEXT NOT NULL REFERENCES cafes(id), name TEXT NOT NULL,
    include_manual INTEGER NOT NULL, source TEXT NOT NULL, UNIQUE(cafe_id,name)
  );
  CREATE TABLE IF NOT EXISTS accounting_exports (
    id TEXT PRIMARY KEY, cafe_id TEXT NOT NULL REFERENCES cafes(id), title TEXT NOT NULL,
    date_from TEXT NOT NULL, date_to TEXT NOT NULL, csv TEXT NOT NULL, created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS loyalty_programs (
    cafe_id TEXT PRIMARY KEY REFERENCES cafes(id), name TEXT NOT NULL, active INTEGER NOT NULL,
    spend_per_point INTEGER NOT NULL CHECK(spend_per_point>0)
  );
  CREATE TABLE IF NOT EXISTS loyalty_tiers (
    id TEXT PRIMARY KEY, cafe_id TEXT NOT NULL REFERENCES cafes(id), name TEXT NOT NULL,
    threshold INTEGER NOT NULL, UNIQUE(cafe_id,threshold)
  );
  CREATE TABLE IF NOT EXISTS loyalty_rules (
    id TEXT PRIMARY KEY, cafe_id TEXT NOT NULL REFERENCES loyalty_programs(cafe_id), name TEXT NOT NULL,
    kind TEXT NOT NULL CHECK(kind IN ('fixed','spend','tier')),
    minimum INTEGER NOT NULL, value INTEGER NOT NULL, active INTEGER NOT NULL DEFAULT 1
  );
  CREATE INDEX IF NOT EXISTS loyalty_rules_cafe ON loyalty_rules(cafe_id);
  CREATE TABLE IF NOT EXISTS loyalty_rewards (
    id TEXT PRIMARY KEY, cafe_id TEXT NOT NULL REFERENCES cafes(id), name TEXT NOT NULL,
    cost INTEGER NOT NULL, percent INTEGER NOT NULL, active INTEGER NOT NULL DEFAULT 1
  );
  CREATE TABLE IF NOT EXISTS loyalty_ledger (
    id TEXT PRIMARY KEY, cafe_id TEXT NOT NULL REFERENCES cafes(id), user_id TEXT NOT NULL REFERENCES users(id),
    delta INTEGER NOT NULL, reason TEXT NOT NULL, created_at TEXT NOT NULL,
    request_key TEXT, reward_id TEXT REFERENCES loyalty_rewards(id), coupon_id TEXT REFERENCES coupons(id),
    UNIQUE(user_id,request_key)
  );
  CREATE INDEX IF NOT EXISTS loyalty_ledger_cafe ON loyalty_ledger(cafe_id,created_at);
  CREATE TABLE IF NOT EXISTS notification_preferences (
    user_id TEXT PRIMARY KEY REFERENCES users(id), reminders INTEGER NOT NULL DEFAULT 1,
    telegram INTEGER NOT NULL DEFAULT 0
  );
  CREATE TABLE IF NOT EXISTS registration_reminders (
    kind TEXT NOT NULL, target_id TEXT NOT NULL, user_id TEXT NOT NULL REFERENCES users(id),
    starts_at TEXT NOT NULL, PRIMARY KEY(kind,target_id,user_id,starts_at)
  );
  CREATE TABLE IF NOT EXISTS articles (
    slug TEXT PRIMARY KEY, title TEXT NOT NULL, category TEXT NOT NULL, summary TEXT NOT NULL,
    body TEXT NOT NULL, image TEXT NOT NULL, published INTEGER NOT NULL DEFAULT 0,
    body_blocks TEXT NOT NULL DEFAULT '[]', publish_at TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL, updated_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS article_categories (name TEXT PRIMARY KEY);
  CREATE TABLE IF NOT EXISTS testimonials (
    id TEXT PRIMARY KEY, name TEXT NOT NULL, byline TEXT NOT NULL, body TEXT NOT NULL,
    image TEXT NOT NULL, visible INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS contact_messages (
    id TEXT PRIMARY KEY, kind TEXT NOT NULL CHECK(kind IN ('contact','partnership')),
    name TEXT NOT NULL, contact TEXT NOT NULL, subject TEXT NOT NULL, body TEXT NOT NULL,
    created_at TEXT NOT NULL, read INTEGER NOT NULL DEFAULT 0
  );
  CREATE TABLE IF NOT EXISTS partner_leads (
    id TEXT PRIMARY KEY, message_id TEXT UNIQUE REFERENCES contact_messages(id),
    cafe_name TEXT NOT NULL, contact_name TEXT NOT NULL, contact TEXT NOT NULL,
    stage TEXT NOT NULL DEFAULT 'new' CHECK(stage IN ('new','contacted','negotiating','won','lost')),
    follow_up_on TEXT NOT NULL DEFAULT '', revision INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL, updated_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS partner_leads_stage_follow_up ON partner_leads(stage,follow_up_on);
  CREATE TABLE IF NOT EXISTS partner_lead_notes (
    id INTEGER PRIMARY KEY, lead_id TEXT NOT NULL REFERENCES partner_leads(id),
    author_id TEXT NOT NULL REFERENCES users(id), body TEXT NOT NULL, created_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS partner_lead_notes_lead ON partner_lead_notes(lead_id,id);
  CREATE TRIGGER IF NOT EXISTS capture_partnership_lead AFTER INSERT ON contact_messages
    WHEN NEW.kind='partnership'
    BEGIN
      INSERT INTO partner_leads(id,message_id,cafe_name,contact_name,contact,created_at,updated_at)
      VALUES(NEW.id,NEW.id,NEW.subject,NEW.name,NEW.contact,NEW.created_at,NEW.created_at);
    END;
  INSERT INTO partner_leads(id,message_id,cafe_name,contact_name,contact,created_at,updated_at)
    SELECT id,id,subject,name,contact,created_at,created_at FROM contact_messages
    WHERE kind='partnership' AND NOT EXISTS (
      SELECT 1 FROM partner_leads WHERE message_id=contact_messages.id
    );
  CREATE TABLE IF NOT EXISTS ticket_attachments (
    id TEXT PRIMARY KEY, ticket_id TEXT NOT NULL REFERENCES tickets(id), reply_id TEXT REFERENCES ticket_replies(id),
    name TEXT NOT NULL, content BLOB NOT NULL, size INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS ticket_attachments_ticket ON ticket_attachments(ticket_id);
  CREATE TABLE IF NOT EXISTS ticket_reads (
    ticket_id TEXT NOT NULL REFERENCES tickets(id), user_id TEXT NOT NULL REFERENCES users(id), read_at TEXT NOT NULL,
    PRIMARY KEY(ticket_id,user_id)
  );
  CREATE TABLE IF NOT EXISTS oauth_attempts (
    state_hash TEXT PRIMARY KEY, verifier TEXT NOT NULL, user_id TEXT REFERENCES users(id),
    next TEXT NOT NULL, expires INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS google_accounts (
    subject TEXT PRIMARY KEY, user_id TEXT NOT NULL UNIQUE REFERENCES users(id)
  );
  CREATE TABLE IF NOT EXISTS telegram_links (
    user_id TEXT PRIMARY KEY REFERENCES users(id), chat_id TEXT NOT NULL UNIQUE, linked_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS telegram_tokens (
    token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL UNIQUE REFERENCES users(id), expires INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS telegram_outbox (
    notification_id TEXT PRIMARY KEY REFERENCES notifications(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL REFERENCES users(id), created_at INTEGER NOT NULL,
    state TEXT NOT NULL DEFAULT 'pending', attempts INTEGER NOT NULL DEFAULT 0, next_attempt INTEGER NOT NULL DEFAULT 0
  );
`;
