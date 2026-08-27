import { useState } from 'react'
import { db } from '../store'
import { fmtPKR } from '../utils/calculations'

export default function TestData({ navigate }) {
  const [loaded, setLoaded] = useState(false)
  const [log, setLog] = useState([])

  function addLog(msg, ok = true) {
    setLog(prev => [...prev, { msg, ok }])
  }

  function loadTestData() {
    setLog([])

    // ── SUPPLIER ─────────────────────────────────────────────
    const supplier = db.saveSupplier({
      name: 'M/s National Electrical Co.',
      ntn: '3456789-1',
      address: 'Industrial Area, Lahore',
      type: 'company',
      default_wht_rate: 5,
      is_active: true,
    })
    addLog(`Supplier created: ${supplier.name} (WHT 5%)`)

    // Exemption certificate — 2% rate for 2026
    db.saveExemption({
      supplier_id: supplier.id,
      certificate_no: 'EXM-2026-NEC',
      valid_from: '2026-01-01',
      valid_to: '2026-12-31',
      wht_rate: 2,
    })
    addLog(`Exemption cert added: EXM-2026-NEC @ 2% (2026-01-01 to 2026-12-31)`)
    addLog(`WHT rate today: 2% (exemption cert active)`)

    // ── PRODUCT MASTER ────────────────────────────────────────
    const prod1 = db.saveProduct({ name: 'Distribution Transformer 100KVA', default_uom: 'Nos' })
    const prod2 = db.saveProduct({ name: 'HT Aerial Bunched Cable', default_uom: 'Meter' })
    addLog(`Products added: ${prod1.name}, ${prod2.name}`)

    // ── PURCHASE ORDER ────────────────────────────────────────
    const exGst = (185000 * 50) + (4500 * 2000)  // 9,250,000 + 9,000,000 = 18,250,000
    const gstAmt = Math.round(exGst * 0.18)        // 3,285,000
    const grandTotal = exGst + gstAmt               // 21,535,000
    const pgAmount = Math.round(grandTotal * 0.05)  // 1,076,750

    const po = db.savePO({
      po_number: 'PO-TEST-001',
      po_date: '2026-07-01',
      supplier_id: supplier.id,
      gst_rate: 18,
      total_amount_ex_gst: exGst,
      gst_amount: gstAmt,
      grand_total: grandTotal,
      ld_rate: 2,
      ld_max_cap_pct: 10,
      pg_amount: pgAmount,
      pg_validity_to: '2028-06-30',
      pg_bank_guarantee_no: 'BG-2026-NEC-001',
      warranty_months: 24,
      payment_method: 'cheque',
      prototype_required: false,
      budget_heads: [{ head: 'Consumer Finance', pct: 60 }, { head: 'ELR', pct: 40 }],
      tender_no: 'TDR-2026-045',
      status: 'active',
    })
    addLog(`PO created: ${po.po_number} dated ${po.po_date}`)
    addLog(`Amount Ex-GST: ${fmtPKR(exGst)} | GST: ${fmtPKR(gstAmt)} | Grand Total: ${fmtPKR(grandTotal)}`)
    addLog(`Max LD (10%): ${fmtPKR(grandTotal * 0.1)} | PG: ${fmtPKR(pgAmount)}`)

    // ── PO ITEMS ──────────────────────────────────────────────
    db.replacePOItems(po.id, [
      { product_id: prod1.id, product_name: prod1.name, description: prod1.name, unit_rate: 185000, total_qty: 50, unit_of_measure: 'Nos' },
      { product_id: prod2.id, product_name: prod2.name, description: prod2.name, unit_rate: 4500, total_qty: 2000, unit_of_measure: 'Meter' },
    ])
    const items = db.getPOItems(po.id)
    addLog(`Item 1: ${prod1.name} — 50 Nos @ Rs.185,000 = ${fmtPKR(185000*50)}`)
    addLog(`Item 2: ${prod2.name} — 2,000 m @ Rs.4,500 = ${fmtPKR(4500*2000)}`)

    // ── DELIVERY SCHEDULE ─────────────────────────────────────
    db.replaceSchedules(po.id, [
      { po_item_id: items[0].id, shipment_no: 1, promised_qty: 25, promised_date: '2026-09-15' },
      { po_item_id: items[0].id, shipment_no: 2, promised_qty: 25, promised_date: '2026-11-15' },
      { po_item_id: items[1].id, shipment_no: 1, promised_qty: 1000, promised_date: '2026-09-15' },
      { po_item_id: items[1].id, shipment_no: 2, promised_qty: 1000, promised_date: '2026-11-15' },
    ])
    addLog(`Delivery Schedule: Item 1 — 25 by 2026-09-15, 25 by 2026-11-15`)
    addLog(`Delivery Schedule: Item 2 — 1000m by 2026-09-15, 1000m by 2026-11-15`)

    setLoaded(true)

    addLog('─────────────────────────────────────────────────────', true)
    addLog('TEST DATA LOADED. Now verify on screen:', true)
    addLog('BILL 1 — ON TIME (no LD expected):', true)
    addLog('  IC No: IC-2026-001 | IC Date: 2026-09-02', true)
    addLog('  Call Date: 2026-08-25 (21 days before promised → >15 → Insp Comp applies)', true)
    addLog('  Sample Date: 2026-08-28', true)
    addLog('  Insp Completion: 2026-09-01 (before promised 2026-09-15 → NO LD)', true)
    addLog('  Challan: 2026-09-12 (10 days after IC → within 20 → OK)', true)
    addLog('  GRN: 20 Transformers + 800m Cable', true)
    addLog('  Expected: LD=0 | WHT=2% | Net = Amount - WHT', true)
    addLog('─────────────────────────────────────────────────────', true)
    addLog('BILL 2 — LATE 61 DAYS (3 months × 2% = 6% LD):', true)
    addLog('  IC No: IC-2026-002 | IC Date: 2026-11-15', true)
    addLog('  Call Date: 2026-08-01 (45 days before promised → >15 → Insp Comp applies)', true)
    addLog('  Sample Date: 2026-08-10', true)
    addLog('  Insp Completion: 2026-11-15 (61 days after promised → 3 months)', true)
    addLog('  Challan: 2026-11-20 (5 days after IC → within 20 → OK)', true)
    addLog('  GRN: 5 Transformers + 200m Cable', true)
    addLog('  Expected LD: (5×185,000×6%)+(200×4,500×6%) = 55,500+54,000 = Rs.109,500', true)
    addLog('  Expected WHT @2% on bill amount Rs.1,825,000 = Rs.36,500', true)
    addLog('  Expected Net Payable: 1,825,000 - 109,500 - 36,500 = Rs.1,679,000', true)
  }

  return (
    <div>
      <div className="card mb-4">
        <div className="card-header">
          <span className="card-title">🧪 Test Data Loader</span>
          <span className="badge badge-amber">Development Tool</span>
        </div>
        <div className="card-body">
          <div className="alert alert-warning" style={{ marginBottom: 16 }}>
            This loads sample data so you can verify all calculations live in the app. After loading, go to <strong>Supply Bills → New Supply Bill</strong> and enter the bill details shown below.
          </div>

          {!loaded ? (
            <button className="btn btn-primary" onClick={loadTestData}>
              ▶ Load Test Data into App
            </button>
          ) : (
            <div className="flex gap-2">
              <button className="btn btn-success" onClick={() => navigate('supply-bills')}>
                → Go to Supply Bills to Test
              </button>
              <button className="btn btn-secondary" onClick={() => navigate('pos')}>
                → View Purchase Orders
              </button>
            </div>
          )}

          {log.length > 0 && (
            <div style={{ marginTop: 20, background: '#0f172a', borderRadius: 8, padding: 16, fontFamily: 'monospace', fontSize: 12 }}>
              {log.map((l, i) => (
                <div key={i} style={{ color: l.msg.startsWith('─') ? '#334155' : l.msg.startsWith('  ') ? '#94a3b8' : l.msg.startsWith('BILL') || l.msg.startsWith('Expected') ? '#fbbf24' : '#22c55e', marginBottom: 3 }}>
                  {l.msg.startsWith('─') ? l.msg : l.msg.startsWith('  ') ? l.msg : `✓ ${l.msg}`}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {loaded && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          {/* BILL 1 CHEAT SHEET */}
          <div className="card">
            <div className="card-header" style={{ background: 'var(--green-light)' }}>
              <span className="card-title">📋 Bill 1 — Enter These Values</span>
              <span className="badge badge-green">No LD Expected</span>
            </div>
            <div className="card-body">
              <table style={{ width: '100%', fontSize: 13 }}>
                <tbody>
                  {[
                    ['PO Number', 'PO-TEST-001'],
                    ['Bill Number', 'NEC-INV-001'],
                    ['Bill Date', '2026-09-10'],
                    ['IC Number', 'IC-2026-001'],
                    ['IC Date', '2026-09-02'],
                    ['Call Date', '2026-08-25'],
                    ['Sample Date', '2026-08-28'],
                    ['Insp Completion', '2026-09-01'],
                    ['Challan No', 'DC-2026-001'],
                    ['Challan Date', '2026-09-12'],
                    ['GRN No', 'GRN-2026-001'],
                    ['GRN Date', '2026-09-12'],
                    ['Transformers qty', '20'],
                    ['Cable qty', '800'],
                  ].map(([k, v]) => (
                    <tr key={k} style={{ borderBottom: '1px solid var(--gray-100)' }}>
                      <td style={{ padding: '5px 0', color: 'var(--gray-500)', width: '50%' }}>{k}</td>
                      <td style={{ padding: '5px 0', fontWeight: 600 }}>{v}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div style={{ marginTop: 12, padding: 10, background: 'var(--green-light)', borderRadius: 6, fontSize: 12 }}>
                <div><strong>Expected Results:</strong></div>
                <div>Bill Amount: {fmtPKR(20*185000 + 800*4500)}</div>
                <div>LD: Rs. 0.00 (on time)</div>
                <div>WHT @2%: {fmtPKR(Math.round((20*185000 + 800*4500)*0.02))}</div>
                <div style={{ fontWeight: 700, color: 'var(--green)' }}>Net Payable: {fmtPKR((20*185000+800*4500) - Math.round((20*185000+800*4500)*0.02))}</div>
              </div>
            </div>
          </div>

          {/* BILL 2 CHEAT SHEET */}
          <div className="card">
            <div className="card-header" style={{ background: 'var(--red-light)' }}>
              <span className="card-title">📋 Bill 2 — Enter These Values</span>
              <span className="badge badge-red">LD Expected — 3 Months</span>
            </div>
            <div className="card-body">
              <table style={{ width: '100%', fontSize: 13 }}>
                <tbody>
                  {[
                    ['PO Number', 'PO-TEST-001'],
                    ['Bill Number', 'NEC-INV-002'],
                    ['Bill Date', '2026-11-20'],
                    ['IC Number', 'IC-2026-002'],
                    ['IC Date', '2026-11-15'],
                    ['Call Date', '2026-08-01'],
                    ['Sample Date', '2026-08-10'],
                    ['Insp Completion', '2026-11-15'],
                    ['Challan No', 'DC-2026-002'],
                    ['Challan Date', '2026-11-20'],
                    ['GRN No', 'GRN-2026-002'],
                    ['GRN Date', '2026-11-25'],
                    ['Transformers qty', '5'],
                    ['Cable qty', '200'],
                  ].map(([k, v]) => (
                    <tr key={k} style={{ borderBottom: '1px solid var(--gray-100)' }}>
                      <td style={{ padding: '5px 0', color: 'var(--gray-500)', width: '50%' }}>{k}</td>
                      <td style={{ padding: '5px 0', fontWeight: 600 }}>{v}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div style={{ marginTop: 12, padding: 10, background: 'var(--red-light)', borderRadius: 6, fontSize: 12 }}>
                <div><strong>Expected Results:</strong></div>
                <div>Bill Amount: {fmtPKR(5*185000 + 200*4500)}</div>
                <div>Delay: 61 days → 3 months → 6% LD</div>
                <div>Transformer LD: {fmtPKR(5*185000*0.06)}</div>
                <div>Cable LD: {fmtPKR(200*4500*0.06)}</div>
                <div>Total LD: {fmtPKR(5*185000*0.06 + 200*4500*0.06)}</div>
                <div>WHT @2%: {fmtPKR(Math.round((5*185000+200*4500)*0.02))}</div>
                <div style={{ fontWeight: 700, color: 'var(--red)' }}>Net Payable: {fmtPKR((5*185000+200*4500) - (5*185000*0.06+200*4500*0.06) - Math.round((5*185000+200*4500)*0.02))}</div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
