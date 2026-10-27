# แผน เฟส 3: ลิงก์รับไฟล์ (Inbox) และ Paste / Gist

วันที่: 2026-10-27
สถานะ: ส่วน A (ขั้น 1–3) ทำเสร็จ 2026-10-27 ยังไม่ขึ้นระบบ · ส่วน B ยังไม่เริ่ม
ต่อจาก: [2026-10-25-temp-file-drop.md](2026-10-25-temp-file-drop.md)

## เป้าหมาย

ตอนนี้ฝากไฟล์ (Drop) ไปได้ทางเดียว: **เจ้าของ** อัปไฟล์ → ได้ลิงก์ให้คนอื่น **โหลด**
เฟสนี้เพิ่มสองอย่าง

1. **ลิงก์รับไฟล์ (Inbox):** เจ้าของเปิดลิงก์ของตัวเอง เช่น `nas.supaxit.com/u/tong-homework`
   แล้ว **คนอื่นที่ไม่ได้ล็อกอิน** เปิดลิงก์นั้นมาลากไฟล์ใส่ได้ ไฟล์ไปโผล่ในโฟลเดอร์ของเจ้าของ
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

## ส่วน A: ลิงก์รับไฟล์ (Inbox)

### A1. ไฟล์ที่คนอื่นส่งมาไปอยู่ไหน

**ข้อเสนอ:** ลงใน **โฟลเดอร์ที่เจ้าของเลือกในพื้นที่ของตัวเอง** (เช่น `/Inbox/การบ้าน`) เห็นได้ในหน้าจัดการไฟล์ทันที
ไม่ใช้โฟลเดอร์ฝากไฟล์ของ Drop เพราะของที่คนอื่นส่งมามักต้องการเก็บถาวร ไม่ใช่ลิงก์ชั่วคราว

- ตอนสร้างและตอนรับไฟล์ทุกครั้ง ตรวจด้วย `authorizePath(owner, target, "upload")` — ถ้าเจ้าของเสียสิทธิ์โฟลเดอร์นั้นไป ลิงก์ก็รับไม่ได้
- ชื่อซ้ำ → ต่อท้าย `(1)`, `(2)` ไม่เขียนทับของเดิมเด็ดขาด
- ชื่อไฟล์จากคนส่งถูกทำความสะอาด (ตัด `/`, `\`, `..`, อักขระควบคุม, ยาวไม่เกิน 200 ตัว)
- เลือกได้ว่าจะแยกโฟลเดอร์ย่อยตามชื่อคนส่ง (`/Inbox/การบ้าน/สมชาย/...`) หรือไม่
- อัปโหลดเข้าไฟล์ชั่วคราวก่อน (`.webnas-part-<id>`) เสร็จแล้วค่อย rename เข้าที่ ถ้าหลุดกลางทาง ไม่มีไฟล์ครึ่งๆ โผล่

### A2. ตั้งค่าต่อลิงก์

| ค่า | ค่าเริ่มต้น | หมายเหตุ |
|---|---|---|
| ชื่อลิงก์ (slug) | สุ่ม | หรือตั้งเองได้ เช่น `tong-homework` (a-z 0-9 `-`, 3–40 ตัว, ห้ามซ้ำ) |
| หัวข้อ + คำอธิบาย | — | แสดงบนหน้าที่คนส่งเห็น เช่น "ส่งการบ้านบทที่ 3" |
| โฟลเดอร์ปลายทาง | — | ต้องเลือก |
| หมดอายุ | 7 วัน | หรือไม่หมดอายุ (ADMIN ปิดตัวเลือกนี้ได้) |
| ขนาดต่อไฟล์สูงสุด | 100 MB | ติดเพดาน Cloudflare Free อยู่แล้ว |
| ขนาดรวมสูงสุดของลิงก์ | 5 GB | ครบแล้วลิงก์ปิดรับเอง |
| จำนวนไฟล์สูงสุด | ไม่จำกัด | |
| ชนิดไฟล์ที่รับ | ทุกชนิด | เช่น `.pdf,.docx` (ตรวจจากนามสกุล) |
| รหัสผ่าน | ไม่มี | เก็บเป็น hash (ใช้ตัวเดียวกับรหัสผู้ใช้) |
| ให้ใส่ชื่อคนส่ง | ไม่บังคับ | ถ้าบังคับ จะใช้แยกโฟลเดอร์ย่อยได้ |
| คนส่งเห็นรายการไฟล์ที่ส่งไปแล้ว | ไม่ | ถ้าเปิด เห็นแค่ชื่อ + ขนาด ไม่มีโหลด |

เจ้าของ **ปิดรับชั่วคราว / เปิดใหม่ / ลบลิงก์** ได้ ลบลิงก์ไม่ลบไฟล์ที่รับมาแล้ว

### A3. กันโดนถล่ม

ลิงก์นี้เปิดให้คนไม่ล็อกอินเขียนลงดิสก์ จึงต้องมีหลายชั้น

- rate limit ต่อ IP: อัปโหลด 30 ไฟล์ / 10 นาที, เดารหัสผ่านผิด 10 ครั้ง / 15 นาที
- โควตารวมต่อผู้ใช้ (ผลรวมทุก inbox) ที่ ADMIN ตั้ง ค่าเริ่มต้น 20 GB
- ตรวจ `Content-Length` ก่อนรับ body (แบบ `assertDeclaredSize`) และนับจริงระหว่าง stream
- จองโควตาในฐานข้อมูลด้วย `UPDATE ... WHERE usedBytes + size <= max` ทีเดียว กันอัปพร้อมกันจนเกิน
- เหลือดิสก์น้อยกว่า 5% → ปิดรับทุก inbox
- หน้า `/u/...` ใส่ `noindex` และไม่บอกว่ามีลิงก์อื่นของเจ้าของคนนี้
- ADMIN ปิดฟีเจอร์ทั้งระบบได้ และเลือกได้ว่า role ไหนสร้าง inbox ได้ (ค่าเริ่มต้น ADMIN + USER)

### A4. ฐานข้อมูล

```prisma
model Inbox {
  id            String    @id                        // random, used in the link when slug is null
  slug          String?   @unique                    // optional custom link name
  title         String
  description   String?
  targetPath    String    @map("target_path")        // virtual path in the owner's space
  splitBySender Boolean   @default(false) @map("split_by_sender")
  requireName   Boolean   @default(false) @map("require_name")
  showReceived  Boolean   @default(false) @map("show_received")
  allowedExt    String?   @map("allowed_ext")         // comma-separated, null = any
  maxFileBytes  BigInt?   @map("max_file_bytes")
  maxTotalBytes BigInt?   @map("max_total_bytes")
  maxFiles      Int?      @map("max_files")
  passwordHash  String?   @map("password_hash")
  usedBytes     BigInt    @default(0) @map("used_bytes")
  fileCount     Int       @default(0) @map("file_count")
  expiresAt     DateTime? @map("expires_at")
  closedAt      DateTime? @map("closed_at")           // paused by the owner
  createdAt     DateTime  @default(now()) @map("created_at")

  user          User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  userId        String    @map("user_id")
  uploads       InboxUpload[]

  @@index([userId], name: "idx_inbox_user_id")
  @@map("inboxes")
}

// One file someone sent through an inbox (a receipt; the file itself lives in the owner's space)
model InboxUpload {
  id         String   @id @default(cuid())
  fileName   String   @map("file_name")              // name it was saved under
  path       String                                   // virtual path it was saved to
  size       BigInt
  senderName String?  @map("sender_name")
  senderIp   String?  @map("sender_ip")               // kept for abuse checks, cleared after 30 days
  createdAt  DateTime @default(now()) @map("created_at")

  inbox      Inbox    @relation(fields: [inboxId], references: [id], onDelete: Cascade)
  inboxId    String   @map("inbox_id")

  @@index([inboxId], name: "idx_inbox_upload_inbox_id")
  @@map("inbox_uploads")
}
```

### A5. เส้นทาง

| ใคร | Method / Path | ทำอะไร |
|---|---|---|
| คนส่ง | หน้า `/u/<slug หรือ id>` | หัวข้อ คำอธิบาย ช่องรหัส ช่องชื่อ ที่ลากไฟล์ แถบความคืบหน้าต่อไฟล์ |
| คนส่ง | GET `/api/public/inbox/<id>` | ข้อมูลหน้า (ไม่มี path ปลายทาง ไม่มีชื่อเจ้าของนอกจากชื่อที่แสดง) |
| คนส่ง | POST `/api/public/inbox/<id>/unlock` | ใส่รหัส → cookie อายุสั้นของลิงก์นั้น |
| คนส่ง | POST `pages/api/public/inbox/upload.ts?id=` | อัปทีละไฟล์แบบ stream (เลี่ยง proxy.ts เหมือน drops) |
| เจ้าของ | `/settings/inboxes` | สร้าง/แก้/ปิด/ลบ ดูไฟล์ที่ได้รับ (กดแล้วไปที่ไฟล์ในหน้าจัดการไฟล์) |
| เจ้าของ | GET/POST/PATCH/DELETE `/api/user/inboxes` | ใช้กับหน้า settings |
| ADMIN | `/settings/admin/inboxes` | เปิด/ปิดฟีเจอร์, role ที่ใช้ได้, โควตา, ดูลิงก์ทั้งหมดและปิดลิงก์ที่มีปัญหา |

ในหน้าจัดการไฟล์ เมนูคลิกขวาที่โฟลเดอร์มี **"สร้างลิงก์รับไฟล์ที่นี่"** เป็นทางลัด

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
3. **Inbox: หน้าเว็บ** — `/u/<id>` สำหรับคนส่ง, `/settings/inboxes` สำหรับเจ้าของ, ทางลัดในเมนูโฟลเดอร์, หน้า ADMIN
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
