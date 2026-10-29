import type { CartLine, Customer, Expense, Product, ProductInput, Sale, ShopState, StockMovement } from './types';
import { createId } from './id';

const STORAGE_KEY = 'shop-billing-demo-v1';
const money = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;
const isoNow = () => new Date().toISOString();
const id = createId;
const localDateStamp = (value: string | Date) => {
  const date = new Date(value);
  return `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}${String(date.getDate()).padStart(2, '0')}`;
};

function baseDemoState(): ShopState {
  const now = isoNow();
  const products: Product[] = [
    { id: 'sample-kg', name: 'Sample loose product', category: 'kg', purchasePrice: 620, retailPrice: 999, sellingPrice: 899, discountPercent: 0, stockQuantity: 46.5, lowStockAt: 10, active: true, createdAt: now },
    { id: 'sample-rice', name: 'Rice', category: 'kg', purchasePrice: 43, retailPrice: 60, sellingPrice: 52, discountPercent: 0, stockQuantity: 80, lowStockAt: 10, active: true, createdAt: now },
    { id: 'sample-sugar', name: 'Sugar', category: 'kg', purchasePrice: 34, retailPrice: 48, sellingPrice: 42, discountPercent: 0, stockQuantity: 65, lowStockAt: 8, active: true, createdAt: now },
    { id: 'sample-tea', name: 'Tea powder', category: 'kg', purchasePrice: 320, retailPrice: 490, sellingPrice: 420, discountPercent: 0, stockQuantity: 18, lowStockAt: 4, active: true, createdAt: now },
    { id: 'sample-cashew', name: 'Cashew nuts', category: 'kg', purchasePrice: 620, retailPrice: 999, sellingPrice: 899, discountPercent: 0, stockQuantity: 12.5, lowStockAt: 3, active: true, createdAt: now },
    { id: 'sample-dry-mix', name: 'Dry fruit mix', category: 'kg', purchasePrice: 470, retailPrice: 720, sellingPrice: 650, discountPercent: 0, stockQuantity: 8.25, lowStockAt: 2, active: true, createdAt: now },
    { id: 'sample-piece', name: 'Sample piece product', category: 'piece', purchasePrice: 20, retailPrice: 40, sellingPrice: 35, discountPercent: 0, stockQuantity: 72, lowStockAt: 12, active: true, createdAt: now },
    { id: 'sample-pack', name: 'Sample 15 kg pack', category: 'piece', purchasePrice: 10600, retailPrice: 15000, sellingPrice: 13900, discountPercent: 0, stockQuantity: 8, lowStockAt: 2, active: true, createdAt: now },
    { id: 'sample-water', name: 'Water bottle', category: 'piece', purchasePrice: 10, retailPrice: 25, sellingPrice: 20, discountPercent: 0, stockQuantity: 48, lowStockAt: 10, active: true, createdAt: now },
    { id: 'sample-soap', name: 'Soap bar', category: 'piece', purchasePrice: 27, retailPrice: 50, sellingPrice: 42, discountPercent: 0, stockQuantity: 25, lowStockAt: 6, active: true, createdAt: now },
    { id: 'sample-snack', name: 'Snack pack', category: 'piece', purchasePrice: 15, retailPrice: 30, sellingPrice: 25, discountPercent: 0, stockQuantity: 36, lowStockAt: 8, active: true, createdAt: now },
    { id: 'sample-oil', name: 'Cooking oil bottle', category: 'piece', purchasePrice: 135, retailPrice: 180, sellingPrice: 165, discountPercent: 0, stockQuantity: 14, lowStockAt: 4, active: true, createdAt: now },
  ];
  return {
    shopName: 'My Shop', products, customers: [], sales: [], expenses: [], demoSeedVersion: 3,
    stockMovements: products.map((product) => ({
      id: `${product.id}-opening`, productId: product.id, productName: product.name, type: 'opening' as const,
      quantity: product.stockQuantity, cost: product.purchasePrice, note: 'Demo opening stock', createdAt: now,
    })),
  };
}

function addDemoActivity(state: ShopState): ShopState {
  let next = state;
  if (next.sales.length === 0) {
    next = createDemoSale(next, [{ productId: 'sample-kg', quantity: 500, unit: 'g' }], { customerName: '', customerPhone: '', billDiscount: 0, cashAmount: 449.5, upiAmount: 0 }).state;
    next = createDemoSale(next, [{ productId: 'sample-piece', quantity: 2, unit: 'piece' }], { customerName: '', customerPhone: '', billDiscount: 0, cashAmount: 0, upiAmount: 70 }).state;
    next = createDemoSale(next, [{ productId: 'sample-kg', quantity: 70.5, unit: 'g' }], { customerName: '', customerPhone: '', billDiscount: 0, cashAmount: 0, upiAmount: 63.38 }).state;
    next = createDemoSale(next, [{ productId: 'sample-rice', quantity: 3, unit: 'kg' }], { customerName: '', customerPhone: '', billDiscount: 0, cashAmount: 156, upiAmount: 0 }).state;
  }
  if (next.expenses.length === 0) {
    next = { ...next, expenses: [
      { id: 'demo-exp-transport', category: 'Transport', note: 'Local delivery', amount: 30, method: 'cash', createdAt: isoNow() },
      { id: 'demo-exp-electricity', category: 'Electricity', note: 'Shop bill', amount: 50, method: 'upi', createdAt: isoNow() },
    ] };
  }
  return { ...next, demoSeedVersion: 3 };
}

function seedState(): ShopState {
  return addDemoActivity(baseDemoState());
}

export function loadDemoState(): ShopState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const saved = JSON.parse(raw) as ShopState;
      if ((saved.demoSeedVersion ?? 0) >= 3 && Array.isArray(saved.customers)) return saved;
      const baseline = baseDemoState();
      const existingIds = new Set(saved.products.map((product) => product.id));
      const addedProducts = baseline.products.filter((product) => !existingIds.has(product.id));
      const addedIds = new Set(addedProducts.map((product) => product.id));
      const merged: ShopState = {
        ...saved,
        customers: saved.customers ?? [],
        products: [...saved.products, ...addedProducts],
        stockMovements: [...saved.stockMovements, ...baseline.stockMovements.filter((movement) => addedIds.has(movement.productId))],
      };
      const upgraded = addDemoActivity(merged);
      saveDemoState(upgraded);
      return upgraded;
    }
  } catch {
    // If local demo data is malformed, start a fresh browser-local demo.
  }
  const initial = seedState();
  saveDemoState(initial);
  return initial;
}

export function saveDemoState(state: ShopState) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

export function addDemoProduct(state: ShopState, input: ProductInput): ShopState {
  const product: Product = {
    id: id(), ...input, stockQuantity: 0, active: true, createdAt: isoNow(),
  };
  const next: ShopState = { ...state, products: [product, ...state.products] };
  if (input.stockQuantity > 0) return receiveDemoStock(next, product.id, input.stockQuantity, input.purchasePrice, 'opening', undefined, 'Opening stock');
  return next;
}

export function receiveDemoStock(
  state: ShopState,
  productId: string,
  quantity: number,
  unitCost: number,
  type: 'opening' | 'purchase' | 'adjustment' = 'purchase',
  method?: 'cash' | 'upi',
  note = '',
): ShopState {
  if (!Number.isFinite(quantity) || quantity <= 0) throw new Error('Enter a stock quantity greater than zero.');
  const product = state.products.find((item) => item.id === productId);
  if (!product) throw new Error('Product not found.');
  const movement: StockMovement = {
    id: id(), productId, productName: product.name, type, quantity,
    cost: money(unitCost), method, note, createdAt: isoNow(),
  };
  return {
    ...state,
    products: state.products.map((item) => item.id === productId ? { ...item, stockQuantity: money(item.stockQuantity + quantity), purchasePrice: money(unitCost || item.purchasePrice) } : item),
    stockMovements: [movement, ...state.stockMovements],
  };
}

export function addDemoExpense(state: ShopState, input: Omit<Expense, 'id' | 'createdAt'> & { createdAt?: string }): ShopState {
  if (input.amount <= 0) throw new Error('Enter an amount greater than zero.');
  const expense: Expense = { ...input, id: id(), createdAt: input.createdAt ?? isoNow() };
  return { ...state, expenses: [expense, ...state.expenses] };
}

function saveDemoCustomer(customers: Customer[], name: string, phone: string): Customer[] {
  const cleanedPhone = phone.trim();
  const phoneNormalized = cleanedPhone.replace(/\D/g, '');
  if (!phoneNormalized) return customers;
  const existing = customers.find((customer) => customer.phoneNormalized === phoneNormalized);
  const updatedAt = isoNow();
  if (existing) return customers.map((customer) => customer.id === existing.id ? {
    ...customer,
    name: name.trim() || customer.name,
    phone: cleanedPhone,
    updatedAt,
  } : customer);
  return [{ id: id(), name: name.trim(), phone: cleanedPhone, phoneNormalized, createdAt: updatedAt, updatedAt }, ...customers];
}

export function createDemoSale(
  state: ShopState,
  cart: CartLine[],
  values: { customerName: string; customerPhone: string; billDiscount: number; cashAmount: number; upiAmount: number },
): { state: ShopState; sale: Sale } {
  if (!cart.length) throw new Error('Add at least one product to the bill.');
  let subtotal = 0;
  let productDiscountTotal = 0;
  const draftLines = cart.map((cartLine) => {
    const product = state.products.find((item) => item.id === cartLine.productId && item.active);
    if (!product) throw new Error('One of the products is no longer available.');
    if (!Number.isFinite(cartLine.quantity) || cartLine.quantity <= 0) throw new Error(`Enter a valid quantity for ${product.name}.`);
    const expectedUnit = product.category === 'piece' ? 'piece' : cartLine.unit;
    if (product.category === 'piece' && (!Number.isInteger(cartLine.quantity) || cartLine.unit !== 'piece')) throw new Error('Piece quantities must be whole numbers.');
    if (product.category === 'kg' && !['g', 'kg'].includes(cartLine.unit)) throw new Error('Choose grams or kilograms for this product.');
    const baseQuantity = product.category === 'kg' ? (cartLine.unit === 'g' ? cartLine.quantity / 1000 : cartLine.quantity) : cartLine.quantity;
    if (product.stockQuantity + 0.0000001 < baseQuantity) throw new Error(`Not enough stock for ${product.name}. Available: ${product.stockQuantity.toFixed(product.category === 'kg' ? 3 : 0)} ${product.category === 'kg' ? 'kg' : 'pcs'}.`);
    const gross = money(baseQuantity * product.sellingPrice);
    const productDiscount = money(gross * product.discountPercent / 100);
    subtotal = money(subtotal + gross);
    productDiscountTotal = money(productDiscountTotal + productDiscount);
    return {
      id: id(), productId: product.id, productName: product.name, category: product.category,
      displayQuantity: cartLine.quantity, displayUnit: expectedUnit as 'g' | 'kg' | 'piece',
      baseQuantity, unitPrice: product.sellingPrice, costPrice: product.purchasePrice,
      discountAmount: productDiscount, lineTotal: money(gross - productDiscount),
    };
  });
  const beforeBillDiscount = money(subtotal - productDiscountTotal);
  const billDiscount = money(values.billDiscount || 0);
  if (billDiscount < 0 || billDiscount > beforeBillDiscount) throw new Error('Bill discount cannot exceed the amount due.');
  const total = money(beforeBillDiscount - billDiscount);
  const cash = money(values.cashAmount || 0);
  const upi = money(values.upiAmount || 0);
  if (money(cash + upi) !== total) throw new Error(`Payment must equal the bill total of ₹${total.toFixed(2)}.`);
  if (cash < 0 || upi < 0) throw new Error('Payment amounts cannot be negative.');
  const payableBeforeAllocation = draftLines.reduce((sum, line) => sum + line.lineTotal, 0);
  let discountLeft = billDiscount;
  const lines = draftLines.map((line, index) => {
    const proportionalShare = payableBeforeAllocation === 0 ? 0 : money(billDiscount * line.lineTotal / payableBeforeAllocation);
    const share = Math.min(discountLeft, line.lineTotal, index === draftLines.length - 1 ? discountLeft : proportionalShare);
    discountLeft = money(discountLeft - share);
    return { ...line, discountAmount: money(line.discountAmount + share), lineTotal: money(line.lineTotal - share) };
  });
  const today = localDateStamp(new Date());
  const numberToday = state.sales.filter((sale) => localDateStamp(sale.createdAt) === today).length + 1;
  const sale: Sale = {
    id: id(), receiptNumber: `${today}-${String(numberToday).padStart(4, '0')}`,
    customerName: values.customerName.trim(), customerPhone: values.customerPhone.trim(),
    subtotal, discountTotal: money(productDiscountTotal + billDiscount), total, status: 'completed', createdAt: isoNow(),
    lines,
    payments: [
      ...(cash > 0 ? [{ id: id(), method: 'cash' as const, amount: cash }] : []),
      ...(upi > 0 ? [{ id: id(), method: 'upi' as const, amount: upi }] : []),
    ],
  };
  const next: ShopState = {
    ...state,
    customers: saveDemoCustomer(state.customers ?? [], values.customerName, values.customerPhone),
    sales: [sale, ...state.sales],
    products: state.products.map((product) => {
      const sold = lines.filter((line) => line.productId === product.id).reduce((sum, line) => sum + line.baseQuantity, 0);
      return sold ? { ...product, stockQuantity: money(product.stockQuantity - sold) } : product;
    }),
    stockMovements: [
      ...lines.map((line) => ({ id: id(), productId: line.productId, productName: line.productName, type: 'sale' as const, quantity: -line.baseQuantity, cost: line.costPrice, note: `Receipt ${sale.receiptNumber}`, createdAt: sale.createdAt })),
      ...state.stockMovements,
    ],
  };
  return { state: next, sale };
}

