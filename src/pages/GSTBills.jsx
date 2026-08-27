import { useState, useEffect } from 'react'
import { db } from '../store'
import { getWHTRateToday, fmtPKR, todayStr } from '../utils/calculations'

export default function GSTBills({ navigate }) {
  const [view, setView] = useState('list')
  const [allGSTBills, setAllGSTBills] = useState([])
  const [pos, setPOs] = useState([])
  const [suppliers, setSuppliers] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    const [g, p, s] = await Promise.all([db.getAllGSTBills(), db.getPOs(), db.getSuppliers()])
    setAllGSTBills(g); setPOs(p); setSuppliers(s); setLoading(false)
  }

  if (view === 'new') return <GSTBillForm onSave={() => { load(); setView('list') }} onCancel={() => setView('list')} />
  if (loading) return <div className="text-muted" style={{ padding: 32 }}>Loading...</div>

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <span className="text-muted text-sm">GST bills created against processed supply bill GRNs</span>
        <button className="btn btn-primary" onClick={() => setView('new')}>+ New GST Bill</button>
      </div>
      <div className="card">
        <div className="table-wrap">
          <table>
            <thead><tr><th>GST Bill No</th><th>Date</th><th>PO No</th><th>Supplier</th><th className="text-right">GST Amount</th><th className="text-right">LD on GST</th><th className="text-right">1/5th</th><th className="text-right">WHT</th><th className="text-right">Net Payable</th></tr></thead>
            <tbody>
              {allGSTBills.length === 0 && <tr><td colSpan={9} className="text-center text-muted" style={{ padding: 32 }}>No GST bills yet.</td></tr>}
              {allGSTBills.map(g => {
                const po = pos.find(p => p.id === g.po_id)
                const sup = suppliers.find(s => s.id === po?.supplier_id)
                return (
                  <tr key={g.id}>
                    <td><strong>{g.gst_bill_number}</strong></td>
                    <td>{g.gst_bill_date}</td>
                    <td>{po?.po_number}</td>
                    <td style={{ maxWidth: 130, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{sup?.name}</td>
                    <td className="text-right font-mono">{fmtPKR(g.gst_amount)}</td>
                    <td className="text-right font-mono" style={{ color: g.ld_on_gst > 0 ? 'var(--red)' : 'inherit' }}>{g.ld_on_gst > 0 ? fmtPKR(g.ld_on_gst) : '—'}</td>
                    <td className="text-right font-mono" style={{ color: 'var(--red)' }}>{fmtPKR(g.deduction_1_5th)}</td>
                    <td className="text-right font-mono">{fmtPKR(g.wht_amount)}</td>
                    <td className="text-right font-mono"><strong>{fmtPKR(g.net_payable)}</strong></td>
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

function GSTBillForm({ onSave, onCancel }) {
  const [poQuery, setPOQuery] = useState('')
  const [poResults, setPOResults] = useState([])
  const [selectedPO, setSelectedPO] = useState(null)
  const [supplier, setSupplier] = useState(null)
  const [whtInfo, setWhtInfo] = useState({ rate: 0, isExemption: false })
  const [gstBillNo, setGSTBillNo] = useState('')
  const [gstBillDate, setGSTBillDate] = useState('')
  const [availableGRNs, setAvailableGRNs] = useState([])
  const [selectedGRNIds, setSelectedGRNIds] = useState([])
  const [calcResult, setCalcResult] = useState(null)
  const [saving, setSaving] = useState(false)

  async function searchPO(q) {
    setPOQuery(q)
    if (q.length < 2) { setPOResults([]); return }
    const results = await db.searchPOs(q)
    const withBills = await Promise.all(results.map(async po => {
      const bills = await db.getBills(po.id)
      return bills.length > 0 ? po : null
    }))
    setPOResults(withBills.filter(Boolean))
  }

  async function loadPO(po) {
    setSelectedPO(po)
    const [sup, exms] = await Promise.all([db.getSupplier(po.supplier_id), db.getExemptions(po.supplier_id)])
    setSupplier(sup)
    setWhtInfo(getWHTRateToday(sup, exms))
    setPOResults([]); setPOQuery('')
    const alreadyLinked = await db.getGRNsLinkedToGST(po.id)
    const bills = await db.getBills(po.id)
    const grns = []
    for (const bill of bills) {
      const billGRNs = await db.getGRNs(bill.id)
      billGRNs.forEach(grn => {
        if (!alreadyLinked.includes(grn.id)) grns.push({ ...grn, bill_number: bill.bill_number, bill_date: bill.bill_date })
      })
    }
    setAvailableGRNs(grns); setSelectedGRNIds([]); setCalcResult(null)
  }

  function toggleGRN(grnId) { setSelectedGRNIds(ids => ids.includes(grnId) ? ids.filter(i => i !== grnId) : [...ids, grnId]); setCalcResult(null) }

  async function calculate() {
    if (!selectedPO || selectedGRNIds.length === 0) return
    let totalSupplyAmount = 0, totalLDActuallyDeducted = 0
    const grnDetails = []
    for (const grnId of selectedGRNIds) {
      const grn = availableGRNs.find(g => g.id === grnId)
      if (!grn) continue
      const grnItems = await db.getGRNItems(grnId)
      totalSupplyAmount += grn.total_amount || 0
      totalLDActuallyDeducted += grn.total_ld_capped || 0
      grnDetails.push({ grnId, grn_number: grn.grn_number, amount: grn.total_amount, ld_deducted: grn.total_ld_capped, items: grnItems })
    }
    const gstAmount = Math.round(totalSupplyAmount * 0.18)
    const ldOnGST = Math.round(totalLDActuallyDeducted * 0.18)
    const deduction1_5th = 0
    const whtAmount = Math.round(gstAmount * whtInfo.rate / 100)
    const netPayable = gstAmount - ldOnGST - whtAmount
    setCalcResult({ grnDetails, totalSupplyAmount, gstAmount, ldOnGST, deduction1_5th, whtAmount, netPayable, totalLDActuallyDeducted })
  }

  async function save() {
    if (!calcResult || !selectedPO) return
    setSaving(true)
    try {
      await db.saveGSTBill({
        po_id: selectedPO.id, gst_bill_number: gstBillNo, gst_bill_date: gstBillDate,
        gst_amount: calcResult.gstAmount, ld_on_gst: calcResult.ldOnGST,
        deduction_1_5th: 0,
        wht_cert_no: whtInfo.certNo, wht_amount: calcResult.whtAmount, net_payable: calcResult.netPayable,
      }, selectedGRNIds)
      onSave()
    } catch (err) { alert('Error: ' + err.message) }
    setSaving(false)
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <button className="btn btn-secondary btn-sm" onClick={onCancel}>← Back</button>
        <div style={{ fontSize: 12, color: 'var(--gray-500)' }}>Pre-Audit Date: <strong>{todayStr()}</strong></div>
      </div>

      {!selectedPO ? (
        <div className="card mb-4">
          <div className="card-header"><span className="card-title">Search Purchase Order</span></div>
          <div className="card-body">
            <div className="alert alert-info" style={{ marginBottom: 12 }}>Only POs with processed supply bills will appear.</div>
            <div className="field" style={{ maxWidth: 400 }}>
              <label>Search by PO Number or Supplier</label>
              <input value={poQuery} onChange={e => searchPO(e.target.value)} placeholder="Type PO number or supplier..." />
            </div>
            {poResults.length > 0 && (
              <div style={{ marginTop: 8, border: '1px solid var(--gray-200)', borderRadius: 6, overflow: 'hidden', maxWidth: 500 }}>
                {poResults.map(po => (
                  <div key={po.id} onClick={() => loadPO(po)}
                    style={{ padding: '10px 14px', cursor: 'pointer', borderBottom: '1px solid var(--gray-100)' }}
                    onMouseEnter={e => e.currentTarget.style.background = 'var(--accent-light)'}
                    onMouseLeave={e => e.currentTarget.style.background = 'white'}>
                    <div style={{ fontWeight: 700 }}>{po.po_number}</div>
                    <div style={{ fontSize: 12, color: 'var(--gray-500)' }}>Grand Total: Rs. {fmtPKR(po.grand_total)}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      ) : (
        <>
          <div className="card mb-4">
            <div className="card-header">
              <span className="card-title">GST Bill — PO: {selectedPO.po_number}</span>
              <button className="btn btn-secondary btn-sm" onClick={() => setSelectedPO(null)}>Change PO</button>
            </div>
            <div className="card-body">
              <div className={`alert ${whtInfo.isExemption ? 'alert-success' : 'alert-info'}`} style={{ marginBottom: 16 }}>
                <strong>WHT Rate Today: {whtInfo.rate}%</strong>{whtInfo.isExemption ? ` — Cert: ${whtInfo.certNo}` : ' — Default rate'}
              </div>
              <div className="form-grid">
                <div className="field"><label>GST Bill Number *</label><input required value={gstBillNo} onChange={e => { setGSTBillNo(e.target.value); setCalcResult(null) }} /></div>
                <div className="field"><label>GST Bill Date *</label><input type="date" required value={gstBillDate} onChange={e => { setGSTBillDate(e.target.value); setCalcResult(null) }} /></div>
              </div>
            </div>
          </div>

          <div className="card mb-4">
            <div className="card-header"><span className="card-title">Select GRNs</span></div>
            <div className="card-body">
              {availableGRNs.length === 0 && <div className="alert alert-warning">No unlinked GRNs available.</div>}
              {availableGRNs.map(grn => {
                const isSelected = selectedGRNIds.includes(grn.id)
                return (
                  <div key={grn.id} onClick={() => toggleGRN(grn.id)}
                    style={{ border: `1px solid ${isSelected ? 'var(--accent)' : 'var(--gray-200)'}`, borderRadius: 8, padding: 12, marginBottom: 8, cursor: 'pointer', background: isSelected ? 'var(--accent-light)' : 'white' }}>
                    <div className="flex justify-between items-center">
                      <div>
                        <span style={{ fontWeight: 700 }}>GRN: {grn.grn_number}</span>
                        <span style={{ marginLeft: 12, fontSize: 12, color: 'var(--gray-500)' }}>Bill: {grn.bill_number} · {grn.grn_date}</span>
                      </div>
                      <div className="flex gap-3 items-center">
                        <div style={{ textAlign: 'right' }}>
                          <div style={{ fontSize: 11, color: 'var(--gray-500)' }}>Supply Amount</div>
                          <div className="font-mono" style={{ fontSize: 13 }}>Rs. {fmtPKR(grn.total_amount)}</div>
                        </div>
                        {grn.total_ld_capped > 0 && (
                          <div style={{ textAlign: 'right' }}>
                            <div style={{ fontSize: 11, color: 'var(--red)' }}>LD Deducted</div>
                            <div className="font-mono" style={{ fontSize: 13, color: 'var(--red)' }}>Rs. {fmtPKR(grn.total_ld_capped)}</div>
                          </div>
                        )}
                        <div style={{ fontSize: 20, color: isSelected ? 'var(--accent)' : 'var(--gray-300)' }}>{isSelected ? '☑' : '☐'}</div>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          <div className="card mb-4">
            <div className="card-header">
              <span className="card-title">GST Calculation</span>
              <button type="button" className="btn btn-secondary" onClick={calculate} disabled={selectedGRNIds.length === 0}>↻ Calculate</button>
            </div>
            {calcResult && (
              <div className="card-body">
                <table style={{ width: '100%', maxWidth: 500, fontSize: 13 }}>
                  <tbody>
                    <tr><td style={{ padding: '7px 0', color: 'var(--gray-500)' }}>Total Supply Amount</td><td className="text-right font-mono">Rs. {fmtPKR(calcResult.totalSupplyAmount)}</td></tr>
                    <tr><td style={{ padding: '7px 0', color: 'var(--gray-500)' }}>GST @ 18%</td><td className="text-right font-mono">Rs. {fmtPKR(calcResult.gstAmount)}</td></tr>
                                        {calcResult.ldOnGST > 0 && <tr><td style={{ padding: '7px 0', color: 'var(--red)' }}>(-) LD on GST (18% of Rs. {fmtPKR(calcResult.totalLDActuallyDeducted)})</td><td className="text-right font-mono" style={{ color: 'var(--red)' }}>Rs. {fmtPKR(calcResult.ldOnGST)}</td></tr>}
                    <tr><td style={{ padding: '7px 0', color: 'var(--gray-500)' }}>(-) WHT @ {whtInfo.rate}% {whtInfo.isExemption && <span className="badge badge-green" style={{ marginLeft: 8 }}>Cert: {whtInfo.certNo}</span>}</td><td className="text-right font-mono">Rs. {fmtPKR(calcResult.whtAmount)}</td></tr>
                    <tr style={{ borderTop: '2px solid var(--gray-200)' }}>
                      <td style={{ padding: '10px 0', fontWeight: 700, fontSize: 15 }}>Net GST Payable</td>
                      <td className="text-right font-mono" style={{ fontWeight: 700, fontSize: 15, color: 'var(--green)' }}>Rs. {fmtPKR(calcResult.netPayable)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="flex gap-2">
            <button className="btn btn-primary" onClick={save} disabled={!calcResult || saving}>{saving ? 'Saving...' : calcResult ? 'Save GST Bill' : 'Calculate First'}</button>
            <button className="btn btn-secondary" onClick={onCancel}>Cancel</button>
          </div>
        </>
      )}
    </div>
  )
}
