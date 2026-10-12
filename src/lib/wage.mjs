// wage.mjs — minimum pay for a household worker under Ministerial Regulation
// No. 15 B.E. 2567 (in force 30 Apr 2024), which extended the minimum wage
// (LPA s.90) and the 8-hour day (s.23) to domestic work. Pure arithmetic; the
// rates and their sources are data below. Used by the /wage page and the
// /agreement page.

/** Daily minimum wage by area, THB. `source` is the notification and the page
 *  read; `checked` is the date the page was read. */
export const RATES = {
  checked: '2026-10-04',
  notification: {
    th: 'ประกาศคณะกรรมการค่าจ้าง เรื่อง อัตราค่าจ้างขั้นต่ำ (ฉบับที่ 14) ราชกิจจานุเบกษา เล่ม 142 ตอนพิเศษ 236 ง มีผล 1 กรกฎาคม 2568',
    en: 'Wage Committee Notification on Minimum Wage Rates (No. 14), Royal Gazette vol. 142 special issue 236 Ng, in force 1 July 2025',
    url: 'https://www.mol.go.th/wp-content/uploads/sites/2/2025/08/%E0%B9%81%E0%B8%9B%E0%B8%A5%E0%B8%9B%E0%B8%A3%E0%B8%B0%E0%B8%81%E0%B8%B2%E0%B8%A8-%E0%B8%89%E0%B8%9A%E0%B8%B1%E0%B8%9A%E0%B8%97%E0%B8%B5%E0%B9%88-14-_1_-1.pdf',
  },
  // clause 3 (Mueang CM), clause 7 (rest of CM), clause 11 (Chiang Rai)
  areas: [
    { key: 'cm-mueang', thb: 380, th: 'อำเภอเมืองเชียงใหม่', en: 'Mueang Chiang Mai district' },
    { key: 'cm-other', thb: 357, th: 'อำเภออื่นในจังหวัดเชียงใหม่', en: 'Other Chiang Mai districts' },
    { key: 'cr', thb: 352, th: 'จังหวัดเชียงราย', en: 'Chiang Rai province' },
  ],
}

/** The regulation's floors, each with its Labour Protection Act section. */
export const MR15 = {
  title: {
    th: 'กฎกระทรวง ฉบับที่ 15 (พ.ศ. 2567) ออกตามความในพระราชบัญญัติคุ้มครองแรงงาน พ.ศ. 2541 ราชกิจจานุเบกษา เล่ม 141 ตอนที่ 26 ก',
    en: 'Ministerial Regulation No. 15 B.E. 2567 under the Labour Protection Act B.E. 2541, Royal Gazette vol. 141 part 26 Kor',
  },
  inForce: '2024-04-30',
  url: 'https://legal.labour.go.th/images/law/Protection2541/7/Description_Rule15.pdf',
  hoursPerDay: 8, // s.23
  restMinutes: 60, // s.27
  holidays: 13, // s.29
  annualLeaveDays: 6, // s.30, after one year of service
  sickPaidDays: 30, // s.32, s.57
  businessLeaveDays: 3, // s.34; pay by agreement (DLPW explanation)
  // s.41 / s.59 as amended by LPA (No. 9) B.E. 2568, in force 7 Dec 2025
  // (Royal Gazette vol. 142 part 74 Kor); MR15 applies these two sections.
  maternityDays: 120,
  maternityPaidDays: 60,
  maternityLaw: {
    th: 'พระราชบัญญัติคุ้มครองแรงงาน (ฉบับที่ 9) พ.ศ. 2568 มีผล 7 ธันวาคม 2568',
    en: 'Labour Protection Act (No. 9) B.E. 2568, in force 7 December 2025',
    url: 'https://legal.labour.go.th/images/law/Protection2541/2568/08122568.pdf',
  },
  deductEachPct: 10, // s.76
  deductTotalPct: 20,
}

export const areaOf = (key) => RATES.areas.find((a) => a.key === key) || RATES.areas[0]

const clampInt = (v, lo, hi, d) => {
  const n = Math.round(Number(v))
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d
}

/** Read the calculator's inputs from a query object, with defaults. */
export function readInputs(q = {}) {
  const basis = q.basis === 'month' ? 'month' : 'day'
  return {
    area: areaOf(q.area).key,
    basis,
    days: clampInt(q.days, 1, 7, basis === 'month' ? 6 : 1),
    hours: clampInt(q.hours, 1, 12, 8),
    pay: q.pay === '' || q.pay == null ? null : clampInt(q.pay, 0, 1_000_000, null),
  }
}

const WEEKS_PER_MONTH = 52 / 12

/** Minimum pay for the inputs.
 *  day:   each day worked earns at least the daily rate, however few hours
 *         (Notification No. 14, clause 19: a "day" is the normal working
 *         hours, up to 8); hours past 8 are overtime at a rate the two agree.
 *  month: a monthly wage includes the weekly rest days (LPA s.56(1)) and the
 *         Act works a monthly wage into a daily one over 30 days (s.68), so
 *         the floor shown is the daily rate × 30.
 *  No hourly minimum-wage notification exists; the hourly figure shown is
 *  the daily rate ÷ 8, the rate holiday and overtime pay are counted from.
 *  Returns figures rounded up to the baht. */
export function minimumPay(inp) {
  const a = areaOf(inp.area)
  const rate = a.thb
  const hourly = rate / MR15.hoursPerDay
  const normalHours = Math.min(inp.hours, MR15.hoursPerDay)
  const otHours = Math.max(0, inp.hours - MR15.hoursPerDay)
  const ceil = (x) => Math.ceil(x - 1e-9)
  const month = inp.basis === 'month'
  const perUnit = month ? rate * 30 : rate
  const out = {
    area: a, rate, hourly: Math.round(hourly * 100) / 100, unit: month ? 'month' : 'day', perUnit,
    perWeek: month ? null : rate * inp.days,
    perMonth: month ? perUnit : ceil(rate * inp.days * WEEKS_PER_MONTH),
    normalHours, otHours, shortDay: !month && inp.hours < MR15.hoursPerDay, daysOff: 7 - inp.days,
    restDayShort: inp.days > 6,
    holidayExtra: month ? 1 : 2, // × hourly rate for work on a holiday (s.62)
  }
  if (inp.pay != null) {
    out.pay = inp.pay
    out.gap = inp.pay - perUnit
  }
  return out
}

export const fmt = (n) => (n == null ? '' : Number(n).toLocaleString('en-US', { maximumFractionDigits: 2 }))
