# End-to-end tests

Each suite talks to a real `next dev` server over HTTP, with its own database, storage tree and accounts. Nothing touches your `.env`, your database or your files.

```
npm run test:e2e                 # every suite (about 5 minutes)
npm run test:e2e -- search trash # only suites whose name contains a filter
npm run test:unit                # unit tests in tests/unit (no server needed)
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
| `api-keys` | API keys on `/api/v1`: bad, revoked and expired keys, keys rejected outside `/api/v1`, forged headers, GUEST and password-change owners, bad-key rate limit |
| `api-key-manage` | creating, listing and revoking keys from a browser session: validation, owners only, GUEST and API keys refused, active-key limit |
| `api-limits` | per-key limits: requests per minute (also on the upload routes) and upload size cap for raw, chunked and multipart uploads |
| `api-files` | `/api/v1` list, stat, download (Range, zip), raw and multipart upload, folders, delete; scopes, folder-locked keys, symlinks out of the key folder, auth on the routes that skip `proxy.ts` |
| `drops-admin` | drop settings (ADMIN only, limit and folder checks), the expiry sweeper (expired, used-up, abandoned and leftover drops), moving drops when the drop folder changes, drop folder locked in the file manager |
| `api-drops` | `/api/v1/drops` raw and multipart upload, options and their checks, `drop` scope, GUEST, upload cap and per-user quota, links, list / get / remove, nothing left behind by a refused upload |
| `public-drops` | the public side: `/d/<id>` page (noindex), info, download counting, Range on unlimited drops only, limits never exceeded (also with parallel downloads), previews, expired / removed / used-up links |
| `inbox-manage` | upload links for the owner and admin: who may create them, input checks, link names, owners only, pausing, admin switches (off, roles, required expiry) |
| `inbox-public` | sending files through an upload link without login: safe names, numbered duplicates, sender folders, file types, size / count / total / quota limits (also with parallel uploads), password unlock and its rate limit, paused / expired / deleted links, owner losing the folder |
| `upload` | browser upload route: success, name clash, large binary, missing folders, bad names, permissions |

A suite prints one `PASS`/`FAIL` line per check and exits non-zero if any check fails; the runner shows the full output of failing suites only.
