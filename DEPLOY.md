# Deploy Pungfit backend

เมื่อสั่ง deploy ให้ build/push จาก repo backend ไป registry นี้ ใช้ branch `dev` ตาม workflow โปรเจกต์

รอบนี้ใช้เวอร์ชัน `1.0.12` ทั้ง backend และ frontend ตามคำสั่งให้เลขตรงกัน ก่อน deploy รอบถัดไปตรวจ release ล่าสุดและเพิ่มเวอร์ชันโดยไม่เขียนทับ tag เก่า

```powershell
# รันใน backend และเปลี่ยน tag ตาม release ใหม่ในแต่ละรอบ
docker build -t ara-registry.gipsic.net/pungfit-be:1.0.12 --push .
if ($LASTEXITCODE -ne 0) { throw 'Backend build/push failed' }
```

ต้องเปิด Docker และ login registry ไว้ ห้ามบันทึกรหัสผ่านหรือ token ลงเอกสาร

Push image ไม่ได้อัปเดต container บน server อัตโนมัติ ต้องเปลี่ยน tag ใน Portainer stack `pungfit` แล้ว pull/redeploy และตรวจระบบ หากไม่มี URL/access ให้รายงานว่า push แล้วแต่ยังไม่ได้อัปเดต server

Booking admin ต้องตั้ง `BK_ALLOWED_ORIGINS` เป็น origin หน้าเว็บจริง เช่น `https://pungfit.life`, ใช้ MongoDB replica set, mount พื้นที่ถาวรส่วนตัวให้ `BK_UPLOAD_DIR` และสร้าง super admin ด้วย `npm run bk:create-super-admin` บน environment เป้าหมาย ดู [คู่มือระบบ](docs/bk-admin.md)

Frontend ใช้คำสั่งใน repo frontend ไฟล์ `DEPLOY.md` โดยรอบนี้ใช้เลขเวอร์ชันเดียวกัน
