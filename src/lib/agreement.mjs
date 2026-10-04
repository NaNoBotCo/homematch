// agreement.mjs — the bilingual household employment agreement, clause by
// clause, Thai beside English. Floors from Ministerial Regulation No. 15
// B.E. 2567 and the Labour Protection Act sections it applies; the clause
// list follows ../baanstaff/docs/LEGAL_RESEARCH.md §6. Employment is จ้างแรงงาน
// (CCC s.575): นายจ้าง / ลูกจ้าง, never ผู้ว่าจ้าง / ผู้รับจ้าง.
//
// Each clause is a function of the filled numbers `n` and returns { th, en }.
// A blank the two fill by hand is BLANK.

import { RATES, MR15, fmt } from './wage.mjs'

export const BLANK = '____________'
const S = '______'

const unitTh = { day: 'วัน', month: 'เดือน' }
const unitEn = { day: 'day', month: 'month' }

/** n: { area, basis, days, hours, pay, min } from wage.mjs readInputs + minimumPay. */
export function clauses(n) {
  const wage = n.pay != null ? fmt(n.pay) : BLANK
  const hrs = n.hours && n.hours <= MR15.hoursPerDay ? String(n.hours) : '8'
  const off = n.days ? String(Math.max(1, 7 - n.days)) : S
  const days = n.days ? String(Math.min(6, n.days)) : S
  const floorTh = n.basis === 'month'
    ? `ไม่ต่ำกว่า ${fmt(n.min.perUnit)} บาทต่อเดือน (ค่าจ้างขั้นต่ำ ${fmt(n.min.rate)} บาทต่อวัน × 30)`
    : `ไม่ต่ำกว่า ${fmt(n.min.rate)} บาทต่อวันทำงาน แม้วันนั้นทำงานน้อยกว่า 8 ชั่วโมง`
  const floorEn = n.basis === 'month'
    ? `not below ${fmt(n.min.perUnit)} baht a month (minimum wage ${fmt(n.min.rate)} baht a day × 30)`
    : `not below ${fmt(n.min.rate)} baht for each day worked, a day of fewer than 8 hours included`
  return [
    {
      head: { th: 'คู่สัญญา', en: 'Parties' },
      th: `สัญญานี้ทำขึ้นที่ ${BLANK} เมื่อวันที่ ${S} เดือน ${BLANK} พ.ศ. ${S} ระหว่าง ${BLANK}${BLANK} อยู่บ้านเลขที่ ${BLANK}${BLANK} ซึ่งต่อไปในสัญญานี้เรียกว่า “นายจ้าง” ฝ่ายหนึ่ง กับ ${BLANK}${BLANK} สัญชาติ ${BLANK} อยู่บ้านเลขที่ ${BLANK}${BLANK} ซึ่งต่อไปในสัญญานี้เรียกว่า “ลูกจ้าง” อีกฝ่ายหนึ่ง ทั้งสองฝ่ายตกลงทำสัญญาจ้างแรงงานในงานบ้านอันมิได้มีการประกอบธุรกิจรวมอยู่ด้วย ดังต่อไปนี้`,
      en: `Made at ${BLANK} on ${BLANK} between ${BLANK}${BLANK} of ${BLANK}${BLANK} (“the Employer”) and ${BLANK}${BLANK}, nationality ${BLANK}, of ${BLANK}${BLANK} (“the Employee”). The two agree to a contract of employment for household work not connected with a business, as follows.`,
    },
    {
      head: { th: 'งานและสถานที่ทำงาน', en: 'Work and workplace' },
      th: `ลูกจ้างทำงานบ้านที่ ${BLANK}${BLANK} ได้แก่ ☐ ทำความสะอาด ☐ ซักรีด ☐ ดูแลสวน ☐ ซ่อมบำรุงบ้าน ☐ อื่น ๆ ${BLANK} เริ่มทำงานวันที่ ${BLANK}`,
      en: `The Employee does household work at ${BLANK}${BLANK}: ☐ cleaning ☐ laundry ☐ garden ☐ house repairs and upkeep ☐ other ${BLANK}, starting on ${BLANK}.`,
    },
    {
      head: { th: 'ค่าจ้าง', en: 'Wages' },
      th: `นายจ้างจ่ายค่าจ้าง ${wage} บาท ต่อ${unitTh[n.basis] || S} เป็นเงินบาท ทุกวันที่ ${S} ของเดือน อย่างน้อยเดือนละหนึ่งครั้ง โดย ☐ เงินสด ☐ โอนเข้าบัญชี ${BLANK} ค่าจ้างนี้${floorTh} ตามอัตราค่าจ้างขั้นต่ำของ${n.min.area.th} (${RATES.notification.th})`,
      en: `The Employer pays ${wage} baht per ${unitEn[n.basis] || S}, in Thai baht, on day ${S} of each month, at least once a month, ☐ in cash ☐ by transfer to account ${BLANK}. This wage is ${floorEn}, the minimum wage for ${n.min.area.en} (${RATES.notification.en}).`,
    },
    {
      head: { th: 'เวลาทำงานและเวลาพัก', en: 'Hours and rest' },
      th: `ลูกจ้างทำงานสัปดาห์ละ ${days} วัน วันละ ${hrs} ชั่วโมง ไม่เกิน 8 ชั่วโมงต่อวัน เวลา ${S} น. ถึง ${S} น. มีเวลาพักระหว่างการทำงานไม่น้อยกว่าวันละ 1 ชั่วโมง เวลา ${S} น. ถึง ${S} น. งานที่เกิน 8 ชั่วโมงต่อวันเป็นงานล่วงเวลา ทำเมื่อลูกจ้างยินยอม นายจ้างจ่ายค่าล่วงเวลาชั่วโมงละ ${S} บาท`,
      en: `The Employee works ${days} days a week, ${hrs} hours a day, at most 8 hours a day, from ${S} to ${S}, with a rest of at least 1 hour a day, from ${S} to ${S}. Work past 8 hours in a day is overtime, done with the Employee's consent, paid at ${S} baht an hour.`,
    },
    {
      head: { th: 'วันหยุดประจำสัปดาห์', en: 'Weekly rest day' },
      th: `ลูกจ้างมีวันหยุดประจำสัปดาห์ สัปดาห์ละ ${off} วัน คือวัน ${BLANK} (กฎหมายกำหนดไม่น้อยกว่าสัปดาห์ละ 1 วัน)`,
      en: `The Employee has ${off} rest day(s) a week, on ${BLANK} (the law sets at least 1 day a week).`,
    },
    {
      head: { th: 'วันหยุดตามประเพณี', en: 'Public holidays' },
      th: `ลูกจ้างมีวันหยุดตามประเพณีปีละไม่น้อยกว่า ${MR15.holidays} วัน รวมวันแรงงานแห่งชาติ โดยได้รับค่าจ้าง วันหยุดที่ตกลงคือ ${BLANK}${BLANK} ถ้านายจ้างให้ลูกจ้างทำงานในวันหยุด นายจ้างจ่ายค่าทำงานในวันหยุดตามมาตรา 62 แห่งพระราชบัญญัติคุ้มครองแรงงาน: ลูกจ้างที่มีสิทธิได้รับค่าจ้างในวันหยุด เพิ่มอีกไม่น้อยกว่า 1 เท่าของอัตราค่าจ้างต่อชั่วโมงในวันทำงาน ลูกจ้างที่ไม่มีสิทธิได้รับค่าจ้างในวันหยุด ไม่น้อยกว่า 2 เท่า`,
      en: `The Employee has at least ${MR15.holidays} paid public holidays a year, National Labour Day among them. The agreed holidays are ${BLANK}${BLANK}. Work on a holiday is paid under s.62 of the Labour Protection Act: an Employee entitled to wages on that holiday gets at least 1 times the working-day hourly rate on top; an Employee not entitled to wages on that holiday gets at least 2 times.`,
    },
    {
      head: { th: 'วันหยุดพักผ่อนประจำปี', en: 'Annual leave' },
      th: `เมื่อลูกจ้างทำงานติดต่อกันครบ 1 ปี ลูกจ้างมีวันหยุดพักผ่อนประจำปี ปีละไม่น้อยกว่า ${MR15.annualLeaveDays} วันทำงาน โดยได้รับค่าจ้าง`,
      en: `After 1 year of continuous work the Employee has at least ${MR15.annualLeaveDays} working days of paid annual leave a year.`,
    },
    {
      head: { th: 'ลาป่วย', en: 'Sick leave' },
      th: `ลูกจ้างลาป่วยได้เท่าที่ป่วยจริง ได้รับค่าจ้างเท่ากับค่าจ้างในวันทำงานตลอดระยะเวลาที่ลา ปีหนึ่งไม่เกิน ${MR15.sickPaidDays} วันทำงาน การลาป่วยตั้งแต่ 3 วันทำงานขึ้นไป นายจ้างขอใบรับรองแพทย์ได้`,
      en: `The Employee may take sick leave for as long as actually sick, paid at the working-day rate up to ${MR15.sickPaidDays} working days a year. For 3 or more working days in a row the Employer may ask for a medical certificate.`,
    },
    {
      head: { th: 'ลากิจธุระอันจำเป็น', en: 'Personal business leave' },
      th: `ลูกจ้างลากิจธุระอันจำเป็นได้ปีละไม่น้อยกว่า ${MR15.businessLeaveDays} วันทำงาน ☐ ได้รับค่าจ้าง ☐ ไม่ได้รับค่าจ้าง`,
      en: `The Employee may take at least ${MR15.businessLeaveDays} working days a year of leave for necessary personal business, ☐ paid ☐ unpaid.`,
    },
    {
      head: { th: 'ลูกจ้างหญิงมีครรภ์', en: 'Pregnancy and maternity' },
      th: `ลูกจ้างหญิงมีครรภ์ลาเพื่อคลอดบุตรได้ตามมาตรา 41 และได้รับค่าจ้างระหว่างลาตามมาตรา 59 แห่งพระราชบัญญัติคุ้มครองแรงงาน (ครรภ์หนึ่งไม่เกิน ${MR15.maternityDays} วัน ได้รับค่าจ้างไม่เกิน ${MR15.maternityPaidDays} วัน ตาม${MR15.maternityLaw.th}) ระหว่างมีครรภ์ ลูกจ้างไม่ทำงานระหว่างเวลา 22.00 น. ถึง 06.00 น. ไม่ทำงานล่วงเวลา และไม่ทำงานในวันหยุด นายจ้างไม่เลิกจ้างลูกจ้างเพราะเหตุมีครรภ์`,
      en: `A pregnant Employee takes maternity leave under s.41 and is paid during it under s.59 of the Labour Protection Act (up to ${MR15.maternityDays} days per pregnancy, ${MR15.maternityPaidDays} of them paid, under the ${MR15.maternityLaw.en}). While pregnant she does no work between 22:00 and 06:00, no overtime and no holiday work. The Employer does not dismiss an Employee because she is pregnant.`,
    },
    {
      head: { th: 'การหักค่าจ้าง', en: 'Deductions' },
      th: `นายจ้างหักค่าจ้างได้เฉพาะกรณีที่มาตรา 76 แห่งพระราชบัญญัติคุ้มครองแรงงานกำหนด แต่ละกรณีไม่เกินร้อยละ ${MR15.deductEachPct} และรวมกันไม่เกินร้อยละ ${MR15.deductTotalPct} ของเงินที่ลูกจ้างมีสิทธิได้รับในงวดนั้น`,
      en: `The Employer deducts from wages only in the cases s.76 of the Labour Protection Act lists, at most ${MR15.deductEachPct}% for each and ${MR15.deductTotalPct}% in all of the pay due that period.`,
    },
    {
      head: { th: 'เอกสารประจำตัว', en: 'Identity documents' },
      th: 'นายจ้างไม่เก็บบัตรประจำตัวประชาชน หนังสือเดินทาง หรือใบอนุญาตทำงานของลูกจ้างไว้',
      en: 'The Employer does not keep the Employee\'s ID card, passport or work permit.',
    },
    {
      head: { th: 'ลูกจ้างที่ไม่ใช่คนไทย', en: 'Employee who is not Thai' },
      th: `ใบอนุญาตทำงาน / บัตร ประเภท ${BLANK} เลขที่ ${BLANK} หมดอายุ ${BLANK} นายจ้างแจ้งการจ้างและการสิ้นสุดการจ้างต่อนายทะเบียน กรมการจัดหางาน ภายใน 15 วัน`,
      en: `Work permit / card type ${BLANK}, number ${BLANK}, expires ${BLANK}. The Employer reports the hiring, and the end of the work, to the Department of Employment registrar within 15 days.`,
    },
    {
      head: { th: 'การเลิกสัญญา', en: 'Ending the agreement' },
      th: 'ฝ่ายใดประสงค์จะเลิกสัญญาโดยอีกฝ่ายไม่มีความผิด ให้บอกกล่าวเป็นหนังสือล่วงหน้าอย่างน้อยหนึ่งงวดการจ่ายค่าจ้าง หรือนายจ้างจ่ายค่าจ้างแทนการบอกกล่าวล่วงหน้า เมื่อสัญญาสิ้นสุด นายจ้างจ่ายค่าจ้างและเงินอื่นที่ค้างทั้งหมด รวมค่าจ้างสำหรับวันหยุดพักผ่อนประจำปีที่ลูกจ้างยังไม่ได้ใช้ ภายใน 3 วัน และออกหนังสือรับรองการทำงานให้ลูกจ้าง',
      en: 'Either side ending the agreement when the other is not at fault gives written notice of at least one pay period, or the Employer pays wages in place of notice. At the end the Employer pays all wages and other money owed, including pay for unused annual leave, within 3 days, and gives the Employee a certificate of work.',
    },
    {
      head: { th: 'สิ่งที่ตกลงเพิ่ม (นอกเหนือข้อกำหนดของกฎหมาย)', en: 'Further terms (beyond what the law sets)' },
      th: `☐ ที่พัก ${BLANK} ☐ อาหาร ${BLANK} ☐ ค่าชดเชยเมื่อเลิกจ้าง ${BLANK} ☐ ประกันสังคมมาตรา 40 นายจ้างช่วยจ่ายเดือนละ ${S} บาท ☐ โบนัส / ค่าเดินทาง ${BLANK} ☐ อื่น ๆ ${BLANK}${BLANK}`,
      en: `☐ Accommodation ${BLANK} ☐ Meals ${BLANK} ☐ Severance on dismissal ${BLANK} ☐ Social Security section 40: the Employer pays ${S} baht a month toward it ☐ Bonus / travel ${BLANK} ☐ Other ${BLANK}${BLANK}`,
    },
    {
      head: { th: 'ลงนาม', en: 'Signatures' },
      th: 'สัญญานี้ทำขึ้นสองฉบับ มีข้อความตรงกัน คู่สัญญาได้อ่านและเข้าใจข้อความโดยตลอดแล้ว จึงลงลายมือชื่อไว้เป็นสำคัญต่อหน้าพยาน และเก็บไว้ฝ่ายละหนึ่งฉบับ',
      en: 'This agreement is made in two identical copies. Both parties have read and understood it, sign it before witnesses, and keep one copy each.',
    },
  ]
}

export const SIGNATURES = [
  { th: 'นายจ้าง', en: 'Employer' },
  { th: 'ลูกจ้าง', en: 'Employee' },
  { th: 'พยาน', en: 'Witness' },
  { th: 'พยาน', en: 'Witness' },
]

export const SOURCES = {
  th: `ข้อกำหนดขั้นต่ำ: ${MR15.title.th} มีผล 30 เมษายน 2567 · ลาคลอด: ${MR15.maternityLaw.th} · ค่าจ้างขั้นต่ำ: ${RATES.notification.th} · อ่านเมื่อ ${RATES.checked}`,
  en: `Floors: ${MR15.title.en}, in force 30 April 2024 · Maternity: ${MR15.maternityLaw.en} · Minimum wage: ${RATES.notification.en} · read ${RATES.checked}`,
}
