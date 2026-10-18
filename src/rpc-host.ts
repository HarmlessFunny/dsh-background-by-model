/**
 * The RPC transport, as a mountable plugin.
 *
 * Why it is its own plugin: a plugin's `apply` runs in a fiber that can resolve
 * exactly the services its `inject` declaration names. Calling `ctx.inject(...)`
 * from inside that `apply` asks a SECOND question — the callback gets a nested
 * fiber rather than the one the module asked for — and reading `connection` from
 * there failed at load, inside the effect: the page still rendered (the client
 * half paints from its own state) while every RPC answered 405 from the fallback
 * route. One fiber, one registration, and the services read directly off the
 * context cordis hands `apply`.
 */
export const name = 'dsh-background-by-model-rpc'
export const inject = ['connection', 'webServer']

export function apply(ctx: any): void {
  // Mounted by ./index as a child plugin (see the header), which hands the
  // dispatcher and the channel over as its config — importing ./index back would
  // create a second edge between the two entries, and rolldown would then lift the
  // shared code into a chunk the loader cannot serve.
  const dispatch = ctx.config?.dispatchRpc
  const channel = ctx.config?.rpcChannel
  if (typeof dispatch !== 'function' || typeof channel !== 'string') {
    throw new Error('dsh-background-by-model: the RPC transport was mounted without its dispatcher')
  }
  // Registered through the connection service's own registry — the same path the
  // host mounts `/api` on — so the body cap, the request-envelope schema, the
  // method/endpoint match, the Host/Origin fence and the browser credential all
  // follow the host instead of being reimplemented here.
  const registry = ctx.connection.rpc
  ctx.effect(
    () => registry.handle(channel, (endpoint: unknown, payload: unknown) => dispatch(ctx, endpoint, payload)),
    'dsh-background-by-model: rpc channel',
  )
}
