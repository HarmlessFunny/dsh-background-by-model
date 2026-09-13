import type { Context } from '@deepseek-ai/cordis'
import type { InvariantInstaller } from '@deepseek-ai/dsh-invariants'

const PACKAGE_NAME = 'dsh-background-by-model'

export const name = 'dsh-background-by-model-invariant'
export const inject = ['invariants']

// No runtime invariant: the plugin registers a theme definition through the
// existing ThemeRuntime service and emits no cross-plugin mutable state.
const install: InvariantInstaller = () => {}

export const apply = (ctx: Context): Promise<() => void> =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
