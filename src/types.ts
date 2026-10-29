export type ProductType = 'kg' | 'piece';
export type PaymentMethod = 'cash' | 'upi';

export interface Product {
  id: string;
  name: string;
  category: ProductType;
  purchasePrice: number;
  retailPrice: number | null;
  sellingPrice: number;
  discountPercent: number;
  stockQuantity: number;
  lowStockAt: number;
  active: boolean;
  createdAt: string;
}

export interface Customer {
  id: string;
  name: string;
  phone: string;
  phoneNormalized: string;
  createdAt: string;
  updatedAt: string;
}

export interface SaleLine {
  id: string;
  productId: string;
  productName: string;
  category: ProductType;
  displayQuantity: number;
  displayUnit: 'g' | 'kg' | 'piece';
  baseQuantity: number;
  unitPrice: number;
  costPrice: number;
  discountAmount: number;
  lineTotal: number;
}

export interface Payment {
  id: string;
  method: PaymentMethod;
  amount: number;
  reference?: string;
}

export interface Sale {
  id: string;
  receiptNumber: string;
  customerName: string;
  customerPhone: string;
  subtotal: number;
  discountTotal: number;
  total: number;
  status: 'completed' | 'void';
  createdAt: string;
  lines: SaleLine[];
  payments: Payment[];
}

export interface Expense {
  id: string;
  category: string;
  note: string;
  amount: number;
  method: PaymentMethod;
  createdAt: string;
}

export interface StockMovement {
  id: string;
  productId: string;
  productName: string;
  type: 'opening' | 'purchase' | 'adjustment' | 'sale';
  quantity: number;
  cost: number;
  method?: PaymentMethod;
  note: string;
  createdAt: string;
}

export interface ShopState {
  shopName: string;
  products: Product[];
  customers: Customer[];
  sales: Sale[];
  expenses: Expense[];
  stockMovements: StockMovement[];
  demoSeedVersion?: number;
}

export interface ProductInput {
  name: string;
  category: ProductType;
  purchasePrice: number;
  retailPrice: number | null;
  sellingPrice: number;
  discountPercent: number;
  stockQuantity: number;
  lowStockAt: number;
}

export interface CartLine {
  productId: string;
  quantity: number;
  unit: 'g' | 'kg' | 'piece';
}
