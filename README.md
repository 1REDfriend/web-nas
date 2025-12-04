# Hello Guy | OpenSource

wellcome to my File Manager web application.
this tools will make easy to upload, download file and it has a terminal to use control your linux

## Hot Fix `Commits on Nov 30, 2025`

- Fix next lint
- Fix suspense tags
- Fix prisma permission
- Fix owner
- Fix cookie secure with caddy (look like a nginx)

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

DATABASE_URL="file:./main.sqlite"

TOKEN_COOKIE="your-token_cookie"

JWT_SECRET="your-jwt_secret"

STORAGE_ROOT="your-storage_root"

STORAGE_INTERNAL="your-storage_internal" => default use `storage` 

NEXT_PUBLIC_TERMINAL_HOST="your-next_public_terminal_host"

> **NOTE** if you will use external disk without docker, you should Edit `volume - /:/host_root` and change `.env STORAGE_ROOT` to `/host_root` 

## Screen Shot

<img width="1880" height="920" alt="image" src="https://github.com/user-attachments/assets/797f01c5-d3c1-4f13-a213-181c97d222a7" />
<img width="1161" height="731" alt="image" src="https://github.com/user-attachments/assets/08f42631-dbad-4a91-9410-1c0f4375e49e" />
<img width="1192" height="281" alt="image" src="https://github.com/user-attachments/assets/724f51ac-4837-49f7-b0a9-8d2211960621" />
<img width="676" height="532" alt="image" src="https://github.com/user-attachments/assets/fa158e30-ce1e-4c2a-8027-c952b49517c6" />
