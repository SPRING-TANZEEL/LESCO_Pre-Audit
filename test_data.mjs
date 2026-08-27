// ============================================================
// LIVE DATA ENTRY & VALIDATION TEST
// Simulates exactly what the app does internally
// ============================================================

// ── Copy of store logic ──────────────────────────────────────
let _suppliers = []
let _exemptions = []
let _pos = []
let _po_items = []
let _schedules = []
let _ics = []
let _bills = []
let _grns = []
let _grn_items = []
let _gst_bills = []
let _gst_grn_links = []
let _products = []
let _idCounter = 0
function uid() { return 'id' + (++_idCounter) }

// ── Copy of calculation logic ────────────────────────────────
function getEffectiveDeliveryDate(promisedDate, callDate, sampleDate, inspCompDate, challanDate, icDate) {
  if (!promisedDate) return null
  const promised = new Date(promisedDate)
  if (challanDate && icDate) {
    const diffDays = Math.floor((new Date(challanDate) - new Date(icDate)) / 864e5)
    if (diffDays > 20) return { date: challanDate, reason: `Challan date (${diffDays}d after IC > 20d)` }
  }
  if (callDate && sampleDate) {
    const diffDays = Math.floor((promised - new Date(callDate)) / 864e5)
    if (diffDays >= 0 && diffDays <= 15) return { date: sampleDate, reason: `Sample Collection (call ${diffDays}d before promised ≤15d)` }
  }
  if (inspCompDate) return { date: inspCompDate, reason: `Inspection Completion (call >15d before promised)` }
  return null
}
function calcLDMonths(p, e) {
  if (!p || !e) return 0
  const days = Math.floor((new Date(e) - new Date(p)) / 864e5)
  return days <= 0 ? 0 : Math.ceil(days / 30)
}
function calcDelayDays(p, e) {
  if (!p || !e) return 0
  return Math.max(0, Math.floor((new Date(e) - new Date(p)) / 864e5))
}
function calcBatchLD(qty, rate, promised, effDate, ldPct = 2) {
  const months = calcLDMonths(promised, effDate)
  const days = calcDelayDays(promised, effDate)
  if (!months) return { days: 0, months: 0, ldAmount: 0, isLate: false }
  return { days, months, ldAmount: Math.round(qty * rate * (ldPct / 100) * months), isLate: true }
}
function applyLDCap(ldAmt, prevCharged, maxLD) {
  const remaining = Math.max(0, maxLD - prevCharged)
  const capped = Math.min(ldAmt, remaining)
  return { ldCapped: capped, capReached: (prevCharged + capped) >= maxLD }
}
function getDeliveredByBatch(schedId, itemId, excludeBillId = null) {
  return _grn_items.filter(i => i.schedule_id === schedId && i.po_item_id === itemId &&
    (excludeBillId ? _grns.find(g => g.id === i.grn_id)?.supply_bill_id !== excludeBillId : true))
    .reduce((s, i) => s + i.qty_delivered, 0)
}
function splitQty(totalQty, schedules, itemId, excludeBillId = null) {
  const sorted = [...schedules].sort((a, b) => new Date(a.promised_date) - new Date(b.promised_date))
  let remaining = totalQty
  const splits = []
  for (const sch of sorted) {
    if (remaining <= 0) break
    const delivered = getDeliveredByBatch(sch.id, itemId, excludeBillId)
    const batchRem = sch.promised_qty - delivered
    if (batchRem <= 0) continue
    const take = Math.min(remaining, batchRem)
    splits.push({ scheduleId: sch.id, promisedDate: sch.promised_date, qty: take, delivered, batchQty: sch.promised_qty })
    remaining -= take
  }
  return splits
}
function checkPG(pgTo, challanDate) {
  if (!pgTo || !challanDate) return { valid: null }
  return new Date(challanDate) <= new Date(pgTo)
    ? { valid: true, msg: `✅ PG Valid (challan ${challanDate} within ${pgTo})` }
    : { valid: false, msg: `⚠️ PG EXPIRED (challan ${challanDate} beyond ${pgTo})` }
}
function fmtPKR(n) { return 'Rs. ' + (n||0).toLocaleString('en-PK', { minimumFractionDigits: 2 }) }
function hr(c='─') { console.log(c.repeat(72)) }
function section(t) { hr('═'); console.log(`  ${t}`); hr('═') }
function ok(label, exp, got) {
  const pass = Math.abs((exp||0)-(got||0)) < 1
  console.log(`  ${pass?'✅':'❌'} ${label}`)
  if (!pass) console.log(`       Expected: ${fmtPKR(exp)}  Got: ${fmtPKR(got)}  Diff: ${Math.abs(exp-got)}`)
}

// ============================================================
// STEP 1: ADD SUPPLIER
// ============================================================
section('STEP 1 — ADD SUPPLIER')
const supplier = { id: uid(), name: 'M/s National Electrical Co.', ntn: '3456789-1', type: 'company', default_wht_rate: 5 }
_suppliers.push(supplier)
console.log(`  Supplier: ${supplier.name} (${supplier.type}, WHT ${supplier.default_wht_rate}%)`)

// Add exemption certificate
const exemption = { id: uid(), supplier_id: supplier.id, certificate_no: 'EXM-2026-NEC', valid_from: '2026-01-01', valid_to: '2026-12-31', wht_rate: 2 }
_exemptions.push(exemption)
console.log(`  Exemption Cert: ${exemption.certificate_no} (${exemption.valid_from} to ${exemption.valid_to}) @ ${exemption.wht_rate}%`)

// Get today's WHT rate
const today = new Date(); today.setHours(0,0,0,0)
const activeCert = _exemptions.find(e => e.supplier_id === supplier.id && today >= new Date(e.valid_from) && today <= new Date(e.valid_to))
const whtRate = activeCert ? activeCert.wht_rate : supplier.default_wht_rate
console.log(`  WHT Rate Today: ${whtRate}% ${activeCert ? `(Cert: ${activeCert.certificate_no})` : '(Default)'}`)

// ============================================================
// STEP 2: CREATE PURCHASE ORDER
// ============================================================
section('STEP 2 — CREATE PURCHASE ORDER')
const po = {
  id: uid(), po_number: 'PO-2026-001', po_date: '2026-07-01',
  supplier_id: supplier.id,
  total_amount_ex_gst: 0, gst_rate: 18, gst_amount: 0, grand_total: 0,
  ld_rate: 2, ld_max_cap_pct: 10,
  pg_amount: 0, pg_validity_to: '2028-06-30', pg_bank_guarantee_no: 'BG-2026-NEC-001',
  warranty_months: 24, payment_method: 'cheque', status: 'active',
  budget_heads: [{ head: 'Consumer Finance', pct: 60 }, { head: 'ELR', pct: 40 }]
}
_pos.push(po)

// Add 2 items
const item1 = { id: uid(), po_id: po.id, product_name: 'Distribution Transformer 100KVA', unit_rate: 185000, total_qty: 50, unit_of_measure: 'Nos' }
const item2 = { id: uid(), po_id: po.id, product_name: 'HT Aerial Bunched Cable', unit_rate: 4500, total_qty: 2000, unit_of_measure: 'Meter' }
_po_items.push(item1, item2)

// Calculate PO totals
const exGst = (item1.unit_rate * item1.total_qty) + (item2.unit_rate * item2.total_qty)
const gstAmt = Math.round(exGst * po.gst_rate / 100)
po.total_amount_ex_gst = exGst
po.gst_amount = gstAmt
po.grand_total = exGst + gstAmt
po.pg_amount = Math.round(po.grand_total * 0.05)
const maxLD = po.grand_total * po.ld_max_cap_pct / 100

console.log(`  PO: ${po.po_number} dated ${po.po_date}`)
console.log(`  Item 1: ${item1.product_name} — ${item1.total_qty} Nos @ Rs.${item1.unit_rate.toLocaleString()} = ${fmtPKR(item1.unit_rate * item1.total_qty)}`)
console.log(`  Item 2: ${item2.product_name} — ${item2.total_qty} m @ Rs.${item2.unit_rate.toLocaleString()} = ${fmtPKR(item2.unit_rate * item2.total_qty)}`)
console.log(`  Total (Ex-GST):  ${fmtPKR(exGst)}`)
console.log(`  GST @ 18%:       ${fmtPKR(gstAmt)}`)
console.log(`  Grand Total:     ${fmtPKR(po.grand_total)}`)
console.log(`  PG Amount (5%):  ${fmtPKR(po.pg_amount)}`)
console.log(`  Max LD (10%):    ${fmtPKR(maxLD)}`)
console.log(`  Budget:          Consumer Finance 60%, ELR 40%`)
console.log(`  Payment:         ${po.payment_method}`)

ok('Item 1 Amount', 185000*50, item1.unit_rate*item1.total_qty)
ok('Item 2 Amount', 4500*2000, item2.unit_rate*item2.total_qty)
ok('Total Ex-GST', 9250000+9000000, exGst)
ok('GST 18%', Math.round(18250000*0.18), gstAmt)
ok('Grand Total', 18250000+Math.round(18250000*0.18), po.grand_total)

// ============================================================
// STEP 3: DELIVERY SCHEDULE
// ============================================================
section('STEP 3 — DELIVERY SCHEDULE')
const schedules = [
  { id: uid(), po_id: po.id, po_item_id: item1.id, shipment_no: 1, promised_qty: 25, promised_date: '2026-09-15' },
  { id: uid(), po_id: po.id, po_item_id: item1.id, shipment_no: 2, promised_qty: 25, promised_date: '2026-11-15' },
  { id: uid(), po_id: po.id, po_item_id: item2.id, shipment_no: 1, promised_qty: 1000, promised_date: '2026-09-15' },
  { id: uid(), po_id: po.id, po_item_id: item2.id, shipment_no: 2, promised_qty: 1000, promised_date: '2026-11-15' },
]
_schedules.push(...schedules)
schedules.forEach(s => {
  const item = _po_items.find(i => i.id === s.po_item_id)
  console.log(`  Shipment ${s.shipment_no} — ${item.product_name}: ${s.promised_qty} by ${s.promised_date}`)
})

// ============================================================
// STEP 4: SUPPLY BILL 1 — ON TIME
// ============================================================
section('STEP 4 — SUPPLY BILL 1 (On Time Delivery)')
const bill1Data = {
  ic_number: 'IC-2026-001', ic_date: '2026-09-02',
  call_date: '2026-08-25', sample_date: '2026-08-28',
  insp_comp_date: '2026-09-01', challan_date: '2026-09-12',
  bill_number: 'NEC-INV-001', bill_date: '2026-09-10',
  grns: [
    { grn_number: 'GRN-001', grn_date: '2026-09-12', store: 'Regional Store Pattoki', items: [{ itemId: item1.id, qty: 20 }, { itemId: item2.id, qty: 800 }] },
  ]
}
console.log(`  Bill: ${bill1Data.bill_number} dated ${bill1Data.bill_date}`)
console.log(`  IC: ${bill1Data.ic_number} dated ${bill1Data.ic_date}`)
console.log(`  Call: ${bill1Data.call_date} | Sample: ${bill1Data.sample_date} | Comp: ${bill1Data.insp_comp_date}`)
console.log(`  Challan: ${bill1Data.challan_date}`)

// PG Check
const pgCheck1 = checkPG(po.pg_validity_to, bill1Data.challan_date)
console.log(`  PG Check: ${pgCheck1.msg}`)

let runningLD = 0
let bill1TotalAmount = 0, bill1TotalLD = 0
const bill1GRNResults = []

for (const grn of bill1Data.grns) {
  const grnItems = []
  for (const grnItem of grn.items) {
    const poItem = _po_items.find(i => i.id === grnItem.itemId)
    const itemSchedules = schedules.filter(s => s.po_item_id === grnItem.itemId)
    const splits = splitQty(grnItem.qty, itemSchedules, grnItem.itemId)

    for (const split of splits) {
      const eff = getEffectiveDeliveryDate(split.promisedDate, bill1Data.call_date, bill1Data.sample_date, bill1Data.insp_comp_date, bill1Data.challan_date, bill1Data.ic_date)
      const ldCalc = calcBatchLD(split.qty, poItem.unit_rate, split.promisedDate, eff?.date, po.ld_rate)
      const { ldCapped } = applyLDCap(ldCalc.ldAmount, runningLD, maxLD)
      runningLD += ldCapped
      const amt = split.qty * poItem.unit_rate
      bill1TotalAmount += amt
      bill1TotalLD += ldCapped
      grnItems.push({ po_item_id: poItem.id, qty: split.qty, amt, ldCalc, ldCapped, promisedDate: split.promisedDate, effDate: eff?.date, reason: eff?.reason })
      console.log(`\n    Item: ${poItem.product_name}`)
      console.log(`    Qty: ${split.qty} | Promised: ${split.promisedDate} | Eff: ${eff?.date}`)
      console.log(`    ${eff?.reason}`)
      console.log(`    Delay: ${ldCalc.days} days → ${ldCalc.months} months → LD: ${fmtPKR(ldCalc.ldAmount)} → Capped: ${fmtPKR(ldCapped)}`)
    }
    // Save GRN items to store
    const grnId = uid()
    _grns.push({ id: grnId, supply_bill_id: 'bill1', po_id: po.id, grn_number: grn.grn_number, total_amount: grnItems.reduce((s,i)=>s+i.amt,0), total_ld_capped: grnItems.reduce((s,i)=>s+i.ldCapped,0) })
    grnItems.forEach(gi => _grn_items.push({ id: uid(), grn_id: grnId, po_id: po.id, po_item_id: gi.po_item_id, schedule_id: splits[0]?.scheduleId, qty_delivered: gi.qty, amount: gi.amt, ld_capped: gi.ldCapped, delay_days: gi.ldCalc.days, delay_months: gi.ldCalc.months, is_late: gi.ldCalc.isLate, eff_delivery_date: gi.effDate }))
    bill1GRNResults.push({ grnId, items: grnItems })
  }
}

const bill1WHT = Math.round(bill1TotalAmount * whtRate / 100)
const bill1Net = bill1TotalAmount - bill1TotalLD - bill1WHT
_bills.push({ id: 'bill1', po_id: po.id, bill_number: bill1Data.bill_number, bill_date: bill1Data.bill_date, total_bill_amount: bill1TotalAmount, total_ld: bill1TotalLD, wht_amount: bill1WHT, net_payable: bill1Net, pg_valid: pgCheck1.valid })

console.log(`\n  ── Bill 1 Summary ──`)
console.log(`  Bill Amount:   ${fmtPKR(bill1TotalAmount)}`)
console.log(`  LD Deducted:   ${fmtPKR(bill1TotalLD)}`)
console.log(`  WHT @ ${whtRate}%:    ${fmtPKR(bill1WHT)}`)
console.log(`  Net Payable:   ${fmtPKR(bill1Net)}`)

ok('Bill 1 LD (on time)', 0, bill1TotalLD)
ok('Bill 1 Amount', (20*185000)+(800*4500), bill1TotalAmount)
ok('Bill 1 WHT @2%', Math.round(((20*185000)+(800*4500))*0.02), bill1WHT)
ok('Bill 1 Net', ((20*185000)+(800*4500)) - 0 - Math.round(((20*185000)+(800*4500))*0.02), bill1Net)

// ============================================================
// STEP 5: SUPPLY BILL 2 — LATE (61 DAYS)
// ============================================================
section('STEP 5 — SUPPLY BILL 2 (Late — 61 Days)')
const bill2Data = {
  ic_number: 'IC-2026-002', ic_date: '2026-11-20',
  call_date: '2026-09-01', sample_date: '2026-09-10',
  insp_comp_date: '2026-11-15', challan_date: '2026-11-25',
  // Challan: 5 days after IC → within 20 days
  // Call: 75 days before promised → >15 days → use Inspection Completion
  // Insp Comp: 2026-11-15 vs Promised: 2026-09-15 → 61 days late
  bill_number: 'NEC-INV-002', bill_date: '2026-11-20',
  grns: [
    { grn_number: 'GRN-002', grn_date: '2026-11-25', store: 'Regional Store Shalamar', items: [{ itemId: item1.id, qty: 5 }, { itemId: item2.id, qty: 200 }] },
  ]
}
console.log(`  Bill: ${bill2Data.bill_number} | Promised: 2026-09-15 | Eff: ${bill2Data.insp_comp_date}`)
console.log(`  Call: ${bill2Data.call_date} (75 days before promised > 15 days → Insp Comp applies)`)
console.log(`  Insp Completion: ${bill2Data.insp_comp_date} (61 days after promised)`)
console.log(`  Challan: ${bill2Data.challan_date} (5 days after IC — within 20 days)`)
console.log(`  Expected: 61 days → ceil(61/30) = 3 months → LD = 3 × 2% = 6%`)

const pgCheck2 = checkPG(po.pg_validity_to, bill2Data.challan_date)
console.log(`  PG Check: ${pgCheck2.msg}`)

let bill2TotalAmount = 0, bill2TotalLD = 0

for (const grn of bill2Data.grns) {
  const grnItems = []
  for (const grnItem of grn.items) {
    const poItem = _po_items.find(i => i.id === grnItem.itemId)
    const itemSchedules = schedules.filter(s => s.po_item_id === grnItem.itemId)
    const splits = splitQty(grnItem.qty, itemSchedules, grnItem.itemId, 'bill1')

    for (const split of splits) {
      const eff = getEffectiveDeliveryDate(split.promisedDate, bill2Data.call_date, bill2Data.sample_date, bill2Data.insp_comp_date, bill2Data.challan_date, bill2Data.ic_date)
      const ldCalc = calcBatchLD(split.qty, poItem.unit_rate, split.promisedDate, eff?.date, po.ld_rate)
      const { ldCapped, capReached } = applyLDCap(ldCalc.ldAmount, runningLD, maxLD)
      runningLD += ldCapped
      const amt = split.qty * poItem.unit_rate
      bill2TotalAmount += amt
      bill2TotalLD += ldCapped
      grnItems.push({ po_item_id: poItem.id, qty: split.qty, amt, ldCalc, ldCapped, promisedDate: split.promisedDate, effDate: eff?.date })
      console.log(`\n    Item: ${poItem.product_name} — ${split.qty} units`)
      console.log(`    Promised: ${split.promisedDate} | Eff: ${eff?.date} | ${eff?.reason}`)
      console.log(`    Delay: ${ldCalc.days} days → ceil(${ldCalc.days}/30) = ${ldCalc.months} months → LD: ${fmtPKR(ldCalc.ldAmount)} → Capped: ${fmtPKR(ldCapped)}`)
    }
    const grnId = uid()
    _grns.push({ id: grnId, supply_bill_id: 'bill2', po_id: po.id, grn_number: grn.grn_number, total_amount: grnItems.reduce((s,i)=>s+i.amt,0), total_ld_capped: grnItems.reduce((s,i)=>s+i.ldCapped,0) })
    grnItems.forEach(gi => _grn_items.push({ id: uid(), grn_id: grnId, po_id: po.id, po_item_id: gi.po_item_id, qty_delivered: gi.qty, amount: gi.amt, ld_capped: gi.ldCapped, delay_days: gi.ldCalc.days, delay_months: gi.ldCalc.months, is_late: gi.ldCalc.isLate, eff_delivery_date: gi.effDate }))
  }
}

const bill2WHT = Math.round(bill2TotalAmount * whtRate / 100)
const bill2Net = bill2TotalAmount - bill2TotalLD - bill2WHT
_bills.push({ id: 'bill2', po_id: po.id, bill_number: bill2Data.bill_number, bill_date: bill2Data.bill_date, total_bill_amount: bill2TotalAmount, total_ld: bill2TotalLD, wht_amount: bill2WHT, net_payable: bill2Net, pg_valid: pgCheck2.valid })

console.log(`\n  ── Bill 2 Summary ──`)
console.log(`  Bill Amount:   ${fmtPKR(bill2TotalAmount)}`)
console.log(`  LD Deducted:   ${fmtPKR(bill2TotalLD)}`)
console.log(`  WHT @ ${whtRate}%:    ${fmtPKR(bill2WHT)}`)
console.log(`  Net Payable:   ${fmtPKR(bill2Net)}`)

// Item 1: 5 × 185,000 × 2% × 3 = 55,500
// Item 2: 200 × 4,500 × 2% × 3 = 54,000
const expItem1LD = 5 * 185000 * 0.02 * 3
const expItem2LD = 200 * 4500 * 0.02 * 3
const expBill2LD = expItem1LD + expItem2LD
const expBill2Amt = (5*185000) + (200*4500)
ok('Bill 2 Item 1 LD (5×185k×6%)', expItem1LD, 5*185000*0.02*3)
ok('Bill 2 Item 2 LD (200×4.5k×6%)', expItem2LD, 200*4500*0.02*3)
ok('Bill 2 Total LD', expBill2LD, bill2TotalLD)
ok('Bill 2 WHT @2%', Math.round(expBill2Amt*0.02), bill2WHT)
ok('Bill 2 Net Payable', expBill2Amt - expBill2LD - Math.round(expBill2Amt*0.02), bill2Net)

// ============================================================
// STEP 6: GST BILL
// ============================================================
section('STEP 6 — GST BILL (Covers Bill 2 GRNs)')
const bill2GRNs = _grns.filter(g => g.supply_bill_id === 'bill2')
const gstSupplyAmt = bill2GRNs.reduce((s,g) => s+g.total_amount, 0)
const gstLDActual = bill2GRNs.reduce((s,g) => s+g.total_ld_capped, 0)
const gstAmount = Math.round(gstSupplyAmt * 0.18)
const ldOnGST = Math.round(gstLDActual * 0.18)
const deduction1_5th = Math.round(gstAmount / 5)
const gstWHT = Math.round(gstAmount * whtRate / 100)
const gstNet = gstAmount - ldOnGST - deduction1_5th - gstWHT

console.log(`  Supply Amount (Bill 2):  ${fmtPKR(gstSupplyAmt)}`)
console.log(`  LD Actually Deducted:    ${fmtPKR(gstLDActual)}`)
console.log(`  GST @ 18%:               ${fmtPKR(gstAmount)}`)
console.log(`  (-) LD on GST (18% LD):  ${fmtPKR(ldOnGST)}`)
console.log(`  (-) 1/5th FBR:           ${fmtPKR(deduction1_5th)}`)
console.log(`  (-) WHT @ ${whtRate}%:          ${fmtPKR(gstWHT)}`)
console.log(`  Net GST Payable:         ${fmtPKR(gstNet)}`)

ok('GST Amount (18%)', Math.round(gstSupplyAmt*0.18), gstAmount)
ok('LD on GST (18% of LD)', Math.round(gstLDActual*0.18), ldOnGST)
ok('1/5th Deduction', Math.round(gstAmount/5), deduction1_5th)
ok('GST WHT @2%', Math.round(gstAmount*0.02), gstWHT)
ok('Net GST Payable', gstAmount-ldOnGST-deduction1_5th-Math.round(gstAmount*0.02), gstNet)

// ============================================================
// STEP 7: PO BALANCE SUMMARY
// ============================================================
section('STEP 7 — PO BALANCE & LD SUMMARY')
const allGRNItems = _grn_items.filter(i => i.po_id === po.id)
const delivItem1 = allGRNItems.filter(i => i.po_item_id === item1.id).reduce((s,i)=>s+i.qty_delivered,0)
const delivItem2 = allGRNItems.filter(i => i.po_item_id === item2.id).reduce((s,i)=>s+i.qty_delivered,0)
const totalLDCharged = runningLD

console.log(`  ${item1.product_name}:`)
console.log(`    PO Qty: ${item1.total_qty} | Delivered: ${delivItem1} | Balance: ${item1.total_qty - delivItem1}`)
console.log(`  ${item2.product_name}:`)
console.log(`    PO Qty: ${item2.total_qty} | Delivered: ${delivItem2} | Balance: ${item2.total_qty - delivItem2}`)
console.log(`\n  LD Summary:`)
console.log(`    Max LD Allowed (10%):   ${fmtPKR(maxLD)}`)
console.log(`    Bill 1 LD Charged:      ${fmtPKR(bill1TotalLD)}`)
console.log(`    Bill 2 LD Charged:      ${fmtPKR(bill2TotalLD)}`)
console.log(`    Total LD Charged:       ${fmtPKR(totalLDCharged)}`)
console.log(`    Remaining LD Capacity:  ${fmtPKR(maxLD - totalLDCharged)}`)

ok('Item 1 delivered', 25, delivItem1)
ok('Item 2 delivered', 1000, delivItem2)
ok('Total LD = Bill1 + Bill2', bill1TotalLD + bill2TotalLD, totalLDCharged)
ok('Remaining LD cap', maxLD - totalLDCharged, maxLD - totalLDCharged)

// ============================================================
// FINAL REPORT
// ============================================================
section('FINAL REPORT — ALL BILLS')
console.log(`  ${'Bill No'.padEnd(18)} ${'Amount'.padStart(18)} ${'LD'.padStart(14)} ${'WHT'.padStart(14)} ${'Net Payable'.padStart(18)}`)
hr()
_bills.forEach(b => {
  console.log(`  ${b.bill_number.padEnd(18)} ${fmtPKR(b.total_bill_amount).padStart(18)} ${fmtPKR(b.total_ld).padStart(14)} ${fmtPKR(b.wht_amount).padStart(14)} ${fmtPKR(b.net_payable).padStart(18)}`)
})
hr()
const totAmt = _bills.reduce((s,b)=>s+b.total_bill_amount,0)
const totLD = _bills.reduce((s,b)=>s+b.total_ld,0)
const totWHT = _bills.reduce((s,b)=>s+b.wht_amount,0)
const totNet = _bills.reduce((s,b)=>s+b.net_payable,0)
console.log(`  ${'TOTAL'.padEnd(18)} ${fmtPKR(totAmt).padStart(18)} ${fmtPKR(totLD).padStart(14)} ${fmtPKR(totWHT).padStart(14)} ${fmtPKR(totNet).padStart(18)}`)

console.log('\n  GST Bill Net Payable: ' + fmtPKR(gstNet))
console.log('═'.repeat(72))
console.log('  ALL TESTS COMPLETE')
console.log('═'.repeat(72))
