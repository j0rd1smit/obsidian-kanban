# Demo vault

`demo_vault/` at the repo root is a real Obsidian vault for manual testing.

- `yarn build:demo` (one-off) and `yarn dev:demo` (watch) pass `demo` to `esbuild.config.mjs`, which switches `outdir` to `demo_vault/.obsidian/plugins/<manifest.id>` and copies `manifest.json` next to the bundle — Obsidian won't see the plugin without it.
  The plugin id comes from `manifest.json`, so renaming the plugin doesn't need a build change.
- `demo_vault/.obsidian/community-plugins.json` lists the plugin so it is enabled on load.
- The built plugin folder and `workspace.json` are gitignored; the vault's notes and `community-plugins.json` are not.
- `yarn build` / `yarn dev` are unchanged and still write `main.js` + `styles.css` to the repo root.

The vault has two boards: `Auto-move completed cards.md` and `Move cards between boards.md`, the second one being somewhere for a card to move to.
Two tests load the first from disk, so breaking that example board fails `yarn test`.
See [testing.md](testing.md).
