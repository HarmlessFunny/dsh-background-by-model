/**
 * The project's public repository — the ONE address the shell links to.
 *
 * Both links the interface ships (the brand in the header, the package name in
 * the profile footer) read this constant: two literals would drift the day the
 * repository moves, and a link that points at the wrong place is indistinguishable
 * from a link that works until someone clicks it. `scripts/ui-strings-check.ts`
 * holds it against `package.json`'s `repository`, which is what npm and the
 * plugin market read.
 */
export const REPO_URL = 'https://github.com/HarmlessFunny/dsh-background-by-model'
