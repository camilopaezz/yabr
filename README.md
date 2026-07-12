# Tauri + React + Typescript

This template should help get you started developing with Tauri, React and Typescript in Vite.

## Development

This project uses [Bun](https://bun.sh) as its package manager. `bun.lock` is the canonical lockfile — do not commit `package-lock.json` or `yarn.lock`.

```bash
bun install          # install dependencies
bun run dev          # start the Vite dev server
bun run tauri dev    # start the Tauri desktop app
bun run build        # production frontend build
bun run test         # run unit tests (Vitest)
bun run test:e2e     # run Playwright e2e tests
```

## Recommended IDE Setup

- [VS Code](https://code.visualstudio.com/) + [Tauri](https://marketplace.visualstudio.com/items?itemName=tauri-apps.tauri-vscode) + [rust-analyzer](https://marketplace.visualstudio.com/items?itemName=rust-lang.rust-analyzer)
