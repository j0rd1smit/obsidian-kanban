#!/bin/bash
# SessionStart hook: installs project dependencies at the start of cloud
# sessions only. Local sessions skip this — dependency management there stays
# manual (yarn install when you actually need it), same as every other
# workflow here. See .claude/settings.json for the hook wiring and
# https://code.claude.com/docs/en/cloud-environments#install-dependencies-with-a-sessionstart-hook.
set -euo pipefail

if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

cd "$CLAUDE_PROJECT_DIR"

# --frozen-lockfile: fail loudly instead of silently rewriting yarn.lock if
# it's drifted from package.json. Node + yarn are already on the cloud VM, so
# there's nothing to provision first.
yarn install --frozen-lockfile

# The sandbox egress proxy only allows the npm registry + git+https. SSH git
# deps and codeload.github.com tarballs have broken installs here before
# (.agent_notes/changelog/2026-08-10-*.md). Same check CI runs — fail fast
# here with a clear message instead of a confusing install error.
yarn check:lock
