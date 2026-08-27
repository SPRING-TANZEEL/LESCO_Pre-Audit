import { useState, useEffect } from 'react'
import { db } from '../store'
import { fmtPKR } from '../utils/calculations'

// ── PRINT CSS ─────────────────────────────────────────────────────────────
const PRINT_CSS = `
@media print {
  body * { visibility: hidden; }
  #print-area, #print-area * { visibility: visible; }
  #print-area { position: absolute; left: 0; top: 0; width: 100%; }
  .no-print { display: none !important; }
  * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
  @page { margin: 10mm; size: A4; }
}
`

// ── SELECTOR PAGE ─────────────────────────────────────────────────────────
export default function PreAuditPrint({ billId, navigate }) {
  const [allBills, setAllBills] = useState([])
  const [allPOs, setAllPOs] = useState([])
  const [selectedPOId, setSelectedPOId] = useState('')
  const [poBills, setPOBills] = useState([])
  const [selectedBillIds, setSelectedBillIds] = useState(billId ? [billId] : [])
  const [sheetData, setSheetData] = useState(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    const style = document.createElement('style')
    style.innerHTML = PRINT_CSS
    document.head.appendChild(style)
    return () => document.head.removeChild(style)
  }, [])

  useEffect(() => {
    async function load() {
      const [bills, pos] = await Promise.all([db.getAllBills(), db.getPOs()])
      setAllBills(bills); setAllPOs(pos)
      if (billId) {
        const b = bills.find(b => b.id === billId)
        if (b) { setSelectedPOId(b.po_id); setPOBills(bills.filter(x => x.po_id === b.po_id)) }
      }
    }
    load()
  }, [])

  async function onPOSelect(poId) {
    setSelectedPOId(poId); setSelectedBillIds([]); setSheetData(null)
    setPOBills(allBills.filter(b => b.po_id === poId))
  }

  function toggleBill(id) {
    setSelectedBillIds(ids => ids.includes(id) ? ids.filter(i => i !== id) : [...ids, id].slice(0, 3))
    setSheetData(null)
  }

  async function generate() {
    if (!selectedPOId || selectedBillIds.length === 0) return
    setLoading(true)
    const po = await db.getPO(selectedPOId)
    const supplier = await db.getSupplier(po.supplier_id)
    const poItems = await db.getPOItems(selectedPOId)
    const schedules = await db.getSchedules(selectedPOId)
    const bal = await db.getPOBalance(selectedPOId)
    const billsData = []
    for (const bid of selectedBillIds) {
      const bill = await db.getBill(bid)
      const grns = await db.getGRNs(bid)
      const grnsFull = []
      for (const grn of grns) {
        const items = await db.getGRNItems(grn.id)
        grnsFull.push({ ...grn, items })
      }
      billsData.push({ bill, grns: grnsFull })
    }
    setSheetData({ po, supplier, poItems, schedules, bal, billsData })
    setLoading(false)
  }

  if (sheetData) return <Sheet data={sheetData} onBack={() => setSheetData(null)} />

  return (
    <div>
      <div className="card" style={{ maxWidth: 580 }}>
        <div className="card-header"><span className="card-title">Pre-Audit Sheet — Voucher Calculation</span></div>
        <div className="card-body">
          <div className="field" style={{ marginBottom: 16 }}>
            <label>Purchase Order</label>
            <select value={selectedPOId} onChange={e => onPOSelect(e.target.value)}>
              <option value="">Select PO...</option>
              {allPOs.map(po => <option key={po.id} value={po.id}>{po.po_number} — {po.po_date}</option>)}
            </select>
          </div>
          {poBills.length > 0 && (
            <div className="field" style={{ marginBottom: 16 }}>
              <label>Select Bills to Print (max 3)</label>
              <div style={{ fontSize: 12, color: 'var(--gray-500)', marginBottom: 8 }}>Each selected bill appears as a separate column.</div>
              {poBills.map(b => (
                <label key={b.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 0', cursor: 'pointer', borderBottom: '1px solid var(--gray-100)' }}>
                  <input type="checkbox" checked={selectedBillIds.includes(b.id)} onChange={() => toggleBill(b.id)}
                    disabled={!selectedBillIds.includes(b.id) && selectedBillIds.length >= 3} />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 600 }}>{b.bill_number}</div>
                    <div style={{ fontSize: 11, color: 'var(--gray-500)' }}>{b.bill_date}</div>
                  </div>
                  <div style={{ fontSize: 12, fontFamily: 'monospace' }}>Rs. {fmtPKR(b.total_bill_amount)}</div>
                  <span className={`badge badge-${b.status === 'verified' ? 'green' : 'amber'}`}>{b.status}</span>
                </label>
              ))}
            </div>
          )}
          <div className="flex gap-2">
            <button className="btn btn-primary" onClick={generate} disabled={selectedBillIds.length === 0 || loading}>
              {loading ? 'Generating...' : '→ Generate Sheet'}
            </button>
            <button className="btn btn-secondary" onClick={() => navigate('supply-bills')}>← Back</button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── COLORS (preserved on print) ───────────────────────────────────────────
const C = {
    blue: '#4a7ab5',
  lightBlue: '#f0f5fb',
  red: '#cc0000',
  green: '#15803d',
  amber: '#b45309',
  gray: '#f5f5f5',
  border: '#c8c8c8',
  darkBorder: '#888',
  text: '#111',
  muted: '#555',
}

// ── SHEET ─────────────────────────────────────────────────────────────────
function Sheet({ data, onBack }) {
  const { po, supplier, poItems, schedules, bal, billsData } = data
  const n = billsData.length
  const maxLD = (po.grand_total || 0) * (po.ld_max_cap_pct || 10) / 100
  const ldNowDeducted = billsData.reduce((s, b) => s + (b.bill?.total_ld || 0), 0)
  const ldPrevious = Math.max(0, (bal?.total_ld_charged || 0) - ldNowDeducted)

  function allGRNItems(idx) {
    const items = []
    billsData[idx]?.grns?.forEach(g => g.items?.forEach(i => items.push(i)))
    return items
  }

  const labelW = n === 1 ? '32%' : n === 2 ? '28%' : '24%'

  return (
    <div>
      <div className="flex gap-2 mb-4 no-print">
        <button className="btn btn-secondary btn-sm" onClick={onBack}>← Back</button>
        <button className="btn btn-primary" onClick={() => window.print()}>🖨️ Print / Save PDF</button>
      </div>

      <div id="print-area" style={{ background: 'white', padding: '20px 24px', maxWidth: 980, margin: '0 auto', fontFamily: 'Arial, sans-serif', fontSize: 11, color: C.text, border: '1px solid #ccc' }}>

        {/* ── HEADER ── */}
        <div style={{ textAlign: 'center', marginBottom: 12 }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: C.blue, textDecoration: 'underline', letterSpacing: 0.3 }}>
            PRE-AUDIT SHEET — SUPPLY BILL
          </div>
          
          <div style={{ borderBottom: `2px solid ${C.blue}`, marginTop: 8 }} />
        </div>

        {/* ── PO INFO ── */}
        <InfoBlock title="Purchase Order Information">
          <InfoRow left="Purchase Order No:" leftVal={<strong style={{ color: C.blue }}>{po.po_number}</strong>} right="PO Date:" rightVal={po.po_date} />
                    <InfoRow left="Supplier Name:" leftVal={<strong>{supplier?.name}</strong>} right="WHT Rate:" rightVal={
            billsData[0]?.bill?.wht_cert_no
              ? <span>Exemption Cert: <strong>{billsData[0].bill.wht_cert_no}</strong> — Rate: <strong>{billsData[0].bill.wht_rate_applied}%</strong></span>
              : `${billsData[0]?.bill?.wht_rate_applied || 0}% (Default Rate)`
          } />
          <InfoRow left="Description of Material:" leftVal={poItems.map(i => i.product_name).join(', ')} right="Supplier Type:" rightVal={supplier?.type === 'company' ? 'Company' : 'Individual'} />
        </InfoBlock>

        {/* ── PG ── */}
        <InfoBlock title="Performance Guarantee">
          <InfoRow
            left="PG Amount:" leftVal={`Rs. ${fmtPKR(po.pg_amount)}`}
            right="Valid Till:" rightVal={po.pg_validity_to || '—'}
            extra={<span style={{ marginLeft: 24, fontWeight: 600, color: billsData[0]?.bill?.pg_valid ? C.green : C.red }}>
              Status: {billsData[0]?.bill?.pg_valid ? '✓ Valid' : '✗ Expired / Not Checked'}
            </span>}
          />
        </InfoBlock>

        {/* ── BILLS COLUMNAR TABLE ── */}
        <div style={{ border: `1px solid ${C.darkBorder}`, marginBottom: 10 }}>

          {/* Section title */}
          <div style={{ background: C.blue, color: 'white', padding: '5px 10px', fontWeight: 700, fontSize: 10.5, letterSpacing: 0.5 }}>
            BILL DETAILS
          </div>

          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <colgroup>
              <col style={{ width: labelW }} />
              {Array(n).fill(0).map((_, i) => <col key={i} />)}
            </colgroup>

            {/* Bill headers */}
            <thead>
              <tr>
                <td style={{ background: C.gray, border: `1px solid ${C.border}`, padding: '5px 8px' }}></td>
                {billsData.map((b, i) => (
                  <th key={i} style={{ background: C.lightBlue, border: `1px solid ${C.darkBorder}`, padding: '5px 8px', textAlign: 'center', color: C.blue, fontWeight: 700, fontSize: 11 }}>
                    Bill {['I','II','III'][i]} &nbsp;—&nbsp; {b.bill?.bill_number}
                  </th>
                ))}
              </tr>
            </thead>

            <tbody>
              {/* ═══ BILL INFORMATION ═══ */}
              <SubHeader label="Bill Information" n={n} />
              <Row label="Invoice No." n={n} vals={billsData.map(b => b.bill?.bill_number)} />
              <Row label="Invoice Date" n={n} vals={billsData.map(b => b.bill?.bill_date)} />
              <Row label="Delivery Challan No." n={n} vals={billsData.map(b => b.bill?.challan_number || '—')} />
              <Row label="Challan Date" n={n} vals={billsData.map(b => b.bill?.challan_date || '—')} />
              <Row label="GRN No." n={n} vals={billsData.map(b => b.grns?.map(g => g.grn_number).join(' & ') || '—')} />
              <Row label="GRN Date" n={n} vals={billsData.map(b => b.grns?.map(g => g.grn_date).join(' & ') || '—')} />
              <Row label="Quantity & Rate" n={n} vals={billsData.map((b, i) => {
                const items = allGRNItems(i)
                return items.map(item => `${item.qty_delivered?.toLocaleString()} Nos @ Rs.${fmtPKR(item.unit_rate)}`).join('\n') || '—'
              })} multiline />

              {/* ═══ DELIVERY DETAILS ═══ */}
              <SubHeader label="Delivery Details" n={n} />
              <Row label="Due Date of Delivery" n={n} vals={billsData.map((b, i) => {
                const items = allGRNItems(i)
                return [...new Set(items.map(x => x.promised_date).filter(Boolean))].join(' & ') || '—'
              })} />
              <Row label="Actual Delivery Date" n={n} vals={billsData.map(b => b.bill?.eff_delivery_date || '—')} />
              <Row label="Inspection Call Date" n={n} vals={billsData.map(b => b.bill?.call_date || '—')} />
              <Row label="IC Number & Date" n={n} vals={billsData.map(b => b.bill?.ic_number ? `${b.bill.ic_number}  DTD: ${b.bill.ic_date || '—'}` : '—')} />
              <Row label="Late Delivery" n={n} vals={billsData.map((b, i) => {
                const items = allGRNItems(i)
                const lateItem = items.find(x => x.is_late)
                if (!lateItem) return 'On Time ✓'
                const days = lateItem.delay_days || 0
                const months = lateItem.delay_months || 0
                const yrs = Math.floor(months / 12)
                const remM = months % 12
                const remD = Math.max(0, days - months * 30)
                return `${days}d (${yrs > 0 ? yrs + 'y ' : ''}${remM}m${remD > 0 ? ' ' + remD + 'd' : ''})`
              })} late />

              {/* ═══ PAYMENT DETAILS ═══ */}
              <SubHeader label="Payment Details" n={n} />
              <Row label="Invoice Amount (Ex-GST)" n={n} vals={billsData.map(b => `Rs. ${fmtPKR(b.bill?.total_bill_amount)}`)} bold />
              <Row label={`(-) Income Tax (WHT) @ ${billsData[0]?.bill?.wht_rate_applied || 0}%${billsData[0]?.bill?.wht_cert_no ? ' — ' + billsData[0].bill.wht_cert_no : ''}`}
                n={n} vals={billsData.map(b => `Rs. ${fmtPKR(b.bill?.wht_amount)}`)} red />
              <Row label={`(-) Penalty / LD @ ${po.ld_rate}% / month`}
                n={n} vals={billsData.map(b => (b.bill?.total_ld || 0) > 0 ? `Rs. ${fmtPKR(b.bill.total_ld)}` : '—')} red />
              <Row label="Total Deductions"
                n={n} vals={billsData.map(b => `Rs. ${fmtPKR((b.bill?.wht_amount || 0) + (b.bill?.total_ld || 0))}`)} bold red />

              {/* NET PAYABLE */}
              <tr>
                <td style={{ padding: '6px 8px', border: `1px solid ${C.darkBorder}`, borderTop: `2px solid ${C.blue}`, background: C.lightBlue, fontWeight: 700, fontSize: 12, color: C.blue }}>
                  NET PAYABLE AMOUNT
                </td>
                {billsData.map((b, i) => (
                                    <td key={i} style={{ padding: '6px 8px', border: `1px solid ${C.darkBorder}`, borderTop: `2px solid ${C.blue}`, textAlign: n === 1 ? 'center' : 'right', fontWeight: 700, fontSize: 13, color: C.green, background: '#f0fff4' }}>
                    Rs. {fmtPKR(b.bill?.net_payable)}
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>

        {/* ── BOTTOM 3 BOXES ── */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 16 }}>
          <SummaryBox title="LD Summary" rows={[
            ['Max LD Allowed (10%)', `Rs. ${fmtPKR(maxLD)}`, C.text],
            ['LD Already Deducted', `Rs. ${fmtPKR(ldPrevious)}`, C.red],
            ['Now Deducted (This Print)', `Rs. ${fmtPKR(ldNowDeducted)}`, C.red],
            ['Remaining LD Capacity', `Rs. ${fmtPKR(bal?.remaining_ld_capacity || 0)}`, C.green],
          ]} />
          <SummaryBox title="PO Balance" rows={[
            ['Total PO Qty', `${bal?.po_qty?.toLocaleString() || 0} Nos`, C.text],
            ['Delivered Qty', `${bal?.delivered_qty?.toLocaleString() || 0} Nos`, C.text],
            ['Balance Qty', `${bal?.balance_qty?.toLocaleString() || 0} Nos`, C.green],
            ['Balance Amount', `Rs. ${fmtPKR(bal?.balance_amount)}`, C.green],
          ]} />
          <div style={{ border: `1px solid ${C.darkBorder}` }}>
            <div style={{ background: C.blue, color: 'white', padding: '4px 8px', fontWeight: 700, fontSize: 10, textTransform: 'uppercase' }}>Delivery Schedule</div>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: C.lightBlue }}>
                  <th style={{ padding: '4px 8px', border: `1px solid ${C.border}`, fontSize: 9.5, textAlign: 'left', color: C.blue }}>Due Date</th>
                  <th style={{ padding: '4px 8px', border: `1px solid ${C.border}`, fontSize: 9.5, textAlign: 'right', color: C.blue }}>Qty</th>
                </tr>
              </thead>
              <tbody>
                {schedules.map((s, i) => (
                  <tr key={i} style={{ background: i % 2 === 0 ? 'white' : C.gray }}>
                    <td style={{ padding: '4px 8px', border: `1px solid ${C.border}`, fontSize: 9.5 }}>{s.promised_date}</td>
                    <td style={{ padding: '4px 8px', border: `1px solid ${C.border}`, fontSize: 9.5, textAlign: 'right', fontFamily: 'monospace' }}>{s.promised_qty?.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* ── SIGNATURES ── */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 20, marginTop: 12 }}>
          {['Accounts Assistant', 'Accounts Officer', 'Assistant Manager', 'Dy. Manager Accounts'].map((label, i) => (
            <div key={i} style={{ textAlign: 'center' }}>
              <div style={{ height: 36, borderBottom: `1px solid ${C.text}`, marginBottom: 5 }}></div>
              <div style={{ fontSize: 10, fontWeight: 600, color: C.text }}>{label}</div>
            </div>
          ))}
        </div>

        <div style={{ textAlign: 'center', marginTop: 8, fontSize: 8.5, color: '#aaa', borderTop: `1px solid ${C.border}`, paddingTop: 5 }}>
                    Pre-Audit System Generated By Mian Tanzeel · PO# {po.po_number} · {new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
        </div>
      </div>
    </div>
  )
}

// ── HELPER COMPONENTS ──────────────────────────────────────────────────────
function InfoBlock({ title, children }) {
  return (
    <div style={{ border: `1px solid ${C.darkBorder}`, marginBottom: 8 }}>
      <div style={{ background: C.blue, color: 'white', padding: '4px 10px', fontWeight: 700, fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.4 }}>{title}</div>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}><tbody>{children}</tbody></table>
    </div>
  )
}

function InfoRow({ left, leftVal, right, rightVal, extra }) {
  return (
    <tr>
      <td style={{ padding: '5px 10px', width: '15%', color: C.muted, fontSize: 10, background: C.gray, border: `1px solid ${C.border}` }}>{left}</td>
      <td style={{ padding: '5px 10px', width: '35%', border: `1px solid ${C.border}` }}>{leftVal}</td>
      <td style={{ padding: '5px 10px', width: '15%', color: C.muted, fontSize: 10, background: C.gray, border: `1px solid ${C.border}` }}>{right}</td>
      <td style={{ padding: '5px 10px', border: `1px solid ${C.border}` }}>{rightVal}{extra}</td>
    </tr>
  )
}

function SubHeader({ label, n }) {
  return (
    <tr>
      <td colSpan={n + 1} style={{ background: C.lightBlue, color: C.blue, padding: '4px 8px', fontWeight: 700, fontSize: 10, border: `1px solid ${C.border}`, borderTop: `1.5px solid ${C.blue}`, textTransform: 'uppercase', letterSpacing: 0.4 }}>
        {label}
      </td>
    </tr>
  )
}

function Row({ label, n, vals = [], bold, red, late, multiline }) {
  const valStyle = {
    padding: '4px 8px',
    border: `1px solid ${C.border}`,
    textAlign: 'right',
    fontWeight: bold ? 700 : 400,
    color: red ? C.red : late ? C.amber : C.text,
    background: bold ? C.gray : 'white',
    whiteSpace: multiline ? 'pre-line' : 'normal',
    fontSize: 10.5,
  }
  return (
    <tr>
      <td style={{ padding: '4px 8px', border: `1px solid ${C.border}`, color: C.muted, background: C.gray, fontSize: 10 }}>{label}</td>
            {Array(n).fill(0).map((_, i) => <td key={i} style={{ ...valStyle, textAlign: n === 1 ? 'center' : 'right' }}>{vals[i] || '—'}</td>)}
    </tr>
  )
}

function SummaryBox({ title, rows }) {
  return (
    <div style={{ border: `1px solid ${C.darkBorder}` }}>
      <div style={{ background: C.blue, color: 'white', padding: '4px 8px', fontWeight: 700, fontSize: 10, textTransform: 'uppercase' }}>{title}</div>
      {rows.map(([label, value, color], i) => (
        <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 8px', borderBottom: `1px solid ${C.border}`, background: i % 2 === 0 ? 'white' : C.gray }}>
          <span style={{ fontSize: 9.5, color: C.muted }}>{label}</span>
          <span style={{ fontSize: 10, fontWeight: 600, color, fontFamily: 'monospace' }}>{value}</span>
        </div>
      ))}
    </div>
  )
}
