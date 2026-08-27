// ============================================================
// CALCULATIONS — LD, WHT, GST
// ============================================================

// ── LD CALCULATION ────────────────────────────────────────────────────────

// Determine effective delivery date based on inspection conditions
export function getEffectiveDeliveryDate(promisedDate, callDate, sampleCollectionDate, inspectionCompletionDate, challanDate, icDate) {
  if (!promisedDate) return null
  const promised = new Date(promisedDate)

  // Rule 3: If challan date > 20 days after IC date → effective = challan date
  if (challanDate && icDate) {
    const ic = new Date(icDate)
    const challan = new Date(challanDate)
    const diffDays = Math.floor((challan - ic) / (1000 * 60 * 60 * 24))
    if (diffDays > 20) return { date: challanDate, reason: 'Delivery Challan Date (>20 days from IC date)' }
  }

  // Rule 1: If call date is ≤ 15 days before promised date → effective = sample collection date
  if (callDate && sampleCollectionDate) {
    const call = new Date(callDate)
    const diffDays = Math.floor((promised - call) / (1000 * 60 * 60 * 24))
    if (diffDays >= 0 && diffDays <= 15) {
      return { date: sampleCollectionDate, reason: 'Sample Collection Date (call within 15 days of promised date)' }
    }
  }

  // Rule 2: Call date is > 15 days before promised → effective = inspection completion date
  if (inspectionCompletionDate) {
    return { date: inspectionCompletionDate, reason: 'Inspection Completion Date (call >15 days before promised date)' }
  }

  return null
}

// Calculate LD months — ceil(days/30), only complete+started months
export function calcLDMonths(promisedDate, effectiveDate) {
  if (!promisedDate || !effectiveDate) return 0
  const promised = new Date(promisedDate)
  const effective = new Date(effectiveDate)
  if (effective <= promised) return 0
  const days = Math.floor((effective - promised) / (1000 * 60 * 60 * 24))
  if (days <= 0) return 0
  return Math.ceil(days / 30)
}

export function calcDelayDays(promisedDate, effectiveDate) {
  if (!promisedDate || !effectiveDate) return 0
  const promised = new Date(promisedDate)
  const effective = new Date(effectiveDate)
  return Math.max(0, Math.floor((effective - promised) / (1000 * 60 * 60 * 24)))
}

// Auto-split GRN qty across delivery schedule batches (oldest first)
// Returns array of { scheduleId, promisedDate, store, qtyFromThisBatch, alreadyDelivered, batchQty }
export function splitQtyAcrossBatches(totalQtyInGRN, poItem, schedules, alreadyDeliveredByBatch) {
  // schedules sorted by promised_date asc
  const sorted = [...schedules].sort((a, b) => new Date(a.promised_date) - new Date(b.promised_date))
  let remaining = totalQtyInGRN
  const splits = []

  for (const sch of sorted) {
    if (remaining <= 0) break
    const alreadyDelivered = alreadyDeliveredByBatch[sch.id] || 0
    const batchRemaining = sch.promised_qty - alreadyDelivered
    if (batchRemaining <= 0) continue
    const take = Math.min(remaining, batchRemaining)
    splits.push({
      scheduleId: sch.id,
      promisedDate: sch.promised_date,
      store: sch.consignee_store,
      qtyFromThisBatch: take,
      alreadyDelivered,
      batchQty: sch.promised_qty,
    })
    remaining -= take
  }

  return splits
}

// Calculate LD for one batch split
export function calcBatchLD(qty, unitRate, promisedDate, effectiveDeliveryDate, ldRatePct = 2) {
  const months = calcLDMonths(promisedDate, effectiveDeliveryDate)
  const days = calcDelayDays(promisedDate, effectiveDeliveryDate)
  if (months === 0) return { days: 0, months: 0, ldAmount: 0, isLate: false }
  const ldAmount = Math.round(qty * unitRate * (ldRatePct / 100) * months)
  return { days, months, ldAmount, isLate: true }
}

// Apply PO-level LD cap across GRNs
export function applyLDCap(ldAmount, prevLDCharged, maxLD) {
  const remaining = Math.max(0, maxLD - prevLDCharged)
  const capped = Math.min(ldAmount, remaining)
  const capReached = (prevLDCharged + capped) >= maxLD
  return { ldCapped: capped, capReached, remaining }
}

// ── WHT ───────────────────────────────────────────────────────────────────

export function getWHTRateToday(supplier, exemptions = []) {
  if (!supplier) return { rate: 0, certNo: null, isExemption: false }
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const activeCert = exemptions
    .slice().sort((a, b) => new Date(a.valid_from) - new Date(b.valid_from))
    .find(e => {
      const from = new Date(e.valid_from), to = new Date(e.valid_to)
      return today >= from && today <= to
    })
  return activeCert
    ? { rate: activeCert.wht_rate, certNo: activeCert.certificate_no, validTo: activeCert.valid_to, isExemption: true }
    : { rate: supplier.default_wht_rate, certNo: null, isExemption: false }
}

// ── PG VALIDITY CHECK ─────────────────────────────────────────────────────

export function checkPGValidity(pgValidTo, challanDate) {
  if (!pgValidTo || !challanDate) return { valid: null, message: 'PG or Challan date missing' }
  const pg = new Date(pgValidTo)
  const challan = new Date(challanDate)
  if (challan <= pg) return { valid: true, message: `PG valid — Challan date (${challanDate}) is within PG validity (till ${pgValidTo})` }
  return { valid: false, message: `⚠️ PG EXPIRED — Challan date (${challanDate}) is beyond PG validity (${pgValidTo})` }
}

// ── FORMATTING ────────────────────────────────────────────────────────────

export function fmtPKR(amount) {
  if (amount == null || isNaN(amount)) return '—'
  return new Intl.NumberFormat('en-PK', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(amount)
}

export function fmtDate(dateStr) {
  if (!dateStr) return '—'
  return new Date(dateStr).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}

export function todayStr() {
  return new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' })
}

export function todayISO() {
  return new Date().toISOString().slice(0, 10)
}
