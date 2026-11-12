export const TIMEZONE = 'Africa/Porto-Novo';

/** 3 000 FCFA (espaces insécables, comme la maquette). 0 → « Gratuit ». */
export function formatXof(n: number): string {
  if (n === 0) return 'Gratuit';
  return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + ' FCFA';
}

const dayFmt = new Intl.DateTimeFormat('fr-FR', {
  timeZone: TIMEZONE, weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
});
const shortDayFmt = new Intl.DateTimeFormat('fr-FR', { timeZone: TIMEZONE, day: 'numeric', month: 'long', year: 'numeric' });
const hmFmt = new Intl.DateTimeFormat('fr-FR', { timeZone: TIMEZONE, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
const ymdFmt = new Intl.DateTimeFormat('en-CA', { timeZone: TIMEZONE });

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
/** « 08:00 » ou « 08 h 00 » selon l'ICU → toujours « 08h00 ». */
const hm = (d: Date) => hmFmt.format(d).replace(/\s?[h:]\s?/, 'h');

export const formatDay = (iso: string) => cap(dayFmt.format(new Date(iso)));
export const formatShortDay = (iso: string) => shortDayFmt.format(new Date(iso));
export const formatTime = (iso: string) => hm(new Date(iso));
export const formatProgrammeTime = (t: string) => t.replace(':', 'h');

/** Bloc « date » de la page : ligne forte + ligne d'horaires (maquette : « Samedi 28 novembre 2026 / 08h00 à 17h00 »). */
export function formatWhen(startsAt: string | null, endsAt: string | null): { title: string; sub: string | null } | null {
  if (!startsAt) return null;
  const sameDay = !endsAt || ymdFmt.format(new Date(startsAt)) === ymdFmt.format(new Date(endsAt));
  if (sameDay) {
    return { title: formatDay(startsAt), sub: endsAt ? `${formatTime(startsAt)} à ${formatTime(endsAt)}` : formatTime(startsAt) };
  }
  return {
    title: `${formatDay(startsAt)}, ${formatTime(startsAt)}`,
    sub: `jusqu’au ${formatDay(endsAt!).toLowerCase()}, ${formatTime(endsAt!)}`
  };
}

/** Numéro → chiffres uniquement pour https://wa.me/<chiffres>. */
export function whatsappUrl(phone: string | null): string | null {
  const digits = (phone ?? '').replace(/\D/g, '');
  return digits.length >= 8 ? `https://wa.me/${digits}` : null;
}
