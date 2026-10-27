# แผน เฟส 3: ลิงก์รับไฟล์ (Drop request) และ Paste / Gist

วันที่: 2026-10-27
สถานะ: ส่วน A ทำเสร็จ และรวมเข้ากับฝากไฟล์ (Drops) แล้ว 2026-10-27 · ส่วน B ยังไม่เริ่ม
ต่อจาก: [2026-10-25-temp-file-drop.md](2026-10-25-temp-file-drop.md)

## เป้าหมาย

ตอนนี้ฝากไฟล์ (Drop) ไปได้ทางเดียว: **เจ้าของ** อัปไฟล์ → ได้ลิงก์ให้คนอื่น **โหลด**
เฟสนี้เพิ่มสองอย่าง

1. **ลิงก์รับไฟล์ (Drop request):** เจ้าของเปิดลิงก์ของตัวเอง เช่น `nas.supaxit.com/u/tong-homework`
   แล้ว **คนอื่นที่ไม่ได้ล็อกอิน** เปิดลิงก์นั้นมาลากไฟล์ใส่ได้ ไฟล์กลายเป็น Drop ของเจ้าของ
   (แบบ File Request ของ Dropbox / Google Form ที่รับไฟล์)
2. **Paste / Gist:** วางข้อความหรือโค้ดลงไป ได้ลิงก์สั้นๆ เปิดดูมีสีโค้ด มีปุ่ม raw ไว้ `curl`
   หนึ่ง paste มีได้หลายไฟล์แบบ gist ตั้งหมดอายุ / อ่านครั้งเดียวแล้วลบ / ใส่รหัสได้

## ของที่มีอยู่แล้วและจะใช้ต่อ

- การรับไฟล์แบบ stream ลงดิสก์ (`parseUploadForm` ใน `upload-service.ts`) และวิธีเลี่ยง `proxy.ts`
  ที่ใช้กับ `pages/api/v1/drops/upload.ts`
- path-guard (`authorizePath`) ตรวจว่าโฟลเดอร์ปลายทางอยู่ในพื้นที่ของเจ้าของและไม่ติด PathRule
- rate limit ต่อ IP (`rate-limit.ts`, `assertShareRateLimit`) และ IP จริงหลัง Cloudflare
- รหัสลิงก์สุ่ม (`createShareId`, `newDropId`), ตัวกวาดใน `instrumentation.ts` (`startDropSweeper`)
- หน้า Settings ใหม่ (`/settings/...`) ที่เพิ่งย้ายมา — ใส่หน้าใหม่เป็น section ได้เลย
- scope ของ API key — เพิ่ม scope ใหม่ได้แบบเดียวกับ `drop`

---

## ส่วน A: ลิงก์รับไฟล์ (Drop request)

> **เปลี่ยนแผน 2026-10-27:** รุ่นแรกทำเป็นฟีเจอร์แยกชื่อ Inbox (ไฟล์ลงโฟลเดอร์ของเจ้าของ) และขึ้นระบบไปแล้ว
> แต่ผู้ใช้อยากให้เป็นส่วนหนึ่งของฝากไฟล์ (Drops) เลย ไม่แยกกัน จึงรวมเข้าด้วยกันทั้งระบบ
> ตารางเดิม `inboxes` / `inbox_uploads` ถูกลบ (ตอนนั้นยังไม่มีข้อมูล) หน้าและ API ของ Inbox เดิมถูกลบทั้งหมด

### A1. ไฟล์ที่คนอื่นส่งมาไปอยู่ไหน

ไฟล์ที่คนส่งมา **กลายเป็น Drop ของเจ้าของลิงก์** หนึ่งไฟล์ = หนึ่ง Drop

- เก็บในโฟลเดอร์ฝากไฟล์ (`<โฟลเดอร์ drops>/<dropId>/file`) ไม่โผล่ในหน้าจัดการไฟล์
- นับรวมในโควตา Drop ของเจ้าของ (`drops.quotaMB`) และอยู่ได้ตามที่ลิงก์ตั้งไว้ (`keepHours`) ไม่เกินอายุสูงสุดของ Drop
- หมดอายุแล้วตัวกวาด Drop ลบให้เหมือน Drop ทั่วไป ไม่จำกัดจำนวนครั้งที่โหลด
- เจ้าของเห็นไฟล์ที่ได้รับในหน้า Drops (แท็บส่ง จะเขียนว่า "received from …") ได้ลิงก์โหลด ลบเองได้
- ชื่อไฟล์จากคนส่งถูกทำความสะอาด (ตัด `/`, `\`, `..`, อักขระควบคุม, ยาวไม่เกิน 200 ตัว) ชื่อซ้ำไม่มีปัญหาเพราะแต่ละไฟล์อยู่โฟลเดอร์ของตัวเอง
- ลบลิงก์แล้ว Drop ที่รับมาแล้วยังอยู่จนหมดอายุ

### A2. ตั้งค่าต่อลิงก์

| ค่า | ค่าเริ่มต้น | หมายเหตุ |
|---|---|---|
| ชื่อลิงก์ (slug) | สุ่ม | หรือตั้งเองได้ เช่น `tong-homework` (a-z 0-9 `-`, 3–40 ตัว, ห้ามซ้ำ) |
| หัวข้อ + คำอธิบาย | — | แสดงบนหน้าที่คนส่งเห็น |
| ลิงก์รับไฟล์ได้ถึง | 7 วัน | หรือจนกว่าจะปิดเอง (ADMIN ปิดตัวเลือกนี้ได้) |
| เก็บแต่ละไฟล์ไว้ | อายุสูงสุดของ Drop | 1 ชั่วโมงถึงอายุสูงสุดของ Drop ที่ ADMIN ตั้ง |
| ขนาดต่อไฟล์สูงสุด | 100 MB | ติดเพดาน Cloudflare Free อยู่แล้ว |
| ขนาดรวมสูงสุดของลิงก์ | 5 GB | ครบแล้วลิงก์ปิดรับเอง |
| จำนวนไฟล์สูงสุด | ไม่จำกัด | |
| ชนิดไฟล์ที่รับ | ทุกชนิด | เช่น `pdf, docx` (ตรวจจากนามสกุล) |
| รหัสผ่าน | ไม่มี | เก็บเป็น hash |
| ให้ใส่ชื่อคนส่ง | ไม่บังคับ | ชื่อติดไปกับ Drop |
| คนส่งเห็นรายการไฟล์ที่ส่งไปแล้ว | ไม่ | ถ้าเปิด เห็นแค่ชื่อ + ขนาด ไม่มีโหลด |

เจ้าของ **ปิดรับชั่วคราว / เปิดใหม่ / ลบลิงก์** ได้ มีได้ไม่เกิน 50 ลิงก์ต่อคน

### A3. กันโดนถล่ม

- rate limit ต่อ IP: อัปโหลด 30 ไฟล์ / 10 นาที, เดารหัสผ่านผิด 10 ครั้ง / 15 นาที
- โควตาคือโควตา Drop ของเจ้าของ (รวม Drop ที่อัปเองและที่ได้รับ)
- ต้องมี `Content-Length` ตรวจก่อนรับ body และนับจริงระหว่าง stream
- จองที่ในฐานข้อมูลใน transaction เดียว: `UPDATE drop_requests ... WHERE` (จำนวนไฟล์, ขนาดรวม, โควตา Drop) แล้วสร้างแถว Drop
  SQLite ล็อกตอน UPDATE เลยอัปพร้อมกันกี่ไฟล์ก็ไม่เกิน ถ้าอัปพลาด ลบแถวและโฟลเดอร์ทิ้งและคืนที่
- ดิสก์ของโฟลเดอร์ drops เหลือน้อยกว่า 5% → ไม่รับ (507)
- IP คนส่งเก็บไว้ดูเรื่องใช้ผิดทาง ลบทิ้งหลัง 30 วัน
- หน้า `/u/...` ใส่ `noindex`, ลิงก์ไม่มี / หมดอายุ / ปิดฟีเจอร์ ตอบ 404 เหมือนกันหมด
- ADMIN ปิดฟีเจอร์ทั้งระบบได้ และเลือก role ที่สร้างลิงก์ได้ (ค่าเริ่มต้น ADMIN + USER; GUEST สร้าง Drop ไม่ได้อยู่แล้ว)

### A4. ฐานข้อมูล

ตาราง `drop_requests` (model `DropRequest`) เก็บค่าตาม A2 กับ `usedBytes`, `fileCount`, `closedAt`
ตาราง `drops` เพิ่ม `request_id` (ลบลิงก์แล้วเป็น null), `sender_name`, `sender_ip`
migration: `prisma/migrations/20261028000000_drop_requests`

### A5. เส้นทาง

| ใคร | Method / Path | ทำอะไร |
|---|---|---|
| คนส่ง | หน้า `/u/<slug หรือ id>` | หัวข้อ คำอธิบาย ช่องรหัส ช่องชื่อ ที่ลากไฟล์ แถบความคืบหน้าต่อไฟล์ |
| คนส่ง | GET `/api/public/drop-requests/<id>` | ข้อมูลหน้า (ไม่มีชื่อเจ้าของ) |
| คนส่ง | POST `/api/public/drop-requests/<id>/unlock` | ใส่รหัส → cookie `wn_req_<id>` อายุ 12 ชั่วโมง |
| คนส่ง | POST `/api/public/drop-request-upload?id=&name=&sender=` | อัปทีละไฟล์แบบ stream (Pages API เลี่ยง proxy.ts) |
| เจ้าของ | `/settings/drops` แท็บ **Receive** | สร้าง/แก้/ปิด/ลบลิงก์ ดูและลบไฟล์ที่ได้รับ |
| เจ้าของ | GET/POST/PATCH/DELETE `/api/v1/drops/requests` | ใช้ได้ทั้ง session และ API key (scope `drop`) |
| ADMIN | `/settings/admin/drops` | เปิด/ปิดฟีเจอร์, role ที่ใช้ได้, อนุญาตลิงก์ไม่มีวันปิด, ดูลิงก์ทั้งหมดและหยุดลิงก์ที่มีปัญหา |
| ADMIN | PUT `/api/admin/drops` (`requests`), PATCH `/api/admin/drops/requests?id=` | ตั้งค่า / หยุด-เปิดลิงก์ของใครก็ได้ |

e2e: `drop-requests-manage`, `drop-requests-public`

---

## ส่วน B: Paste / Gist

### B1. หน้าตา

- หน้า `/paste/new`: ช่องหัวข้อ + ไฟล์ได้หลายอัน (ชื่อไฟล์ + ภาษา + เนื้อหา) ปุ่ม "เพิ่มไฟล์"
  ตั้งการมองเห็น / หมดอายุ / อ่านครั้งเดียว / รหัสผ่าน แล้วกดสร้าง → ได้ลิงก์ `/p/<id>`
- หน้า `/p/<id>`: แต่ละไฟล์มีสีโค้ดตามภาษา (เดาจากนามสกุล) เลขบรรทัด ปุ่มคัดลอก ปุ่ม raw ปุ่มโหลด
  ไฟล์ `.md` แสดงเป็น Markdown ได้ (สลับดูต้นฉบับได้)
- `/p/<id>/raw/<ชื่อไฟล์>`: ข้อความล้วน `text/plain; charset=utf-8` สำหรับ `curl`
- เจ้าของแก้ไขได้ เห็นรายการ paste ของตัวเองที่ `/settings/pastes` (หรือเมนูในแถบข้าง)

### B2. การมองเห็น

| แบบ | ใครเห็น |
|---|---|
| unlisted (ค่าเริ่มต้น) | คนที่มีลิงก์ |
| private | เจ้าของเท่านั้น (ใช้เป็นที่จดโน้ต / snippet ส่วนตัว) |
| password | คนที่มีลิงก์ + รหัส |

ไม่มีหน้า "paste สาธารณะทั้งหมด" — NAS ส่วนตัวไม่ควรเป็นที่ให้คนนอกเดินดู

ตัวเลือกเพิ่ม: **หมดอายุ** (10 นาที / 1 ชม. / 1 วัน / 1 สัปดาห์ / ไม่หมด) และ **อ่านครั้งเดียวแล้วลบ**
(ลบเมื่อมีคนเปิดครั้งแรกที่ไม่ใช่เจ้าของ; นับด้วย `UPDATE ... WHERE views = 0` เหมือนการนับ Drop)

### B3. เก็บที่ไหน

**ข้อเสนอ:** เก็บเนื้อหาใน **ฐานข้อมูล (SQLite)** ไม่ใช่ไฟล์บนดิสก์
- เพดาน 512 KB ต่อไฟล์, 10 ไฟล์ต่อ paste, 2 MB ต่อ paste — paste ไม่ใช่ที่เก็บไฟล์ใหญ่ (ของใหญ่ใช้ Drop)
- เหตุผล: ข้อความเล็ก ค้นหา/ลบ/แก้ทีเดียวจบในฐานข้อมูล ไม่ต้องมีโฟลเดอร์ใหม่และตัวย้ายโฟลเดอร์แบบ Drop
- ตัวกวาดเดิมใน `instrumentation.ts` ลบ paste ที่หมดอายุไปด้วยในรอบเดียวกัน

### B4. ฐานข้อมูล

```prisma
model Paste {
  id           String    @id                       // random short id used in /p/<id>
  title        String?
  visibility   String    @default("unlisted")      // unlisted | private
  passwordHash String?   @map("password_hash")
  burnAfterRead Boolean  @default(false) @map("burn_after_read")
  views        Int       @default(0)
  expiresAt    DateTime? @map("expires_at")
  createdAt    DateTime  @default(now()) @map("created_at")
  updatedAt    DateTime  @updatedAt @map("updated_at")

  user         User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  userId       String    @map("user_id")
  files        PasteFile[]

  @@index([userId], name: "idx_paste_user_id")
  @@index([expiresAt], name: "idx_paste_expires_at")
  @@map("pastes")
}

model PasteFile {
  id       String @id @default(cuid())
  name     String                                   // e.g. "main.py", unique within the paste
  language String?                                  // null = guess from the name
  content  String
  position Int    @default(0)

  paste    Paste  @relation(fields: [pasteId], references: [id], onDelete: Cascade)
  pasteId  String @map("paste_id")

  @@unique([pasteId, name], name: "idx_paste_file_name")
  @@map("paste_files")
}
```

### B5. API (scope ใหม่ `paste`)

| Method | Path | ทำอะไร |
|---|---|---|
| POST | `/api/v1/pastes` | JSON `{ title, files: [{ name, content }], expiresIn, burnAfterRead, visibility }` |
| PUT | `/api/v1/pastes/raw?name=log.txt&expiresIn=1d` | body เป็นข้อความล้วน → `cat log.txt \| curl -T - ...` ได้เลย |
| GET | `/api/v1/pastes` | รายการของตัวเอง |
| PATCH / DELETE | `/api/v1/pastes?id=` | แก้ / ลบ |

ตอบกลับ `{ id, url, rawUrl, expiresAt }` เหมือนรูปแบบของ Drop

### B6. ความปลอดภัยของหน้าแสดงผล

- เนื้อหาเป็นข้อความที่ใครก็พิมพ์มาได้ → **ห้ามใส่ลง HTML ตรงๆ** ใช้ตัวทำสีโค้ดที่ escape เอง
- Markdown แปลงแล้วผ่านตัวกรอง HTML (ไม่มี `<script>`, `on*=`, `javascript:`) และรูปภายนอกไม่โหลดอัตโนมัติ
- raw ส่ง `Content-Type: text/plain` + `X-Content-Type-Options: nosniff` + `Content-Disposition: inline`
  กันเบราว์เซอร์ตีความเป็น HTML
- หน้า `/p/...` มี `noindex`, ตัวทำสีโค้ดทำฝั่ง server เพื่อไม่ส่ง JS หนักให้คนเปิด

---

## ขั้นตอน

1. **Inbox: ฐานข้อมูล + service + test** — ตาราง `inboxes`, `inbox_uploads`, ตรวจโฟลเดอร์ปลายทาง, จองโควตา, ทำความสะอาดชื่อ, suite `inbox-service`
2. **Inbox: อัปโหลดสาธารณะ** — route stream, รหัสผ่าน, rate limit, ไฟล์ `.part` + rename, suite `inbox-public` (รวมเคสยิงพร้อมกันเกินโควตา, ชื่อ `../`, ลิงก์หมดอายุ)
3. **Inbox: หน้าเว็บ** (ขั้น 1–3 ทำแล้ว ต่อมารวมเข้า Drops ดูส่วน A) — `/u/<id>` สำหรับคนส่ง, `/settings/inboxes` สำหรับเจ้าของ, ทางลัดในเมนูโฟลเดอร์, หน้า ADMIN
   - **ขั้น 1–3 เสร็จ 2026-10-27** (เคาะคำถามทุกข้อตามข้อเสนอ ข้อความบนหน้าเว็บเป็นอังกฤษเหมือนหน้าอื่น)
     - โค้ดอยู่ที่ `src/lib/inbox/` (settings, names, inboxes, public, receive), migration `20261027000000_inboxes`
     - suite ชื่อ `inbox-manage` (ฝั่งเจ้าของ + ADMIN) และ `inbox-public` (ฝั่งคนส่ง) แทนชื่อในแผน
     - ตั้งค่า ADMIN อยู่ใน `AppSetting`: `inbox.enabled`, `inbox.roles`, `inbox.quotaMB`, `inbox.allowNoExpiry`
   - เปลี่ยนจากแผน / สิ่งที่ควรรู้:
     - อัปโหลดอยู่ที่ `POST /api/public/inbox-upload?id=` (pages router เลี่ยง proxy.ts และไม่ชนกับ `/api/public/inbox/[id]`)
     - ต้องมี `Content-Length` (ไม่มี → 411) เพราะใช้จองที่ล่วงหน้าในคำสั่ง UPDATE เดียวที่ตรวจทั้งเพดานลิงก์และโควตาผู้ใช้
     - ตอนจองใช้ขนาด body ทั้งก้อน (รวมหัว multipart) แล้วค่อยลดเหลือขนาดไฟล์จริง ไฟล์ที่พอดีเพดานเป๊ะอาจถูกปฏิเสธ
     - โควตานับ **ที่รับมาแล้วทั้งหมด** ลบไฟล์ในหน้าจัดการไฟล์ไม่คืนโควตา ลบลิงก์ถึงคืน
     - ตั้งชื่อกันชนด้วยการสร้างไฟล์เปล่าแบบ exclusive ก่อน แล้ว rename ทับ (ไม่มีทางสองไฟล์ได้ชื่อเดียวกัน)
     - รหัสผ่านปลดล็อกด้วย cookie `wn_inbox_<id>` อายุ 12 ชม. ผูกกับ hash รหัสปัจจุบัน เปลี่ยนรหัสแล้ว cookie เก่าใช้ไม่ได้
     - GUEST: แม้ ADMIN เปิดสิทธิ์ให้ กฎโฟลเดอร์ตั้งต้นยังห้าม GUEST อัปโหลด จึงสร้างลิงก์ไม่ได้อยู่ดีจนกว่าจะแก้กฎ
     - ยังไม่ทำ: เมนู "Receive files here" โผล่ให้ GUEST ด้วย (กดแล้วเจอ 404), ปิดฟีเจอร์แล้วเจ้าของแก้/พักลิงก์ไม่ได้ (ลบได้),
       ไฟล์ `.webnas-part-*` ที่ค้างเพราะเครื่องดับกลางอัปโหลดยังไม่มีตัวกวาด
4. **Paste: ฐานข้อมูล + API v1 + scope `paste` + test** — suite `api-pastes`
5. **Paste: หน้าเว็บ** — `/paste/new`, `/p/<id>`, raw, สีโค้ด, Markdown, รายการของตัวเอง, ตัวกวาดหมดอายุ, suite `paste-render` (เคส XSS)
6. README + deploy ขึ้น radxa + ลองจริงผ่าน `nas.supaxit.com`

Inbox (1–3) กับ Paste (4–5) ไม่แตะไฟล์เดียวกัน ยกเว้น `schema.prisma`, `sections.ts` ของ settings และ `instrumentation.ts`
ทำแยกกันได้ถ้าทำ migration ของ Inbox ก่อน

## คำถามที่ต้องเคาะก่อนเริ่ม

1. **ไฟล์ที่คนอื่นส่งมา:** ลงโฟลเดอร์ในพื้นที่ของเจ้าของแบบถาวร (ข้อเสนอ) หรืออยากให้เป็นไฟล์ชั่วคราวแบบ Drop ที่หมดอายุเอง?
2. **ใครสร้างลิงก์รับไฟล์ได้:** ADMIN + USER (ข้อเสนอ) — GUEST ได้ด้วยไหม?
3. **ค่าเริ่มต้น Inbox:** หมดอายุ 7 วัน, รวม 5 GB ต่อลิงก์, โควตา 20 GB ต่อผู้ใช้ — โอเคไหม?
4. **ชื่อลิงก์ตั้งเองได้ (`/u/tong-homework`)** หรือสุ่มอย่างเดียว? ตั้งเองได้ง่ายต่อการบอกต่อ แต่เดาได้ จึงแนะนำให้ใส่รหัสคู่กัน
5. **Paste ต้องมีประวัติการแก้ (revision) แบบ gist ไหม:** ร่างนี้ **ยังไม่ทำ** แก้แล้วทับของเดิม เพิ่มทีหลังได้
6. **ภาษาของข้อความบนหน้าเว็บใหม่** (หน้าคนส่งไฟล์ / หน้า paste): อังกฤษเหมือนหน้าอื่นตอนนี้ หรือไทย?
7. **ลำดับ:** ทำ Inbox ก่อน แล้วค่อย Paste (ข้อเสนอ) หรือกลับกัน?

หมายเหตุ: ผ่าน Cloudflare Free ไฟล์ต่อครั้งยังติดเพดาน 100 MB — Inbox จึงรับไฟล์ใหญ่กว่านี้ไม่ได้
จนกว่าจะทำการแบ่งไฟล์เป็นชิ้น (chunked upload) ซึ่งไม่อยู่ในเฟสนี้
