# CI

What GitHub Actions runs, and the local equivalent (`yarn ci`).

## Workflows

- `.github/workflows/ci.yml` — the gate. Runs on pushes to `custom`, on PRs
  targeting `custom`, and on manual dispatch.
  **Not on `main`**: `main` mirrors upstream and has no `tests/`, no
  `vitest.config.ts` and no fork tooling, so a run there fails for reasons that
  may not be fixed on that branch.
- `.github/workflows/release.yml` — the release. Runs on manual dispatch (the
  button) and on a tag push. See [the release section](#the-release) below.

## The gate

One job, one runner, checks as steps. The checks between `Install` and `Build`
carry `if: ${{ !cancelled() && steps.install.outcome == 'success' }}`, so a
failing typecheck still lets lint, format and the tests report — one run shows
every problem instead of one problem per round trip. Nothing runs if the install
itself failed.

`Build` is the exception and has no `if:`, leaving it on the default `success()`
so it runs only when everything before it passed. It is the one step whose
output nobody wants from a red tree.

| Step | Command | Guards |
| --- | --- | --- |
| Install | `yarn install --frozen-lockfile` | `yarn.lock` agrees with `package.json` |
| Lockfile untouched | `git diff --exit-code -- yarn.lock package.json` | the install did not rewrite either file |
| Lockfile transports | `yarn check:lock` | every dep resolves over npm or `git+https` |
| Typecheck | `yarn typecheck` | `tsc --noemit` over `tsconfig.json` |
| Typecheck tests | `yarn typecheck:tests` | `tsc --noemit` over `tsconfig.tests.json` |
| Lint | `yarn lint` | eslint over `src/` + `tests/`, `--max-warnings 0` |
| Format | `yarn format:check` | prettier check over `src/` + `tests/` |
| Test | `yarn test` | the vitest suite, see [testing.md](testing.md) |
| Build | `yarn build` | esbuild + less actually produce a bundle |

CI does not publish the build anywhere. An Actions artifact would not help: BRAT
installs a beta plugin by downloading `manifest.json`, `main.js` and
`styles.css` **from GitHub release assets**, and an Actions artifact is a zip
behind an authenticated API call, so BRAT cannot read one. Testing a change in a
real vault means `yarn build:demo` locally (see [demo-vault.md](demo-vault.md)),
which the lockfile makes reproducible, or a tagged release through
`release.yml`.

`yarn ci` chains the same commands locally, in the same order, and takes about
25s on a warm `node_modules`.

## The release

Actions -> **Release Obsidian plugin** -> **Run workflow**, on the `custom`
branch, pick `patch` / `minor` / `major`. One job does the whole release:

| Step | What it does |
| --- | --- |
| Refuse to release anything but custom | dispatch from any other branch fails before the checkout |
| Checkout | `fetch-depth: 0`, because the release notes are a `git log` since the last tag |
| Install | `yarn install --frozen-lockfile`, the dependency set CI checked |
| Bump the version | `yarn version --no-git-tag-version --<bump>` then `yarn bump` |
| Check and build | `yarn ci` — the whole gate again, now against the bumped tree |
| Commit and tag | commit the four bumped files, tag `<version>`, push both to `custom` |
| Create release | `gh release create` with `main.js`, `manifest.json`, `styles.css` |

The version bump runs the same two commands a manual release ran, so the
artifacts are identical either way: `yarn version` moves `package.json`,
`yarn bump` copies that into `manifest.json` and `versions.json` (via
`version-bump.mjs`), regenerates `release-notes.md` from `git log <last
tag>..HEAD --oneline`, and stages all four. Nothing is pushed until `yarn ci`
has passed, so a failed release leaves no tag, no commit and no version behind.

The tag-push trigger is still there, so a local `yarn bump && yarn release`
publishes exactly as it did before. It cannot double-fire on the button: the
workflow pushes its tag with `GITHUB_TOKEN`, and GitHub does not start workflow
runs from pushes made with that token. The same rule means the release commit
lands on `custom` without a CI run — which is why the release runs `yarn ci`
itself rather than trusting an earlier run.

`steps.bump.outputs.tag` is empty on the tag-push path, so the publish step
falls back to `github.ref_name` — the tag that started the run.

## The three TS programs

`tsc` is pointed at a different project for each job, because no single one
covers all three:

| Project | Include | Used by |
| --- | --- | --- |
| `tsconfig.json` | `src/*.ts(x)` + imports | `yarn typecheck`, esbuild |
| `tsconfig.tests.json` | `tests/**/*.ts` + `src/types.d.ts` + imports | `yarn typecheck:tests` |
| `tsconfig.eslint.json` | all of `src/` + `tests/` | eslint's parser only |

`tsconfig.tests.json` includes `tests/` and lets the `src/` modules the tests
use arrive through imports, the same way `tsconfig.json` reaches `src/`
subdirectories. Pointing `tsc` at `tsconfig.eslint.json` instead would not work:
it includes upstream files the app never imports (the flatpickr plugins), which
have implicit-any errors nobody here intends to fix.

It has to name `src/types.d.ts` explicitly. That file declares the globals
Obsidian injects (`app`, `HTMLAttributes`, `h`, `Fragment`); `tsconfig.json`
picks it up through its `src/*.ts` glob, but nothing imports it, so a program
without it fails in `src/` with `Cannot find name 'app'`.

Its `lib` is `es2022`, where `tsconfig.json` is `es2018`. Tests run under node
via vitest, not in the bundle esbuild targets, so they may use `Array.prototype
.at` and friends — `src/` stays held to es2018.

## Lockfile checking

`scripts/check-lockfile.mjs` allowlists the transports every `resolved` line may
use: `https://registry.npmjs.org/`, `git+https://`, and a bare
`https://github.com/<owner>/<repo>#<40-char sha>` (a git dep, not a download).
Anything else fails with the line number and a fix hint; SSH URLs and
codeload/github tarballs get a specific message, because those are the two that
have already broken an install here. `--frozen-lockfile` cannot catch them — the
lockfile is perfectly in sync, it just points at something unreachable.

`node scripts/check-lockfile.mjs <path>` runs it against a fixture instead.

## Toolchain pinning

`.nvmrc` holds the node version (22), and both workflows read it with
`setup-node`'s `node-version-file`. Bump it in one place.

## Gotchas

- `tsconfig.json` only includes `src/*.ts(x)` plus what those files import, so
  type-aware eslint rules used to die with "TSConfig does not include this file"
  on 13 files (locales, flatpickr plugins, ambient `.d.ts`). Lint therefore runs
  against **`tsconfig.eslint.json`**, which includes all of `src/` and `tests/`.
  `tsc` never uses it — `tests/` is typechecked through `tsconfig.tests.json`.
- Lint runs with `--max-warnings 0`. Name a deliberately unused argument `_foo`;
  `@typescript-eslint/no-unused-vars` is configured with
  `argsIgnorePattern: '^_'`.
- `yarn lint` used to be `eslint ./src/**/*.{ts,tsx}`, whose coverage depended on
  whether the shell running it expands `**` and braces. It is `eslint src tests
  --ext .ts,.tsx` now, which globs the same way everywhere.
- `src/lang/helpers.ts:22` imports the Ukrainian locale from `./locale/tr`
  (upstream bug), which is why `src/lang/locale/uk.ts` is in no TS program. Left
  alone — fixing it is an upstream change, not a CI one.
- The release pushes a commit straight to `custom` with `GITHUB_TOKEN`. A branch
  protection rule on `custom` that requires a pull request would reject that
  push — after the tag was already created locally in the runner, so the tag
  never reaches GitHub and the run just fails. Re-running after removing the
  rule is safe; nothing was published.
- `workflow_dispatch` only shows a "Run workflow" button for workflows that
  exist on the repository's **default branch**. Here the default branch is
  `custom`, which is why the button is visible at all — it would not be if the
  default were `main`.
- Prettier checks `src/` and `tests/` only. The root `.mjs` files
  (`buffer-es6.mjs`, `version-bump.mjs`) are upstream's and are not
  prettier-clean; reformatting them would create merge conflicts for no gain.
