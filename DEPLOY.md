# 🚀 DEPLOY — ขึ้น GitHub + Railway ฉบับทำตามได้เลย

คู่มือนี้เขียนสำหรับ mito โดยเฉพาะ — ไม่ต้องมีความรู้ git เลยก็ทำได้

---

## ทางเลือก A — ง่ายสุด: ให้หัวหน้า (Kimi) push ให้จากฝั่งนี้

เหมาะกับใช้มือถือ ไม่ต้องแตะไฟล์เลย ทำ 3 อย่าง:

### 1. สร้าง repo บน GitHub (ทำบนมือถือได้)
- เปิด https://github.com/new
- **Repository name**: `goldcast` (หรือชื่อที่ชอบ)
- เลือก **Private** (แนะนำ)
- **อย่า** ติ๊ก "Add a README" (repo เรามีอยู่แล้ว)
- กด **Create repository**

### 2. สร้าง token (กุญแชให้หัวหน้า push)
- เปิด https://github.com/settings/tokens?type=beta (Fine-grained token)
- กด **Generate new token**
- Token name: `goldcast-push`
- Expiration: 7 days พอ
- **Repository access**: เลือก "Only select repositories" → เลือก `goldcast`
- **Permissions** → Repository permissions → **Contents: Read and write** (อย่างเดียวพอ)
- กด **Generate token** → ก๊อปโค้ดที่ได้ (ขึ้นต้นด้วย `github_pat_...`)

### 3. ส่งให้หัวหน้าในแชท 2 บรรทัด
```
repo: <ชื่อ user GitHub>/goldcast
token: github_pat_xxxxxxxx
```
หัวหน้าจะ push โค้ดทั้งหมดขึ้นให้ทันที แล้วบอกให้ mito **กลับไปลบ token ทิ้ง** (ที่หน้าเดิมกด Delete) — กุญแชใช้ครั้งเดียวทิ้ง ปลอดภัย ✅

---

## ทางเลือก B — ทำเองบนคอมพิวเตอร์

1. ดาวน์โหลด `goldcast_v8_github.zip` (ในแชท Kimi) → แตกไฟล์
2. สร้าง repo บน GitHub ตามข้อ 1 ข้างบน
3. เปิด terminal ในโฟลเดอร์ที่แตกแล้ว:
```bash
git init
git add -A
git commit -m "GoldCast v8"
git branch -M main
git remote add origin https://github.com/<user>/goldcast.git
git push -u origin main
```

---

## 🚂 ขึ้น Railway (หลังโค้ดอยู่บน GitHub แล้ว — ทำบนมือถือได้)

1. เปิด https://railway.app → Login ด้วย GitHub
2. **New Project** → **Deploy from GitHub repo** → เลือก `goldcast`
3. Railway จะเจอ `Dockerfile` ของเราเองอัตโนมัติ → **ไม่ต้องตั้งค่าอะไรเพิ่ม** (build + serve อยู่ใน Dockerfile หมดแล้ว)
4. รอ build สัก 2–4 นาที → ไปที่ **Settings → Networking → Generate Domain** → ได้ลิงก์สาธารณะ เช่น `goldcast-production.up.railway.app` 🎉

### สิ่งที่ต้องรู้
- **ไม่ต้องตั้ง env อะไรเลย** — แอปไม่มี backend, ไม่มี database, ไม่มี API key (ฟีดราคาทองสดใช้ gold-api.com ที่ CORS เปิดอยู่แล้ว)
- Railway ให้ **$5 credit ฟรีต่อเดือน** (แผน Hobby) — เว็บ static เบาๆ แบบนี้กินน้อยมาก
- ทุกครั้งที่ push โค้ดใหม่ขึ้น GitHub → Railway **deploy ใหม่อัตโนมัติ**

---

## ✅ เช็กว่าสำเร็จ

เปิดลิงก์ Railway แล้วต้องเห็น:
- หน้าแดชบอร์ดทองคำพร้อมกราฟแท่งเทียน + ghost candles
- มุมขวาบนมีสถานะ LIVE (ถ้าช่วงตลาดปิด/ฟีดขาด จะขึ้น STALE/GAP — เป็นปกติ แอปซื่อสัตย์)
- ลอง `/sessions`, `/scalper-clock`, `?symbol=nas100` — ทุกหน้าต้องเปิดได้ (SPA fallback ตั้งไว้ใน Dockerfile แล้ว)

มีปัญหาตรงไหนส่งมาถามหัวหน้าได้ตลอด 💪
