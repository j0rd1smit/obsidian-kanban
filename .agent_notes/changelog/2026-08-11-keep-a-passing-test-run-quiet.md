# 2026-08-11 - Keep a passing test run quiet

**Why:** Two of the parse smoke tests feed the parser deliberately broken
input, and `StateManager.getParsedBoard` logs a parse failure as well as
recording it. So a fully green run printed two stack traces to stderr, in CI
and in the release log. Nothing was wrong, but a log that is noisy when
everything passes is a log nobody reads — and the next `console.error`, from a
test that happens to still pass, would go straight past.

**What:** The two tests stub `console.error` with `vi.spyOn` and assert it was
called. The noise becomes an assertion: that the failure is reported to the
console, not only recorded on the board, which is how it reaches Obsidian's
developer console and was not covered before. `restoreMocks: true` in
`vitest.config.ts` restores the real logger after each test even when an
assertion throws first.

Deliberately not a global stub in `tests/setup.ts`. That would silence these
two tests and every future unexpected `console.error` with them, which is the
exact problem this change is about.

The source is untouched: logging the failure is correct behaviour in the app,
and it is upstream code.
