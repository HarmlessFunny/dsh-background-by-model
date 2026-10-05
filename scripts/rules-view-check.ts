/**
 * Checks for the rule-tab layout — `pnpm check:rules`.
 *
 * Two halves, because the tab strip is half decision and half structure, and both
 * fail in ways a screenshot at rest would not show:
 *
 *   1. the DECISION (`src/client/rules-view.ts`) — which rule the editor shows,
 *      and which one it shows after a deletion. A selection that resets on every
 *      render, or a deletion that drops the user back at rule 1, is a flicker and
 *      a lost place: neither is an error anywhere, and both are pure functions.
 *   2. the STRUCTURE (the page source and its stylesheet) — the whole point of
 *      the redesign is that the page renders ONE editor and a strip that cannot
 *      grow taller with the rule count. These are properties of the JSX and the
 *      CSS, so they are pinned textually, the same way `repaint-check.ts` pins
 *      the layer contract it cannot run.
 *
 * Runs on plain `node` (≥ 22.6 strips the types itself), no dependency, no
 * transform — the same shape as `scripts/rotation-check.ts`.
 */
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { neighbourAfter, resolveTab } from '../src/client/rules-view.ts'

const HERE = dirname(fileURLToPath(import.meta.url))
const read = (rel: string): string => readFileSync(resolve(HERE, '..', rel), 'utf8')

let failures = 0
function check(label: string, got: unknown, want: unknown): void {
  const ok = JSON.stringify(got) === JSON.stringify(want)
  if (!ok) failures++
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}${ok ? '' : ` — got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`}`)
}
function ok(label: string, cond: boolean, detail = ''): void {
  if (!cond) failures++
  console.log(`${cond ? 'ok  ' : 'FAIL'} ${label}${cond || detail === '' ? '' : ` — ${detail}`}`)
}

const rules = (...ids: string[]): Array<{ id: string }> => ids.map(id => ({ id }))

// ── 1. which rule the editor shows ─────────────────────────────────────────
console.log('--- the selection is the user\'s ---')
check('the held rule wins over the active one',
  resolveTab(rules('a', 'b', 'c'), 'c', 'a')?.id, 'c')
check('the held rule survives a reorder',
  resolveTab(rules('c', 'a', 'b'), 'c', 'a')?.id, 'c')
check('a model switch does not move the selection',
  resolveTab(rules('a', 'b'), 'b', 'a')?.id, 'b')

console.log('\n--- the fallbacks run only when they must ---')
check('nothing held: the active rule is shown',
  resolveTab(rules('a', 'b', 'c'), null, 'b')?.id, 'b')
check('nothing held and nothing live: the first rule',
  resolveTab(rules('a', 'b'), null, null)?.id, 'a')
check('a held id that is gone (an import replaced the list) falls back to the active rule',
  resolveTab(rules('x', 'y'), 'a', 'y')?.id, 'y')
check('a held id that is gone with nothing live falls back to the first rule',
  resolveTab(rules('x', 'y'), 'a', null)?.id, 'x')
check('an empty list shows nothing',
  resolveTab(rules(), 'a', 'b'), null)

// ── 2. where a deletion lands ──────────────────────────────────────────────
console.log('\n--- deleting a rule lands on its neighbour ---')
check('a middle rule hands over to the NEXT one',
  neighbourAfter(rules('a', 'b', 'c'), 'b')?.id, 'c')
check('the last rule hands over to the PREVIOUS one',
  neighbourAfter(rules('a', 'b', 'c'), 'c')?.id, 'b')
check('the first of two hands over to the second',
  neighbourAfter(rules('a', 'b'), 'a')?.id, 'b')
check('the only rule leaves nothing',
  neighbourAfter(rules('a'), 'a'), null)
check('an id that is not in the list leaves nothing',
  neighbourAfter(rules('a', 'b'), 'zz'), null)

// ── 3. the page renders one editor, and the strip cannot grow ──────────────
console.log('\n--- the page structure ---')
const page = read('src/client/components/pages/ModelBgPage.tsx')
const css = read('src/client/components/ui.css.ts')

// Exactly one <RuleCard> is DRAWN (the other occurrence is the declaration).
const drawn = [...page.matchAll(/<RuleCard\b/g)].length
check('the page draws exactly one rule editor', drawn, 1)
ok('the editor is mounted inside the tab panel', /<div className="dab-rule-panel"[^>]*>[\s\S]{0,400}<RuleCard\b/.test(page))
ok('no rule card is rendered per rule in a list', !/<RuleCard\b[^>]*\/>\s*\)\)/.test(page))
// The accordion that let every rule hold its own open editor is gone.
ok('the old stacked list container is gone', !page.includes('dab-rules') && !css.includes('.dab-rules{'))
ok('RuleCard no longer owns an open/collapsed state',
  !/const \[open, setOpen\]/.test(page) && !page.includes('aria-expanded={open}'))

// The strip, the panel and the picker each have a rule in the stylesheet.
for (const cls of ['dab-tabs-row', 'dab-tabs', 'dab-tab', 'dab-tab-match', 'dab-tab-live',
  'dab-tab-rot', 'dab-tab-icon', 'dab-tab-thumb', 'dab-pick-menu', 'dab-pick-item',
  'dab-rule-panel', 'dab-confirm-txt']) {
  ok(`.${cls} is styled`, css.includes(`.${cls}{`) || css.includes(`.${cls},`))
}

// The strip's actions must live OUTSIDE the horizontal scroller: inside it, a
// long rule list scrolls the add button off the end, and adding a rule becomes
// the one thing the user cannot reach without scrolling to the bottom first.
const stripOpen = page.indexOf('<div className="dab-tabs"')
const addBtn = page.indexOf('className="dab-tab dab-tab-icon" onClick={onAdd}')
ok('the rule tabs are rendered in the strip', stripOpen >= 0 && page.indexOf('role="tab"', stripOpen) > stripOpen)
ok('the add button sits after the strip, not inside it', addBtn > stripOpen)
ok('the tab strip renders no action tile of its own', addBtn > 0 && !page.slice(stripOpen, addBtn).includes('onClick={onAdd}'))

// The two properties that keep the page height independent of the rule count:
// the strip scrolls sideways instead of wrapping, and the label elides so a long
// match string cannot widen a tab.
const tabsRule = css.match(/\.dab-tabs\{([^}]*)\}/)?.[1] ?? ''
ok('the strip scrolls sideways', tabsRule.includes('overflow-x:auto'), tabsRule)
ok('the strip never wraps', !tabsRule.includes('flex-wrap:wrap'), tabsRule)
// The strip's bar must be the panel's bar, not the platform default. That means
// the host's scrollbar block applied to OUR scroller (see ui.css.ts) — and the
// stylesheet is injected into the host page, so every selector in it has to be
// scoped to a dab- class rather than restyling the whole harness.
const dabSel = css.match(/\.dab-tabs,\.dab-pick-menu\{([^}]*)\}/)?.[1] ?? ''
ok('the strip declares the host scrollbar tokens',
  dabSel.includes('--dsh-scrollbar-thumb:') && dabSel.includes('--dsh-scrollbar-width:'), dabSel)
const scrollerRules = [...css.matchAll(/^[ \t]*([^{}\n]*::-webkit-scrollbar[^{]*)\{/gm)]
  .filter(m => !m[1]!.trimStart().startsWith('*') && !m[1]!.trimStart().startsWith('/*'))
ok('the scroller carries a 5px webkit bar',
  scrollerRules.some(m => m[1]!.includes('.dab-tabs::-webkit-scrollbar')), String(scrollerRules.length))
// The host's bar has no stepper arrows; the platform default has two, one at
// each end of the track, and only this rule removes them.
ok('the platform stepper arrows are hidden',
  scrollerRules.some(m => m[1]!.includes('scrollbar-button')), '')
for (const rule of scrollerRules) {
  ok(`scrollbar rule is scoped to the plugin: ${rule[1]!.trim().slice(0, 56)}`,
    !/(^|,)\s*::-webkit-scrollbar/.test(rule[1]!), rule[1]!)
}
ok('the native-thin bar is not used (it ignores the webkit block)',
  !/scrollbar-width:thin/.test(tabsRule), tabsRule)
const tabRule = css.match(/\.dab-tab\{([^}]*)\}/)?.[1] ?? ''
ok('a tab is a fixed height', tabRule.includes('height:34px'), tabRule)
// The icon buttons beside the strip must sit on the tabs' line. The strip is the
// taller box (its height includes the horizontal scrollbar, which no other tile
// has), so: the row aligns by TOP edge and adds no padding of its own below the
// tiles, and the strip's own bottom padding is the entire gap between the tiles
// and the bar. Center the row, or move that padding onto the row, and the bar
// stops being equidistant from the tabs and from the icon buttons.
const rowRule = css.match(/\.dab-tabs-row\{([^}]*)\}/)?.[1] ?? ''
ok('the row aligns its tiles by the top edge', rowRule.includes('align-items:flex-start'), rowRule)
ok('the row adds no padding below the bar', rowRule.includes('padding-bottom:0'), rowRule)
ok('the strip owns the whole gap under the tiles',
  /padding:3px 2px [1-9]/.test(tabsRule), tabsRule)
const iconRule = css.match(/\.dab-tab-icon\{([^}]*)\}/)?.[1] ?? ''
ok('the icon tiles mirror the strip\'s top padding', iconRule.includes('margin-top:3px'), iconRule)
const matchRuleCss = css.match(/\.dab-tab-match\{([^}]*)\}/)?.[1] ?? ''
ok('a long match string elides instead of widening the tab',
  matchRuleCss.includes('text-overflow:ellipsis') && matchRuleCss.includes('nowrap'), matchRuleCss)

console.log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`}`)
process.exit(failures === 0 ? 0 : 1)
