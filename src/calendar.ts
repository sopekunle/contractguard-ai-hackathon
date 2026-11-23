import { isoDate } from './deadlines.ts';

export const reminderDays = [30, 7, 1] as const;

export function calendarInstant(date: string, time: string, zone: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) {
    throw new Error('Enter a valid date and time.');
  }
  const [year, month, day] = date.split('-').map(Number);
  if (date !== isoDate(year, month, day)) throw new Error('Enter a valid date.');
  const wall = Date.parse(date + 'T' + time + ':00Z');
  let formatter: Intl.DateTimeFormat;
  try {
    if (!/^[A-Za-z][A-Za-z0-9_+\-/]*$/.test(zone)) throw new RangeError();
    formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
    });
  } catch {
    throw new Error('Enter a time zone such as Africa/Lagos or UTC.');
  }
  const localAsUtc = (instant: number) => {
    const parts = Object.fromEntries(formatter.formatToParts(instant).map(({ type, value }) => [type, Number(value)]));
    return Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
  };
  // Probe both sides of a possible daylight-saving transition and round-trip the chosen time.
  const probes = [-36, -12, 0, 12, 36].map((hours) => wall + hours * 3_600_000);
  const offsets = new Set(probes.map((instant) => localAsUtc(instant) - instant));
  const candidates = [...offsets].map((offset) => wall - offset).filter((instant) => localAsUtc(instant) === wall);
  if (candidates.length !== 1) throw new Error('This local time is skipped or occurs twice. Choose a different time or use UTC.');
  return new Date(candidates[0]);
}

function utcValue(date: Date): string {
  return date.toISOString().replace(/[-:]|\.\d{3}/g, '');
}

export function makeCalendarReminder(event: Date, days: readonly number[], now = new Date()): string {
  if (!Number.isFinite(event.getTime()) || event <= now) throw new Error('Choose a future deadline.');
  const selected = reminderDays.filter((day) => days.includes(day));
  if (days.some((day) => !selected.includes(day as (typeof reminderDays)[number]))) {
    throw new Error('Choose a supported reminder interval.');
  }
  if (selected.some((day) => event.getTime() - day * 86_400_000 <= now.getTime())) {
    throw new Error('One or more reminders would occur in the past. Shorten the reminder schedule.');
  }
  const uid = Array.from(crypto.getRandomValues(new Uint8Array(16)), (n) => n.toString(16).padStart(2, '0')).join('');
  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//ContractGuard AI//Contract Deadline//EN',
    'CALSCALE:GREGORIAN',
    'BEGIN:VEVENT',
    'UID:' + uid + '@contractguard-local',
    'DTSTAMP:' + utcValue(now),
    'DTSTART:' + utcValue(event),
    'SUMMARY:Contract deadline',
    'CLASS:PRIVATE',
    'TRANSP:TRANSPARENT',
    ...selected.flatMap((day) => [
      'BEGIN:VALARM',
      'ACTION:DISPLAY',
      'TRIGGER:-P' + day + 'D',
      'DESCRIPTION:Review your contract deadline.',
      'END:VALARM',
    ]),
    'END:VEVENT',
    'END:VCALENDAR',
    '',
  ].join('\r\n');
}
