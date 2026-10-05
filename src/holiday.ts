/**
 * The built-in holiday calendar behind the "holiday background" override.
 *
 * Imported by BOTH halves — the node half only reads `HOLIDAYS` (the fixed slot
 * ids and the hosted asset names), the browser half does the date maths — so
 * nothing here may touch the DOM, Node or the Cordis context, and every
 * `Intl` formatter is built lazily so the node half never constructs one.
 *
 * Both holidays are evaluated in **Asia/Shanghai**, not in the machine's own
 * zone: 中秋 is a lunar date, and the lunar day rolls over at Beijing midnight,
 * so reading "today" from a UTC or UTC-8 clock puts the festival on the wrong
 * day for most of the planet.
 *
 *   mid-autumn   农历八月十五 — moves across the Gregorian calendar
 *                (2024-09-17, 2025-10-06, 2026-09-25, 2027-09-15 …)
 *   national-day 公历 10 月 1–7 日 — the fixed National Day holiday window
 */

export type HolidayId = 'mid-autumn' | 'national-day'

export interface HolidayDef {
  id: HolidayId
  /**
   * Image slot holding this holiday's wallpaper. Fixed, and namespaced with an
   * `h-` prefix so it can never collide with a rule slot (`nextSlot` only ever
   * hands out `m<n>`, and slots are what reach the filesystem).
   */
  slot: string
  /**
   * File name of this holiday's wallpaper in the hosted asset directory —
   * `holiday/` beside the README screenshots (see `HOLIDAY_ASSET_HOSTS` in
   * ./index for where that is and which revision of it is pinned).
   *
   * Named HERE, with the slot and the colour, because the three are one
   * definition of a festival: the node half derives the download URL from this
   * field alone, so adding a holiday is still a change to this table plus one
   * file in the assets repository.
   */
  asset: string
  /**
   * The theme color this holiday paints with, as `#RRGGBB`.
   *
   * Fixed, and fixed HERE — beside the slot and the art — rather than derived
   * from the wallpaper: the palette of a festival is a design decision, and
   * decoding a 3456×1920 photo to re-derive the same hue was both slower and
   * less predictable than naming it. ./schema turns this into the `[h, s, l]`
   * triple the rule shape stores, and takes it from the definition rather than
   * from disk, so a config can never paint a festival in a color it does not
   * have.
   */
  color: string
  /** How the window is computed — also drives the "next occurrence" scan. */
  kind: 'lunar' | 'gregorian'
}

export const HOLIDAYS: readonly HolidayDef[] = [
  { id: 'mid-autumn', slot: 'h-midautumn', asset: 'mid-autumn.webp', color: '#384A77', kind: 'lunar' },
  { id: 'national-day', slot: 'h-nationalday', asset: 'national-day.webp', color: '#FFF6EB', kind: 'gregorian' },
]

/** 中秋 always falls between these two Gregorian days, so a scan can skip the rest. */
const MID_AUTUMN_FROM = { m: 9, d: 7 }
const MID_AUTUMN_TO = { m: 10, d: 8 }

export function holidayDef(id: string): HolidayDef | null {
  return HOLIDAYS.find(h => h.id === id) ?? null
}

export function isHolidayId(id: string): id is HolidayId {
  return HOLIDAYS.some(h => h.id === id)
}

/** The slot a holiday's wallpaper lives in; '' for an unknown id. */
export function holidaySlot(id: string): string {
  return holidayDef(id)?.slot ?? ''
}

// ── Calendar primitives ────────────────────────────────────────────────────
// Both formatters are optional: a build without full ICU (a small-icu Node, an
// exotic browser) simply cannot answer, and every caller degrades to "no
// holiday" instead of throwing inside a render.

const TZ = 'Asia/Shanghai'

let civilFormatter: Intl.DateTimeFormat | null | undefined
function civilFmt(): Intl.DateTimeFormat | null {
  if (civilFormatter === undefined) {
    try {
      civilFormatter = new Intl.DateTimeFormat('en-US', {
        timeZone: TZ, year: 'numeric', month: 'numeric', day: 'numeric',
      })
    } catch {
      civilFormatter = null
    }
  }
  return civilFormatter
}

let lunarFormatter: Intl.DateTimeFormat | null | undefined
function lunarFmt(): Intl.DateTimeFormat | null {
  if (lunarFormatter === undefined) {
    try {
      lunarFormatter = new Intl.DateTimeFormat('en-u-ca-chinese', {
        timeZone: TZ, year: 'numeric', month: 'numeric', day: 'numeric',
      })
    } catch {
      lunarFormatter = null
    }
  }
  return lunarFormatter
}

function partsOf(fmt: Intl.DateTimeFormat, date: Date): Record<string, string> | null {
  try {
    const out: Record<string, string> = {}
    for (const p of fmt.formatToParts(date)) {
      if (p.type !== 'literal') out[p.type] = p.value
    }
    return out
  } catch {
    return null
  }
}

/** The civil (Gregorian) date in Asia/Shanghai, or null when ICU cannot answer. */
export function shanghaiDate(date: Date): { y: number; m: number; d: number } | null {
  const fmt = civilFmt()
  if (fmt === null) return null
  const p = partsOf(fmt, date)
  if (p === null) return null
  const y = Number(p.year)
  const m = Number(p.month)
  const d = Number(p.day)
  if (!isFinite(y) || !isFinite(m) || !isFinite(d)) return null
  return { y, m, d }
}

/** `YYYY-MM-DD` of one Asia/Shanghai civil date. */
export function civilKey(date: { y: number; m: number; d: number }): string {
  return `${date.y}-${String(date.m).padStart(2, '0')}-${String(date.d).padStart(2, '0')}`
}

/**
 * The Chinese-calendar month and day in Asia/Shanghai.
 *
 * ICU marks a **leap** month by suffixing `bis` — a leap fourth month reads
 * `4bis`, a leap eighth month would read `8bis`. 中秋 is the FIFTEENTH DAY OF THE
 * REGULAR EIGHTH MONTH, so the exact `month === '8'` test below is what keeps a
 * leap eighth month (which does occur, roughly once every few decades) from
 * dragging the festival a month late.
 */
export function lunarMonthDay(date: Date): { month: string; day: string } | null {
  const fmt = lunarFmt()
  if (fmt === null) return null
  const p = partsOf(fmt, date)
  if (p === null || p.month === undefined || p.day === undefined) return null
  return { month: p.month, day: p.day }
}

// ── The two windows ────────────────────────────────────────────────────────

/** 农历八月十五, in the regular eighth month — i.e. 中秋 itself. */
export function isMidAutumn(date: Date = new Date()): boolean {
  const lunar = lunarMonthDay(date)
  return lunar !== null && lunar.month === '8' && lunar.day === '15'
}

/** 公历 10 月 1–7 日 — the National Day holiday period. */
export function isNationalDay(date: Date = new Date()): boolean {
  const civil = shanghaiDate(date)
  return civil !== null && civil.m === 10 && civil.d >= 1 && civil.d <= 7
}

/**
 * The holiday whose window contains `date`, or null.
 *
 * 中秋 wins the overlap: it is a single precise day, while National Day is a
 * seven-day window, and the two do collide (2025-10-06 was both). On a tie the
 * rarer, more specific answer is the better one.
 */
export function activeHoliday(date: Date = new Date()): HolidayId | null {
  if (isMidAutumn(date)) return 'mid-autumn'
  if (isNationalDay(date)) return 'national-day'
  return null
}

/**
 * The next Asia/Shanghai civil date on which `id` starts, as `YYYY-MM-DD`, or
 * null when the calendar is unavailable.
 *
 * The scan is anchored at 04:00 UTC — noon in Beijing, and Shanghai has no DST —
 * so stepping a whole day at a time can never skip or repeat a civil date. Days
 * outside the possible window of a lunar holiday are skipped before the
 * (expensive) lunar lookup, which is what keeps this cheap enough to run while
 * the settings page renders.
 */
export function nextHolidayStart(id: HolidayId, from: Date = new Date()): string | null {
  const start = shanghaiDate(from)
  if (start === null) return null
  const anchor = Date.UTC(start.y, start.m - 1, start.d, 4)
  for (let i = 0; i < 400; i++) {
    const probe = new Date(anchor + i * 86_400_000)
    const civil = shanghaiDate(probe)
    if (civil === null) return null
    // A day that cannot hold this holiday is skipped BEFORE the lunar lookup,
    // which is what makes a year-long scan cheap enough to run while the
    // settings page renders.
    if (holidayDef(id)?.kind === 'lunar' && !inMidAutumnRange(civil)) continue
    if (activeHoliday(probe) === id) return civilKey(civil)
  }
  return null
}

function inMidAutumnRange(civil: { m: number; d: number }): boolean {
  if (civil.m === MID_AUTUMN_FROM.m) return civil.d >= MID_AUTUMN_FROM.d
  if (civil.m === MID_AUTUMN_TO.m) return civil.d <= MID_AUTUMN_TO.d
  return false
}

// ── Which holiday overrides the rules right now ────────────────────────────

/**
 * The bits of a holiday entry the picker needs. Structural on purpose: the
 * persisted shape lives in ./schema, and this module importing THAT would close a
 * cycle, since ./schema imports `HOLIDAYS` from here.
 *
 * The image LIST (rather than one slot) is what a rule owns since 0.7, and this
 * mirrors just enough of it to ask the picker's only question: "is there anything
 * to paint?". A holiday's own list is always the single hosted image (see
 * `defaultHolidayRule`), so the shape stays a formality for it — and a rule that
 * happens to be passed in answers through the same field.
 */
export interface HolidayCandidate {
  id: string
  enabled: boolean
  images: readonly { slot: string }[]
}

/**
 * The holiday the background must follow right now, or null.
 *
 * Four gates, every one of them deliberate:
 *
 *   1. the master switch — an override that discards the user's rule list must
 *      never happen without being asked for;
 *   2. a built-in holiday whose window contains today;
 *   3. that holiday's own switch;
 *   4. actual bytes in its slot.
 *
 * The last one matters most, and it is the reason this is not a one-liner at the
 * call site: a switched-on holiday with no image at all has to fall through to
 * the model rules, not blank the wallpaper.
 *
 * It lives here, as a pure function, so the decision is covered by
 * `scripts/holiday-check.ts` instead of hiding inside the plugin's apply closure
 * where nothing can reach it.
 */
export function pickHoliday<T extends HolidayCandidate>(
  master: boolean,
  items: readonly T[],
  todayId: HolidayId | null,
  hasImage: (slot: string) => boolean,
): T | null {
  if (!master || todayId === null) return null
  const item = items.find(i => i.id === todayId)
  if (item === undefined || !item.enabled) return null
  return item.images.some(image => hasImage(image.slot)) ? item : null
}
