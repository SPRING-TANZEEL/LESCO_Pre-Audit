import { useState, useEffect } from 'react'
import { db } from '../store'
import { fmtPKR } from '../utils/calculations'

export default function PODetail({ poId, navigate }) {
  const [po, setPO] = useState(null)
  const [supplier, setSupplier] = useState(null)
  const [schedules, setSchedules] = useState([])
  const [bills, setBills] = useState([])
  const [items, setItems] = useState([])
  const [bal, setBal] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => { if (poId) load() }, [poId])

  async function load() {
    setLoading(true)
    const p = await db.getPO(poId)
    setPO(p)
    const [sup, scheds, bls, itms, balance] = await Promise.all([
      db.getSupplier(p?.supplier_id),
      db.getSchedules(poId),
      db.getBills(poId),
      db.getPOItems(poId),
      db.getPOBalance(poId),
    ])
    setSupplier(sup); setSchedules(scheds); setBills(bls); setItems(itms); setBal(balance)
    setLoading(false)
  }

  if (loading) return <div className="text-muted" style={{ padding: 32 }}>Loading...</div>
  if (!po) return <div className="text-muted" style={{ padding: 32 }}>PO not found</div>

  const ldUsedPct = bal ? (bal.total_ld_charged / bal.max_ld_allowed) * 100 : 0

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <button className="btn btn-secondary btn-sm" onClick={() => navigate('pos')}>← Back</button>
        <button className="btn btn-primary" onClick={() => navigate('supply-bills')}>+ New Supply Bill</button>
      </div>

      {/* PO HEADER */}
      <div className="card mb-4">
        <div className="card-header">
          <span className="card-title">PO: {po.po_number}</span>
          <span className={`badge badge-${po.status === 'active' ? 'green' : 'amber'}`}>{po.status === 'active' ? 'Approved' : 'Pending'}</span>
        </div>
        <div className="card-body">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 16 }}>
            <div><div className="stat-label">PO Date</div><div style={{ marginTop: 4, fontWeight: 600 }}>{po.po_date}</div></div>
            <div><div className="stat-label">Supplier</div><div style={{ marginTop: 4, fontWeight: 600 }}>{supplier?.name}</div></div>
            <div><div className="stat-label">Tender No</div><div style={{ marginTop: 4 }}>{po.tender_no || '—'}</div></div>
            <div><div className="stat-label">Payment</div><div style={{ marginTop: 4 }}>{po.payment_method === 'lc' ? 'Letter of Credit' : 'Cheque'}</div></div>
            <div><div className="stat-label">Prototype</div><div style={{ marginTop: 4 }}>{po.prototype_required ? '✅ Yes' : 'No'}</div></div>
            <div><div className="stat-label">Warranty</div><div style={{ marginTop: 4 }}>{po.warranty_months} months</div></div>
            <div><div className="stat-label">Budget Head</div><div style={{ marginTop: 4, fontSize: 12 }}>{(po.budget_heads||[]).filter(h=>h.pct>0).map(h=>`${h.head} ${h.pct}%`).join(', ') || '—'}</div></div>
          </div>
        </div>
      </div>

      {/* FINANCIALS + BALANCE */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
        <div className="card">
          <div className="card-header"><span className="card-title">Financial Summary</span></div>
          <div className="card-body">
            <table style={{ width: '100%' }}>
              <tbody>
                <tr><td style={{ padding: '6px 0', color: 'var(--gray-500)' }}>Amount (Ex-GST)</td><td className="text-right font-mono">Rs. {fmtPKR(po.total_amount_ex_gst)}</td></tr>
                <tr><td style={{ padding: '6px 0', color: 'var(--gray-500)' }}>GST @ {po.gst_rate}%</td><td className="text-right font-mono">Rs. {fmtPKR(po.gst_amount)}</td></tr>
                <tr style={{ borderTop: '2px solid var(--gray-200)' }}><td style={{ padding: '8px 0', fontWeight: 700 }}>Grand Total</td><td className="text-right font-mono" style={{ fontWeight: 700 }}>Rs. {fmtPKR(po.grand_total)}</td></tr>
              </tbody>
            </table>
          </div>
        </div>
        <div className="card">
          <div className="card-header"><span className="card-title">Balance Tracking</span></div>
          <div className="card-body">
            {bal && <>
              <table style={{ width: '100%' }}>
                <tbody>
                  <tr><td style={{ padding: '6px 0', color: 'var(--gray-500)' }}>Total Bills</td><td className="text-right">{bal.total_bills}</td></tr>
                  <tr><td style={{ padding: '6px 0', color: 'var(--gray-500)' }}>Delivered Amount</td><td className="text-right font-mono">Rs. {fmtPKR(bal.delivered_amount)}</td></tr>
                  <tr><td style={{ padding: '6px 0', color: 'var(--green)' }}>Balance Amount</td><td className="text-right font-mono" style={{ color: 'var(--green)', fontWeight: 700 }}>Rs. {fmtPKR(bal.balance_amount)}</td></tr>
                  <tr><td style={{ padding: '6px 0', color: 'var(--gray-500)' }}>Total LD Charged</td><td className="text-right font-mono" style={{ color: 'var(--red)' }}>Rs. {fmtPKR(bal.total_ld_charged)}</td></tr>
                </tbody>
              </table>
              <div style={{ marginTop: 12 }}>
                <div className="flex justify-between text-sm"><span>LD Used</span><span>Rs. {fmtPKR(bal.total_ld_charged)} / {fmtPKR(bal.max_ld_allowed)}</span></div>
                <div className="ld-bar"><div className={`ld-bar-fill ${ldUsedPct > 80 ? 'danger' : ''}`} style={{ width: `${Math.min(100, ldUsedPct)}%` }} /></div>
              </div>
            </>}
          </div>
        </div>
      </div>

      {/* PG */}
      <div className="card mb-4">
        <div className="card-header"><span className="card-title">Performance Guarantee</span></div>
        <div className="card-body">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
            <div><div className="stat-label">PG Amount</div><div style={{ marginTop: 4, fontWeight: 600 }}>Rs. {fmtPKR(po.pg_amount)}</div></div>
            <div><div className="stat-label">BG No</div><div style={{ marginTop: 4 }}>{po.pg_bank_guarantee_no || '—'}</div></div>
            <div><div className="stat-label">Valid Till</div><div style={{ marginTop: 4 }}>{po.pg_validity_to || '—'}</div></div>
          </div>
        </div>
      </div>

      {/* ITEMS */}
      <div className="card mb-4">
        <div className="card-header"><span className="card-title">Items</span></div>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Product</th><th>UOM</th><th className="text-right">Unit Rate</th><th className="text-right">Total Qty</th><th className="text-right">Amount</th></tr></thead>
            <tbody>
              {items.map(item => (
                <tr key={item.id}>
                  <td>{item.product_name}</td>
                  <td>{item.unit_of_measure}</td>
                  <td className="text-right font-mono">{fmtPKR(item.unit_rate)}</td>
                  <td className="text-right">{item.total_qty?.toLocaleString()}</td>
                  <td className="text-right font-mono">{fmtPKR(item.unit_rate * item.total_qty)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* DELIVERY SCHEDULE */}
      <div className="card mb-4">
        <div className="card-header"><span className="card-title">Delivery Schedule</span></div>
        <div className="table-wrap">
          <table>
            <thead><tr><th>#</th><th>Product</th><th className="text-right">Qty</th><th>Promised Date</th></tr></thead>
            <tbody>
              {schedules.map(s => {
                const item = items.find(i => i.id === s.po_item_id)
                return (
                  <tr key={s.id}>
                    <td>{s.shipment_no}</td>
                    <td>{item?.product_name || '—'}</td>
                    <td className="text-right">{s.promised_qty?.toLocaleString()}</td>
                    <td>{s.promised_date}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* BILLS */}
      <div className="card">
        <div className="card-header">
          <span className="card-title">Supply Bills ({bills.length})</span>
          <button className="btn btn-primary btn-sm" onClick={() => navigate('supply-bills')}>+ New Bill</button>
        </div>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Bill No</th><th>Bill Date</th><th className="text-right">Amount</th><th className="text-right">LD</th><th className="text-right">WHT</th><th className="text-right">Net Payable</th><th>PG</th><th>Status</th><th></th></tr></thead>
            <tbody>
              {bills.length === 0 && <tr><td colSpan={9} className="text-center text-muted" style={{ padding: 24 }}>No bills yet</td></tr>}
              {bills.map(b => (
                <tr key={b.id}>
                  <td><strong>{b.bill_number}</strong></td>
                  <td>{b.bill_date}</td>
                  <td className="text-right font-mono">{fmtPKR(b.total_bill_amount)}</td>
                  <td className="text-right font-mono" style={{ color: b.total_ld > 0 ? 'var(--red)' : 'inherit' }}>{b.total_ld > 0 ? fmtPKR(b.total_ld) : '—'}</td>
                  <td className="text-right font-mono">{fmtPKR(b.wht_amount)}</td>
                  <td className="text-right font-mono"><strong>{fmtPKR(b.net_payable)}</strong></td>
                  <td>{b.pg_valid === true ? <span className="badge badge-green">Valid</span> : b.pg_valid === false ? <span className="badge badge-red">Expired</span> : '—'}</td>
                  <td><span className={`badge badge-${b.status === 'verified' ? 'green' : 'amber'}`}>{b.status}</span></td>
                  <td>
                    <div className="flex gap-2">
                      <button className="btn btn-primary btn-sm" onClick={() => navigate('print', { billId: b.id })}>Print</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
