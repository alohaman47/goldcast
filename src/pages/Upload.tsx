import { useCallback, useRef, useState } from 'react'
import { Download, FileUp, KeyRound, ListChecks, TriangleAlert } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Progress } from '@/components/ui/progress'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

/**
 * GoldCast Phase 18 Track U — หน้าอัปโหลด CSV ข้อมูล MT5 (static export format).
 *
 * ซื่อสัตย์ตามโทนแอป:
 *  - ไฟล์ที่อัปโหลดไม่ได้ retrain ในเซิร์ฟเวอร์นี้ — pipeline นอกเว็บจะหยิบไป
 *    retrain ในรอบถัดไป ตัวเลขในแอปไม่เปลี่ยนทันที
 *  - disk บน host อาจเป็น ephemeral — ไฟล์อาจหายเมื่อ redeploy
 *  - หน้านี้ไม่มีการรับรองว่าข้อมูลจะถูกใช้เมื่อไหร่ บอกแค่ว่ารับไว้ + validate
 *    รูปแบบให้ตรง MT5 export (TAB + <DATE>/<TIME> แยกคอลัมน์)
 */

const PIN_STORAGE_KEY = 'goldcast.upload.pin'

const MARKETS = [
  { id: 'xauusd', label: 'XAUUSD — ทองคำ' },
  { id: 'nas100', label: 'NAS100 — Nasdaq 100' },
  { id: 'us30', label: 'US30 — Dow Jones' },
  { id: 'ger40', label: 'GER40 — DAX' },
  { id: 'eurusd', label: 'EURUSD — ยูโร/ดอลลาร์' },
  { id: 'gbpusd', label: 'GBPUSD — ปอนด์/ดอลลาร์' },
  { id: 'usdjpy', label: 'USDJPY — ดอลลาร์/เยน' },
] as const

const TFS = [
  { id: 'd1', label: 'D1 — รายวัน' },
  { id: 'h4', label: 'H4 — 4 ชั่วโมง' },
  { id: 'h1', label: 'H1 — 1 ชั่วโมง' },
  { id: 'm15', label: 'M15 — 15 นาที' },
  { id: 'm5', label: 'M5 — 5 นาที' },
] as const

type MarketId = (typeof MARKETS)[number]['id']
type TfId = (typeof TFS)[number]['id']

type UploadOk = {
  ok: true
  market: string
  tf: string
  rows: number
  firstBar: string
  lastBar: string
  warnings: string[]
  hasSpread: boolean
  hasTickvol: boolean
  storedAs?: string
}

type FileState = {
  id: number
  file: File
  market: MarketId
  tf: TfId
  guessed: boolean // true = เดาจากชื่อไฟล์ / false = ผู้ใช้เลือกเอง
  status: 'pending' | 'uploading' | 'done' | 'error'
  progress: number // 0–100 (upload progress จริงจาก XHR)
  result?: UploadOk
  error?: string
}

type StatusFile = {
  dir: string
  file: string
  market?: string
  tf?: string
  receivedAt?: string
  bytes?: number
  rows?: number
  firstBar?: string
  lastBar?: string
  warnings?: string[]
  error?: string
}

/* เดา market/tf จากชื่อไฟล์ เช่น XAUUSD_H1_202201030100_202608041600.csv
   หรือ XAUUSD_Daily_202201030000_202608040000.csv (MT5 เรียก D1 ว่า "Daily") */
function guessFromName(name: string): { market: MarketId | null; tf: TfId | null } {
  const lower = name.toLowerCase()
  const m = lower.match(/(xauusd|nas100|us100|us30|ger40|de40|eurusd|gbpusd|usdjpy)/)
  const tfMatch = lower.match(/(?:^|[^a-z0-9])(d1|h1|h4|m15|m5|daily)(?:[^a-z0-9]|$)/)
  const tfRaw = tfMatch?.[1] === 'daily' ? 'd1' : tfMatch?.[1]
  const marketMap: Record<string, MarketId> = { us100: 'nas100', de40: 'ger40' }
  const rawMarket = m?.[1] ?? null
  const market = rawMarket ? ((marketMap[rawMarket] ?? rawMarket) as MarketId) : null
  return { market, tf: (tfRaw as TfId | undefined) ?? null }
}

/* อัปโหลดด้วย XHR เพื่อให้มี upload progress จริง (fetch ไม่มี upload progress) */
function postCsv(
  pin: string,
  market: string,
  tf: string,
  file: File,
  onProgress: (pct: number) => void,
): Promise<{ status: number; json: Record<string, unknown> }> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('POST', `/api/data-upload/${market}/${tf}`)
    xhr.setRequestHeader('content-type', 'text/plain')
    xhr.setRequestHeader('x-upload-token', pin)
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100))
    }
    xhr.onload = () => {
      let json: Record<string, unknown> = {}
      try {
        json = JSON.parse(xhr.responseText)
      } catch {
        json = { error: `เซิร์ฟเวอร์ตอบกลับไม่ใช่ JSON (HTTP ${xhr.status})` }
      }
      resolve({ status: xhr.status, json })
    }
    xhr.onerror = () => reject(new Error('เชื่อมต่อเซิร์ฟเวอร์ไม่ได้'))
    xhr.send(file)
  })
}

let nextId = 1

export default function Upload() {
  const [pin, setPin] = useState(() => localStorage.getItem(PIN_STORAGE_KEY) ?? '')
  const [files, setFiles] = useState<FileState[]>([])
  const [busy, setBusy] = useState(false)
  const [statusOpen, setStatusOpen] = useState(false)
  const [statusLoading, setStatusLoading] = useState(false)
  const [statusError, setStatusError] = useState<string | null>(null)
  const [statusFiles, setStatusFiles] = useState<StatusFile[] | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const savePin = (v: string) => {
    setPin(v)
    localStorage.setItem(PIN_STORAGE_KEY, v)
  }

  const addFiles = useCallback((list: FileList | null) => {
    if (!list) return
    const added: FileState[] = Array.from(list).map((file) => {
      const g = guessFromName(file.name)
      return {
        id: nextId++,
        file,
        market: g.market ?? 'xauusd',
        tf: g.tf ?? 'h1',
        guessed: g.market !== null && g.tf !== null,
        status: 'pending',
        progress: 0,
      }
    })
    setFiles((prev) => [...prev, ...added])
  }, [])

  const patchFile = (id: number, patch: Partial<FileState>) =>
    setFiles((prev) => prev.map((f) => (f.id === id ? { ...f, ...patch } : f)))

  const removeFile = (id: number) => setFiles((prev) => prev.filter((f) => f.id !== id))

  const uploadAll = async () => {
    if (!pin.trim() || busy) return
    setBusy(true)
    // ส่งทีละไฟล์ตามลำดับ — เซิร์ฟเวอร์เก็บไฟล์ทีละชุด ไม่เร่งรีบ
    for (const f of files) {
      if (f.status === 'done') continue
      patchFile(f.id, { status: 'uploading', progress: 0, error: undefined })
      try {
        const { status, json } = await postCsv(pin.trim(), f.market, f.tf, f.file, (pct) =>
          patchFile(f.id, { progress: pct }),
        )
        if (status === 200 && json.ok === true) {
          patchFile(f.id, { status: 'done', progress: 100, result: json as unknown as UploadOk })
        } else {
          patchFile(f.id, {
            status: 'error',
            error: typeof json.error === 'string' ? json.error : `HTTP ${status}`,
          })
        }
      } catch (e) {
        patchFile(f.id, { status: 'error', error: String((e as Error)?.message || e) })
      }
    }
    setBusy(false)
  }

  const loadStatus = async () => {
    if (!pin.trim()) {
      setStatusError('ใส่ PIN ก่อนดูสถานะ')
      setStatusOpen(true)
      return
    }
    setStatusOpen(true)
    setStatusLoading(true)
    setStatusError(null)
    try {
      const res = await fetch(`/api/data-upload/status?token=${encodeURIComponent(pin.trim())}`)
      const json = await res.json().catch(() => null)
      if (res.status === 200 && Array.isArray(json?.files)) {
        setStatusFiles(json.files as StatusFile[])
      } else {
        setStatusFiles(null)
        setStatusError(typeof json?.error === 'string' ? json.error : `HTTP ${res.status}`)
      }
    } catch (e) {
      setStatusFiles(null)
      setStatusError(String((e as Error)?.message || e))
    }
    setStatusLoading(false)
  }

  const pendingCount = files.filter((f) => f.status !== 'done').length

  return (
    <div className="mx-auto w-full max-w-[900px] px-6 pb-24 pt-14">
      {/* Hero */}
      <p className="label-caps text-gold">MT5 data upload · offline retrain pipeline</p>
      <h1 className="mt-3 font-display text-[30px] font-bold leading-[38px] tracking-[-0.015em] text-text0">
        อัปโหลดข้อมูล MT5 (CSV)
      </h1>
      <p className="mt-3 max-w-[640px] font-body text-[13px] leading-6 text-text1">
        รับไฟล์ CSV จาก MT5 (เมนู Export) — รูปแบบ tab-delimited หัวตาราง{' '}
        <code className="font-mono text-gold">&lt;DATE&gt; &lt;TIME&gt; &lt;OPEN&gt; &lt;HIGH&gt; &lt;LOW&gt; &lt;CLOSE&gt;</code>{' '}
        (ไฟล์ D1 ไม่มีคอลัมน์ &lt;TIME&gt;; คอลัมน์ TICKVOL/VOL/SPREAD จะมีหรือไม่ก็ได้)
        เซิร์ฟเวอร์จะ validate รูปแบบและเก็บไฟล์ไว้
      </p>

      {/* ข้อความซื่อสัตย์ — บังคับมี */}
      <div className="mt-6 rounded-lg border border-warn/30 bg-bg1 p-4">
        <span className="label-caps text-warn">ต้องรู้ก่อนอัปโหลด</span>
        <ul className="mt-2 list-disc space-y-1 pl-5 font-body text-[12px] leading-5 text-text1">
          <li>ไฟล์ที่อัปโหลดจะถูกนำไป retrain โมเดลนอกเว็บในรอบถัดไป — ตัวเลขในแอปไม่เปลี่ยนทันที</li>
          <li>ไฟล์บนเซิร์ฟเวอร์อาจหายเมื่อ redeploy — เก็บต้นฉบับไว้ด้วย</li>
        </ul>
      </div>

      {/* สคริปต์ MT5 สำหรับ export CSV */}
      <section className="panel mt-6 p-5" aria-label="สคริปต์ MT5">
        <h2 className="panel-title flex items-center gap-2">
          <Download className="h-3.5 w-3.5 text-gold" /> สคริปต์ MT5 (GoldCast_Export.mq5)
        </h2>
        <p className="mt-3 max-w-[640px] font-body text-[12px] leading-5 text-text1">
          สคริปต์ MQL5 ที่ export ข้อมูล OHLC ทุกตลาดออกเป็น CSV ในคลิกเดียว — รูปแบบไฟล์ตรงกับที่หน้านี้รับเป๊ะ
          (วิธีติดตั้งและใช้งานอยู่ในคอมเมนต์หัวไฟล์ หรือถามผู้ดูแล)
        </p>
        <p className="mt-2 max-w-[640px] font-body text-[12px] leading-5 text-text1">
          ทางลัด: ตั้งค่าครั้งเดียว (เปิด WebRequest + ใส่ PIN ในหน้า Inputs ของสคริปต์) — ครั้งต่อไปสคริปต์จะส่งไฟล์ขึ้นเว็บเองตอนรัน
          ไม่ต้องเลือกไฟล์อัปโหลด วิธีอยู่ในคอมเมนต์หัวไฟล์สคริปต์
        </p>
        <div className="mt-4">
          <Button
            asChild
            variant="outline"
            className="border-line bg-bg3 font-mono text-[12px] text-gold hover:bg-bg4 hover:text-goldhi"
          >
            <a href="/mt5/GoldCast_Export.mq5" download="GoldCast_Export.mq5">
              ดาวน์โหลดสคริปต์ MT5 (GoldCast_Export.mq5)
            </a>
          </Button>
        </div>
      </section>

      {/* PIN */}
      <section className="panel mt-8 p-5" aria-label="PIN">
        <h2 className="panel-title flex items-center gap-2">
          <KeyRound className="h-3.5 w-3.5 text-gold" /> PIN อัปโหลด
        </h2>
        <div className="mt-4 flex max-w-md flex-col gap-2">
          <Label htmlFor="upload-pin" className="font-mono text-[11px] text-text2">
            ใส่ PIN ที่ตั้งไว้ในเซิร์ฟเวอร์ (UPLOAD_TOKEN) — จำไว้ในเครื่องนี้เท่านั้น
          </Label>
          <Input
            id="upload-pin"
            type="password"
            value={pin}
            onChange={(e) => savePin(e.target.value)}
            placeholder="PIN"
            autoComplete="off"
            className="border-line bg-bg3 font-mono text-[13px] text-text0"
          />
        </div>
      </section>

      {/* File picker + list */}
      <section className="panel mt-6 p-5" aria-label="เลือกไฟล์">
        <h2 className="panel-title flex items-center gap-2">
          <FileUp className="h-3.5 w-3.5 text-gold" /> ไฟล์ CSV
        </h2>
        <div className="mt-4">
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,text/csv,text/plain"
            multiple
            className="hidden"
            onChange={(e) => {
              addFiles(e.target.files)
              e.target.value = ''
            }}
          />
          <Button
            variant="outline"
            onClick={() => fileInputRef.current?.click()}
            className="border-line bg-bg3 font-mono text-[12px] text-gold hover:bg-bg4 hover:text-goldhi"
          >
            เลือกไฟล์ (เลือกได้หลายไฟล์)
          </Button>
        </div>

        {files.length > 0 && (
          <div className="mt-5 flex flex-col gap-4">
            {files.map((f) => (
              <div key={f.id} className="rounded-lg border border-line bg-bg1 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-mono text-[12px] text-text0">{f.file.name}</span>
                  <span className="font-mono text-[11px] text-text2">
                    {(f.file.size / 1024 / 1024).toFixed(2)} MB
                    {f.guessed && f.status === 'pending' && ' · เดาตลาด/timeframe จากชื่อไฟล์ — ตรวจก่อนส่ง'}
                  </span>
                </div>

                <div className="mt-3 flex flex-wrap items-end gap-3">
                  <div className="flex flex-col gap-1">
                    <span className="font-mono text-[10px] uppercase tracking-wide text-text2">ตลาด</span>
                    <Select
                      value={f.market}
                      onValueChange={(v) => patchFile(f.id, { market: v as MarketId, guessed: false })}
                      disabled={f.status === 'uploading' || f.status === 'done'}
                    >
                      <SelectTrigger className="w-[220px] border-line bg-bg3 font-mono text-[12px] text-text0">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {MARKETS.map((m) => (
                          <SelectItem key={m.id} value={m.id} className="font-mono text-[12px]">
                            {m.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex flex-col gap-1">
                    <span className="font-mono text-[10px] uppercase tracking-wide text-text2">Timeframe</span>
                    <Select
                      value={f.tf}
                      onValueChange={(v) => patchFile(f.id, { tf: v as TfId, guessed: false })}
                      disabled={f.status === 'uploading' || f.status === 'done'}
                    >
                      <SelectTrigger className="w-[180px] border-line bg-bg3 font-mono text-[12px] text-text0">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {TFS.map((t) => (
                          <SelectItem key={t.id} value={t.id} className="font-mono text-[12px]">
                            {t.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  {f.status === 'pending' && (
                    <Button
                      variant="ghost"
                      onClick={() => removeFile(f.id)}
                      className="font-mono text-[11px] text-text2 hover:text-down"
                    >
                      ลบออก
                    </Button>
                  )}
                </div>

                {(f.status === 'uploading' || f.status === 'done') && (
                  <div className="mt-3">
                    <Progress value={f.progress} className="h-1.5" />
                    <p className="mt-1 font-mono text-[10px] text-text2">
                      {f.status === 'uploading' ? `กำลังอัปโหลด… ${f.progress}%` : 'อัปโหลดสำเร็จ'}
                    </p>
                  </div>
                )}

                {f.status === 'done' && f.result && (
                  <div className="mt-3 rounded border border-up/30 bg-bg0 p-3 font-mono text-[11px] leading-5 text-text1">
                    <p className="text-up">
                      ผ่านการ validate — {f.result.rows.toLocaleString('en-US')} แถว · {f.result.firstBar} ถึง{' '}
                      {f.result.lastBar}
                    </p>
                    <p className="mt-1 text-text2">
                      คอลัมน์เสริม: {f.result.hasTickvol ? 'มี TICKVOL' : 'ไม่มี TICKVOL'} ·{' '}
                      {f.result.hasSpread ? 'มี SPREAD' : 'ไม่มี SPREAD'}
                      {f.result.storedAs && <> · เก็บเป็น {f.result.storedAs}</>}
                    </p>
                    {f.result.warnings.length > 0 && (
                      <ul className="mt-2 space-y-1 text-warn">
                        {f.result.warnings.map((w, i) => (
                          <li key={i} className="flex items-start gap-1.5">
                            <TriangleAlert className="mt-0.5 h-3 w-3 shrink-0" /> {w}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}

                {f.status === 'error' && (
                  <p className="mt-3 rounded border border-down/40 bg-bg0 p-3 font-mono text-[11px] leading-5 text-down">
                    อัปโหลดไม่สำเร็จ — {f.error}
                  </p>
                )}
              </div>
            ))}

            <div className="flex items-center gap-3">
              <Button
                onClick={uploadAll}
                disabled={busy || pendingCount === 0 || !pin.trim()}
                className="bg-gold font-mono text-[12px] font-semibold text-bg0 hover:bg-goldhi"
              >
                {busy ? 'กำลังอัปโหลด…' : `อัปโหลด ${pendingCount} ไฟล์`}
              </Button>
              {!pin.trim() && <span className="font-mono text-[11px] text-warn">ใส่ PIN ก่อนอัปโหลด</span>}
            </div>
          </div>
        )}
      </section>

      {/* Status */}
      <section className="panel mt-6 p-5" aria-label="สถานะไฟล์บนเซิร์ฟเวอร์">
        <h2 className="panel-title flex items-center gap-2">
          <ListChecks className="h-3.5 w-3.5 text-gold" /> ไฟล์ที่เซิร์ฟเวอร์รับไว้
        </h2>
        <div className="mt-4">
          <Button
            variant="outline"
            onClick={loadStatus}
            disabled={statusLoading}
            className="border-line bg-bg3 font-mono text-[12px] text-gold hover:bg-bg4 hover:text-goldhi"
          >
            {statusLoading ? 'กำลังโหลด…' : 'ดูสถานะรวม'}
          </Button>
        </div>

        {statusOpen && (
          <div className="mt-4">
            {statusError && (
              <p className="rounded border border-down/40 bg-bg0 p-3 font-mono text-[11px] text-down">{statusError}</p>
            )}
            {statusFiles && statusFiles.length === 0 && (
              <p className="font-mono text-[12px] text-text2">ยังไม่มีไฟล์บนเซิร์ฟเวอร์ (หรือไฟล์หายไปเมื่อ redeploy ล่าสุด)</p>
            )}
            {statusFiles && statusFiles.length > 0 && (
              <div className="flex flex-col gap-3">
                {statusFiles.map((s, i) => (
                  <div key={i} className="rounded-lg border border-line bg-bg1 p-3 font-mono text-[11px] leading-5 text-text1">
                    <p className="text-text0">
                      {s.market?.toUpperCase() ?? '?'} · {s.tf?.toUpperCase() ?? '?'} ·{' '}
                      {typeof s.rows === 'number' ? `${s.rows.toLocaleString('en-US')} แถว` : '—'}
                    </p>
                    <p className="text-text2">
                      {s.firstBar ?? '?'} ถึง {s.lastBar ?? '?'}
                      {s.receivedAt && <> · รับเมื่อ {new Date(s.receivedAt).toLocaleString('th-TH')}</>}
                      {typeof s.bytes === 'number' && <> · {(s.bytes / 1024 / 1024).toFixed(2)} MB</>}
                    </p>
                    <p className="text-text2">path: {s.dir}/{s.file}</p>
                    {s.error && <p className="text-warn">{s.error}</p>}
                    {s.warnings && s.warnings.length > 0 && (
                      <ul className="mt-1 space-y-0.5 text-warn">
                        {s.warnings.map((w, j) => (
                          <li key={j}>· {w}</li>
                        ))}
                      </ul>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </section>
    </div>
  )
}
