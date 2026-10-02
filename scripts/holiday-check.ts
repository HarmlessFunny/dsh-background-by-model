/**
 * Calendar checks for the holiday override — `pnpm check:holiday`.
 *
 * Covers the three things that are easy to get silently wrong and impossible to
 * notice by looking at the UI once:
 *
 *   1. the two windows, against known 中秋 / 国庆 dates;
 *   2. the Beijing day boundary (23:59 vs 00:01), i.e. that the calendar is NOT
 *      read in the machine's own zone;
 *   3. leap eighth months — ICU reports them as `8bis`, and 中秋 must stay on the
 *      REGULAR eighth month.
 *
 * Runs on plain `node` (Node ≥ 22.6 strips the types itself), so it needs no
 * dependency, no build and no browser: `node scripts/holiday-check.ts`.
 */
import {
  activeHoliday, civilKey, lunarMonthDay, nextHolidayStart, pickHoliday, shanghaiDate,
} from '../src/holiday.ts'

let failures = 0
function check(label: string, got: unknown, want: unknown): void {
  const ok = got === want
  if (!ok) failures++
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}: got ${JSON.stringify(got)} want ${JSON.stringify(want)}`)
}

const at = (iso: string): Date => new Date(iso)

console.log('--- single days (04:00Z = noon in Beijing) ---')
check('2026-09-25 中秋', activeHoliday(at('2026-09-25T04:00:00Z')), 'mid-autumn')
check('2026-09-24 eve', activeHoliday(at('2026-09-24T04:00:00Z')), null)
check('2026-09-26 after', activeHoliday(at('2026-09-26T04:00:00Z')), null)
check('2026-10-01 国庆', activeHoliday(at('2026-10-01T04:00:00Z')), 'national-day')
check('2026-10-07 last day', activeHoliday(at('2026-10-07T04:00:00Z')), 'national-day')
check('2026-10-08 after', activeHoliday(at('2026-10-08T04:00:00Z')), null)
check('2025-10-06 both -> 中秋 wins', activeHoliday(at('2025-10-06T04:00:00Z')), 'mid-autumn')
check('2025-10-06 really is 8/15',
  JSON.stringify(lunarMonthDay(at('2025-10-06T04:00:00Z'))), JSON.stringify({ month: '8', day: '15' }))

console.log('\n--- the day turns over at Beijing midnight, not at the machine\'s ---')
check('2026-09-24T15:59Z (Beijing 23:59)', activeHoliday(at('2026-09-24T15:59:00Z')), null)
check('2026-09-24T16:01Z (Beijing 00:01 on the 25th)', activeHoliday(at('2026-09-24T16:01:00Z')), 'mid-autumn')

console.log('\n--- nextHolidayStart ---')
check('next 中秋 from 2026-01-01', nextHolidayStart('mid-autumn', at('2026-01-01T04:00:00Z')), '2026-09-25')
check('next 中秋 from 2026-10-01 (already past)', nextHolidayStart('mid-autumn', at('2026-10-01T04:00:00Z')), '2027-09-15')
check('next 中秋 on the day itself', nextHolidayStart('mid-autumn', at('2026-09-25T04:00:00Z')), '2026-09-25')
check('next 国庆 from 2026-09-25', nextHolidayStart('national-day', at('2026-09-25T04:00:00Z')), '2026-10-01')
check('next 国庆 from 2026-10-07 (its last day)', nextHolidayStart('national-day', at('2026-10-07T04:00:00Z')), '2026-10-07')
check('next 国庆 from 2026-10-08', nextHolidayStart('national-day', at('2026-10-08T04:00:00Z')), '2027-10-01')

console.log('\n--- every day of 2024..2030: what each holiday claims ---')
for (let y = 2024; y <= 2030; y++) {
  const days: Record<string, string[]> = { 'mid-autumn': [], 'national-day': [] }
  for (let i = 0; i < 366; i++) {
    const d = new Date(Date.UTC(y, 0, 1, 4) + i * 86_400_000)
    const civil = shanghaiDate(d)
    if (civil === null || civil.y !== y) continue
    const hit = activeHoliday(d)
    if (hit !== null) days[hit]!.push(civilKey(civil))
  }
  console.log(`${y}: 中秋 ${days['mid-autumn']!.join(',') || '-'} | `
    + `国庆 ${days['national-day']!.length} 天（${days['national-day']![0]}..${days['national-day']!.at(-1)}）`)
}

console.log('\n--- leap eighth months (ICU spells them "8bis") ---')
// Only September–November can hold one, so that is all that is scanned.
const leap8: string[] = []
const leap8Years = new Set<number>()
for (let y = 1900; y <= 2100; y++) {
  for (const m of [9, 10, 11]) {
    for (let day = 1; day <= 30; day++) {
      const d = new Date(Date.UTC(y, m - 1, day, 4))
      if (lunarMonthDay(d)?.month === '8bis') {
        leap8.push(civilKey(shanghaiDate(d)!))
        leap8Years.add(y)
        break
      }
    }
  }
}
console.log(`years with a leap eighth month: ${[...leap8Years].join(', ') || 'none'}`)
// An 8bis day can still be National Day, so the claim is about 中秋 specifically.
const leaks = leap8.filter(k => activeHoliday(new Date(`${k}T04:00:00Z`)) === 'mid-autumn')
console.log('中秋 never fires on an 8bis day:', leaks.length === 0 ? 'ok' : `FAIL (${leaks.join(', ')})`)
if (leaks.length !== 0) failures++

console.log('\n--- 2052 has a leap eighth month: 中秋 must be the REGULAR one ---')
const mid2052: string[] = []
for (let i = 0; i < 366; i++) {
  const d = new Date(Date.UTC(2052, 0, 1, 4) + i * 86_400_000)
  const civil = shanghaiDate(d)
  if (civil === null || civil.y !== 2052) continue
  if (activeHoliday(d) === 'mid-autumn') mid2052.push(civilKey(civil))
}
console.log(`2052 中秋: ${mid2052.join(',') || '-'} (exactly one day, in September)`)
const ok2052 = mid2052.length === 1 && mid2052[0]!.startsWith('2052-09')
if (!ok2052) failures++

// ── the four gates that decide whether a holiday takes over ────────────────
// `pickHoliday` is the feature's entire decision. It used to live inside the
// plugin's apply closure, where nothing but a browser could reach it.
//
// The candidate carries the entry's IMAGE LIST (a rule owns several images since
// 0.7); a holiday's own list is always the single packaged picture.
console.log('\n--- pickHoliday: all four gates ---')
interface Item { id: string; images: { slot: string }[]; enabled: boolean }
const item = (id: string, enabled = true): Item => ({ id, images: [{ slot: `h-${id}` }], enabled })
const items: Item[] = [item('mid-autumn'), item('national-day')]
const has = (...slots: string[]) => (slot: string): boolean => slots.includes(slot)
const pick = (
  master: boolean, list: Item[], today: 'mid-autumn' | 'national-day' | null, withImage: string[],
): string | null => pickHoliday(master, list, today, has(...withImage))?.id ?? null

check('master off, everything else ready', pick(false, items, 'national-day', ['h-national-day']), null)
check('no holiday today', pick(true, items, null, ['h-national-day']), null)
check('today, switched on, but the slot is empty', pick(true, items, 'national-day', []), null)
check('today with an image, but the entry is off',
  pick(true, [item('mid-autumn'), item('national-day', false)], 'national-day', ['h-national-day']), null)
check('today, on, with an image', pick(true, items, 'national-day', ['h-national-day']), 'national-day')
check('mid-autumn takes over when that is today',
  pick(true, items, 'mid-autumn', ['h-mid-autumn']), 'mid-autumn')
check('bytes in the OTHER holiday slot do not count',
  pick(true, items, 'national-day', ['h-mid-autumn']), null)
check('today is a holiday this list does not carry',
  pick(true, items, 'not-a-holiday' as 'mid-autumn', ['h-national-day']), null)
check('empty entry list', pick(true, [], 'national-day', ['h-national-day']), null)
// Identity matters: the result IS the config entry the render layer reads on
// every repaint, so the picker must hand back that object rather than a copy of
// it that would then drift from the config.
check('the picked entry is the list own object, not a copy',
  pickHoliday(true, items, 'national-day', has('h-national-day')) === items[1], true)
check('an empty slot never consults another entry',
  pick(true, items, 'national-day', []), null)
// A multi-image entry counts as paintable when ANY of its images has bytes — the
// picker must not stop at the first one, which is how it would answer "no" for an
// entry whose later image is the one that exists.
check('a later image in the list counts as bytes',
  pick(true, [{ id: 'national-day', enabled: true, images: [{ slot: 'empty' }, { slot: 'h-national-day' }] }],
    'national-day', ['h-national-day']), 'national-day')

console.log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`}`)
process.exit(failures === 0 ? 0 : 1)