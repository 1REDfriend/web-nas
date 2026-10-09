# End-to-end tests

Each suite talks to a real `next dev` server over HTTP, with its own database, storage tree and accounts. Nothing touches your `.env`, your database or your files.

```
npm run test:e2e                 # every suite (about 5 minutes)
npm run test:e2e -- search trash # only suites whose name contains a filter
```

Needs `npm install` and `npx prisma generate` first. The test server listens on port `47213` (`E2E_PORT` to change it). Fixtures are created in `<os temp>/web-nas-e2e` (`E2E_WORK_DIR` to change it); they must live outside the project, because the app always locks its own folder.

## How it works

- `run-all.mjs` builds an empty database with `prisma db push`, then for each group of suites resets the fixtures, starts the server, runs the suites and stops it.
- `fixtures.mjs` creates the storage tree, a symlink that points outside storage, four accounts (`e2e_admin`, `e2e_alice`, `e2e_bob`, `e2e_guest`) with a random password, and random `JWT_SECRET` / cookie name.
- `STORAGE_WRITABLE_PATHS` is set to `alice`, `bob` and `shared`, standing in for the mounted disk in Docker; `appdir` stands in for a protected app folder.

## Suites

| Suite | Covers |
|---|---|
| `path-guard` | `../` and symlink escapes, folder ownership, trash, default protected-folder rules, admin rules |
| `share-links` | public share links: scope, expiry, recursive/single-file shares, revoking |
| `auth-sessions` | first-run registration only, forged headers, session revocation, forced password change, login rate limit |
| `terminal-gate` | `/api/auth/terminal-check` used by Caddy for the web terminal |
| `offline-disk` | a missing folder is reported, never deleted from the folder assignments |
| `limits` | idle/absolute session expiry, share-link rate limits |
| `starred-recent-preview` | Starred and Recent views, stars following renames and moves, bounded text preview |
| `trash-restore` | restoring items, name clashes, permission re-checks, tampered trash files |
| `persistent-storage` | writes only inside `STORAGE_WRITABLE_PATHS`, storage folders cannot be deleted |
| `media-preview` | `/api/files/raw`: type allowlist, Range requests, permissions |
| `search` | search through subfolders, limits, permission filtering |
| `empty-trash` | emptying only your own trash, symlinks, confirmation |
| `thumbnails` | thumbnail generation, cache, decompression bombs, permissions |
| `share-media` | media preview and thumbnails through share links |

A suite prints one `PASS`/`FAIL` line per check and exits non-zero if any check fails; the runner shows the full output of failing suites only.
