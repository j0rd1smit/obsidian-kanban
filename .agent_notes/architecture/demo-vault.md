# Demo vault

`demo_vault/` at the repo root is a real Obsidian vault for manual testing.

- `yarn build:demo` (one-off) and `yarn dev:demo` (watch) pass `demo` to `esbuild.config.mjs`, which switches `outdir` to `demo_vault/.obsidian/plugins/<manifest.id>` and copies `manifest.json` next to the bundle — Obsidian won't see the plugin without it.
  The plugin id comes from `manifest.json`, so renaming the plugin doesn't need a build change.
- `demo_vault/.obsidian/community-plugins.json` lists the plugin so it is enabled on load.
- The built plugin folder and `workspace.json` are gitignored; the vault's notes and `community-plugins.json` are not.
- `yarn build` / `yarn dev` are unchanged and still write `main.js` + `styles.css` to the repo root.

The vault has three boards and one note:

- `Auto-move completed cards.md` — ticking a card's checkbox in the board.
- `Move cards between boards.md` — somewhere for "Move to other board" to move a card to.
- `Completed from a query.md` — for ticking a card from outside the board, including a `Kept as-is` list marked `**Complete**` to show the opt-out. It is written in exactly the form `boardToMd` emits, so opening it does not rewrite it.
- `Tick a card from a query.md` — the Dataview and Tasks queries over that board, and the cases worth trying by hand (board closed, board open, Obsidian restarted, a card already in the wrong list, the opt-out, the setting off). Needs the Dataview and Tasks plugins, both listed in `community-plugins.json`.

Tests load `Auto-move completed cards.md` and `Completed from a query.md` from disk, so breaking either example fails `yarn test`.
See [testing.md](testing.md) and [card-completion.md](card-completion.md).
