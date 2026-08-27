import { useState, useEffect } from 'react'
import { db } from '../store'
import { calcGrnLD, applyLDCap, getWHTRateToday, calcBillSummary, fmtPKR, todayStr } from '../utils/calculations'

const EMPTY_GRN = { grn_number: '', grn_date: '', challan_number: '', challan_date: '', consignee_store: '', promised_date: '', actual_delivery_date: '', qty_delivered: '', amount: '' }

export default function NewBill({ poId, billId, navigate }) {
  const [po, setPO] = useState(null)
  const [supplier, setSupplier] = useState(null)
  const [exemptions, setExemptions] = useState([])
  const [schedules, setSchedules] = useState([])
  const [prevLDCharged, setPrevLDCharged] = useState(0)
  const [whtInfo, setWhtInfo] = useState({ rate: 0, certNo: null, isExemption: false })

  const [billNo, setBillNo] = useState('')
  const [billDate, setBillDate] = useState('')
  const [grns, setGRNs] = useState([{ ...EMPTY_GRN }])
  const [calc, setCalc] = useState({ totalQty: 0, totalAmount: 0, whtAmount: 0, totalLD: 0, netPayable: 0 })
  const [calcDone, setCalcDone] = useState(false)

  useEffect(() => {
    const p = db.getPO(poId)
    setPO(p)
    const s = db.getSupplier(p?.supplier_id)
    setSupplier(s)
    const exms = db.getExemptions(p?.supplier_id)
    setExemptions(exms)
    const wht = getWHTRateToday(s, exms)
    setWhtInfo(wht)
    setSchedules(db.getSchedules(poId))
    const bal = db.getPOBalance(poId)
    // If editing a bill, exclude its own LD from prev total
    const allGRNs = db.getGRNsByPO(poId)
    const thisBillGRNs = billId ? db.getGRNs(billId) : []
    const thisBillLD = thisBillGRNs.reduce((s, g) => s + (g.ld_amount_capped || 0), 0)
    setPrevLDCharged((bal?.total_ld_charged || 0) - thisBillLD)

    if (billId) {
      const b = db.getBill(billId)
      if (b) { setBillNo(b.bill_number); setBillDate(b.bill_date) }
      const g = db.getGRNs(billId)
      if (g.length) setGRNs(g.map(g => ({ ...g, qty_delivered: String(g.qty_delivered), amount: String(g.amount) })))
    }
  }, [poId, billId])

  function addGRN() { if (grns.length < 5) setGRNs(g => [...g, { ...EMPTY_GRN }]) }
  function removeGRN(i) { if (grns.length > 1) setGRNs(g => g.filter((_, idx) => idx !== i)) }

  function updateGRN(i, field, val) {
    setGRNs(g => g.map((row, idx) => {
      if (idx !== i) return row
      const newRow = { ...row, [field]: val }
      if (field === 'qty_delivered' && po) newRow.amount = (parseFloat(val) || 0) * po.rate_per_unit
      return newRow
    }))
    setCalcDone(false)
  }

  function recalculate() {
    if (!po || !supplier) return
    const grnsWithLD = grns.map(g => {
      const qty = parseInt(g.qty_delivered) || 0
      const amt = parseFloat(g.amount) || 0
      const { daysLate, monthsLate, ldAmount } = calcGrnLD(qty, po.rate_per_unit, g.promised_date, g.actual_delivery_date, po.ld_rate)
      return { ...g, qty, amount: amt, daysLate, monthsLate, ldAmount }
    })
    const capped = applyLDCap(grnsWithLD, po.grand_total, po.ld_max_cap_pct, prevLDCharged)
    const totalLD = capped.reduce((s, g) => s + (g.ldAmountCapped || 0), 0)
    const totalQty = grns.reduce((s, g) => s + (parseInt(g.qty_delivered) || 0), 0)
    const totalAmount = grns.reduce((s, g) => s + (parseFloat(g.amount) || 0), 0)
    const { whtAmount, netPayable } = calcBillSummary(totalAmount, whtInfo.rate, totalLD)
    setCalc({ totalQty, totalAmount, whtAmount, totalLD, netPayable, grnsCalc: capped })
    setCalcDone(true)
  }

  function save(e) {
    e.preventDefault()
    if (!calcDone) { recalculate(); return }
    const bill = db.saveBill({
      ...(billId ? { id: billId } : {}),
      po_id: poId, bill_number: billNo, bill_date: billDate,
      total_bill_qty: calc.totalQty, total_bill_amount: calc.totalAmount,
      wht_rate_applied: whtInfo.rate,
      wht_cert_no: whtInfo.certNo,
      wht_amount: calc.whtAmount,
      ld_amount: calc.totalLD,
      net_payable: calc.netPayable,
    })
    const grnData = (calc.grnsCalc || grns).map(g => ({
      ...g, qty_delivered: parseInt(g.qty_delivered) || 0,
      amount: parseFloat(g.amount) || 0,
      ld_amount_capped: g.ldAmountCapped || 0,
    }))
    db.saveGRNs(bill.id, poId, grnData)
    navigate('po-detail', { poId })
  }

  if (!po) return <div className="text-muted">Loading...</div>

  const bal = db.getPOBalance(poId)

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <button className="btn btn-secondary btn-sm" onClick={() => navigate('po-detail', { poId })}>← Back to PO</button>
        <div style={{ fontSize: 12, color: 'var(--gray-500)' }}>Pre-Audit Date: <strong>{todayStr()}</strong></div>
      </div>

      {/* PO REFERENCE */}
      <div className="card mb-4">
        <div className="card-header"><span className="card-title">PO Reference — {po.po_number}</span></div>
        <div className="card-body">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
            <div><div className="stat-label">Supplier</div><div style={{ fontWeight: 600, fontSize: 13 }}>{supplier?.name}</div></div>
            <div><div className="stat-label">Rate/Unit</div><div className="font-mono">Rs. {fmtPKR(po.rate_per_unit)}</div></div>
            <div><div className="stat-label">Balance Qty</div><div style={{ fontWeight: 700, color: 'var(--green)' }}>{bal?.balance_qty?.toLocaleString()}</div></div>
            <div><div className="stat-label">Balance Amount</div><div className="font-mono" style={{ color: 'var(--green)', fontWeight: 700 }}>Rs. {fmtPKR(bal?.balance_amount)}</div></div>
          </div>
        </div>
      </div>

      {/* WHT RATE BOX — Today's rate */}
      <div className={`alert ${whtInfo.isExemption ? 'alert-success' : 'alert-info'}`} style={{ marginBottom: 16 }}>
        <div>
          <strong>WHT Rate for This Pre-Audit: {whtInfo.rate}%</strong>
          {whtInfo.isExemption
            ? <span style={{ marginLeft: 8 }}>— Exemption certificate <strong>{whtInfo.certNo}</strong> is active today (valid till {whtInfo.validTo})</span>
            : <span style={{ marginLeft: 8 }}>— No active exemption certificate today. Default {supplier?.type === 'company' ? 'company (5%)' : 'individual (5.5%)'} rate applies.</span>
          }
        </div>
      </div>

      <form onSubmit={save}>
        {/* BILL DETAILS */}
        <div className="card mb-4">
          <div className="card-header"><span className="card-title">Supply Bill Details</span></div>
          <div className="card-body">
            <div className="form-grid">
              <div className="field">
                <label>Bill Number *</label>
                <input required value={billNo} onChange={e => setBillNo(e.target.value)} placeholder="Supplier bill number" />
              </div>
              <div className="field">
                <label>Bill Date *</label>
                <input type="date" required value={billDate} onChange={e => setBillDate(e.target.value)} />
              </div>
            </div>
          </div>
        </div>

        {/* GRNs */}
        <div className="card mb-4">
          <div className="card-header">
            <span className="card-title">GRNs ({grns.length}/5)</span>
            {grns.length < 5 && <button type="button" className="btn btn-secondary btn-sm" onClick={addGRN}>+ Add GRN</button>}
          </div>
          <div className="card-body">
            {grns.map((grn, i) => {
              const gCalc = calc.grnsCalc?.[i]
              return (
                <div key={i} className="grn-block">
                  <div className="grn-block-header">
                    <span className="grn-block-title">GRN #{i + 1}</span>
                    {grns.length > 1 && <button type="button" className="btn btn-danger btn-sm" onClick={() => removeGRN(i)}>Remove</button>}
                  </div>
                  <div className="form-grid">
                    <div className="field">
                      <label>GRN Number *</label>
                      <input required value={grn.grn_number} onChange={e => updateGRN(i, 'grn_number', e.target.value)} />
                    </div>
                    <div className="field">
                      <label>GRN Date *</label>
                      <input type="date" required value={grn.grn_date} onChange={e => updateGRN(i, 'grn_date', e.target.value)} />
                    </div>
                    <div className="field">
                      <label>Challan Number *</label>
                      <input required value={grn.challan_number} onChange={e => updateGRN(i, 'challan_number', e.target.value)} />
                    </div>
                    <div className="field">
                      <label>Challan Date *</label>
                      <input type="date" required value={grn.challan_date} onChange={e => updateGRN(i, 'challan_date', e.target.value)} />
                    </div>
                    <div className="field">
                      <label>Consignee Store *</label>
                      <select value={grn.consignee_store} onChange={e => {
                        const sch = schedules.find(s => s.consignee_store === e.target.value)
                        updateGRN(i, 'consignee_store', e.target.value)
                        if (sch) updateGRN(i, 'promised_date', sch.promised_date)
                      }}>
                        <option value="">Select store...</option>
                        {schedules.map(s => <option key={s.id} value={s.consignee_store}>{s.consignee_store}</option>)}
                        <option value="other">Other</option>
                      </select>
                    </div>
                    <div className="field">
                      <label>Promised Delivery Date</label>
                      <input type="date" value={grn.promised_date} onChange={e => updateGRN(i, 'promised_date', e.target.value)} />
                      <span className="hint">Auto-filled from delivery schedule</span>
                    </div>
                    <div className="field">
                      <label>Actual Delivery Date *</label>
                      <input type="date" required value={grn.actual_delivery_date} onChange={e => updateGRN(i, 'actual_delivery_date', e.target.value)} />
                    </div>
                    <div className="field">
                      <label>Qty Delivered *</label>
                      <input type="number" required value={grn.qty_delivered} onChange={e => updateGRN(i, 'qty_delivered', e.target.value)} />
                    </div>
                    <div className="field">
                      <label>Amount (Ex-GST)</label>
                      <input type="number" step="0.01" value={grn.amount} onChange={e => updateGRN(i, 'amount', e.target.value)} />
                      <span className="hint">Auto: Qty × Rs.{fmtPKR(po.rate_per_unit)}</span>
                    </div>
                  </div>
                  {/* LD Warning per GRN */}
                  {gCalc && gCalc.daysLate > 0 && (
                    <div className="alert alert-warning" style={{ marginTop: 12 }}>
                      ⚠️ Late by <strong>{gCalc.daysLate} day(s)</strong> = <strong>{gCalc.monthsLate} month(s)</strong> · LD = Rs. {fmtPKR(gCalc.ldAmount)}
                      {gCalc.ldAmountCapped < gCalc.ldAmount && (
                        <span> → Capped to Rs. <strong>{fmtPKR(gCalc.ldAmountCapped)}</strong> (10% LD cap reached)</span>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>

        {/* CALCULATION SUMMARY */}
        <div className="card mb-4">
          <div className="card-header">
            <span className="card-title">Pre-Audit Calculation Summary</span>
            <button type="button" className="btn btn-secondary btn-sm" onClick={recalculate}>↻ Calculate</button>
          </div>
          <div className="card-body">
            {!calcDone && <div className="alert alert-info" style={{ marginBottom: 16 }}>Click <strong>Calculate</strong> to compute deductions before saving.</div>}
            <table style={{ width: '100%', maxWidth: 480 }}>
              <tbody>
                <tr><td style={{ padding: '7px 0', color: 'var(--gray-500)' }}>Total Qty Delivered</td><td className="text-right">{calc.totalQty.toLocaleString()}</td></tr>
                <tr><td style={{ padding: '7px 0', color: 'var(--gray-500)' }}>Bill Amount (Ex-GST)</td><td className="text-right font-mono">Rs. {fmtPKR(calc.totalAmount)}</td></tr>
                {calc.totalLD > 0 && (
                  <tr>
                    <td style={{ padding: '7px 0', color: 'var(--red)' }}>(-) LD Deduction @ {po.ld_rate}%/month</td>
                    <td className="text-right font-mono" style={{ color: 'var(--red)' }}>Rs. {fmtPKR(calc.totalLD)}</td>
                  </tr>
                )}
                <tr>
                  <td style={{ padding: '7px 0', color: 'var(--gray-500)' }}>
                    (-) WHT @ {whtInfo.rate}%
                    {whtInfo.isExemption && <span className="badge badge-green" style={{ marginLeft: 8 }}>Cert: {whtInfo.certNo}</span>}
                  </td>
                  <td className="text-right font-mono">Rs. {fmtPKR(calc.whtAmount)}</td>
                </tr>
                <tr style={{ borderTop: '2px solid var(--gray-200)' }}>
                  <td style={{ padding: '10px 0', fontWeight: 700, fontSize: 15 }}>Net Payable Amount</td>
                  <td className="text-right font-mono" style={{ fontWeight: 700, fontSize: 15, color: 'var(--green)' }}>Rs. {fmtPKR(calc.netPayable)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <div className="flex gap-2">
          <button type="submit" className="btn btn-primary">{calcDone ? 'Save Bill' : 'Calculate First'}</button>
          <button type="button" className="btn btn-secondary" onClick={() => navigate('po-detail', { poId })}>Cancel</button>
        </div>
      </form>
    </div>
  )
}
