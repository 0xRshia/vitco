import { test } from 'node:test';
import assert from 'node:assert/strict';
import { eventPhase } from '../src/lib/event-time';

test('event phases respect Tehran time and exact start/end boundaries', () => {
  const event = { date: '2026-11-14', time: '17:00', end_time: '19:00' };
  assert.equal(eventPhase(event, Date.parse('2026-11-14T13:29:59Z')), 'upcoming');
  assert.equal(eventPhase(event, Date.parse('2026-11-14T13:30:00Z')), 'ongoing');
  assert.equal(eventPhase(event, Date.parse('2026-11-14T15:29:59Z')), 'ongoing');
  assert.equal(eventPhase(event, Date.parse('2026-11-14T15:30:00Z')), 'ended');
});

test('an elapsed start without an explicit valid end never invents an ongoing duration', () => {
  const now = Date.parse('2026-11-14T14:30:00Z');
  assert.equal(eventPhase({ date: '2026-11-14', time: '17:00' }, now), 'unknown');
  assert.equal(
    eventPhase({ date: '2026-11-14', time: '17:00', end_time: '16:00' }, now),
    'unknown',
  );
});
