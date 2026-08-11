# GoldCast — สถานะโปรเจกต์ (อ่านไฟล์นี้ก่อนทำต่อทุกครั้ง)

> อัปเดตล่าสุด: 2026-08-11 (หลัง v17) — ไฟล์นี้คือจุดต่องานข้ามแชท ถ้าแชทใหม่ไม่เห็นไฟล์ในเครื่องเก่า ให้อ่านไฟล์นี้จาก GitHub repo `alohaman47/goldcast` (branch master/main)

## ระบบคืออะไร
GoldCast = market-volatility intelligence terminal 7 ตลาด (XAUUSD, NAS100, US30, GER40, EURUSD, GBPUSD, USDJPY) — React + Vite frontend, Express server, โฮสต์ Railway, deploy อัตโนมัติจาก branch `main` ของ GitHub repo `alohaman47/goldcast`
- เว็บจริง: https://goldcast-production.up.railway.app
- เจ้าของ: mito (M15 gold scalper) — ผู้ช่วยเรียกตัวเองว่า "ท่านหัวหน้า" คุยภาษาไทย ตรงๆ ไม่โม้ (หลัก brutal honesty ของโปรเจกต์)

## สถานะปัจจุบัน (v17)
- ข้อมูล MT5 ของ mito เอง 100% ครบ 7 ตลาด (ถึง 2026-08-10, M15 ถึง 20:15) — OANDA ถูกลบออกจากระบบแล้ว
- Engines: gold AUC 0.7756, EURUSD 0.8308, NAS100 0.8725, US30 0.8890, GER40 0.8368, GBPUSD 0.8392, USDJPY 0.7668 — direction NO-SHIP ทุกตลาด (ขายนาฬิกาความผันผวน ไม่ขายทิศ)
- ระบบอัปโหลด: PIN-gated (UPLOAD_TOKEN ใน Railway Variables) — สคริปต์ MT5 v2 ส่งไฟล์ขึ้นเว็บเองตอนรัน (WebRequest) + fallback หาชื่อ symbol โบรกเอง (NAS100/DE40/DJ30)
- Pipeline ดึงไฟล์: GET /api/data-upload/status + /api/data-upload/file/:market/:tf?token=PIN
- PIN: ผู้ช่วยเก็บไว้ใน memory ถาวรแล้ว — ถ้าใช้ไม่ได้ (403) แปลว่า mito เปลี่ยน ให้ถามตัวใหม่
- ข้อมูลข่าว: /api/economic-calendar (forexfactory + fallback) + Professor อ่านข่าวได้
- Version ledger: v14=21ee625, v15=4699535, v16=01f6b50, v17=02720a4 (ปัจจุบัน)

## พิธีกรรมรีเฟรชข้อมูลของ mito (ทำเองได้)
1. เปิด chart NAS100 ทิ้งไว้ 1 นาที (ให้ history โหลดครบ)
2. ลากสคริปต์ GoldCast_Export ลง chart → OK → รอบรรทัดสรุปในแท็บ Experts
3. ทักผู้ช่วยว่า "เสร็จ" + แปะบรรทัดสรุป → ผู้ช่วยดึงไฟล์ด้วย PIN → เช็ก bytes → retrain → version ใหม่ → push (ขอ GitHub PAT จาก mito ทุกรอบ)

## งานค้าง ณ 2026-08-11
- mito กำลังรันสคริปต์ v2 ครั้งแรก (log 10:04: ผ่าน ~4/21 ไฟล์, ข้อมูลสดถึง 08-11, NAS100 ครบแล้ว) — รอบรรทัดสรุป `อัปโหลดอัตโนมัติ: 21/21` แล้วดึงไฟล์เช็ก → เสนอ retrain v18

## กฎเหล็กของโปรเจกต์ (ห้ามลืม)
- ความซื่อสัตย์คือฟีเจอร์: ทุก artifact บอกวันสุดท้ายของข้อมูลตัวเอง, ไม่พลิก verdict ถ้าไม่มีข้อมูลใหม่, ความผิดพลาดต้องเปิดเผย
- Gates ก่อน ship ทุกครั้ง: tsc / build / parity_check 9/9 / symbol_check / alert_check / stub tests (upload 47, professor, calendar) + verifier subagent
- Push: clone/push ด้วย x-access-token URL → push master + master:main → ลบ clone ที่มี token ทิ้งทุกครั้ง
- Railway disk เป็น ephemeral — ไฟล์อัปโหลดหายเมื่อ redeploy (ดึงทันทีหลัง mito แจ้ง)
- งาน research อยู่นอก repo (goldcast_phase1/) — retrain ทำนอกเว็บเสมอ ตัวเลขในเว็บไม่เปลี่ยนทันทีหลังอัปโหลด

## Backlog (mito รู้แล้ว เสนอเมื่อเหมาะ)
H4 CSV 5 ตลาดใหม่ (ปลดล็อก H4 engines — สคริปต์รองรับแล้ว แค่เพิ่ม H4 ใน InpTimeframes), M5 clocks ตลาดอื่น, Telegram alerts (@BotFather), trade journal, Professor streaming, trailing-slash guard ใน InpUploadBaseUrl, gold dual-AUC harmonization note
