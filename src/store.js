// ============================================================
// SUPABASE STORE — All data persisted to Supabase
// ============================================================
import { supabase } from './supabase'

// ── PRODUCTS ──────────────────────────────────────────────────────────────
export const db = {

  // PRODUCTS
  getProducts: async () => {
    const { data } = await supabase.from('products').select('*').order('name')
    return data || []
  },
  getProduct: async (id) => {
    const { data } = await supabase.from('products').select('*').eq('id', id).single()
    return data
  },
  findProduct: async (name) => {
    const { data } = await supabase.from('products').select('*').ilike('name', name).single()
    return data
  },
  saveProduct: async (data) => {
    if (data.id) {
      const { data: d } = await supabase.from('products').update(data).eq('id', data.id).select().single()
      return d
    }
    const { data: existing } = await supabase.from('products').select('*').ilike('name', data.name).single()
    if (existing) return existing
    const { data: d } = await supabase.from('products').insert(data).select().single()
    return d
  },

  // SUPPLIERS
  getSuppliers: async () => {
    const { data } = await supabase.from('suppliers').select('*').order('name')
    return data || []
  },
  getSupplier: async (id) => {
    if (!id) return null
    const { data } = await supabase.from('suppliers').select('*').eq('id', id).single()
    return data
  },
  saveSupplier: async (data) => {
    if (data.id) {
      const { data: d } = await supabase.from('suppliers').update(data).eq('id', data.id).select().single()
      return d
    }
    const { data: d } = await supabase.from('suppliers').insert(data).select().single()
    return d
  },

  // EXEMPTIONS
  getExemptions: async (supplierId) => {
    const { data } = await supabase.from('supplier_exemptions').select('*').eq('supplier_id', supplierId).order('valid_from')
    return data || []
  },
  saveExemption: async (data) => {
    if (data.id) {
      const { data: d } = await supabase.from('supplier_exemptions').update(data).eq('id', data.id).select().single()
      return d
    }
    const { data: d } = await supabase.from('supplier_exemptions').insert(data).select().single()
    return d
  },
  deleteExemption: async (id) => {
    await supabase.from('supplier_exemptions').delete().eq('id', id)
  },

  // PURCHASE ORDERS
  getPOs: async () => {
    const { data } = await supabase.from('purchase_orders').select('*').order('created_at', { ascending: false })
    return data || []
  },
  getPO: async (id) => {
    const { data } = await supabase.from('purchase_orders').select('*').eq('id', id).single()
    return data
  },
    searchPOs: async (q) => {
    const { data } = await supabase.from('purchase_orders').select('*').or(`po_number.ilike.%${q}%`)
    return data || []
  },
    savePO: async (data) => {
    const { id, ...rest } = data
    if (id) {
            const clean = Object.fromEntries(Object.entries(rest).map(([k, v]) => [k, v === '' ? null : v]))
      const { data: d, error } = await supabase.from('purchase_orders').update(clean).eq('id', id).select().single()
      if (error) { console.error('PO update error:', error); return null }
      return d
    }
        // Clean empty strings to null for date fields
    const clean = Object.fromEntries(Object.entries(rest).map(([k, v]) => [k, v === '' ? null : v]))
    const { data: d, error } = await supabase.from('purchase_orders').insert(clean).select().single()
    if (error) { console.error('PO insert error:', error.message, error.details); return null }
    return d
  },

  // PO ITEMS
  getPOItems: async (poId) => {
    const { data } = await supabase.from('po_items').select('*').eq('po_id', poId)
    return data || []
  },
  getProduct: async (id) => {
    const { data } = await supabase.from('products').select('*').eq('id', id).single()
    return data
  },
    replacePOItems: async (poId, list) => {
    await supabase.from('po_items').delete().eq('po_id', poId)
    if (list.length === 0) return []
        const rows = list.map(i => {
      const row = {
        po_id: poId,
        product_id: i.product_id || null,
        product_name: i.product_name || '',
        description: i.product_name || i.description || '',
        unit_rate: parseFloat(i.unit_rate) || 0,
        total_qty: parseInt(i.total_qty) || 0,
        unit_of_measure: i.unit_of_measure || 'Each',
      }
      return row
    })
    console.log('Inserting rows:', JSON.stringify(rows))
    const { data, error } = await supabase.from('po_items').insert(rows).select()
    if (error) { console.error('PO items insert error:', error.message, error.details); return [] }
    return data || []
  },

  // DELIVERY SCHEDULES
  getSchedules: async (poId) => {
    const { data } = await supabase.from('po_delivery_schedule').select('*').eq('po_id', poId).order('promised_date')
    return data || []
  },
  replaceSchedules: async (poId, list) => {
    await supabase.from('po_delivery_schedule').delete().eq('po_id', poId)
    if (list.length === 0) return
    const rows = list.map(s => ({ ...s, po_id: poId }))
    await supabase.from('po_delivery_schedule').insert(rows)
  },

  // INSPECTION CERTIFICATES
  getICs: async (poId) => {
    const { data } = await supabase.from('inspection_certificates').select('*').eq('po_id', poId)
    return data || []
  },
  getIC: async (id) => {
    const { data } = await supabase.from('inspection_certificates').select('*').eq('id', id).single()
    return data
  },
  getICByNumber: async (poId, icNo) => {
    const { data } = await supabase.from('inspection_certificates').select('*').eq('po_id', poId).eq('ic_number', icNo).single()
    return data
  },
    saveIC: async (data) => {
    const { id, ...rest } = data
    const clean = Object.fromEntries(Object.entries(rest).map(([k, v]) => [k, v === '' ? null : v]))
    if (id) {
      const { data: d, error } = await supabase.from('inspection_certificates').update(clean).eq('id', id).select().single()
      if (error) { console.error('IC update error:', error.message); return null }
      return d
    }
    const { data: d, error } = await supabase.from('inspection_certificates').insert(clean).select().single()
    if (error) { console.error('IC insert error:', error.message); return null }
    return d
  },
  getICUsedQty: async (icId, excludeBillId = null) => {
    let q = supabase.from('supply_bills').select('ic_qty_this_bill').eq('ic_id', icId)
    if (excludeBillId) q = q.neq('id', excludeBillId)
    const { data } = await q
    return (data || []).reduce((s, b) => s + (b.ic_qty_this_bill || 0), 0)
  },

  // SUPPLY BILLS
  getBills: async (poId) => {
    const { data } = await supabase.from('supply_bills').select('*').eq('po_id', poId).order('created_at', { ascending: false })
    return data || []
  },
  getAllBills: async () => {
    const { data } = await supabase.from('supply_bills').select('*').order('created_at', { ascending: false })
    return data || []
  },
  getBill: async (id) => {
    const { data } = await supabase.from('supply_bills').select('*').eq('id', id).single()
    return data
  },
    saveBill: async (data) => {
    const { id, ...rest } = data
    const clean = Object.fromEntries(Object.entries(rest).map(([k, v]) => [k, v === '' ? null : v]))
    if (id) {
      const { data: d, error } = await supabase.from('supply_bills').update(clean).eq('id', id).select().single()
      if (error) { console.error('Bill update error:', error.message); return null }
      return d
    }
    const { data: d, error } = await supabase.from('supply_bills').insert(clean).select().single()
    if (error) { console.error('Bill insert error:', error.message); return null }
    return d
  },

  // GRNs
  getGRNs: async (billId) => {
    const { data } = await supabase.from('grns').select('*').eq('supply_bill_id', billId)
    return data || []
  },
  getGRNsByPO: async (poId) => {
    const { data } = await supabase.from('grns').select('*').eq('po_id', poId)
    return data || []
  },
  getGRN: async (id) => {
    const { data } = await supabase.from('grns').select('*').eq('id', id).single()
    return data
  },
  saveGRNs: async (billId, poId, list) => {
    await supabase.from('grns').delete().eq('supply_bill_id', billId)
    if (list.length === 0) return []
    const rows = list.map(g => ({ ...g, supply_bill_id: billId, po_id: poId }))
    const { data } = await supabase.from('grns').insert(rows).select()
    return data || []
  },

  // GRN ITEMS
  getGRNItems: async (grnId) => {
    const { data } = await supabase.from('grn_items').select('*').eq('grn_id', grnId)
    return data || []
  },
  saveGRNItems: async (grnId, poId, list) => {
    await supabase.from('grn_items').delete().eq('grn_id', grnId)
    if (list.length === 0) return
    const rows = list.map(i => ({ ...i, grn_id: grnId, po_id: poId }))
    await supabase.from('grn_items').insert(rows)
  },
  getDeliveredQtyByBatch: async (poId, poItemId, scheduleId, excludeBillId = null) => {
    const { data: grns } = await supabase.from('grns').select('id, supply_bill_id').eq('po_id', poId)
    if (!grns) return 0
    const filteredGRNs = excludeBillId ? grns.filter(g => g.supply_bill_id !== excludeBillId) : grns
    if (filteredGRNs.length === 0) return 0
    const grnIds = filteredGRNs.map(g => g.id)
    const { data } = await supabase.from('grn_items').select('qty_delivered').in('grn_id', grnIds).eq('po_item_id', poItemId).eq('schedule_id', scheduleId)
    return (data || []).reduce((s, i) => s + (i.qty_delivered || 0), 0)
  },
  getDeliveredQtyByItem: async (poId, poItemId, excludeBillId = null) => {
    const { data: grns } = await supabase.from('grns').select('id, supply_bill_id').eq('po_id', poId)
    if (!grns) return 0
    const filteredGRNs = excludeBillId ? grns.filter(g => g.supply_bill_id !== excludeBillId) : grns
    if (filteredGRNs.length === 0) return 0
    const grnIds = filteredGRNs.map(g => g.id)
    const { data } = await supabase.from('grn_items').select('qty_delivered').in('grn_id', grnIds).eq('po_item_id', poItemId)
    return (data || []).reduce((s, i) => s + (i.qty_delivered || 0), 0)
  },

  // GST BILLS
  getAllGSTBills: async () => {
    const { data } = await supabase.from('gst_bills').select('*').order('created_at', { ascending: false })
    return data || []
  },
  getGSTBills: async (poId) => {
    const { data } = await supabase.from('gst_bills').select('*').eq('po_id', poId)
    return data || []
  },
  getGSTBill: async (id) => {
    const { data } = await supabase.from('gst_bills').select('*').eq('id', id).single()
    return data
  },
  saveGSTBill: async (data, grnIds) => {
    const { id, ...rest } = data
    let saved
    if (id) {
      const { data: d } = await supabase.from('gst_bills').update(rest).eq('id', id).select().single()
      saved = d
      await supabase.from('gst_bill_grn_links').delete().eq('gst_bill_id', id)
    } else {
      const { data: d } = await supabase.from('gst_bills').insert(rest).select().single()
      saved = d
    }
    if (grnIds && grnIds.length > 0) {
      const links = grnIds.map(grnId => ({ gst_bill_id: saved.id, grn_id: grnId }))
      await supabase.from('gst_bill_grn_links').insert(links)
    }
    return saved
  },
  getGSTGRNLinks: async (gstBillId) => {
    const { data } = await supabase.from('gst_bill_grn_links').select('*').eq('gst_bill_id', gstBillId)
    return data || []
  },
  getGRNsLinkedToGST: async (poId) => {
    const gstBills = await db.getGSTBills(poId)
    if (!gstBills.length) return []
    const ids = gstBills.map(g => g.id)
    const { data } = await supabase.from('gst_bill_grn_links').select('grn_id').in('gst_bill_id', ids)
    return (data || []).map(l => l.grn_id)
  },

  // PO BALANCE
  getPOBalance: async (poId) => {
    const po = await db.getPO(poId)
    if (!po) return null
    const items = await db.getPOItems(poId)
    const grns = await db.getGRNsByPO(poId)
    const bills = await db.getBills(poId)
    const grnIds = grns.map(g => g.id)
    let totalDelivered = 0, totalDeliveredAmt = 0, totalLD = 0
    if (grnIds.length > 0) {
      const { data: grnItems } = await supabase.from('grn_items').select('qty_delivered, amount, ld_capped').in('grn_id', grnIds)
      totalDelivered = (grnItems || []).reduce((s, i) => s + (i.qty_delivered || 0), 0)
      totalDeliveredAmt = (grnItems || []).reduce((s, i) => s + (i.amount || 0), 0)
      totalLD = (grnItems || []).reduce((s, i) => s + (i.ld_capped || 0), 0)
    }
    const totalPOQty = items.reduce((s, i) => s + (i.total_qty || 0), 0)
    const maxLD = po.grand_total * po.ld_max_cap_pct / 100
    return {
      po_qty: totalPOQty, delivered_qty: totalDelivered, balance_qty: totalPOQty - totalDelivered,
      po_amount: po.total_amount_ex_gst, delivered_amount: totalDeliveredAmt,
      balance_amount: po.total_amount_ex_gst - totalDeliveredAmt,
      total_bills: bills.length, total_ld_charged: totalLD,
      max_ld_allowed: maxLD, remaining_ld_capacity: Math.max(0, maxLD - totalLD),
      ld_cap_reached: totalLD >= maxLD,
    }
  },
}
