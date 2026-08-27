# LESCO Pre-Audit System — Setup Guide

## Quick Start (Demo Mode)
The app works immediately in demo mode with sample data (PO 4314-P1).
Just open index.html in browser or deploy to Vercel.

## For Production (Supabase Backend)

### Step 1: Create Supabase Project
1. Go to https://supabase.com → New Project
2. Copy your Project URL and Anon Key

### Step 2: Run Database Schema
1. Open Supabase → SQL Editor
2. Paste contents of SUPABASE_SCHEMA.sql → Run

### Step 3: Configure Environment
1. Copy .env.example → .env
2. Fill in your Supabase URL and Anon Key
3. In src/store.js — replace in-memory functions with Supabase queries

### Step 4: Deploy to Vercel
1. Push to GitHub
2. Connect to Vercel → Import repository
3. Add environment variables in Vercel dashboard
4. Deploy

## Features
- ✅ Supplier master with WHT rates
- ✅ Exemption certificates (time-based, multiple per supplier)
- ✅ Purchase Order entry (supply + GST amounts)
- ✅ Delivery schedule per PO
- ✅ Supply bills (1-5 GRNs per bill)
- ✅ Auto LD calculation (2%/month, fraction = full month)
- ✅ LD cap enforcement (10% of grand total, cumulative)
- ✅ WHT auto-rate by bill date + exemption period
- ✅ GST bills linked to supply bills (1/5th deduction)
- ✅ Balance qty/amount tracking
- ✅ Pre-audit print sheet with signatures

## LD Formula
- Rate: 2% per month (configurable per PO)
- Basis: Late qty × unit rate
- Fraction of month = full month
- Max cap: 10% of Grand Total (incl GST), cumulative across all bills

## WHT Logic
- Company: 5% (default)
- Individual: 5.5% (default)
- Exemption certificate: enters reduced rate + validity dates
- System auto-selects rate based on bill date
