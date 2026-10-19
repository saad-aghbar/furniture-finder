/**
 * Generates the sample workbooks used by unit and e2e tests.
 *   npm run fixtures            → tests/fixtures/** (committed)
 *   npm run fixtures -- --big   → also tests/fixtures/big/200k.xlsx (not committed, perf only)
 */
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import * as XLSX from 'xlsx'
import * as cptable from 'xlsx/dist/cpexcel'

XLSX.set_cptable(cptable)

const ROOT = resolve(process.argv.includes('--out') ? process.argv[process.argv.indexOf('--out') + 1]! : 'tests/fixtures')
const SAMPLE = join(ROOT, 'catalogue')

type Row = (string | number | null)[]

function sheet(rows: Row[], formats: Record<number, string> = {}): XLSX.WorkSheet {
  const ws = XLSX.utils.aoa_to_sheet(rows)
  const range = XLSX.utils.decode_range(ws['!ref'] ?? 'A1')
  for (let r = range.s.r; r <= range.e.r; r++) {
    for (const [col, z] of Object.entries(formats)) {
      const cell = ws[XLSX.utils.encode_cell({ r, c: Number(col) })] as XLSX.CellObject | undefined
      if (cell && cell.t === 'n') cell.z = z
    }
  }
  return ws
}

function book(sheets: Record<string, XLSX.WorkSheet>): XLSX.WorkBook {
  const wb = XLSX.utils.book_new()
  for (const [name, ws] of Object.entries(sheets)) XLSX.utils.book_append_sheet(wb, ws, name)
  return wb
}

function write(wb: XLSX.WorkBook, file: string, bookType: XLSX.BookType = 'xlsx'): void {
  mkdirSync(join(file, '..'), { recursive: true })
  XLSX.writeFile(wb, file, { bookType, compression: true })
}

const ILS = '#,##0.00 "₪"'

// ---------- Hebrew catalogue (title rows above the header) ----------
const heRows: Row[] = [
  ['קטלוג רהיטים 2026'],
  [],
  ['קוד', 'שם מוצר', 'צבע', 'מידות', 'מחיר', 'ספק', 'מלאי'],
  ['A-1203', 'כורסה מסתובבת', 'אפור', '80x85x100', 2490, 'רהיטי הגליל', 12],
  ['A-1204', 'כּוּרְסָה נוֹחָה לטלוויזיה', 'חום', '90x95x105', 3190, 'רהיטי הגליל', 4],
  ['B-12/3', 'ספה תלת מושבית', "בז'", '220x95x85', 5990, 'עץ ועוד', 3],
  ['B-2001', 'שולחן אוכל אלון', 'אגוז', '180x90x75', 4290, 'עץ ועוד', 7],
  ['C-7', 'כיסא בר מעץ', 'שחור', '45x45x105', 690, 'רהיטי הגליל', 40],
  ['C-8', 'מיטה זוגית עם ארגז מצעים', 'לבן', '160x200', 3890, 'שינה טובה', 5],
  ['D-110', 'ארון הזזה שלוש דלתות', 'לבן', '240x60x230', 6790, 'שינה טובה', 2],
  ['D-111', 'שידת מגירות', 'אגוז', '120x45x80', 1890, 'עץ ועוד', 9],
  ['D-112', 'ספרייה פתוחה', 'אלון', '90x30x190', 1290, 'עץ ועוד', 11],
  ['E-500', 'שולחן קפה עגול', 'שיש', 'קוטר 80', 990, 'רהיטי הגליל', 15]
]

// ---------- Arabic price list (tashkeel, letter variants, Arabic-Indic digits) ----------
const arRows: Row[] = [
  ['الرمز', 'اسم المنتج', 'اللون', 'السعر', 'المورد', 'ملاحظات'],
  ['ك-١٢٠٣', 'كَنَبَة ثلاثية', 'رمادي', 3500, 'مفروشات الشرق', 'متوفر'],
  ['ك-١٢٠٤', 'أريكة زاوية كبيرة', 'بيج', 6200, 'مفروشات الشرق', 'طلب مسبق'],
  ['ط-٣٠', 'طاولة طعام خشب', 'جوزي', 2800, 'بيت الخشب', 'متوفر'],
  ['ك-٤٠', 'كرسي مكتب مريح', 'أسود', 950, 'بيت الخشب', 'متوفر'],
  ['س-٥', 'سرير مزدوج مع تخزين', 'أبيض', 4100, 'نوم هانئ', 'متوفر'],
  ['خ-٢', 'خزانة ملابس بابين', 'أبيض', 3300, 'نوم هانئ', 'نفدت الكمية'],
  ['م-٧', 'مكتبة جدارية', 'بلوط', 1450, 'بيت الخشب', 'متوفر'],
  ['ط-٣١', 'طاولة قهوة مستديرة', 'رخام', 1200, 'مفروشات الشرق', 'متوفر'],
  ['ك-٤١', 'كرسى هزاز', 'بني', 1700, 'مفروشات الشرق', 'متوفر'],
  ['إ-١', 'إطار سرير معدني', 'أسود', 1300, 'نوم هانئ', 'متوفر']
]

// ---------- English supplier list ----------
const enRows: Row[] = [
  ['Supplier', 'Contact', 'Phone', 'Product', 'Code', 'Price'],
  ['Oakline Ltd', 'Dana Cohen', '+972-4-555-0101', 'Oak dining table', 'OAK-180', 4290],
  ['Oakline Ltd', 'Dana Cohen', '+972-4-555-0101', 'Oak bookcase', 'OAK-090', 1290],
  ['Velvet & Co', 'Sami Haddad', '+972-4-555-0144', 'Velvet armchair', 'VLV-77', 2590],
  ['Velvet & Co', 'Sami Haddad', '+972-4-555-0144', 'Sofa bed', 'VLV-200', 3990],
  ['Comfort Home', 'Rina Levi', '+972-3-555-0199', 'Recliner chair', 'CMF-12', 3190],
  ['Comfort Home', 'Rina Levi', '+972-3-555-0199', 'Corner sofa', 'CMF-300', 6890],
  ['Comfort Home', 'Rina Levi', '+972-3-555-0199', 'Bar stool', 'CMF-45', 690]
]

// ---------- Mixed languages ----------
const mixedRows: Row[] = [
  ['Code', 'Name', 'שם', 'الاسم', 'Price'],
  ['A-1203', 'Swivel armchair', 'כורסה מסתובבת', 'كرسي دوار', 2490],
  ['A-1210', 'Sofa', 'ספה', 'كنبة', 3990],
  ['X-9', 'Kitchen chair', 'כיסא מטבח', 'كرسي مطبخ', 350]
]

// ---------- Merged header cells ----------
function mergedHeaders(): XLSX.WorkSheet {
  const ws = XLSX.utils.aoa_to_sheet([
    ['Product details', null, 'Dimensions (cm)', null, null, 'Price'],
    ['Name', 'Colour', 'Width', 'Depth', 'Height', null],
    ['Lounge chair', 'Green', 75, 80, 90, 1990],
    ['Side table', 'Walnut', 50, 50, 55, 590]
  ])
  ws['!merges'] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: 1 } },
    { s: { r: 0, c: 2 }, e: { r: 0, c: 4 } },
    { s: { r: 0, c: 5 }, e: { r: 1, c: 5 } }
  ]
  return ws
}

// ---------- Header on row 4 ----------
const row4: Row[] = [
  ['Spring stock count'],
  ['Prepared by: warehouse'],
  [],
  ['Item', 'Warehouse', 'Qty'],
  ['Dining chair', 'North', 24],
  ['Dining table', 'North', 6],
  ['TV stand', 'South', 3]
]

// ---------- Real-world layout (owner's price list): one product per merged block of option rows ----------
function priceList(): XLSX.WorkSheet {
  const rows: Row[] = [
    [null, 'שכם', 'זאפר : 050-0000001', 'אבו-זאפר 050-0000002', 'טל:09/0000001', null, 'פקס:09/0000002'],
    [null, null, null, null, null, null, "מס' : 15"],
    [null, null, 'ד', 'מחיר ללא מע"מ', null, null, null],
    [null, "מס' הדגם", 'שם הדגם', 'כמות', 'מחיר בלי בד', null, 'כמות הבד']
  ]
  const merges: XLSX.Range[] = [{ s: { r: 2, c: 3 }, e: { r: 2, c: 4 } }]
  const block = (model: string | null, name: string, options: [string, number, string][]): void => {
    const start = rows.length
    options.forEach(([opt, price, fabric], i) => rows.push([null, i === 0 ? model : null, i === 0 ? name : null, opt, price, null, fabric]))
    if (options.length > 1) {
      merges.push({ s: { r: start, c: 2 }, e: { r: start + options.length - 1, c: 2 } })
      if (model) merges.push({ s: { r: start, c: 1 }, e: { r: start + options.length - 1, c: 1 } })
    }
  }
  block('פינתי', "סלון דגם מס' 8665 גודל 2.90 × 2.20 מ'", [['3+שזלון', 3850, '17מטר']])
  block(null, "סלון דגם מס' 8665", [
    ['כורסא גוקר', 880, '5.50מטר'],
    ['2+3', 3850, '18מטר'],
    ['כורסא', 1100, '5.50מטר'],
    ['דו מושבי', 1650, '8מטר'],
    ['תלת מושבי', 2200, '11מטר'],
    ["ספה אורך 3.00 מ'", 2750, '13מטר']
  ])
  block('פינתי', "סלון דגם מס' 8888 עם נוצות", [
    ['3+שזלון', 4600, '18מטר'],
    ['2+3', 4600, '18מטר'],
    ['כורסא', 1320, '6מטר'],
    ['דו מושבי', 2000, '8מטר'],
    ['תלת מושבי', 2650, '11מטר'],
    ["ספה אורך 3.00 מ'", 3300, '13מטר']
  ])
  block(null, "דומינגו אורך 1.80 מ'", [['1', 1050, '4מטר']])
  block(null, 'סלון דגם דרים', [
    ['2+3', 3200, '18מטר'],
    ['כורסא', 920, '6מטר'],
    ['דו מושבי', 1370, '8מטר'],
    ['תלת מושבי', 1830, '11מטר'],
    ["ספה אורך 3.00 מ'", 2300, '13מטר']
  ])
  block(null, "סלון מס' 901 3.10 מ' / 2.10 מ'", [
    ['3 + שזלון', 3100, '19מטר'],
    ['2+3', 3300, '21מטר'],
    ['כורסא', 950, '6מטר'],
    ['דו מושבי', 1420, '9מטר'],
    ['תלת מושבי', 1890, '12מטר'],
    ["ספה אורך 3.00 מ'", 2360, '15מטר']
  ])
  block(null, 'מיטה דגם דובה', [['1', 2200, '10מטר']])
  const ws = sheet(rows, { 4: '"₪" #,##0' })
  ws['!merges'] = merges
  return ws
}

function encryptedFile(): Buffer {
  const cfb = XLSX.CFB.utils.cfb_new()
  XLSX.CFB.utils.cfb_add(cfb, '/EncryptionInfo', Buffer.from([4, 0, 4, 0, 0x40, 0, 0, 0]))
  XLSX.CFB.utils.cfb_add(cfb, '/EncryptedPackage', Buffer.alloc(512, 7))
  return XLSX.CFB.write(cfb, { type: 'buffer' }) as Buffer
}

function toCsv(rows: Row[]): string {
  return rows
    .map((r) => r.map((v) => (v === null ? '' : /[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v))).join(','))
    .join('\r\n')
}

function encode(cp: number, text: string): Buffer {
  // the type declarations only describe the default export; the namespace has `utils` at runtime
  const cpt = cptable as unknown as { utils: { encode(cp: number, s: string): ArrayLike<number> } }
  return Buffer.from(cpt.utils.encode(cp, text) as number[])
}

function main(): void {
  rmSync(SAMPLE, { recursive: true, force: true })
  mkdirSync(SAMPLE, { recursive: true })

  write(book({ 'קטלוג': sheet(heRows, { 4: ILS }), 'מבצעים': sheet([['שם', 'הנחה'], ['ספה תלת מושבית', '15%']]) }), join(SAMPLE, 'קטלוג רהיטים.xlsx'))
  write(book({ 'الأسعار': sheet(arRows, { 3: '#,##0' }) }), join(SAMPLE, 'قائمة الأسعار.xlsx'))
  write(book({ Suppliers: sheet(enRows, { 5: '#,##0.00' }) }), join(SAMPLE, 'suppliers', 'Suppliers 2026.xlsx'))
  write(book({ Mixed: sheet(mixedRows) }), join(SAMPLE, 'suppliers', 'mixed', 'Mixed.xlsm'), 'xlsm')
  write(book({ Merged: mergedHeaders() }), join(SAMPLE, 'merged-headers.xlsx'))
  write(book({ Stock: sheet(row4) }), join(SAMPLE, 'header-row-4.xlsx'))
  write(book({ 'اسعار 2026 الجديدة': priceList(), 'ורקה1': sheet([['x']]) }), join(SAMPLE, 'מחירון סלונים 2026.xlsx'))
  write(book({ Legacy: sheet(enRows.slice(0, 4)) }), join(SAMPLE, 'legacy.xls'), 'biff8')
  write(book({ Binary: sheet(mixedRows) }), join(SAMPLE, 'binary.xlsb'), 'xlsb')
  write(book({ Open: sheet(row4.slice(3)) }), join(SAMPLE, 'open-document.ods'), 'ods')

  writeFileSync(join(SAMPLE, 'utf8.csv'), '﻿' + toCsv([['Code', 'Name', 'Price'], ['CSV-1', 'Garden bench', 890], ['CSV-2', 'ספסל גינה', 890]]))
  writeFileSync(join(SAMPLE, 'hebrew-1255.csv'), encode(1255, toCsv([['קוד', 'שם', 'מחיר'], ['W-1', 'מדף קיר', '250']])))
  writeFileSync(join(SAMPLE, 'arabic-1256.csv'), encode(1256, toCsv([['الرمز', 'الاسم', 'السعر'], ['W-2', 'رف حائط', '250']])))

  writeFileSync(join(SAMPLE, 'broken.xlsx'), Buffer.from('PK\u0003\u0004 this is not really a workbook'))
  writeFileSync(join(SAMPLE, 'locked-with-password.xlsx'), encryptedFile())
  writeFileSync(join(SAMPLE, '~$קטלוג רהיטים.xlsx'), Buffer.from('owner lock file'))
  writeFileSync(join(SAMPLE, 'notes.txt'), 'not a spreadsheet')
  writeFileSync(join(SAMPLE, 'suppliers', 'logo.png'), Buffer.from([0x89, 0x50, 0x4e, 0x47]))

  if (process.argv.includes('--big')) {
    const big = join(ROOT, 'big')
    mkdirSync(big, { recursive: true })
    const names = ['Sofa', 'Armchair', 'Table', 'Chair', 'Bed', 'Wardrobe', 'ספה', 'כורסה', 'שולחן', 'كنبة', 'طاولة', 'كرسي']
    const colours = ['Grey', 'Walnut', 'Oak', 'White', 'Black', 'אפור', 'رمادي']
    const rows: Row[] = [['Code', 'Name', 'Colour', 'Price', 'Stock']]
    for (let i = 0; i < 200_000; i++) {
      rows.push([`P-${i}`, `${names[i % names.length]} ${i % 997}`, colours[i % colours.length]!, 100 + (i % 5000), i % 50])
    }
    write(book({ Big: sheet(rows) }), join(big, '200k.xlsx'))
  }
  console.log(`fixtures written to ${ROOT}`)
}

main()
