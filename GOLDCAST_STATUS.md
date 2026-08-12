# GoldCast — สถานะโปรเจกต์ (อ่านไฟล์นี้ก่อนทำต่อทุกครั้ง)

> อัปเดตล่าสุด: 2026-08-12 (หลัง Phase 22 Track H4) — ไฟล์นี้คือจุดต่องานข้ามแชท ถ้าแชทใหม่ไม่เห็นไฟล์ในเครื่องเก่า ให้อ่านไฟล์นี้จาก GitHub repo `alohaman47/goldcast` (branch master/main)

## ระบบคืออะไร
GoldCast = market-volatility intelligence terminal 7 ตลาด (XAUUSD, NAS100, US30, GER40, EURUSD, GBPUSD, USDJPY) — React + Vite frontend, Express server, โฮสต์ Railway, deploy อัตโนมัติจาก branch `main` ของ GitHub repo `alohaman47/goldcast`
- เว็บจริง: https://goldcast-production.up.railway.app
- เจ้าของ: mito (M15 gold scalper) — ผู้ช่วยเรียกตัวเองว่า "ท่านหัวหน้า" คุยภาษาไทย ตรงๆ ไม่โม้ (หลัก brutal honesty ของโปรเจกต์)

## สถานะปัจจุบัน (v18)
- ข้อมูล MT5 ของ mito เอง 100% ครบ 7 ตลาด (H1 ถึง 2026-08-11 17:00, M15 ถึง 17:45/18:00, D1 ถึง 08-10) — OANDA ถูกลบออกจากระบบแล้ว
- Engines v18 (classic GBM, engine_version /20.0): gold AUC 0.7738, EURUSD 0.8327, NAS100 0.8729, US30 0.8903, GER40 0.8402, GBPUSD 0.8420, USDJPY 0.7690 — direction NO-SHIP ทุกตลาด (ขายนาฬิกาความผันผวน ไม่ขายทิศ)
- v18 flat vs v17 like-for-like (|ΔAUC| ≤ 0.001 ทุกตลาด = protocol noise; เพิ่มข้อมูล 1 วันไม่เปลี่ยน edge) — walk-forward variant-B, metrics: goldcast_phase1/out_v18/metrics/
- **สำคัญ — โมเดลที่แสดงผลของทองคำ**: bars.json/latest.json ของทองใช้ HistGradientBoostingClassifier (defaults, seed 42, NaN native, full-history) ตามดีไซน์เดิม ไม่ใช่ classic GBM — พิสูจน์ซ้ำอิสระ 0/400 แถวผิดทั้ง v17 และ v18; parity gate ยังคงเฝ้า classic GBM เหมือนเดิม (สองเส้นทางนี้ต่างกันโดยเจตนา)
- **ถอนคำกล่าวผิดของผู้ช่วย (2026-08-11)**: ผู้ช่วยเคยสรุปว่า annotation ทองเป็น "stale model bug" และจะ "แก้" เป็น classic GBM — ผิดถนัด นั่นคือ HGB ตามดีไซน์ การ "แก้" นั้นจะกลายเป็น honesty regression; v17.1 ที่แก้ผิดถูกทิ้ง ไม่เคย push
- ระบบอัปโหลด: PIN-gated (UPLOAD_TOKEN ใน Railway Variables) — สคริปต์ MT5 v2 ส่งไฟล์ขึ้นเว็บเองตอนรัน (WebRequest) + fallback หาชื่อ symbol โบรกเอง (NAS100/DE40/DJ30)
- Pipeline ดึงไฟล์: GET /api/data-upload/status + /api/data-upload/file/:market/:tf?token=PIN
- PIN: ผู้ช่วยเก็บไว้ใน memory ถาวรแล้ว — ถ้าใช้ไม่ได้ (403) แปลว่า mito เปลี่ยน ให้ถามตัวใหม่
- ข้อมูลข่าว: /api/economic-calendar (forexfactory + fallback) + Professor อ่านข่าวได้
- Version ledger: v14=21ee625, v15=4699535, v16=01f6b50, v17=02720a4, v18=20ed887 (ปัจจุบัน)

## พิธีกรรมรีเฟรชข้อมูลของ mito (ทำเองได้)
1. เปิด chart NAS100 ทิ้งไว้ 1 นาที (ให้ history โหลดครบ)
2. ลากสคริปต์ GoldCast_Export ลง chart → OK → รอบรรทัดสรุปในแท็บ Experts
3. ทักผู้ช่วยว่า "เสร็จ" + แปะบรรทัดสรุป → ผู้ช่วยดึงไฟล์ด้วย PIN → เช็ก bytes → retrain → version ใหม่ → push (ขอ GitHub PAT จาก mito ทุกรอบ)

## Phase 22 Track H4 — gold H4 refresh (2026-08-12, หลัง v18/Daily Focus)
mito อัปโหลด H4 CSV ครบ 7 ตลาด (2022-01-03→2026-08-11 16:00; USDJPY ตามมาทีหลังวันเดียวกัน) → วิจัย SHIP/NO-SHIP ต่อตลาดด้วย walk-forward variant-B เดียวกับ H1 (goldcast_phase1/h4_wf.json, baseline = per-hour class-prior AUC):
- **XAUUSD H4: SHIP (รีเฟรช)** — AUC 0.7460, acc 76.82%, 7,133 แท่ง, +2.45pp เหนือ baseline (0.7216) ผ่านเกต ≥0.70/+2pp; harness-old like-for-like บน CSV ใหม่ตัดที่ 2026-07-03 (6,971 แท่งตรงเป๊ะ) ได้ 0.7434 vs pin เดิม 0.7352 (+0.0082 = protocol noise แบบ v18) ⇒ data effect จริงของหน้าต่างใหม่ +0.0026 ไม่มี regression — ยังคงติดป้ายซื่อสัตย์ "อ่อนกว่า H1" (0.746 vs 0.774)
- **NAS100 H4: ไม่รีเฟรช** — หน้าต่างใหม่ 0.8668 < 0.8715 ของเดิม (history สั้นกว่า เริ่ม 2022 vs 2021) เก็บ engine เดิมไว้
- **US30/GER40/EURUSD/GBPUSD H4: NO-SHIP** — margin เหนือ baseline +0.95/+1.18/−1.52/−0.50pp ไม่ผ่านเกต +2pp (AUC 0.9002/0.8269/0.7716/0.7926) — ไม่มี H4 engine ตลาดเหล่านี้ในเว็บ ตามเกต
- **USDJPY H4: NO-SHIP** (mito ส่ง CSV เพิ่ม 2026-08-12, 7,169 แท่ง) — AUC 0.6855 ต่ำกว่าเกต 0.70 แม้ชนะ baseline +3.48pp (0.6507) — โมเดลอ่อนกว่าเก้าอี้ที่จะนั่ง ไม่ ship ตามกฎ
- สิ่งที่เปลี่ยนใน repo: modelHvolGoldH4/modelRangeGoldH4 (pkl ใหม่, JS↔pkl ≤1.11e-16), bars/latest_xauusd_h4.json (ถึง 2026-08-11 16:00, engine_version `goldcast-gbm-classic-xauusd-h4/13.0`), parity_xauusd_h4_* ใหม่ (9/9 PASS), pins: symbols.ts validation 76.82/0.746/7,133, footer H4 ทอง, TfToggle AUC 0.746, symbol_check CHECK 8

## งานค้าง ณ 2026-08-12
- ไม่มีงานค้างจาก Track H4 — วิจัยครบ 7 ตลาดแล้ว (SHIP เฉพาะ gold) — รอบหน้า: mito รันสคริปต์ GoldCast_Export ตามพิธีกรรมด้านบน → retrain v19
- Phase 21 Track DF (หลัง v18): หน้า Daily Focus (/daily-focus) — LONDON countdown, verdict HOT/NORMAL/QUIET จาก percentile p_high_vol เทียบ 400 แท่ง (display convention ไม่ใช่ trading rule), LONDON heat จาก M15 slots จริง, news risk จาก calendar API, standing rules (gold only, ตัวเลขวิจัย verified)

## กฎเหล็กของโปรเจกต์ (ห้ามลืม)
- ความซื่อสัตย์คือฟีเจอร์: ทุก artifact บอกวันสุดท้ายของข้อมูลตัวเอง, ไม่พลิก verdict ถ้าไม่มีข้อมูลใหม่, ความผิดพลาดต้องเปิดเผย
- Gates ก่อน ship ทุกครั้ง: tsc / build / parity_check 9/9 / symbol_check / alert_check / stub tests (upload 47, professor, calendar) + verifier subagent
- Push: clone/push ด้วย x-access-token URL → push master + master:main → ลบ clone ที่มี token ทิ้งทุกครั้ง
- Railway disk เป็น ephemeral — ไฟล์อัปโหลดหายเมื่อ redeploy (ดึงทันทีหลัง mito แจ้ง)
- งาน research อยู่นอก repo (goldcast_phase1/) — retrain ทำนอกเว็บเสมอ ตัวเลขในเว็บไม่เปลี่ยนทันทีหลังอัปโหลด

## Backlog (mito รู้แล้ว เสนอเมื่อเหมาะ)
M5 clocks ตลาดอื่น, Telegram alerts (@BotFather), trade journal, Professor streaming, trailing-slash guard ใน InpUploadBaseUrl, gold dual-AUC harmonization note
