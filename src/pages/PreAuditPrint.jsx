import { useState, useEffect, useRef } from 'react'
import { db } from '../store'
import { fmtPKR, todayStr } from '../utils/calculations'

export default function PreAuditPrint({ billId, navigate }) {
  const [bill, setBill] = useState(null)
  const [po, setPO] = useState(null)
  const [supplier, setSupplier] = useState(null)
  const [grns, setGRNs] = useState([])
  const [grnItems, setGRNItems] = useState({}) // { grnId: [items] }
  const [poItems, setPOItems] = useState([])
  const [bal, setBal] = useState(null)
  const [selectedBillId, setSelectedBillId] = useState(billId || '')
  const [allBills, setAllBills] = useState([])
  const [allPOs, setAllPOs] = useState([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    async function load() {
      const [bills, pos] = await Promise.all([db.getAllBills(), db.getPOs()])
      setAllBills(bills); setAllPOs(pos)
    }
    load()
  }, [])

  useEffect(() => {
    if (!selectedBillId) return
    loadBill(selectedBillId)
  }, [selectedBillId])

  async function loadBill(id) {
    setLoading(true)
    const b = await db.getBill(id)
    setBill(b)
    const p = await db.getPO(b?.po_id)
    setPO(p)
    const [sup, grnList, items, balance] = await Promise.all([
      db.getSupplier(p?.supplier_id),
      db.getGRNs(id),
      db.getPOItems(p?.id),
      db.getPOBalance(p?.id),
    ])
    setSupplier(sup)
    setGRNs(grnList)
    setPOItems(items)
    setBal(balance)
    // Load GRN items for each GRN
    const grnItemsMap = {}
    for (const grn of grnList) {
      grnItemsMap[grn.id] = await db.getGRNItems(grn.id)
    }
    setGRNItems(grnItemsMap)
    setLoading(false)
  }

  if (!selectedBillId) {
    return (
      <div className="card" style={{ maxWidth: 500 }}>
        <div className="card-header"><span className="card-title">Select Bill to Print</span></div>
        <div className="card-body">
          <div className="field">
            <label>Select Supply Bill</label>
            <select value={selectedBillId} onChange={e => setSelectedBillId(e.target.value)}>
              <option value="">Choose bill...</option>
              {allBills.map(b => {
                const po = allPOs.find(p => p.id === b.po_id)
                return <option key={b.id} value={b.id}>{po?.po_number} — Bill {b.bill_number} ({b.bill_date})</option>
              })}
            </select>
          </div>
        </div>
      </div>
    )
  }

  if (loading || !bill || !po) return <div className="text-muted" style={{ padding: 32 }}>Loading...</div>

  const maxLD = (po.grand_total || 0) * (po.ld_max_cap_pct || 10) / 100
  const budgetStatement = (po.budget_heads || []).filter(h => h.pct > 0).map(h => `${h.head} ${h.pct}%`).join(', ') || '—'
  const totalPOQty = poItems.reduce((s, i) => s + (i.total_qty || 0), 0)

  return (
    <div>
      {/* TOP BAR */}
      <div className="flex gap-2 mb-4 no-print">
        <button className="btn btn-secondary btn-sm" onClick={() => navigate('supply-bills')}>← Back</button>
        <select value={selectedBillId} onChange={e => setSelectedBillId(e.target.value)}
          style={{ padding: '6px 10px', border: '1px solid var(--gray-300)', borderRadius: 6, fontSize: 13, minWidth: 300 }}>
          {allBills.map(b => {
            const p = allPOs.find(p => p.id === b.po_id)
            return <option key={b.id} value={b.id}>{p?.po_number} — Bill {b.bill_number} ({b.bill_date})</option>
          })}
        </select>
        <button className="btn btn-primary" onClick={() => window.print()}>🖨️ Print</button>
      </div>

      {/* PRINT SHEET */}
      <div className="print-sheet" style={{ background: 'white', padding: 32, maxWidth: 950, margin: '0 auto', border: '1px solid var(--gray-200)', borderRadius: 8 }}>

        {/* HEADER */}
        <div style={{ textAlign: 'center', borderBottom: '2px solid #000', paddingBottom: 12, marginBottom: 20 }}>
          <div style={{ fontSize: 16, fontWeight: 700, letterSpacing: 1 }}>LAHORE ELECTRIC SUPPLY COMPANY</div>
          <div style={{ fontSize: 13, fontWeight: 600 }}>Material Management Directorate</div>
          <div style={{ fontSize: 12, marginTop: 4, color: '#444' }}>22-A, Queens Road, Lahore | PH: 99204842</div>
          <div style={{ fontSize: 14, fontWeight: 700, marginTop: 12, textDecoration: 'underline' }}>PRE-AUDIT SHEET — SUPPLY BILL</div>
          <div style={{ fontSize: 12, marginTop: 4 }}>Account Head (350105)</div>
        </div>

        {/* PO INFO */}
        <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse', marginBottom: 16 }}>
          <tbody>
            <tr>
              <td style={tdL}>Purchase Order No:</td><td style={tdR}><strong>{po.po_number}</strong></td>
              <td style={tdL}>PO Date:</td><td style={tdR}>{po.po_date}</td>
            </tr>
            <tr>
              <td style={tdL}>Supplier Name:</td><td style={tdR}><strong>{supplier?.name}</strong></td>
              <td style={tdL}>NTN:</td><td style={tdR}>{supplier?.ntn || '—'}</td>
            </tr>
            <tr>
              <td style={tdL}>Tender No:</td><td style={tdR}>{po.tender_no || '—'}</td>
              <td style={tdL}>Payment Method:</td><td style={tdR}>{po.payment_method === 'lc' ? 'Letter of Credit' : 'Cheque'}</td>
            </tr>
            <tr>
              <td style={tdL}>Budget / Functional Head:</td><td colSpan={3} style={tdR}>{budgetStatement}</td>
            </tr>
            <tr>
              <td style={tdL}>PO Amount (Ex-GST):</td><td style={tdR}>Rs. {fmtPKR(po.total_amount_ex_gst)}</td>
              <td style={tdL}>GST @ {po.gst_rate}%:</td><td style={tdR}>Rs. {fmtPKR(po.gst_amount)}</td>
            </tr>
            <tr>
              <td style={tdL}>Grand Total (incl. GST):</td><td style={{ ...tdR, fontWeight: 700 }}>Rs. {fmtPKR(po.grand_total)}</td>
              <td style={tdL}>Max LD (10%):</td><td style={tdR}>Rs. {fmtPKR(maxLD)}</td>
            </tr>
          </tbody>
        </table>

        {/* PO ITEMS */}
        <table style={{ width: '100%', fontSize: 11, borderCollapse: 'collapse', marginBottom: 16 }}>
          <thead>
            <tr style={{ background: '#f0f0f0' }}>
              <th style={th}>#</th><th style={th}>Product / Material</th><th style={th}>UOM</th>
              <th style={{ ...th, textAlign: 'right' }}>Unit Rate</th>
              <th style={{ ...th, textAlign: 'right' }}>PO Qty</th>
              <th style={{ ...th, textAlign: 'right' }}>Amount (Ex-GST)</th>
            </tr>
          </thead>
          <tbody>
            {poItems.map((item, i) => (
              <tr key={item.id}>
                <td style={td}>{i + 1}</td>
                <td style={td}>{item.product_name}</td>
                <td style={td}>{item.unit_of_measure}</td>
                <td style={{ ...td, textAlign: 'right' }}>Rs. {fmtPKR(item.unit_rate)}</td>
                <td style={{ ...td, textAlign: 'right' }}>{item.total_qty?.toLocaleString()}</td>
                <td style={{ ...td, textAlign: 'right' }}>Rs. {fmtPKR(item.unit_rate * item.total_qty)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* PERFORMANCE GUARANTEE */}
        <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse', marginBottom: 16 }}>
          <thead><tr><th colSpan={4} style={{ background: '#f0f0f0', padding: '6px 8px', textAlign: 'left', border: '1px solid #ccc' }}>Performance Guarantee</th></tr></thead>
          <tbody>
            <tr>
              <td style={tdL}>PG Amount:</td><td style={tdR}>Rs. {fmtPKR(po.pg_amount)}</td>
              <td style={tdL}>Bank Guarantee No:</td><td style={tdR}>{po.pg_bank_guarantee_no || '—'}</td>
            </tr>
            <tr>
              <td style={tdL}>Valid Till:</td><td style={tdR}>{po.pg_validity_to || '—'}</td>
              <td style={tdL}>PG Status:</td>
              <td style={{ ...tdR, fontWeight: 700, color: bill.pg_valid ? 'green' : 'red' }}>
                {bill.pg_valid === true ? '✅ Valid' : bill.pg_valid === false ? '⚠️ Expired' : '—'}
              </td>
            </tr>
          </tbody>
        </table>

        {/* BILL & INSPECTION DETAILS */}
        <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse', marginBottom: 16 }}>
          <thead><tr><th colSpan={4} style={{ background: '#f0f0f0', padding: '6px 8px', textAlign: 'left', border: '1px solid #ccc' }}>Bill & Inspection Details</th></tr></thead>
          <tbody>
            <tr>
              <td style={tdL}>Bill Number:</td><td style={tdR}><strong>{bill.bill_number}</strong></td>
              <td style={tdL}>Bill Date:</td><td style={tdR}><strong>{bill.bill_date}</strong></td>
            </tr>
            <tr>
              <td style={tdL}>IC Number:</td><td style={tdR}>{bill.ic_number || '—'}</td>
              <td style={tdL}>IC Date:</td><td style={tdR}>{bill.ic_date || '—'}</td>
            </tr>
            <tr>
              <td style={tdL}>Inspection Call Date:</td><td style={tdR}>{bill.call_date || '—'}</td>
              <td style={tdL}>Sample Collection Date:</td><td style={tdR}>{bill.sample_collection_date || '—'}</td>
            </tr>
            <tr>
              <td style={tdL}>Inspection Completion:</td><td style={tdR}>{bill.inspection_completion_date || '—'}</td>
              <td style={tdL}>Effective Delivery Date:</td><td style={{ ...tdR, fontWeight: 600 }}>{bill.eff_delivery_date || '—'}</td>
            </tr>
            <tr>
              <td style={tdL}>LD Basis:</td><td colSpan={3} style={tdR}>{bill.eff_delivery_reason || '—'}</td>
            </tr>
            <tr>
              <td style={tdL}>Challan Number:</td><td style={tdR}>{bill.challan_number || '—'}</td>
              <td style={tdL}>Challan Date:</td><td style={tdR}>{bill.challan_date || '—'}</td>
            </tr>
            <tr>
              <td style={tdL}>WHT Rate:</td><td style={tdR}>{bill.wht_rate_applied}% {bill.wht_cert_no ? `(Cert: ${bill.wht_cert_no})` : ''}</td>
              <td style={tdL}>Supplier Type:</td><td style={tdR}>{supplier?.type === 'company' ? 'Company' : 'Individual'}</td>
            </tr>
          </tbody>
        </table>

        {/* GRN TABLE */}
        {grns.map((grn, gi) => {
          const items = grnItems[grn.id] || []
          return (
            <div key={grn.id} style={{ marginBottom: 16 }}>
              <table style={{ width: '100%', fontSize: 11, borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: '#e8e8e8' }}>
                    <th colSpan={8} style={{ ...th, textAlign: 'left' }}>
                      GRN #{gi + 1}: {grn.grn_number} | Date: {grn.grn_date} | Store: {grn.consignee_store || '—'}
                    </th>
                  </tr>
                  <tr style={{ background: '#f0f0f0' }}>
                    <th style={th}>Product</th>
                    <th style={th}>Promised Date</th>
                    <th style={th}>Eff. Delivery</th>
                    <th style={{ ...th, textAlign: 'right' }}>Qty</th>
                    <th style={{ ...th, textAlign: 'right' }}>Amount</th>
                    <th style={th}>Delay</th>
                    <th style={{ ...th, textAlign: 'right' }}>LD (Rs.)</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item, ii) => (
                    <tr key={ii}>
                      <td style={td}>{item.description}</td>
                      <td style={td}>{item.promised_date}</td>
                      <td style={td}>{item.eff_delivery_date || '—'}</td>
                      <td style={{ ...td, textAlign: 'right' }}>{item.qty_delivered?.toLocaleString()}</td>
                      <td style={{ ...td, textAlign: 'right' }}>Rs. {fmtPKR(item.amount)}</td>
                      <td style={{ ...td, color: item.is_late ? 'red' : 'green' }}>
                        {item.is_late ? `${item.delay_days}d (${item.delay_months}mo)` : 'On time ✅'}
                      </td>
                      <td style={{ ...td, textAlign: 'right', color: item.ld_capped > 0 ? 'red' : 'inherit' }}>
                        {item.ld_capped > 0 ? `Rs. ${fmtPKR(item.ld_capped)}` : '—'}
                      </td>
                    </tr>
                  ))}
                  <tr style={{ background: '#f9f9f9', fontWeight: 700 }}>
                    <td colSpan={3} style={{ ...td, textAlign: 'right' }}>GRN Total</td>
                    <td style={{ ...td, textAlign: 'right' }}>{items.reduce((s, i) => s + (i.qty_delivered || 0), 0).toLocaleString()}</td>
                    <td style={{ ...td, textAlign: 'right' }}>Rs. {fmtPKR(grn.total_amount)}</td>
                    <td style={td}></td>
                    <td style={{ ...td, textAlign: 'right', color: 'red' }}>{grn.total_ld_capped > 0 ? `Rs. ${fmtPKR(grn.total_ld_capped)}` : '—'}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          )
        })}

        {/* CALCULATION */}
        <table style={{ width: '50%', marginLeft: 'auto', fontSize: 12, borderCollapse: 'collapse', marginBottom: 24 }}>
          <thead><tr><th colSpan={2} style={{ background: '#f0f0f0', padding: '6px 8px', textAlign: 'left', border: '1px solid #ccc' }}>Pre-Audit Calculation</th></tr></thead>
          <tbody>
            <Row label="Bill Amount (Ex-GST)" value={`Rs. ${fmtPKR(bill.total_bill_amount)}`} />
            {bill.total_ld > 0 && <Row label={`(-) LD @ ${po.ld_rate}%/month`} value={`Rs. ${fmtPKR(bill.total_ld)}`} color="red" />}
            <Row label={`(-) WHT @ ${bill.wht_rate_applied}%${bill.wht_cert_no ? ` (${bill.wht_cert_no})` : ''}`} value={`Rs. ${fmtPKR(bill.wht_amount)}`} color="red" />
            <tr style={{ borderTop: '2px solid #000' }}>
              <td style={{ padding: '8px', fontWeight: 700, fontSize: 13 }}>Net Payable Amount</td>
              <td style={{ padding: '8px', fontWeight: 700, fontSize: 13, textAlign: 'right', color: 'green' }}>Rs. {fmtPKR(bill.net_payable)}</td>
            </tr>
          </tbody>
        </table>

        {/* LD SUMMARY TABLE */}
        <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse', marginBottom: 24 }}>
          <thead><tr><th colSpan={4} style={{ background: '#f0f0f0', padding: '6px 8px', textAlign: 'left', border: '1px solid #ccc' }}>LD Summary — This PO</th></tr></thead>
          <tbody>
            <tr>
              <td style={tdL}>Total LD Under This PO:</td><td style={tdR}>Rs. {fmtPKR(maxLD)}</td>
              <td style={tdL}>LD Already Deducted:</td><td style={{ ...tdR, color: 'red' }}>Rs. {fmtPKR((bal?.total_ld_charged || 0))}</td>
            </tr>
            <tr>
              <td style={tdL}>Now Deducted (This Bill):</td><td style={{ ...tdR, color: 'red' }}>Rs. {fmtPKR(bill.total_ld)}</td>
              <td style={tdL}>Balance LD Capacity:</td><td style={{ ...tdR, color: 'green', fontWeight: 700 }}>Rs. {fmtPKR(bal?.remaining_ld_capacity || 0)}</td>
            </tr>
          </tbody>
        </table>

        {/* PO BALANCE */}
        {bal && (
          <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse', marginBottom: 24 }}>
            <thead><tr><th colSpan={4} style={{ background: '#f0f0f0', padding: '6px 8px', textAlign: 'left', border: '1px solid #ccc' }}>PO Balance After This Bill</th></tr></thead>
            <tbody>
              <tr>
                <td style={tdL}>Total PO Qty:</td><td style={tdR}>{bal.po_qty?.toLocaleString()}</td>
                <td style={tdL}>Delivered so far:</td><td style={tdR}>{bal.delivered_qty?.toLocaleString()}</td>
              </tr>
              <tr>
                <td style={tdL}>Balance Qty:</td><td style={{ ...tdR, fontWeight: 700, color: 'green' }}>{bal.balance_qty?.toLocaleString()}</td>
                <td style={tdL}>Balance Amount:</td><td style={{ ...tdR, fontWeight: 700, color: 'green' }}>Rs. {fmtPKR(bal.balance_amount)}</td>
              </tr>
              <tr>
                <td style={tdL}>Total Bills:</td><td style={tdR}>{bal.total_bills}</td>
                <td style={tdL}>Max LD Allowed:</td><td style={tdR}>Rs. {fmtPKR(bal.max_ld_allowed)}</td>
              </tr>
            </tbody>
          </table>
        )}

        {/* SIGNATURES */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 40, marginTop: 48 }}>
          {['Prepared By\n(Accounts Assistant)', 'Verified By\n(Accounts Officer)', 'Approved By\n(Dy. Manager Operation)'].map((label, i) => (
            <div key={i} style={{ textAlign: 'center' }}>
              <div style={{ borderTop: '1px solid #000', paddingTop: 6, fontSize: 11 }}>
                {label.split('\n').map((l, j) => <div key={j}>{l}</div>)}
              </div>
            </div>
          ))}
        </div>

        <div style={{ textAlign: 'center', marginTop: 20, fontSize: 10, color: '#888', borderTop: '1px solid #ddd', paddingTop: 8 }}>
          Generated by LESCO Pre-Audit System · {todayStr()} · PO# {po.po_number}
        </div>
      </div>
    </div>
  )
}

const tdL = { padding: '5px 8px', border: '1px solid #ddd', color: '#555', width: '20%' }
const tdR = { padding: '5px 8px', border: '1px solid #ddd', width: '30%' }
const th = { padding: '6px 8px', border: '1px solid #ccc', textAlign: 'left' }
const td = { padding: '5px 8px', border: '1px solid #ddd' }

function Row({ label, value, color }) {
  return (
    <tr>
      <td style={{ padding: '6px 8px', border: '1px solid #ddd', color: color || 'inherit' }}>{label}</td>
      <td style={{ padding: '6px 8px', border: '1px solid #ddd', textAlign: 'right', fontFamily: 'monospace', color: color || 'inherit' }}>{value}</td>
    </tr>
  )
}
