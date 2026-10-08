# Hello Guy | OpenSource

wellcome to my File Manager web application.
this tools will make easy to upload, download file and it has a terminal to use control your linux

## Introduction

The File Manager Easy to use, It is opensource u can optimzie, customize your theme and you can pull request for your best edit to me.
feature : Drang and Drop, formiddle, xterm, webssh, Nexjs, Manage User, Manager Root Folder.

webssh be create by `huashengdun` [GahubLink](https://github.com/huashengdun/webssh) and Me Modify style to Boostrap -> tailwindcss

## Quick Install

`curl -fsSL https://raw.githubusercontent.com/1REDfriend/web-nas/main/script.sh | bash`

and setup your envorument , `npm install && npx prisma generate` , etc...

## Installation

- step 1 : install `Node js, npm`
- step 2 : download this Web-nas to your favorite directory.
- step 3 : cd into, `npm install && npx prisma generate`
- step 4 : `sudo apt install libnss3-tools`
- step 5 : Edit your `.env` File
- step 6 : `npm run dev` or `npm run build` if you setup .env successful.

> **NOTE** if error xterm your should install `sudo apt install build-essential -y` for complie "C" lang to type script.

> **noVNC NOTE** if use x64 or AMD please config a docker compose file.

## Cloudflare Tunnel ....

If you use cloudflare. You should `Disable TLS` on cloudflare zero trush

## ENV

DATABASE_URL="file:./main.sqlite" => Docker overrides this to `/app/data/main.sqlite`

TOKEN_COOKIE="your-token_cookie"

JWT_SECRET="your-jwt_secret"

STORAGE_ROOT="your-storage_root" => Docker overrides this to `/host_root`

STORAGE_INTERNAL="your-storage_internal" => default `storage`; Docker overrides this to `/app/data/storage`

TERMINAL_HOST="" => optional host of the web terminal, e.g. `nas-ssh.example.com` behind a tunnel; read at runtime, so no rebuild is needed; empty means `<the host you opened>:7255`

COOKIE_DOMAIN="example.com" => optional; set it when the terminal is on another subdomain (e.g. `nas.example.com` + `nas-ssh.example.com`) so the login cookie reaches both

PROTECTED_PATHS="" => optional, comma-separated absolute paths that no role (not even ADMIN) can touch from the web UI

Docker-only (read by `docker-compose.yaml`):

NAS_HOST_DIR="/mnt" => the only host folder the app can see, mounted at `/host_root/mnt`; folder assignments use paths like `/mnt/...`

PUID="1000" / PGID="1000" => host user the app runs as; it can only change files that user may change

WEBNAS_PORT="5491" / WEBSSH_PORT="7255" => host ports published by Caddy

> **NOTE** the web terminal (port 7255) is ADMIN-only: Caddy checks the file manager login before every request. Open it on the same host name as the file manager, or set `COOKIE_DOMAIN`, otherwise the browser does not send the login cookie and the terminal answers 401.

## Docker

```
mkdir -p data
docker compose up -d --build
```

The container syncs the database schema on start and keeps everything that must survive a rebuild in `./data` (database and trash).

### Upgrading from the old layout (whole host mounted, database in `prisma/`)

```
docker compose down
mkdir -p data
cp prisma/main.sqlite data/main.sqlite
sudo cp -a storage data/storage && sudo chown -R 1000:1000 data
docker compose up -d --build
```

Keep the old files until everything works. Folder assignments outside `NAS_HOST_DIR` show as Offline until that folder is mounted too.

## Protected Folders

Admins can block actions (view, download, upload, rename, move, delete, share) on any folder per role from **Setting → Protected Folders**. Built-in rules protect OS folders (`/etc`, `/usr`, `/var`, ...) and make GUEST read-only; they can be edited, removed, or restored with **Restore defaults**.

The app folder and `STORAGE_INTERNAL` are always locked, and so is anything in `PROTECTED_PATHS`.

Without Docker, update the database after pulling: `npx prisma db push` (existing install) or `npx prisma migrate deploy` (fresh database).

## Screen Shot

<img width="1880" height="920" alt="image" src="https://github.com/user-attachments/assets/797f01c5-d3c1-4f13-a213-181c97d222a7" />
<img width="1161" height="731" alt="image" src="https://github.com/user-attachments/assets/08f42631-dbad-4a91-9410-1c0f4375e49e" />
<img width="1192" height="281" alt="image" src="https://github.com/user-attachments/assets/724f51ac-4837-49f7-b0a9-8d2211960621" />
<img width="676" height="532" alt="image" src="https://github.com/user-attachments/assets/fa158e30-ce1e-4c2a-8027-c952b49517c6" />
