/**
 * Checks for the code block's surface — `pnpm check:code-plate`.
 *
 * The code block is the one surface whose INK the plugin does not own: the host's
 * shiki sheet paints it, and that sheet flips as a group with the scheme
 * (`body[data-ds-dark-theme]{--shiki-token-*}`). Two failures follow, both seen
 * in the wild:
 *
 *   1. a plate that does not come from the same branch as the ink. The host
 *      declares `--shiki-background: var(--dsw-alias-markdown-code-block)` (and
 *      `--shiki-foreground`) on `:root`, and a custom property is substituted where
 *      it is DECLARED — once, on <html>. With the palette on `body` only, the plate
 *      there was nothing but the fade registration's `initial-value`, i.e. the
 *      host's own colour read while our sheet was muted: the block stayed on the
 *      host's DARK plate through every light palette while the ink went dark
 *      ("代码块背景有点问题"). Hence BOTH requirements below — the palette rule must
 *      reach `:root`, and the plate must be a palette tint (a constant can only
 *      ever match one of the two ink sets) — plus the `:root` fade scope, or the
 *      block would jump to the new tint while everything around it faded;
 *   2. a code surface no slider can reach. The block carries text and the shipped
 *      profile keeps its plate nearly opaque, but the alpha has to EXIST: the
 *      plate and its banner are painted by the host's own components, so nothing
 *      else in the palette machinery would ever touch them.
 *
 * The colour half is behavioural (`genTokens` is pure); the wiring half is
 * textual, the same shape `scripts/repaint-check.ts` uses for the plugin-owned
 * surfaces — a key added to the CSS mapping but not to the settings table (or the
 * other way round) looks correct at every other level.
 */
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { genTokens } from '../src/client/utils/color.ts'
import { zh, en } from '../src/client/i18n.ts'

const HERE = dirname(fileURLToPath(import.meta.url))
const read = (...p: string[]): string => readFileSync(resolve(HERE, ...p), 'utf8')
const wallpaper = read('../src/client/wallpaper.ts')
const schema = read('../src/schema.ts')
const page = read('../src/client/components/pages/InterfacePage.tsx')

let failures = 0
function check(label: string, got: unknown, want: unknown): void {
  const ok = JSON.stringify(got) === JSON.stringify(want)
  if (!ok) failures++
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}${ok ? '' : ` — got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`}`)
}

const PLATE = '--dsw-alias-markdown-code-block'
const BANNER = `${PLATE}-banner`
const lightness = (v: string | undefined): number => Number(/hsl\(\d+,\d+%,(\d+)%\)/.exec(v ?? '')?.[1])

console.log('--- the plate and its banner follow the palette, in both branches ---')
// `dark = lit < 0.55` is the branch switch, and it is the SAME switch the host's
// ink uses (via data-ds-dark-theme), so both sides are exercised.
const dark = genTokens(220, 0.55, 0.2)
const light = genTokens(220, 0.55, 0.8)
check('the dark palette is the one under test', dark.colorScheme, 'dark')
check('the light palette is the one under test', light.colorScheme, 'light')
check('the dark plate is a tint of that palette', /^hsl\(/.test(dark.tokens[PLATE] ?? ''), true)
check('the light plate is a tint of that palette', /^hsl\(/.test(light.tokens[PLATE] ?? ''), true)
// The tint has to be the palette's, not a coincidence of this hue: two different
// palettes must not produce the same plate.
check('two palettes do not share one plate', dark.tokens[PLATE] !== light.tokens[PLATE], true)
check('both palettes own the banner',
  [/^hsl\(/.test(dark.tokens[BANNER] ?? ''), /^hsl\(/.test(light.tokens[BANNER] ?? '')], [true, true])
// The banner is the language label's own surface: it must stay visible against the
// plate it sits on, or the two merge into one slab of colour.
check('the banner is a visible step off its plate',
  [Math.abs(lightness(light.tokens[BANNER]) - lightness(light.tokens[PLATE])),
   Math.abs(lightness(dark.tokens[BANNER]) - lightness(dark.tokens[PLATE]))].map(d => d >= 2),
  [true, true])

console.log('--- the palette rule reaches the root element, and fades there ---')
// Textual on purpose: the failure is a missing selector on ONE line, and a
// `body{…}` rule looks completely correct at every other level.
check('the token rule is emitted for :root as well as body',
  /ensureTokenStyle\(\)\.textContent = `:root,body\{/.test(wallpaper), true)
check('and never for body alone again',
  /ensureTokenStyle\(\)\.textContent = `body\{/.test(wallpaper), false)
// Only the element that DECLARES a token animates it, and the host's root-level
// shiki variables are the plate itself — without this scope the block jumps.
check('root carries the same fade scope as the body',
  /\{ selector: ':root', tokens: fadeTokenNames\(\) \}/.test(wallpaper), true)
check('the body still does too',
  /\{ selector: 'body', tokens: fadeTokenNames\(\) \}/.test(wallpaper), true)

console.log('--- the code surface has an alpha of its own ---')
const OPACITY_VARS = /const OPACITY_VARS: Record<string, string> = \{([\s\S]*?)\n\}/.exec(wallpaper)?.[1] ?? ''
check('the plate reads the code opacity variable',
  new RegExp(`'${PLATE}': '--dsh-any-op-code'`).test(OPACITY_VARS), true)
// Its own variable, not the plate's: the writer sets one variable per token NAME,
// so a shared name leaves whichever token is written last painting both surfaces.
check('and the banner reads one of its own, same slider',
  new RegExp(`'${BANNER}': '--dsh-any-op-code-banner'`).test(OPACITY_VARS), true)
const GROUPS = /const OPACITY_TOKEN_GROUPS:[\s\S]*?= \[([\s\S]*?)\n\]/.exec(wallpaper)?.[1] ?? ''
check('both ride one part group',
  /part: 'code', names: \['--dsw-alias-markdown-code-block', '--dsw-alias-markdown-code-block-banner'\]/.test(GROUPS), true)

console.log('--- and a slider to move it (schema + page + both dictionaries) ---')
check('the key list carries the part',
  /PART_OPACITY_KEYS = \['bg', 'sidebar', 'card', 'code', 'input'\] as const/.test(schema), true)
check('it ships on the profile\'s own 81%',
  /DEFAULT_PART_OPACITIES: PartOpacities = \{[^}]*\bcode: 0\.81\b[^}]*\}/.test(schema), true)
check('the Interface page renders it, opacity only',
  /\{ opKey: 'code', labelKey: 'uiOpacityCode', Icon: CodeIcon, noBlur: true \}/.test(page), true)
check('the label exists in both dictionaries', [zh.uiOpacityCode, en.uiOpacityCode], ['代码块', 'Code blocks'])

console.log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`}`)
process.exit(failures === 0 ? 0 : 1)
