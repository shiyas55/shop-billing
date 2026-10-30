import type { Customer, Expense, Payment, Product, Sale, SaleLine, ShopState, StockMovement } from './types';
import { supabase } from './supabase';
import { createId } from './id';

function requiredClient() {
  if (!supabase) throw new Error('Supabase is not configured. Add the project URL and publishable key.');
  return supabase;
}

export async function getOwnedShop() {
  const client = requiredClient();
  const { data, error } = await client.from('shops').select('id,name').order('created_at').limit(1).maybeSingle();
  if (error) throw error;
  return data as { id: string; name: string } | null;
}

export async function createOwnedShop(name: string) {
  const client = requiredClient();
  const { data: authData } = await client.auth.getUser();
  if (!authData.user) throw new Error('Sign in before creating a shop.');
  const { data, error } = await client.from('shops').insert({ owner_id: authData.user.id, name: name.trim() || 'My Shop' }).select('id,name').single();
  if (error) throw error;
  return data as { id: string; name: string };
}

export async function renameOwnedShop(shopId: string, name: string) {
  const { error } = await requiredClient().from('shops').update({ name: name.trim() || 'My Shop' }).eq('id', shopId);
  if (error) throw error;
}

export async function loadCloudState(shopId: string, shopName: string): Promise<ShopState> {
  const client = requiredClient();
  const [productResult, customerResult, salesResult, lineResult, paymentResult, expenseResult, movementResult] = await Promise.all([
    client.from('products').select('*').eq('shop_id', shopId).order('name'),
    client.from('customers').select('*').eq('shop_id', shopId).order('updated_at', { ascending: false }),
    client.from('sales').select('*').eq('shop_id', shopId).order('created_at', { ascending: false }).limit(500),
    client.from('sale_items').select('*').eq('shop_id', shopId).order('created_at'),
    client.from('payments').select('*').eq('shop_id', shopId).order('created_at'),
    client.from('expenses').select('*').eq('shop_id', shopId).order('created_at', { ascending: false }).limit(1000),
    client.from('stock_movements').select('*').eq('shop_id', shopId).order('created_at', { ascending: false }).limit(1000),
  ]);
  for (const result of [productResult, customerResult, salesResult, lineResult, paymentResult, expenseResult, movementResult]) {
    if (result.error) throw result.error;
  }
  const products: Product[] = (productResult.data ?? []).map((row: any) => ({
    id: row.id, name: row.name, category: row.category, purchasePrice: Number(row.purchase_price),
    retailPrice: row.retail_price == null ? null : Number(row.retail_price), sellingPrice: Number(row.selling_price),
    discountPercent: Number(row.discount_percent ?? 0), stockQuantity: Number(row.stock_quantity),
    lowStockAt: Number(row.low_stock_at ?? 0), active: row.active, createdAt: row.created_at,
  }));
  const customers: Customer[] = (customerResult.data ?? []).map((row: any) => ({
    id: row.id, name: row.name ?? '', phone: row.phone, phoneNormalized: row.phone_normalized,
    createdAt: row.created_at, updatedAt: row.updated_at,
  }));
  const linesBySale = new Map<string, SaleLine[]>();
  for (const row of lineResult.data ?? []) {
    const line: SaleLine = {
      id: row.id, productId: row.product_id, productName: row.product_name_snapshot, category: row.category_snapshot,
      displayQuantity: Number(row.display_quantity), displayUnit: row.display_unit,
      baseQuantity: Number(row.base_quantity), unitPrice: Number(row.unit_price_snapshot),
      costPrice: Number(row.cost_price_snapshot), discountAmount: Number(row.discount_amount), lineTotal: Number(row.line_total),
    };
    linesBySale.set(row.sale_id, [...(linesBySale.get(row.sale_id) ?? []), line]);
  }
  const paymentsBySale = new Map<string, Payment[]>();
  for (const row of paymentResult.data ?? []) {
    const payment: Payment = { id: row.id, method: row.method, amount: Number(row.amount), reference: row.reference ?? undefined };
    paymentsBySale.set(row.sale_id, [...(paymentsBySale.get(row.sale_id) ?? []), payment]);
  }
  const sales: Sale[] = (salesResult.data ?? []).map((row: any) => ({
    id: row.id, receiptNumber: row.receipt_number, customerName: row.customer_name ?? '', customerPhone: row.customer_phone ?? '',
    subtotal: Number(row.subtotal), discountTotal: Number(row.discount_total), total: Number(row.total),
    status: row.status, createdAt: row.created_at, lines: linesBySale.get(row.id) ?? [], payments: paymentsBySale.get(row.id) ?? [],
  }));
  const expenses: Expense[] = (expenseResult.data ?? []).map((row: any) => ({
    id: row.id, category: row.category, note: row.note ?? '', amount: Number(row.amount), method: row.method, createdAt: row.created_at,
  }));
  const stockMovements: StockMovement[] = (movementResult.data ?? []).map((row: any) => ({
    id: row.id, productId: row.product_id, productName: row.product_name_snapshot ?? 'Product', type: row.movement_type,
    quantity: Number(row.quantity), cost: Number(row.unit_cost ?? 0), method: row.payment_method ?? undefined,
    note: row.note ?? '', createdAt: row.created_at,
  }));
  return { shopName, products, customers, sales, expenses, stockMovements };
}

export async function saveCloudProduct(shopId: string, input: {
  id?: string; name: string; category: 'kg' | 'piece'; purchasePrice: number; retailPrice: number | null;
  sellingPrice: number; discountPercent: number; stockQuantity?: number; lowStockAt: number;
}) {
  const client = requiredClient();
  const row = {
    shop_id: shopId, name: input.name.trim(), category: input.category,
    purchase_price: input.purchasePrice, retail_price: input.retailPrice, selling_price: input.sellingPrice,
    discount_percent: input.discountPercent, low_stock_at: input.lowStockAt, active: true,
  };
  if (input.id) {
    const { error } = await client.from('products').update(row).eq('id', input.id).eq('shop_id', shopId);
    if (error) throw error;
  } else {
    const { data, error } = await client.from('products').insert({ ...row, stock_quantity: 0 }).select('id').single();
    if (error) throw error;
    if ((input.stockQuantity ?? 0) > 0) {
      await receiveCloudStock({ productId: data.id, quantity: input.stockQuantity!, unitCost: input.purchasePrice, type: 'opening', note: 'Opening stock' });
    }
  }
}

export async function archiveCloudProduct(shopId: string, productId: string) {
  const { error } = await requiredClient().from('products').update({ active: false }).eq('id', productId).eq('shop_id', shopId);
  if (error) throw error;
}

export async function receiveCloudStock(input: {
  productId: string; quantity: number; unitCost: number; type: 'purchase' | 'adjustment' | 'opening';
  method?: 'cash' | 'upi'; note: string;
}) {
  const { error } = await requiredClient().rpc('receive_stock', {
    p_product_id: input.productId, p_quantity: input.quantity, p_unit_cost: input.unitCost,
    p_payment_method: input.method ?? null, p_note: input.note, p_movement_type: input.type,
  });
  if (error) throw error;
}

export async function saveCloudExpense(shopId: string, input: { category: string; note: string; amount: number; method: 'cash' | 'upi'; createdAt?: string }) {
  const { error } = await requiredClient().from('expenses').insert({
    shop_id: shopId, category: input.category, note: input.note, amount: input.amount, method: input.method,
    ...(input.createdAt ? { created_at: input.createdAt } : {}),
  });
  if (error) throw error;
}

export async function voidCloudSale(saleId: string) {
  const { error } = await requiredClient().from('sales').update({ status: 'void' }).eq('id', saleId);
  if (error) throw error;
}

export async function saveCloudSale(shopId: string, input: {
  customerName: string; customerPhone: string; billDiscount: number; cart: { productId: string; quantity: number; unit: 'g' | 'kg' | 'piece' }[];
  cashAmount: number; upiAmount: number;
}) {
  const phone = input.customerPhone.trim();
  const phoneNormalized = phone.replace(/\D/g, '');
  if (phoneNormalized) {
    const customerName = input.customerName.trim();
    const { error: customerError } = await requiredClient().from('customers').upsert({
      shop_id: shopId, ...(customerName ? { name: customerName } : {}), phone, phone_normalized: phoneNormalized, updated_at: new Date().toISOString(),
    }, { onConflict: 'shop_id,phone_normalized' });
    if (customerError) throw customerError;
  }
  const payments = [
    ...(input.cashAmount > 0 ? [{ method: 'cash', amount: input.cashAmount }] : []),
    ...(input.upiAmount > 0 ? [{ method: 'upi', amount: input.upiAmount }] : []),
  ];
  const { data, error } = await requiredClient().rpc('create_sale', {
    p_payload: {
      shop_id: shopId,
      customer_name: input.customerName.trim(), customer_phone: input.customerPhone.trim(),
      bill_discount: input.billDiscount,
      lines: input.cart.map((line) => ({ product_id: line.productId, quantity: line.quantity, unit: line.unit })),
      payments,
    },
    p_idempotency_key: createId(),
  });
  if (error) throw error;
  return data as { sale_id: string; receipt_number: string; total: number };
}

