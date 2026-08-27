-- ============================================================
-- LESCO PRE-AUDIT SYSTEM — COMPLETE SUPABASE SCHEMA v2
-- Run this in Supabase SQL Editor
-- ============================================================

-- Drop existing tables if re-running
drop table if exists gst_bill_grn_links cascade;
drop table if exists gst_bills cascade;
drop table if exists grn_items cascade;
drop table if exists grns cascade;
drop table if exists supply_bills cascade;
drop table if exists inspection_certificates cascade;
drop table if exists po_delivery_schedule cascade;
drop table if exists po_items cascade;
drop table if exists purchase_orders cascade;
drop table if exists supplier_exemptions cascade;
drop table if exists suppliers cascade;
drop table if exists products cascade;
drop table if exists app_users cascade;

-- PRODUCTS (global master)
create table products (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  default_uom text default 'Each',
  created_at timestamptz default now()
);

-- SUPPLIERS
create table suppliers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  ntn text,
  address text,
  type text not null check (type in ('company','individual')),
  default_wht_rate numeric(5,2) not null,
  is_active boolean default true,
  created_at timestamptz default now()
);

-- SUPPLIER WHT EXEMPTION CERTIFICATES
create table supplier_exemptions (
  id uuid primary key default gen_random_uuid(),
  supplier_id uuid references suppliers(id) on delete cascade,
  certificate_no text not null,
  valid_from date not null,
  valid_to date not null,
  wht_rate numeric(5,2) not null,
  created_at timestamptz default now()
);

-- PURCHASE ORDERS
create table purchase_orders (
  id uuid primary key default gen_random_uuid(),
  po_number text not null unique,
  po_date date not null,
  supplier_id uuid references suppliers(id),
  tender_no text,
  gst_rate numeric(5,2) default 18,
  total_amount_ex_gst numeric(15,2) default 0,
  gst_amount numeric(15,2) default 0,
  grand_total numeric(15,2) default 0,
  ld_rate numeric(5,2) default 2,
  ld_max_cap_pct numeric(5,2) default 10,
  pg_amount numeric(15,2) default 0,
  pg_validity_to date,
  pg_bank_guarantee_no text,
  warranty_months integer default 24,
  budget_heads jsonb default '[]',
  payment_method text default 'cheque',
  lc_application_date date,
  prototype_required boolean default false,
  notes text,
  status text default 'pending_approval',
  created_at timestamptz default now()
);

-- PO ITEMS
create table po_items (
  id uuid primary key default gen_random_uuid(),
  po_id uuid references purchase_orders(id) on delete cascade,
  product_id uuid references products(id),
  product_name text not null,
  description text,
  item_code text,
  unit_rate numeric(15,2) not null,
  total_qty integer not null,
  unit_of_measure text default 'Each',
  created_at timestamptz default now()
);

-- DELIVERY SCHEDULE
create table po_delivery_schedule (
  id uuid primary key default gen_random_uuid(),
  po_id uuid references purchase_orders(id) on delete cascade,
  po_item_id uuid references po_items(id) on delete cascade,
  shipment_no integer not null,
  promised_qty integer not null,
  promised_date date not null,
  created_at timestamptz default now()
);

-- INSPECTION CERTIFICATES
create table inspection_certificates (
  id uuid primary key default gen_random_uuid(),
  po_id uuid references purchase_orders(id) on delete cascade,
  ic_number text not null,
  ic_date date,
  call_date date,
  sample_collection_date date,
  inspection_completion_date date,
  total_qty integer default 0,
  created_at timestamptz default now()
);

-- SUPPLY BILLS
create table supply_bills (
  id uuid primary key default gen_random_uuid(),
  po_id uuid references purchase_orders(id) on delete cascade,
  bill_number text not null,
  bill_date date not null,
  ic_id uuid references inspection_certificates(id),
  ic_number text,
  ic_date date,
  call_date date,
  sample_collection_date date,
  inspection_completion_date date,
  ic_qty_this_bill integer default 0,
  challan_number text,
  challan_date date,
  total_bill_amount numeric(15,2) default 0,
  total_ld numeric(15,2) default 0,
  wht_rate_applied numeric(5,2) default 0,
  wht_cert_no text,
  wht_amount numeric(15,2) default 0,
  net_payable numeric(15,2) default 0,
  pg_valid boolean,
  eff_delivery_date date,
  eff_delivery_reason text,
  status text default 'pending',
  created_at timestamptz default now()
);

-- GRNs
create table grns (
  id uuid primary key default gen_random_uuid(),
  supply_bill_id uuid references supply_bills(id) on delete cascade,
  po_id uuid references purchase_orders(id),
  grn_number text not null,
  grn_date date,
  consignee_store text,
  total_amount numeric(15,2) default 0,
  total_ld_capped numeric(15,2) default 0,
  created_at timestamptz default now()
);

-- GRN ITEMS
create table grn_items (
  id uuid primary key default gen_random_uuid(),
  grn_id uuid references grns(id) on delete cascade,
  po_id uuid references purchase_orders(id),
  po_item_id uuid references po_items(id),
  schedule_id uuid references po_delivery_schedule(id),
  description text,
  unit_rate numeric(15,2) default 0,
  promised_date date,
  qty_delivered integer default 0,
  amount numeric(15,2) default 0,
  delay_days integer default 0,
  delay_months integer default 0,
  ld_before_cap numeric(15,2) default 0,
  ld_capped numeric(15,2) default 0,
  is_late boolean default false,
  eff_delivery_date date,
  created_at timestamptz default now()
);

-- GST BILLS
create table gst_bills (
  id uuid primary key default gen_random_uuid(),
  po_id uuid references purchase_orders(id) on delete cascade,
  gst_bill_number text not null,
  gst_bill_date date not null,
  gst_amount numeric(15,2) default 0,
  ld_on_gst numeric(15,2) default 0,
  deduction_1_5th numeric(15,2) default 0,
  wht_rate numeric(5,2) default 0,
  wht_cert_no text,
  wht_amount numeric(15,2) default 0,
  net_payable numeric(15,2) default 0,
  created_at timestamptz default now()
);

-- GST BILL GRN LINKS
create table gst_bill_grn_links (
  id uuid primary key default gen_random_uuid(),
  gst_bill_id uuid references gst_bills(id) on delete cascade,
  grn_id uuid references grns(id) on delete cascade
);

-- APP USERS
create table app_users (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  email text not null unique,
  role text not null check (role in ('admin','accounts_assistant','accounts_officer','viewer')),
  is_active boolean default true,
  created_at timestamptz default now()
);

-- DISABLE RLS for now (enable when adding auth)
alter table products disable row level security;
alter table suppliers disable row level security;
alter table supplier_exemptions disable row level security;
alter table purchase_orders disable row level security;
alter table po_items disable row level security;
alter table po_delivery_schedule disable row level security;
alter table inspection_certificates disable row level security;
alter table supply_bills disable row level security;
alter table grns disable row level security;
alter table grn_items disable row level security;
alter table gst_bills disable row level security;
alter table gst_bill_grn_links disable row level security;
alter table app_users disable row level security;

select 'Schema created successfully' as result;
