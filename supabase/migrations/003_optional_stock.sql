-- Migration 003: Allow selling products without stock restrictions (optional stock for Kg and open items)
alter table public.products drop constraint if exists products_stock_quantity_check;
