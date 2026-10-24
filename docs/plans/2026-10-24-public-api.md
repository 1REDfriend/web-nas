# แผน: Public API สำหรับให้เซิร์ฟเวอร์อื่นเรียกใช้ web-nas

วันที่: 2026-10-24
สถานะ: ร่าง รอเคาะคำถามท้ายเอกสาร

## เป้าหมาย

ให้โปรแกรมหรือเซิร์ฟเวอร์อื่น (เช่น bot, backend อีกตัว, สคริปต์ cron) ส่งไฟล์มาเก็บ ดึงไฟล์ ดูรายการ
และลบไฟล์บน web-nas ได้ ด้วย **API key** แทนการ login ด้วยรหัสผ่าน (cookie)

ยังไม่ทำในรอบนี้: ระบบฝากไฟล์ชั่วคราว (ดูหัวข้อ "เฟส 2" ท้ายเอกสาร) แต่จะออกแบบให้ต่อยอดได้

## หลักการออกแบบ

1. **API key ผูกกับ user** สิทธิ์ของ key ห้ามเกินสิทธิ์ของเจ้าของ กฎล็อกโฟลเดอร์ (PathRule)
   และ path-guard ใช้กับ key ด้วยเหมือนเดิมทุกข้อ
2. **key ใช้ได้เฉพาะ `/api/v1/*` เท่านั้น** ถ้า key หลุด ก็เข้าหน้า admin, เปลี่ยนรหัส, สร้าง user ไม่ได้
3. **จำกัดขอบเขตต่อ key** กำหนดได้ว่า key ทำอะไรได้บ้าง (scopes) และเข้าได้แค่โฟลเดอร์ไหน (rootPath)
4. **ไม่เก็บ key ตัวจริงใน DB** เก็บแค่ sha256 เหมือน `ActiveSession.token` และโชว์ key ให้ผู้ใช้เห็นครั้งเดียวตอนสร้าง
5. ใช้โค้ดเดิมให้มากที่สุด: `authorizePath`, `authorizeNewEntry`, ส่วนรับไฟล์ด้วย formidable,
   ระบบถังขยะ, `rate-limit.ts`

## 1. ฐานข้อมูล (Prisma)

เพิ่ม model ใหม่ใน `prisma/schema.prisma` และ relation `apiKeys ApiKey[]` ใน `User`

```prisma
model ApiKey {
  id          String    @id @default(cuid())
  name        String                                  // e.g. "backup-bot"
  prefix      String    @unique                       // first chars, shown in UI to identify the key
  keyHash     String    @unique @map("key_hash")      // sha256 of the full key
  scopes      String                                  // comma-separated: read,list,upload,delete
  rootPath    String?   @map("root_path")             // virtual path the key is locked to; null = all of the owner's paths
  maxUploadBytes BigInt? @map("max_upload_bytes")     // optional per-key size cap

  lastUsedAt  DateTime? @map("last_used_at")
  lastUsedIp  String?   @map("last_used_ip")
  expiresAt   DateTime? @map("expires_at")
  revokedAt   DateTime? @map("revoked_at")
  createdAt   DateTime  @default(now()) @map("created_at")

  user        User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  userId      String    @map("user_id")

  @@index([userId], name: "idx_api_key_user_id")
  @@map("api_keys")
}
```

หน้าตา key: `wnas_<prefix 8 ตัว>_<secret 32 ไบต์ base64url>` สุ่มด้วย `crypto.randomBytes`

## 2. ระบบยืนยันตัวตนด้วย key

ไฟล์ใหม่ `src/lib/security/api-key.ts`

- `generateApiKey()` คืนค่า `{ fullKey, prefix, keyHash }`
- `verifyApiKey(raw)` แยก prefix, หาแถวใน DB, เทียบ hash ด้วย `timingSafeEqual`,
  เช็คว่าไม่ถูกเพิกถอน/ไม่หมดอายุ, user ยังอยู่, แล้วอัปเดต `lastUsedAt` (หน่วงไว้ อัปเดตไม่เกินนาทีละครั้ง)
- `requireScope(payload, scope)` และ `assertInsideKeyRoot(payload, virtualPath)` ใช้ `isInside()` จาก path-guard

แก้ `proxy.ts`

- ถ้า path ขึ้นต้นด้วย `/api/v1/` และมี header `Authorization: Bearer wnas_...`
  ให้ตรวจ key แล้วใส่ `x-user-payload` เป็น `{ sub, username, role, via: "apikey", keyId, scopes, keyRoot }`
- ถ้าเป็น path อื่นแล้วส่ง Bearer มา: ไม่สนใจ key (ไปตามระบบ cookie เดิม จึงได้ 401)
- `/api/v1/*` รับ cookie ได้ด้วย เพื่อให้ทดสอบจากเบราว์เซอร์ได้ (ตัดได้ถ้าไม่อยากให้)
- key ผิดหรือหมดอายุ ตอบ 401 แบบข้อความกลางๆ และนับเข้า rate limit ตาม IP (กันการสุ่มเดา key)

## 3. Endpoint (`/api/v1`)

ทุกตัวตอบเป็น JSON รูปแบบเดียวกัน `{ ok: true, data }` / `{ ok: false, error, code }`

| Method | Path | Scope | ใช้ทำอะไร |
|---|---|---|---|
| GET | `/api/v1/me` | - | ดูข้อมูล key: ชื่อ, scopes, rootPath, วันหมดอายุ (ไว้เช็คว่า key ใช้ได้) |
| GET | `/api/v1/files?path=/x` | `list` | ดูรายการในโฟลเดอร์ |
| GET | `/api/v1/files/stat?path=/x/a.txt` | `list` | ดูข้อมูลไฟล์: ขนาด, เวลาแก้ไข, ประเภทไฟล์ |
| GET | `/api/v1/files/download?path=/x/a.txt` | `read` | ดาวน์โหลด (รองรับ Range) |
| POST | `/api/v1/files/upload` | `upload` | อัปโหลดแบบ multipart: `file`, `path`, `overwrite=false|true`, `mkdirs=true` |
| PUT | `/api/v1/files/raw?path=/x/a.txt` | `upload` | อัปโหลดแบบ body ดิบ (`curl --data-binary`) ส่งเป็น stream ลงดิสก์ตรงๆ |
| POST | `/api/v1/folders` | `upload` | สร้างโฟลเดอร์ |
| DELETE | `/api/v1/files?path=/x/a.txt` | `delete` | ย้ายไปถังขยะ (ใช้ trash-service เดิม ไม่ลบถาวร) |

หมายเหตุการ implement

- **อัปโหลด**: เอาส่วนรับไฟล์ใน `pages/api/files/upload.ts` แยกออกมาเป็น helper กลาง
  (เช่น `src/lib/service/upload-service.ts`) แล้วให้ทั้ง UI เดิมและ `pages/api/v1/files/upload.ts` เรียกใช้
  เหตุที่ต้องใช้ pages router: ต้องปิด bodyParser เพื่อ stream ไฟล์ใหญ่ ไม่ให้ไฟล์ทั้งก้อนค้างอยู่ใน RAM
- เพิ่ม `overwrite` (ตอนนี้ UI ตอบ 409 อย่างเดียว) และ `mkdirs` (สร้างโฟลเดอร์ปลายทางให้อัตโนมัติ)
- เขียนไฟล์ลงไฟล์ชั่วคราวในโฟลเดอร์เดียวกันก่อน แล้วค่อย rename ทับ เพื่อไม่ให้มีไฟล์ครึ่งๆ กลางๆ
- path ทุกตัวต้องผ่าน `authorizePath` / `authorizeNewEntry` **และ** `assertInsideKeyRoot` ทั้งคู่
- ดาวน์โหลด/ดูรายการ: เรียก service เดิม (`file-brower-service`, media streaming ที่ทำไว้ตอนทำ share link)
- บันทึก log ทุกครั้ง `[API] <keyPrefix> <action> <path>` และ `recordRecent` พร้อมระบุว่ามาจาก API

## 4. Rate limit และขนาดไฟล์

- ต่อ key: เช่น 120 request/นาที ใช้ `rate-limit.ts` ที่มีอยู่แล้ว ตอบ 429 + `Retry-After`
- ตรวจ key ไม่ผ่าน: นับต่อ IP แบบเดียวกับหน้า login
- ขนาดอัปโหลด: ใช้ `maxUploadBytes` ของ key ถ้าตั้งไว้ ไม่งั้นใช้เพดานเดิม
- เช็คว่าคิว Caddy (`CaddyFile`) ไม่ได้จำกัดขนาด body / timeout จนอัปโหลดไฟล์ใหญ่ผ่าน API ไม่ได้

## 5. จัดการ key ใน UI (หน้า Settings)

- API ภายใน (ใช้ cookie เท่านั้น ไม่รับ key): `GET/POST /api/user/api-keys`, `DELETE /api/user/api-keys/[id]`
- หน้าตั้งค่ามีแท็บ "API keys": ตารางแสดง name, prefix, scopes, rootPath, ใช้ล่าสุด, หมดอายุ, ปุ่ม Revoke
- ฟอร์มสร้าง key: ชื่อ, ติ๊ก scopes, เลือกโฟลเดอร์ (ใช้ตัวเลือกโฟลเดอร์ที่มีอยู่แล้ว), วันหมดอายุ (ค่าเริ่มต้น 90 วัน / ไม่หมด)
- หลังสร้าง แสดง key เต็ม **ครั้งเดียว** พร้อมปุ่ม copy และตัวอย่างคำสั่ง curl
- ใช้ได้ดีบนมือถือเหมือนหน้าอื่นที่เพิ่งปรับ
- ตอนเปลี่ยนรหัสผ่านหรือ admin ลบ user: key ของคนนั้นถูกยกเลิกไปด้วย
  (ลบ user ใช้ cascade, เปลี่ยนรหัสต้องเลือกว่าจะยกเลิก key ด้วยไหม ดูคำถามข้อ 3)
- Admin: หน้าดู key ทั้งหมดของทุก user + ยกเลิกได้ (ทำทีหลังได้)

## 6. ทดสอบ

suite ใหม่ใน `tests/e2e/suites/` (รันด้วย `run-all.mjs` เดิม):

- ไม่มี key / key ผิด / key ถูกเพิกถอน / key หมดอายุ → 401
- key ใช้กับ `/api/admin/*`, `/api/user/*`, `/api/files/*` ไม่ได้ → 401
- ใช้ scope ที่ไม่มี → 403; path นอก rootPath ของ key → 403; ใช้ `../` หลุดออกไป → 403
- PathRule ที่ล็อกโฟลเดอร์ยังล็อกเมื่อใช้ key
- อัปโหลด multipart + raw, ชื่อซ้ำ → 409, `overwrite=true` → ทับได้, `mkdirs`
- ดาวน์โหลดตรง byte, Range ใช้ได้, ลบแล้วไฟล์ไปอยู่ถังขยะ
- ยิงถี่เกิน → 429
- key ใน DB เป็น hash ไม่ใช่ key ตัวจริง

## 7. เอกสาร

- หัวข้อ "API" ใน `README.md`: วิธีสร้าง key, ตาราง endpoint, ตัวอย่าง curl / Node / Python
- (ไม่บังคับ) ไฟล์ `openapi.yaml` ไว้ให้ generate client

## ข้อตกลงที่เคาะแล้ว (2026-10-24)

ใช้ตามที่เสนอทั้ง 4 ข้อ: ทุก user ยกเว้น GUEST สร้าง key ได้, `/api/v1` รับทั้ง key และ cookie,
เปลี่ยนรหัสผ่านไม่ยกเลิก key (มีปุ่ม Revoke all), webhook ยังไม่ทำ

## บันทึกระหว่างทำ

- ขั้น 1 เสร็จ: `ApiKey` model, migration `20261024000000_api_keys`, `src/lib/security/api-key-format.ts`
  (ส่วนที่ไม่แตะ DB, มี unit test `npm run test:unit`) และ `src/lib/security/api-key.ts` (ส่วนที่แตะ DB)
- ขั้น 4 ต้องระวัง: `requireInsideKeyRoot` เช็คแค่ path ตามตัวอักษร ถ้าใน rootPath มี symlink ชี้ออกไปที่อื่น
  จะหลุดได้ ต้องเช็คซ้ำด้วย physical path ที่ `authorizePath` คืนมา (realpath ของ rootPath)
- `verifyApiKey` ยังไม่มี test ที่ยิง DB จริง จะได้ test ผ่าน e2e ในขั้น 2
- ปัญหาเดิมที่เจอ (ไม่เกี่ยวกับงานนี้): `prisma migrate deploy` บน DB เปล่าพังที่ `20261009000000_trash_original_path`
  เพราะ migration init ไม่มีตาราง `trash_schedule` ตัว Docker ใช้ `db push` เลยไม่กระทบ แต่คำแนะนำใน README
  ที่ให้ใช้ `migrate deploy` กับ DB ใหม่ใช้ไม่ได้

## ลำดับการทำ (แต่ละข้อ commit ได้แยกกัน)

1. Prisma model + migration + `api-key.ts` + unit test ฝั่งสร้าง/ตรวจ key
2. แก้ `proxy.ts` + `GET /api/v1/me` + test ฝั่งยืนยันตัวตน
3. แยกส่วนรับไฟล์เป็น helper กลาง (UI เดิมต้องทำงานเหมือนเดิม รัน e2e เดิมให้ผ่านทั้งหมด)
4. endpoint list / stat / download / upload / raw / folders / delete + test
5. rate limit + log
6. UI จัดการ key ในหน้า Settings
7. README + deploy ขึ้น radxa + ลองยิงจากเครื่องอื่นผ่าน `nas.supaxit.com`

## เฟส 2 (ทีหลัง): ฝากไฟล์ชั่วคราว

ต่อยอดจากของรอบนี้ได้เลย:

- ตอนอัปโหลดผ่าน API ใส่ `expiresIn=24h` ได้ → บันทึกลงตาราง `TempFile { path, expiresAt, userId, keyId? }`
- งานล้างไฟล์ทุก X นาที (แบบเดียวกับการล้างถังขยะ) ลบไฟล์ที่หมดอายุ
- ตอบกลับพร้อม share link ที่หมดอายุพร้อมไฟล์ (ใช้ `ShareLink.expireAt` ที่มีอยู่แล้ว)
- เลือกได้ว่าจะให้คนทั่วไปฝากไฟล์ผ่านหน้าเว็บแบบไม่ต้อง login ไหม (มีเรื่องโควตาและการโดน spam ต้องคิดเพิ่ม)

## คำถามที่ต้องเคาะก่อนเริ่ม

1. ใครสร้าง key ได้: ทุก user หรือ ADMIN เท่านั้น? (ร่างนี้ให้ทุก user ยกเว้น GUEST)
2. ให้ `/api/v1/*` รับ cookie ด้วยไหม หรือรับแค่ key? (ร่างนี้รับทั้งคู่)
3. เปลี่ยนรหัสผ่านแล้วต้องยกเลิก API key ทั้งหมดของคนนั้นด้วยไหม? (ร่างนี้: ไม่ยกเลิก เพราะ bot จะพัง แต่มีปุ่ม "Revoke all")
4. ต้องการ webhook แจ้งเตือนเมื่อมีไฟล์เข้ามาไหม (ยังไม่อยู่ในรอบนี้)
