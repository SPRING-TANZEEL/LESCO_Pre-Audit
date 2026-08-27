import { useState, useEffect } from 'react'
import { db } from '../store'
import {
  getEffectiveDeliveryDate, calcBatchLD, applyLDCap,
  splitQtyAcrossBatches, getWHTRateToday, checkPGValidity,
  fmtPKR, todayStr
} from '../utils/calculations'

const EMPTY_GRN = { grn_number: '', grn_date: '', consignee_store: '' }

// ── LIST VIEW ─────────────────────────────────────────────────
export default function SupplyBills({ navigate }) {
  const [view, setView] = useState('list')
  const [allBills, setAllBills] = useState([])
  const [pos, setPOs] = useState([])
  const [suppliers, setSuppliers] = useState([])
  const [editBillId, setEditBillId] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    const [bills, p, s] = await Promise.all([db.getAllBills(), db.getPOs(), db.getSuppliers()])
    setAllBills(bills); setPOs(p); setSuppliers(s); setLoading(false)
  }

  if (view === 'new' || view === 'edit') {
    return <BillForm billId={editBillId} onSave={() => { load(); setView('list') }} onCancel={() => setView('list')} />
  }

  if (loading) return <div className="text-muted" style={{ padding: 32 }}>Loading...</div>

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <span className="text-muted text-sm">All supply bills across all purchase orders</span>
        <button className="btn btn-primary" onClick={() => { setEditBillId(null); setView('new') }}>+ New Supply Bill</button>
      </div>
      <div className="card">
        <div className="table-wrap">
          <table>
            <thead>
              <tr><th>Bill No</th><th>Bill Date</th><th>PO No</th><th>Supplier</th><th className="text-right">Bill Amount</th><th className="text-right">LD</th><th className="text-right">WHT</th><th className="text-right">Net Payable</th><th>PG</th><th>Status</th><th></th></tr>
            </thead>
            <tbody>
              {allBills.length === 0 && <tr><td colSpan={11} className="text-center text-muted" style={{ padding: 32 }}>No supply bills yet.</td></tr>}
              {allBills.map(b => {
                const po = pos.find(p => p.id === b.po_id)
                const sup = suppliers.find(s => s.id === po?.supplier_id)
                return (
                  <tr key={b.id}>
                    <td><strong>{b.bill_number}</strong></td>
                    <td>{b.bill_date}</td>
                    <td>{po?.po_number}</td>
                    <td style={{ maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{sup?.name}</td>
                    <td className="text-right font-mono">{fmtPKR(b.total_bill_amount)}</td>
                    <td className="text-right font-mono" style={{ color: b.total_ld > 0 ? 'var(--red)' : 'inherit' }}>{b.total_ld > 0 ? fmtPKR(b.total_ld) : '—'}</td>
                    <td className="text-right font-mono">{fmtPKR(b.wht_amount)}</td>
                    <td className="text-right font-mono"><strong>{fmtPKR(b.net_payable)}</strong></td>
                    <td>{b.pg_valid === true ? <span className="badge badge-green">Valid</span> : b.pg_valid === false ? <span className="badge badge-red">Expired</span> : <span className="badge badge-gray">—</span>}</td>
                    <td><span className={`badge badge-${b.status === 'verified' ? 'green' : 'amber'}`}>{b.status}</span></td>
                    <td>
                      <div className="flex gap-2">
                        <button className="btn btn-secondary btn-sm" onClick={() => { setEditBillId(b.id); setView('edit') }}>Edit</button>
                        <button className="btn btn-primary btn-sm" onClick={() => navigate('print', { billId: b.id })}>Print</button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

// ── BILL FORM ─────────────────────────────────────────────────
function BillForm({ billId, onSave, onCancel }) {
  const [poQuery, setPOQuery] = useState('')
  const [poResults, setPOResults] = useState([])
  const [selectedPO, setSelectedPO] = useState(null)
  const [supplier, setSupplier] = useState(null)
  const [exemptions, setExemptions] = useState([])
  const [poItems, setPOItems] = useState([])
  const [schedules, setSchedules] = useState([])
  const [whtInfo, setWhtInfo] = useState({ rate: 0, isExemption: false })
  const [poBalance, setPOBalance] = useState(null)

  const [billNo, setBillNo] = useState('')
  const [billDate, setBillDate] = useState('')
  const [icNumber, setICNumber] = useState('')
  const [icDate, setICDate] = useState('')
  const [callDate, setCallDate] = useState('')
  const [sampleDate, setSampleDate] = useState('')
  const [inspCompDate, setInspCompDate] = useState('')
  const [icQtyThisBill, setICQtyThisBill] = useState('')
  const [existingIC, setExistingIC] = useState(null)
  const [icRemainingQty, setICRemainingQty] = useState(null)
  const [challanNo, setChallanNo] = useState('')
  const [challanDate, setChallanDate] = useState('')
  const [grns, setGRNs] = useState([{ ...EMPTY_GRN }])
  const [grnItemQtys, setGRNItemQtys] = useState({})
  const [calcResult, setCalcResult] = useState(null)
  const [pgCheck, setPGCheck] = useState(null)
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(false)

  useEffect(() => { if (billId) loadBill(billId) }, [billId])

  async function loadBill(id) {
    setLoading(true)
    const b = await db.getBill(id)
    if (!b) return
    const po = await db.getPO(b.po_id)
    await loadPO(po)
    setBillNo(b.bill_number); setBillDate(b.bill_date)
    setICNumber(b.ic_number || ''); setICDate(b.ic_date || '')
    setCallDate(b.call_date || ''); setSampleDate(b.sample_collection_date || '')
    setInspCompDate(b.inspection_completion_date || '')
    setICQtyThisBill(b.ic_qty_this_bill || '')
    setChallanNo(b.challan_number || ''); setChallanDate(b.challan_date || '')
    const savedGRNs = await db.getGRNs(id)
    if (savedGRNs.length) setGRNs(savedGRNs)
    const qtys = {}
    for (const g of savedGRNs) {
      const items = await db.getGRNItems(g.id)
      items.forEach(item => { qtys[`${savedGRNs.indexOf(g)}_${item.po_item_id}`] = item.qty_delivered })
    }
    setGRNItemQtys(qtys)
    setLoading(false)
  }

  async function searchPO(q) {
    setPOQuery(q)
    if (q.length < 2) { setPOResults([]); return }
    const results = await db.searchPOs(q)
    setPOResults(results)
  }

  async function loadPO(po) {
    setSelectedPO(po)
    const [sup, exms, items, scheds, bal] = await Promise.all([
      db.getSupplier(po.supplier_id),
      db.getExemptions(po.supplier_id),
      db.getPOItems(po.id),
      db.getSchedules(po.id),
      db.getPOBalance(po.id),
    ])
    setSupplier(sup)
    setExemptions(exms)
    setWhtInfo(getWHTRateToday(sup, exms))
    setPOItems(items)
    setSchedules(scheds)
    setPOBalance(bal)
    setPOResults([])
    setPOQuery('')
  }

  async function checkIC(icNo) {
    if (!selectedPO || !icNo) return
    const existing = await db.getICByNumber(selectedPO.id, icNo)
    if (existing) {
      setExistingIC(existing)
      const usedQty = await db.getICUsedQty(existing.id, billId)
      setICRemainingQty(existing.total_qty - usedQty)
      setICDate(existing.ic_date || '')
      setCallDate(existing.call_date || '')
      setSampleDate(existing.sample_collection_date || '')
      setInspCompDate(existing.inspection_completion_date || '')
    } else {
      setExistingIC(null)
      setICRemainingQty(null)
    }
  }

  function updateGRN(i, field, val) {
    setGRNs(g => g.map((row, idx) => idx === i ? { ...row, [field]: val } : row))
    setCalcResult(null)
  }

  function setGRNItemQty(grnIdx, itemId, val) {
    setGRNItemQtys(q => ({ ...q, [`${grnIdx}_${itemId}`]: val }))
    setCalcResult(null)
  }

  function addGRN() { if (grns.length < 5) setGRNs(g => [...g, { ...EMPTY_GRN }]) }
  function removeGRN(i) { if (grns.length > 1) setGRNs(g => g.filter((_, idx) => idx !== i)) }

  async function calculate() {
    if (!selectedPO) return
    const po = selectedPO
    const prevLD = poBalance?.total_ld_charged || 0
    const maxLD = poBalance?.max_ld_allowed || 0
    let runningLD = prevLD
    const effDate = getEffectiveDeliveryDate(null, callDate, sampleDate, inspCompDate, challanDate, icDate)
    const pgChk = checkPGValidity(po.pg_validity_to, challanDate)
    setPGCheck(pgChk)

    let totalBillAmount = 0, totalLDBeforeCap = 0, totalLDAfterCap = 0, capReached = false
    const grnResults = []

    for (const [gi, grn] of grns.entries()) {
      const grnItemResults = []
      for (const item of poItems) {
        const qtyEntered = parseInt(grnItemQtys[`${gi}_${item.id}`]) || 0
        if (qtyEntered === 0) continue
        const itemSchedules = schedules.filter(s => s.po_item_id === item.id || !s.po_item_id || poItems.length === 1)
        const alreadyByBatch = {}
        for (const sch of itemSchedules) {
          alreadyByBatch[sch.id] = await db.getDeliveredQtyByBatch(po.id, item.id, sch.id, billId)
        }
        const splits = splitQtyAcrossBatches(qtyEntered, item, itemSchedules, alreadyByBatch)
        for (const split of splits) {
          const effDeliveryDate = effDate?.date || null
          const ldCalc = calcBatchLD(split.qtyFromThisBatch, item.unit_rate, split.promisedDate, effDeliveryDate, po.ld_rate)
          const { ldCapped, capReached: cr } = applyLDCap(ldCalc.ldAmount, runningLD, maxLD)
          runningLD += ldCapped
          totalLDBeforeCap += ldCalc.ldAmount
          totalLDAfterCap += ldCapped
          if (cr) capReached = true
          const amount = split.qtyFromThisBatch * item.unit_rate
          totalBillAmount += amount
          grnItemResults.push({
            po_item_id: item.id,
            description: item.product_name || item.description || '',
            unit_rate: item.unit_rate,
            schedule_id: split.scheduleId,
            promised_date: split.promisedDate,
            qty_delivered: split.qtyFromThisBatch,
            amount, delay_days: ldCalc.days, delay_months: ldCalc.months,
            ld_before_cap: ldCalc.ldAmount, ld_capped: ldCapped,
            is_late: ldCalc.isLate, eff_delivery_date: effDeliveryDate,
            eff_delivery_reason: effDate?.reason || '', cap_reached: cr,
          })
        }
      }
      grnResults.push({ ...grn, items: grnItemResults, grn_total_amount: grnItemResults.reduce((s, i) => s + i.amount, 0), grn_total_ld: grnItemResults.reduce((s, i) => s + i.ld_capped, 0) })
    }

    const whtAmount = Math.round(totalBillAmount * whtInfo.rate / 100)
    const netPayable = totalBillAmount - totalLDAfterCap - whtAmount
    setCalcResult({ grnResults, totalBillAmount, totalLDBeforeCap, totalLDAfterCap, capReached, whtAmount, netPayable, prevLD, maxLD, newTotalLD: runningLD, effDate, whtInfo })
  }

  async function save() {
    if (!calcResult || !selectedPO) return
    setSaving(true)
    try {
      const po = selectedPO
            let icId = existingIC?.id
      if (!existingIC && icNumber) {
        const ic = await db.saveIC({
          po_id: po.id, ic_number: icNumber, ic_date: icDate || null,
          call_date: callDate || null, sample_collection_date: sampleDate || null,
          inspection_completion_date: inspCompDate || null,
          total_qty: parseInt(icQtyThisBill) || 0,
        })
        icId = ic?.id || null
      }
      const bill = await db.saveBill({
        ...(billId ? { id: billId } : {}),
        po_id: po.id, bill_number: billNo, bill_date: billDate,
        ic_id: icId || null, ic_number: icNumber || null, ic_date: icDate || null,
        call_date: callDate, sample_collection_date: sampleDate,
        inspection_completion_date: inspCompDate,
        ic_qty_this_bill: parseInt(icQtyThisBill) || 0,
        challan_number: challanNo, challan_date: challanDate,
        total_bill_amount: calcResult.totalBillAmount,
        total_ld: calcResult.totalLDAfterCap,
        wht_rate_applied: whtInfo.rate, wht_cert_no: whtInfo.certNo,
        wht_amount: calcResult.whtAmount, net_payable: calcResult.netPayable,
        pg_valid: pgCheck?.valid,
        eff_delivery_date: calcResult.effDate?.date,
        eff_delivery_reason: calcResult.effDate?.reason,
      })
      const savedGRNs = await db.saveGRNs(bill.id, po.id, calcResult.grnResults.map(g => ({
        grn_number: g.grn_number, grn_date: g.grn_date, consignee_store: g.consignee_store,
        total_amount: g.grn_total_amount, total_ld_capped: g.grn_total_ld,
      })))
      for (let gi = 0; gi < savedGRNs.length; gi++) {
        await db.saveGRNItems(savedGRNs[gi].id, po.id, calcResult.grnResults[gi].items)
      }
      onSave()
    } catch (err) {
      alert('Error saving bill: ' + err.message)
    }
    setSaving(false)
  }

  if (loading) return <div className="text-muted" style={{ padding: 32 }}>Loading bill...</div>

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <button className="btn btn-secondary btn-sm" onClick={onCancel}>← Back</button>
        <div style={{ fontSize: 12, color: 'var(--gray-500)' }}>Pre-Audit Date: <strong>{todayStr()}</strong></div>
      </div>

      {/* PO SEARCH */}
      {!selectedPO ? (
        <div className="card mb-4">
          <div className="card-header"><span className="card-title">Search Purchase Order</span></div>
          <div className="card-body">
            <div className="field" style={{ maxWidth: 400 }}>
              <label>Search by PO Number or Supplier Name</label>
              <input value={poQuery} onChange={e => searchPO(e.target.value)} placeholder="Type PO number or supplier..." style={{ fontSize: 14 }} />
            </div>
            {poResults.length > 0 && (
              <div style={{ marginTop: 8, border: '1px solid var(--gray-200)', borderRadius: 6, overflow: 'hidden', maxWidth: 500 }}>
                {poResults.map(po => {
                  const poData = po.suppliers ? po : po
                  return (
                    <div key={po.id} onClick={() => loadPO(po)}
                      style={{ padding: '10px 14px', cursor: 'pointer', borderBottom: '1px solid var(--gray-100)' }}
                      onMouseEnter={e => e.currentTarget.style.background = 'var(--accent-light)'}
                      onMouseLeave={e => e.currentTarget.style.background = 'white'}>
                      <div style={{ fontWeight: 700 }}>{po.po_number}</div>
                      <div style={{ fontSize: 12, color: 'var(--gray-500)' }}>Grand Total: Rs. {fmtPKR(po.grand_total)}</div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      ) : (
        <>
          {/* PO SUMMARY */}
          <div className="card mb-4">
            <div className="card-header">
              <span className="card-title">PO: {selectedPO.po_number}</span>
              <button className="btn btn-secondary btn-sm" onClick={() => { setSelectedPO(null); setCalcResult(null) }}>Change PO</button>
            </div>
            <div className="card-body">
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 12 }}>
                <div><div className="stat-label">Supplier</div><div style={{ fontWeight: 600, fontSize: 13 }}>{supplier?.name}</div></div>
                <div><div className="stat-label">Grand Total</div><div className="font-mono">Rs. {fmtPKR(selectedPO.grand_total)}</div></div>
                <div><div className="stat-label">PG Valid Till</div><div>{selectedPO.pg_validity_to}</div></div>
                <div><div className="stat-label">LD Remaining</div><div style={{ fontWeight: 700, color: poBalance?.ld_cap_reached ? 'var(--red)' : 'var(--green)' }}>Rs. {fmtPKR(poBalance?.remaining_ld_capacity)}</div></div>
              </div>
              <div className={`alert ${whtInfo.isExemption ? 'alert-success' : 'alert-info'}`}>
                <strong>WHT Rate Today: {whtInfo.rate}%</strong>
                {whtInfo.isExemption ? ` — Cert ${whtInfo.certNo} active (till ${whtInfo.validTo})` : ` — Default ${supplier?.type === 'company' ? 'company' : 'individual'} rate`}
              </div>

              {/* Item balance */}
              <div className="section-title">Item-wise Balance</div>
              <table style={{ width: '100%', fontSize: 12 }}>
                <thead><tr><th>Product</th><th className="text-right">PO Qty</th><th className="text-right">Delivered</th><th className="text-right">Balance</th></tr></thead>
                <tbody>
                                    {poItems.map(item => {
                    return (
                      <tr key={item.id}>
                        <td>{item.product_name}</td>
                        <td className="text-right">{item.total_qty?.toLocaleString()}</td>
                        <td className="text-right">{(poBalance?.delivered_qty || 0).toLocaleString()}</td>
                        <td className="text-right" style={{ fontWeight: 700, color: 'var(--green)' }}>{(item.total_qty - (poBalance?.delivered_qty || 0)).toLocaleString()}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* BILL DETAILS */}
          <div className="card mb-4">
            <div className="card-header"><span className="card-title">Bill Details</span></div>
            <div className="card-body">
              <div className="form-grid">
                <div className="field"><label>Bill Number *</label><input required value={billNo} onChange={e => setBillNo(e.target.value)} /></div>
                <div className="field"><label>Bill Date *</label><input type="date" required value={billDate} onChange={e => setBillDate(e.target.value)} /></div>
              </div>
            </div>
          </div>

          {/* INSPECTION CERTIFICATE */}
          <div className="card mb-4">
            <div className="card-header"><span className="card-title">Inspection Certificate</span></div>
            <div className="card-body">
              {existingIC && <div className="alert alert-success" style={{ marginBottom: 12 }}>✅ IC found: <strong>{existingIC.ic_number}</strong> · Remaining: <strong>{icRemainingQty}</strong></div>}
              <div className="form-grid">
                <div className="field"><label>IC Number *</label><input value={icNumber} onChange={e => { setICNumber(e.target.value); setCalcResult(null) }} onBlur={e => checkIC(e.target.value)} placeholder="Tab out to search existing" /></div>
                <div className="field"><label>IC Date *</label><input type="date" value={icDate} onChange={e => { setICDate(e.target.value); setCalcResult(null) }} readOnly={!!existingIC} /></div>
                <div className="field"><label>Inspection Call Date *</label><input type="date" value={callDate} onChange={e => { setCallDate(e.target.value); setCalcResult(null) }} readOnly={!!existingIC} /></div>
                <div className="field"><label>Sample Collection Date *</label><input type="date" value={sampleDate} onChange={e => { setSampleDate(e.target.value); setCalcResult(null) }} readOnly={!!existingIC} /></div>
                <div className="field"><label>Inspection Completion Date *</label><input type="date" value={inspCompDate} onChange={e => { setInspCompDate(e.target.value); setCalcResult(null) }} readOnly={!!existingIC} /></div>
                <div className="field"><label>IC Qty for This Bill</label><input type="number" value={icQtyThisBill} onChange={e => setICQtyThisBill(e.target.value)} onWheel={e => e.target.blur()} />{icRemainingQty !== null && <span className="hint">Remaining: {icRemainingQty}</span>}</div>
              </div>
            </div>
          </div>

          {/* CHALLAN */}
          <div className="card mb-4">
            <div className="card-header"><span className="card-title">Delivery Challan</span></div>
            <div className="card-body">
              <div className="form-grid">
                <div className="field"><label>Challan Number *</label><input required value={challanNo} onChange={e => { setChallanNo(e.target.value); setCalcResult(null) }} /></div>
                <div className="field"><label>Challan Date *</label><input type="date" required value={challanDate} onChange={e => { setChallanDate(e.target.value); setCalcResult(null) }} /></div>
              </div>
              {challanDate && pgCheck && (
                <div className={`alert ${pgCheck.valid ? 'alert-success' : 'alert-warning'}`} style={{ marginTop: 12 }}>{pgCheck.message}</div>
              )}
            </div>
          </div>

          {/* GRNs */}
          <div className="card mb-4">
            <div className="card-header">
              <span className="card-title">GRNs ({grns.length}/5)</span>
              {grns.length < 5 && <button type="button" className="btn btn-secondary btn-sm" onClick={addGRN}>+ Add GRN</button>}
            </div>
            <div className="card-body">
              {grns.map((grn, gi) => (
                <div key={gi} className="grn-block">
                  <div className="grn-block-header">
                    <span className="grn-block-title">GRN #{gi + 1}</span>
                    {grns.length > 1 && <button type="button" className="btn btn-danger btn-sm" onClick={() => removeGRN(gi)}>Remove</button>}
                  </div>
                  <div className="form-grid">
                    <div className="field"><label>GRN Number *</label><input value={grn.grn_number} onChange={e => updateGRN(gi, 'grn_number', e.target.value)} /></div>
                    <div className="field"><label>GRN Date *</label><input type="date" value={grn.grn_date} onChange={e => updateGRN(gi, 'grn_date', e.target.value)} /></div>
                    <div className="field">
                      <label>Store</label>
                      <select value={grn.consignee_store} onChange={e => updateGRN(gi, 'consignee_store', e.target.value)}>
                        <option value="">Select store...</option>
                        <option>Regional Store Shalamar</option>
                        <option>Regional Store Pattoki</option>
                        <option>Regional Store Walgon Sohail</option>
                        <option>MIS Store</option>
                      </select>
                    </div>
                  </div>
                  {/* Item qty entry */}
                  <div style={{ marginTop: 12 }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--navy)', marginBottom: 8 }}>Qty Received per Item</div>
                    {poItems.map(item => (
                      <div key={item.id} style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr', gap: 8, alignItems: 'center', marginBottom: 8, background: 'white', padding: '8px 10px', borderRadius: 6, border: '1px solid var(--gray-200)' }}>
                        <div>
                          <div style={{ fontSize: 12, fontWeight: 600 }}>{item.product_name}</div>
                          <div style={{ fontSize: 11, color: 'var(--gray-500)' }}>Rate: Rs. {fmtPKR(item.unit_rate)}</div>
                        </div>
                        <div style={{ textAlign: 'center' }}>
                          <div style={{ fontSize: 10, color: 'var(--gray-500)' }}>PO Qty</div>
                          <div style={{ fontWeight: 700 }}>{item.total_qty?.toLocaleString()}</div>
                        </div>
                        <div>
                          <div style={{ fontSize: 10, color: 'var(--gray-500)', marginBottom: 3 }}>Qty in this GRN</div>
                          <input type="number" min="0" value={grnItemQtys[`${gi}_${item.id}`] || ''}
                            onChange={e => setGRNItemQty(gi, item.id, e.target.value)}
                            onWheel={e => e.target.blur()}
                            style={{ width: '100%', padding: '5px 8px', border: '1px solid var(--gray-300)', borderRadius: 4, fontSize: 13 }} />
                        </div>
                        <div style={{ textAlign: 'right' }}>
                          <div style={{ fontSize: 10, color: 'var(--gray-500)' }}>Amount</div>
                          <div className="font-mono" style={{ fontSize: 12 }}>Rs. {fmtPKR((parseInt(grnItemQtys[`${gi}_${item.id}`]) || 0) * item.unit_rate)}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                  {/* LD results per GRN */}
                  {calcResult?.grnResults?.[gi]?.items?.length > 0 && (
                    <div style={{ marginTop: 12, background: 'white', borderRadius: 6, border: '1px solid var(--gray-200)', padding: 12 }}>
                      <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 8, color: 'var(--navy)' }}>LD Calculation — GRN #{gi + 1}</div>
                      {calcResult.grnResults[gi].items.map((item, ii) => (
                        <div key={ii} style={{ fontSize: 12, padding: '4px 0', borderBottom: '1px solid var(--gray-100)' }}>
                          <strong>{item.qty_delivered} × {item.description}</strong> (Promised: {item.promised_date})
                          {item.is_late
                            ? <span style={{ color: 'var(--red)', marginLeft: 8 }}>⚠️ {item.delay_days} days ({item.delay_months} months) · LD: Rs. {fmtPKR(item.ld_capped)}{item.ld_before_cap > item.ld_capped ? ` (capped from Rs. ${fmtPKR(item.ld_before_cap)})` : ''}</span>
                            : <span style={{ color: 'var(--green)', marginLeft: 8 }}>✅ On time</span>}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* CALCULATION */}
          <div className="card mb-4">
            <div className="card-header">
              <span className="card-title">Pre-Audit Calculation</span>
              <button type="button" className="btn btn-secondary" onClick={calculate}>↻ Calculate</button>
            </div>
            {calcResult && (
              <div className="card-body">
                {/* LD Summary */}
                <div style={{ marginBottom: 16 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8, color: 'var(--navy)' }}>LD Summary — This PO</div>
                  <table style={{ width: '100%', maxWidth: 500, fontSize: 12, borderCollapse: 'collapse' }}>
                    <tbody>
                      {[
                        ['Max LD Allowed (10% of Grand Total)', fmtPKR(calcResult.maxLD), 'var(--gray-50)'],
                        ['Already Deducted (Previous Bills)', fmtPKR(calcResult.prevLD), 'white'],
                        ['LD This Bill (before cap)', fmtPKR(calcResult.totalLDBeforeCap), 'white'],
                        ['LD Deducted This Bill', fmtPKR(calcResult.totalLDAfterCap), calcResult.capReached ? 'var(--red-light)' : 'var(--green-light)'],
                        ['Balance LD Capacity', fmtPKR(Math.max(0, calcResult.maxLD - calcResult.newTotalLD)), 'white'],
                      ].map(([label, value, bg]) => (
                        <tr key={label} style={{ background: bg }}>
                          <td style={{ padding: '6px 10px', borderBottom: '1px solid var(--gray-200)' }}>{label}</td>
                          <td style={{ padding: '6px 10px', textAlign: 'right', borderBottom: '1px solid var(--gray-200)', fontFamily: 'monospace' }}>{value}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {calcResult.capReached && <div className="alert alert-warning" style={{ marginTop: 8 }}>⚠️ <strong>Maximum LD cap reached</strong> — Only Rs. {fmtPKR(calcResult.totalLDAfterCap)} deducted.</div>}
                </div>
                {calcResult.effDate && <div className="alert alert-info" style={{ marginBottom: 12 }}>📅 Effective Delivery Date: <strong>{calcResult.effDate.date}</strong> — {calcResult.effDate.reason}</div>}
                <table style={{ width: '100%', maxWidth: 480, fontSize: 13 }}>
                  <tbody>
                    <tr><td style={{ padding: '7px 0', color: 'var(--gray-500)' }}>Total Bill Amount (Ex-GST)</td><td className="text-right font-mono">Rs. {fmtPKR(calcResult.totalBillAmount)}</td></tr>
                    {calcResult.totalLDAfterCap > 0 && <tr><td style={{ padding: '7px 0', color: 'var(--red)' }}>(-) LD Deduction</td><td className="text-right font-mono" style={{ color: 'var(--red)' }}>Rs. {fmtPKR(calcResult.totalLDAfterCap)}</td></tr>}
                    <tr>
                      <td style={{ padding: '7px 0', color: 'var(--gray-500)' }}>(-) WHT @ {whtInfo.rate}% {whtInfo.isExemption && <span className="badge badge-green" style={{ marginLeft: 8 }}>Cert: {whtInfo.certNo}</span>}</td>
                      <td className="text-right font-mono">Rs. {fmtPKR(calcResult.whtAmount)}</td>
                    </tr>
                    <tr style={{ borderTop: '2px solid var(--gray-200)' }}>
                      <td style={{ padding: '10px 0', fontWeight: 700, fontSize: 15 }}>Net Payable</td>
                      <td className="text-right font-mono" style={{ fontWeight: 700, fontSize: 15, color: 'var(--green)' }}>Rs. {fmtPKR(calcResult.netPayable)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="flex gap-2">
            <button className="btn btn-primary" onClick={save} disabled={!calcResult || saving}>{saving ? 'Saving...' : calcResult ? 'Save Bill' : 'Calculate First'}</button>
            <button className="btn btn-secondary" onClick={onCancel}>Cancel</button>
          </div>
        </>
      )}
    </div>
  )
}
