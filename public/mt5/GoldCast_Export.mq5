//+------------------------------------------------------------------+
//|                                           GoldCast_Export.mq5    |
//|         GoldCast — Export OHLC ทุกตลาดออกเป็น CSV ในคลิกเดียว    |
//+------------------------------------------------------------------+
//| วิธีใช้ (สั้นๆ):                                                  |
//|  1. คัดลอกไฟล์นี้ไปวางในโฟลเดอร์  MQL5/Scripts/                  |
//|     (เปิดผ่านเมนู File → Open Data Folder ใน MT5)                 |
//|  2. เปิด MetaEditor แล้วกด F7 เพื่อ compile                       |
//|  3. ใน MT5 เปิดหน้าต่าง Navigator → Scripts →                     |
//|     ลาก GoldCast_Export ลงบน chart อะไรก็ได้ (หรือดับเบิลคลิก)     |
//|  4. ตั้งค่า input ตามต้องการ แล้วกด OK — รอสักครู่ (ดูผลในแท็บ     |
//|     Experts ของหน้าต่าง Toolbox)                                   |
//|  5. ไฟล์ CSV ออกที่ File → Open Data Folder →                     |
//|     MQL5/Files/GoldCast/<SYMBOL>_<TF>.csv                          |
//|                                                                   |
//| รูปแบบไฟล์ที่ออก: ตรงกับไฟล์ export เดิมของ pipeline GoldCast     |
//| เป๊ะ — คั่นด้วย TAB, จบบรรทัด CRLF, มี header แบบ <DATE>...        |
//|  - D1  : <DATE> <OPEN> <HIGH> <LOW> <CLOSE> <TICKVOL> <VOL>        |
//|          <SPREAD>                                                  |
//|  - TF ย่อย: มีคอลัมน์ <TIME> (HH:MM:SS) แทรกหลัง <DATE>            |
//|  - วันที่รูปแบบ YYYY.MM.DD / ทศนิยมตาม digits ของ symbol           |
//|  - <SPREAD> เป็นหน่วย point (ตัวเลขจำนวนเต็ม) เหมือนไฟล์เดิม       |
//+------------------------------------------------------------------+
#property copyright "GoldCast"
#property version   "1.00"
#property script_show_inputs

//--- mapping "ชื่อมาตรฐาน=ชื่อ symbol ของโบรก" คั่นด้วยลูกน้ำ
//--- ถ้าโบรกของคุณใช้ชื่ออื่น ให้แก้ฝั่งขวาของเครื่องหมาย =
//---   เช่น "XAUUSD=XAUUSD.pro" , "GER40=GER40.cash" , "US100=USTEC"
//--- ชื่อฝั่งซ้าย (มาตรฐาน) จะถูกใช้เป็นชื่อไฟล์ผลลัพธ์
input string   InpSymbolMap  = "XAUUSD=XAUUSD,US100=US100,US30=US30,GER40=GER40,EURUSD=EURUSD,GBPUSD=GBPUSD,USDJPY=USDJPY";
//--- timeframe ที่ต้องการ export คั่นด้วยลูกน้ำ (รองรับ M5,M15,M30,H1,H4,D1,W1,MN1)
input string   InpTimeframes = "D1,H1,M15";
//--- วันที่เริ่มต้นของข้อมูล (ไฟล์เดิมของ pipeline เริ่มแถวแรกราว 2021.12.01–2022.01.03)
input datetime InpFromDate   = D'2021.12.01 00:00';
//--- เพดานจำนวน bar สูงสุดต่อไฟล์ (กันโบรกที่มี history ยาวผิดปกติ)
//--- ถ้าข้อมูลเกิน จะตัดเอาเฉพาะ bar ล่าสุดตามจำนวนที่กำหนด และเตือนใน log
input int      InpMaxBars    = 200000;
//--- true = ข้าม bar ล่าสุดที่ยังไม่ปิด (bar ปัจจุบัน) เพื่อให้ไฟล์มีแต่ bar สมบูรณ์
input bool     InpSkipCurrentBar = true;

//+------------------------------------------------------------------+
//| แปลงข้อความ timeframe ("M15","H1",...) เป็น ENUM_TIMEFRAMES       |
//+------------------------------------------------------------------+
bool ParseTimeframe(const string label, ENUM_TIMEFRAMES &tf)
  {
   string t = label;
   StringTrimLeft(t);
   StringTrimRight(t);
   StringToUpper(t);

   if(t=="M1")  { tf=PERIOD_M1;  return(true); }
   if(t=="M5")  { tf=PERIOD_M5;  return(true); }
   if(t=="M15") { tf=PERIOD_M15; return(true); }
   if(t=="M30") { tf=PERIOD_M30; return(true); }
   if(t=="H1")  { tf=PERIOD_H1;  return(true); }
   if(t=="H4")  { tf=PERIOD_H4;  return(true); }
   if(t=="D1")  { tf=PERIOD_D1;  return(true); }
   if(t=="W1")  { tf=PERIOD_W1;  return(true); }
   if(t=="MN1") { tf=PERIOD_MN1; return(true); }
   return(false);
  }

//+------------------------------------------------------------------+
//| TF รายวันขึ้นไป → ไฟล์เดิมไม่มีคอลัมน์ <TIME>                      |
//+------------------------------------------------------------------+
bool IsDateOnlyTF(const ENUM_TIMEFRAMES tf)
  {
   return(tf==PERIOD_D1 || tf==PERIOD_W1 || tf==PERIOD_MN1);
  }

//+------------------------------------------------------------------+
//| ตัดช่องว่างหัว-ท้ายของข้อความ (คืนค่าเป็นสตริงใหม่)               |
//+------------------------------------------------------------------+
string Trim(const string s)
  {
   string r = s;
   StringTrimLeft(r);
   StringTrimRight(r);
   return(r);
  }

//+------------------------------------------------------------------+
//| Export symbol เดียว timeframe เดียว ออกเป็นไฟล์ CSV               |
//| คืนค่า: จำนวนแถวข้อมูลที่เขียนได้ (ไม่นับ header) หรือ -1 ถ้าล้มเหลว |
//+------------------------------------------------------------------+
int ExportOne(const string stdName, const string brokerSym,
              const string tfLabel, const ENUM_TIMEFRAMES tf)
  {
   //--- เลือก symbol ให้ปรากฏใน Market Watch (ถ้าโบรกไม่มี symbol นี้จะข้าม)
   if(!SymbolSelect(brokerSym, true))
     {
      PrintFormat("[GoldCast] ไม่พบ symbol '%s' (ตลาด %s) ที่โบรก — ข้าม "
                  "(แก้ชื่อได้ที่ InpSymbolMap)", brokerSym, stdName);
      return(-1);
     }

   const int digits = (int)SymbolInfoInteger(brokerSym, SYMBOL_DIGITS);

   //--- ดึงข้อมูล OHLC ช่วง InpFromDate ถึงตอนนี้
   //--- (ลองซ้ำสูงสุด 5 ครั้ง เผื่อ terminal กำลังโหลด history อยู่)
   MqlRates rates[];
   int copied = -1;
   for(int attempt=0; attempt<5 && copied<0; attempt++)
     {
      copied = CopyRates(brokerSym, tf, InpFromDate, TimeCurrent(), rates);
      if(copied<0)
         Sleep(500);
     }
   if(copied<=0)
     {
      PrintFormat("[GoldCast] CopyRates ล้มเหลว %s %s (err=%d) — ข้าม",
                  brokerSym, tfLabel, GetLastError());
      return(-1);
     }

   //--- เพดานความปลอดภัย: ถ้า bar เกิน InpMaxBars ให้ตัดเอาชุดล่าสุด
   int startIdx = 0;
   if(copied > InpMaxBars)
     {
      startIdx = copied - InpMaxBars;
      PrintFormat("[GoldCast] คำเตือน: %s %s มี %d bar เกินเพดาน %d — "
                  "ตัดเอาเฉพาะ %d bar ล่าสุด",
                  brokerSym, tfLabel, copied, InpMaxBars, InpMaxBars);
     }

   //--- ข้าม bar ที่ยังไม่ปิด (bar ปัจจุบัน) ถ้าผู้ใช้เลือกไว้
   int endIdx = copied - 1;   // index ของ bar สุดท้ายที่จะเขียน
   if(InpSkipCurrentBar)
     {
      datetime curBarTime = iTime(brokerSym, tf, 0);   // เวลาเปิดของ bar ปัจจุบัน
      if(curBarTime > 0 && endIdx >= 0 && rates[endIdx].time >= curBarTime)
         endIdx--;
     }
   if(endIdx < startIdx)
     {
      PrintFormat("[GoldCast] %s %s ไม่มี bar ที่ปิดสมบูรณ์ในช่วงที่ขอ — ข้าม",
                  brokerSym, tfLabel);
      return(-1);
     }

   //--- เปิดไฟล์ในโฟลเดอร์ย่อย GoldCast ของ MQL5/Files
   //--- (FILE_ANSI + เขียน CRLF เอง เพื่อให้ไฟล์ตรงของเดิมเป๊ะ)
   string fileName = StringFormat("GoldCast\\%s_%s.csv", stdName, tfLabel);
   ResetLastError();
   int h = FileOpen(fileName, FILE_WRITE | FILE_TXT | FILE_ANSI);
   if(h == INVALID_HANDLE)
     {
      PrintFormat("[GoldCast] เปิดไฟล์ %s ไม่ได้ (err=%d) — ข้าม",
                  fileName, GetLastError());
      return(-1);
     }

   //--- header: D1/W1/MN1 ไม่มีคอลัมน์ <TIME> ตามรูปแบบไฟล์เดิม
   bool dateOnly = IsDateOnlyTF(tf);
   if(dateOnly)
      FileWriteString(h, "<DATE>\t<OPEN>\t<HIGH>\t<LOW>\t<CLOSE>\t<TICKVOL>\t<VOL>\t<SPREAD>\r\n");
   else
      FileWriteString(h, "<DATE>\t<TIME>\t<OPEN>\t<HIGH>\t<LOW>\t<CLOSE>\t<TICKVOL>\t<VOL>\t<SPREAD>\r\n");

   //--- เขียนทีละแถว: วันที่ YYYY.MM.DD / เวลา HH:MM:SS / ราคาตาม digits /
   //--- TICKVOL = tick_volume, VOL = real_volume (FX ส่วนมากเป็น 0),
   //--- SPREAD = spread หน่วย point — ตรงไฟล์เดิมทุกประการ
   int rows = 0;
   for(int i=startIdx; i<=endIdx; i++)
     {
      string line = TimeToString(rates[i].time, TIME_DATE);
      if(!dateOnly)
         line += "\t" + TimeToString(rates[i].time, TIME_SECONDS);
      line += "\t" + DoubleToString(rates[i].open,  digits)
            + "\t" + DoubleToString(rates[i].high,  digits)
            + "\t" + DoubleToString(rates[i].low,   digits)
            + "\t" + DoubleToString(rates[i].close, digits)
            + "\t" + IntegerToString(rates[i].tick_volume)
            + "\t" + IntegerToString(rates[i].real_volume)
            + "\t" + IntegerToString(rates[i].spread)
            + "\r\n";
      FileWriteString(h, line);
      rows++;
     }
   FileClose(h);

   //--- รายงานผลต่อไฟล์: จำนวนแถว + ช่วงวันที่
   PrintFormat("[GoldCast] %s  → %d แถว  (%s ถึง %s)%s",
               fileName, rows,
               TimeToString(rates[startIdx].time, TIME_DATE|TIME_SECONDS),
               TimeToString(rates[endIdx].time,  TIME_DATE|TIME_SECONDS),
               (endIdx < copied-1 ? ", ข้าม bar ที่ยังไม่ปิด" : ""));
   return(rows);
  }

//+------------------------------------------------------------------+
//| จุดเริ่มต้นของ script — รันครั้งเดียวแล้วจบ                       |
//+------------------------------------------------------------------+
void OnStart()
  {
   PrintFormat("[GoldCast] เริ่ม export — จาก %s ถึงปัจจุบัน, TF: %s",
               TimeToString(InpFromDate, TIME_DATE), InpTimeframes);

   //--- แยก timeframe list
   string tfParts[];
   int tfCount = StringSplit(InpTimeframes, ',', tfParts);
   if(tfCount<=0)
     {
      Print("[GoldCast] InpTimeframes ว่างเปล่า — จบการทำงาน");
      return;
     }

   //--- แยก symbol map เป็นคู่ "มาตรฐาน=โบรก"
   string pairs[];
   int pairCount = StringSplit(InpSymbolMap, ',', pairs);
   if(pairCount<=0)
     {
      Print("[GoldCast] InpSymbolMap ว่างเปล่า — จบการทำงาน");
      return;
     }

   int okFiles = 0, failFiles = 0;
   long totalRows = 0;

   //--- วนทุก symbol × timeframe
   for(int p=0; p<pairCount; p++)
     {
      string kv[];
      if(StringSplit(Trim(pairs[p]), '=', kv) != 2)
        {
         PrintFormat("[GoldCast] รูปแบบ mapping ไม่ถูกต้อง: '%s' "
                     "(ต้องเป็น ชื่อมาตรฐาน=ชื่อโบรก) — ข้าม", pairs[p]);
         failFiles++;
         continue;
        }
      string stdName   = Trim(kv[0]);
      string brokerSym = Trim(kv[1]);

      for(int t=0; t<tfCount; t++)
        {
         string tfLabel = Trim(tfParts[t]);
         StringToUpper(tfLabel);
         ENUM_TIMEFRAMES tf;
         if(!ParseTimeframe(tfLabel, tf))
           {
            PrintFormat("[GoldCast] ไม่รู้จัก timeframe '%s' — ข้าม", tfLabel);
            failFiles++;
            continue;
           }

         int rows = ExportOne(stdName, brokerSym, tfLabel, tf);
         if(rows >= 0) { okFiles++; totalRows += rows; }
         else          { failFiles++; }
        }
     }

   //--- สรุปท้ายรัน
   PrintFormat("[GoldCast] เสร็จสิ้น: %d ไฟล์สำเร็จ (รวม %I64d แถว), "
               "%d รายการล้มเหลว/ข้าม — ไฟล์อยู่ที่ MQL5/Files/GoldCast/",
               okFiles, totalRows, failFiles);
  }
//+------------------------------------------------------------------+
