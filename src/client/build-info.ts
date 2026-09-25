/**
 * Build-time facts about this plugin, for the host self-check report.
 *
 * `tsdown` replaces `__DAB_VERSION__` / `__DAB_DSH_FLOOR__` with literals read
 * from `package.json` (see tsdown.config.ts), so the client bundle can name the
 * running plugin version and the dsh floor it was built against without a runtime
 * lookup. The `typeof` guards keep the module importable by a plain Node test,
 * where nothing has replaced the identifiers.
 */

declare const __DAB_VERSION__: string | undefined
declare const __DAB_DSH_FLOOR__: string | undefined

/** This plugin's version at build time ('0.0.0' when built unbundled). */
export const PLUGIN_VERSION: string =
  typeof __DAB_VERSION__ === 'string' ? __DAB_VERSION__ : '0.0.0'

/** The dsh floor this build declares, straight from `engines.dsh`. */
export const DSH_FLOOR: string =
  typeof __DAB_DSH_FLOOR__ === 'string' ? __DAB_DSH_FLOOR__ : '0.1.7-rc.2'
