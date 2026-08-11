# 2026-08-11 - Release from a button in the Actions tab

**Why:** A release was four local commands in the right order —
`yarn version`, `yarn bump`, `yarn release`, and a hope that the tree was clean
and the checks passed — on a machine with a working `node_modules` and push
rights. Every one of those is a way to ship a build nobody checked: the tag
path in `release.yml` built and published whatever the tag pointed at, with no
gate in front of it. The ask was one button.

**What:** `release.yml` grew a `workflow_dispatch` trigger with a single
`patch` / `minor` / `major` input, and the job now does the whole release:
bump, check, commit, tag, publish.

The bump is the same two commands the manual release ran (`yarn version
--no-git-tag-version --<bump>` then `yarn bump`), so `manifest.json`,
`versions.json` and `release-notes.md` are produced by exactly the code that
produced them before — this automates the process, it does not reimplement it.
`yarn ci` then runs against the bumped tree, and only after it passes does
anything get committed, tagged or pushed. A failed release leaves nothing
behind.

The tag-push trigger stays, so a local `yarn bump && yarn release` still works
as an escape hatch. It cannot double-publish: the button's tag is pushed with
`GITHUB_TOKEN` and GitHub does not start workflow runs from those. That same
rule is why the job re-runs `yarn ci` instead of trusting the CI run on the
commit being released — the release commit itself never gets one.

A dispatch from any branch other than `custom` fails on the first step.
`custom` holds this fork's version numbers and its tooling; the Actions UI will
happily offer any branch, and `main` mirrors upstream, where a release would be
meaningless.
