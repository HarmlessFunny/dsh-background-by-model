/**
 * Test surface of the host self-check — one import for `node --test`.
 *
 * The probe, the contract table and the on-disk scan are bundled as node entries
 * (`lib/testing.js`) so the tests exercise the code that actually ships rather than
 * a second interpretation of the sources. The client bundle is untouched: this
 * entry exists only for the checks, and it deliberately exports nothing the plugin
 * uses at runtime.
 *
 *   pnpm bundle && node --test .dsh-debug/host-check.test.mjs
 */
export { HOST_CONTRACTS, CONTRACT_GROUPS, DSH_FLOOR, labelOf, symptomOf, verdictOf, reportToMarkdown } from './host-contracts'
export type { ContractResult, HostReport, Lang } from './host-contracts'
export { probeContracts, browserEnv } from './client/judge'
export type { ProbeEnv, ProbeInput, StyleSheetLike, StyleRuleLike } from './client/judge'
export { checkHostOnDisk, meetsFloor, resolveHostRoots, versionOf } from './host-scan'
// The settings UI's stylesheet is data (a template string), so the tests can
// assert that every class the components use is actually defined in it — the one
// kind of typo that React renders without complaint.
export { UI_CSS } from './client/components/ui.css'
