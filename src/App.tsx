import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import {
  AlertTriangle, ArrowDownRight, ArrowRight, ArrowUpRight, Banknote, Boxes, CalendarDays,
  Check, ChevronDown, ChevronRight, CircleDollarSign, Clock3, CreditCard, FileText, House, Info,
  LoaderCircle, LogOut, Menu, Package, PackagePlus, Pencil, Plus, Printer, ReceiptText, RefreshCw,
  Calculator, Scale, Search, Settings, Share2, ShoppingBag, Smartphone, Sparkles, Store, Trash2, Users, WalletCards, X,
} from 'lucide-react';
import type { CartLine, Expense, Product, ProductInput, Sale, ShopState } from './types';
import { archiveCloudProduct, createOwnedShop, getOwnedShop, loadCloudState, receiveCloudStock, renameOwnedShop, saveCloudExpense, saveCloudProduct, saveCloudSale } from './cloud';
import { clearSupabaseConfig, isSupabaseConfigured, saveSupabaseConfig, supabase } from './supabase';

const money = (value: number) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number.isFinite(value) ? value : 0);
const roundMoney = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;
const localDateKey = (value: string | Date) => {
  const date = new Date(value);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
};
const dateLabel = (value: string) => new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(value));
const timeLabel = (value: string) => new Intl.DateTimeFormat('en-IN', { hour: 'numeric', minute: '2-digit' }).format(new Date(value));
const normalizedPhone = (value: string) => value.replace(/\D/g, '');
const safeProductQuantity = (product?: Product) => product?.category === 'kg' ? 'kg' : 'pcs';
const isUntrackedKg = (product: Product) => product.category === 'kg' && (product.stockQuantity >= 900000 || product.stockQuantity <= 0);
const stockLabel = (product: Product) => isUntrackedKg(product) ? 'Open' : product.stockQuantity.toLocaleString('en-IN', { maximumFractionDigits: product.category === 'kg' ? 3 : 0 });

type Tab = 'dashboard' | 'bill' | 'products' | 'customers' | 'expenses' | 'sales' | 'settings';
type Notice = { type: 'success' | 'error' | 'info'; text: string } | null;

const emptyState: ShopState = {
  shopName: 'My Shop',
  products: [],
  customers: [],
  sales: [],
  expenses: [],
  stockMovements: [],
};

const navItems: { id: Tab; label: string; icon: typeof House }[] = [
  { id: 'dashboard', label: 'Overview', icon: House },
  { id: 'bill', label: 'New bill', icon: ReceiptText },
  { id: 'products', label: 'Products', icon: Package },
  { id: 'customers', label: 'Customers', icon: Users },
  { id: 'expenses', label: 'Expenses', icon: WalletCards },
  { id: 'sales', label: 'Sales history', icon: Clock3 },
];

function MetricCard({ label, value, hint, icon: Icon, tone = 'green' }: { label: string; value: string; hint: string; icon: typeof House; tone?: 'green' | 'amber' | 'blue' | 'rose' }) {
  return <article className={`metric-card metric-${tone}`}>
    <div className="metric-top"><span>{label}</span><span className="metric-icon"><Icon size={18} /></span></div>
    <strong>{value}</strong><small>{hint}</small>
  </article>;
}

function EmptyState({ icon: Icon = Package, title, message, action }: { icon?: typeof House; title: string; message: string; action?: ReactNode }) {
  return <div className="empty-state"><span className="empty-icon"><Icon size={22} /></span><strong>{title}</strong><p>{message}</p>{action}</div>;
}

function Overlay({ children, onClose, wide = false }: { children: ReactNode; onClose: () => void; wide?: boolean }) {
  return <div className="overlay" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
    <section className={`modal ${wide ? 'modal-wide' : ''}`} role="dialog" aria-modal="true">{children}</section>
  </div>;
}

function ConnectSupabaseScreen({ onConnect }: { onConnect: (url: string, key: string) => void }) {
  const [url, setUrl] = useState('https://nwmuneczyopsekalfbyb.supabase.co');
  const [key, setKey] = useState('');
  const [error, setError] = useState('');

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!key.trim()) { setError('Please enter your Supabase anon public key.'); return; }
    onConnect(url.trim(), key.trim());
  };

  return <main className="auth-shell"><div className="auth-card">
    <div className="auth-brand"><span className="brand-mark"><ShoppingBag size={22} /></span><span>Shop Billing</span></div>
    <p className="eyebrow">DATABASE SETUP</p><h1>Connect Supabase</h1><p className="muted">Enter your Supabase API credentials to connect your live shop database.</p>
    <form onSubmit={submit} className="form-stack">
      <label>Supabase Project URL<input required type="url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://YOUR_PROJECT.supabase.co" /></label>
      <label>Supabase Anon Key<input required type="text" value={key} onChange={(e) => setKey(e.target.value)} placeholder="eyJhbGciOi..." /></label>
      {error && <p className="form-error">{error}</p>}
      <button className="button button-primary button-full">Save & Connect</button>
    </form>
    <p className="auth-footnote">
      Find your anon key in <a href="https://supabase.com/dashboard/project/nwmuneczyopsekalfbyb/settings/api" target="_blank" rel="noreferrer" style={{ textDecoration: 'underline' }}>Supabase Settings → API</a>.
    </p>
  </div></main>;
}

function AuthScreen({ onLogin, onSignUp, onResetKey }: { onLogin: (email: string, password: string) => Promise<void>; onSignUp: (email: string, password: string) => Promise<void>; onResetKey: () => void }) {
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async (event: FormEvent) => {
    event.preventDefault(); setBusy(true); setError(''); setInfo('');
    try {
      if (mode === 'signin') {
        await onLogin(email, password);
      } else {
        await onSignUp(email, password);
        setInfo('Account created! If your Supabase requires email verification, check your inbox; otherwise you can sign in directly.');
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Authentication failed.');
    } finally {
      setBusy(false);
    }
  };
  return <main className="auth-shell"><div className="auth-card">
    <div className="auth-brand"><span className="brand-mark"><ShoppingBag size={22} /></span><span>Shop Billing</span></div>
    <div className="segmented" style={{ marginBottom: '16px' }}>
      <button type="button" className={mode === 'signin' ? 'selected' : ''} onClick={() => { setMode('signin'); setError(''); setInfo(''); }}>Sign in</button>
      <button type="button" className={mode === 'signup' ? 'selected' : ''} onClick={() => { setMode('signup'); setError(''); setInfo(''); }}>Create account</button>
    </div>
    <p className="eyebrow">OWNER ACCESS</p>
    <h1>{mode === 'signin' ? 'Welcome back' : 'Create owner account'}</h1>
    <p className="muted">{mode === 'signin' ? 'Sign in with your owner email and password.' : 'Register your owner email and password to manage your shop.'}</p>
    <form onSubmit={submit} className="form-stack">
      <label>Email address<input required type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="admin@gmail.com" /></label>
      <label>Password<input required type="password" minLength={6} autoComplete={mode === 'signin' ? 'current-password' : 'new-password'} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="At least 6 characters" /></label>
      {error && <p className="form-error">{error}</p>}
      {info && <p className="form-info" style={{ margin: 0, padding: '10px 12px', borderRadius: '8px', color: '#276b4e', background: '#eef6f0', fontSize: '12px' }}>{info}</p>}
      <button className="button button-primary button-full" disabled={busy}>{busy ? <LoaderCircle className="spin" size={17} /> : null} {mode === 'signin' ? 'Sign in' : 'Create account & Sign in'}</button>
    </form>
    <div className="auth-key-switch" style={{ marginTop: '14px', textAlign: 'center', display: 'flex', flexDirection: 'column', gap: '8px' }}>
      <button type="button" className="text-button" style={{ fontSize: '11px', color: '#35714f', fontWeight: 600 }} onClick={() => { setMode(mode === 'signin' ? 'signup' : 'signin'); setError(''); setInfo(''); }}>
        {mode === 'signin' ? "Don't have an account yet? Create one" : 'Already have an account? Sign in'}
      </button>
      <button type="button" className="text-button" style={{ fontSize: '10px', color: '#88988e' }} onClick={onResetKey}>Change Supabase API key</button>
    </div>
  </div></main>;
}

function SetupShopScreen({ onCreate, error }: { onCreate: (name: string) => Promise<void>; error: string }) {
  const [name, setName] = useState('My Shop');
  const [busy, setBusy] = useState(false);
  const submit = async (event: FormEvent) => { event.preventDefault(); setBusy(true); try { await onCreate(name); } finally { setBusy(false); } };
  return <main className="auth-shell"><div className="auth-card">
    <div className="auth-brand"><span className="brand-mark"><Store size={22} /></span><span>Set up your shop</span></div>
    <p className="eyebrow">ONE-TIME SETUP</p><h1>Name your shop</h1><p className="muted">Your shop name appears on receipts.</p>
    <form className="form-stack" onSubmit={submit}><label>Shop name<input value={name} onChange={(e) => setName(e.target.value)} required /></label>
      {error && <p className="form-error">{error}</p>}<button className="button button-primary button-full" disabled={busy}>{busy ? 'Saving…' : 'Continue'}</button>
    </form>
  </div></main>;
}

function ReceiptView({ sale, shopName, onClose, onNotice }: { sale: Sale; shopName: string; onClose: () => void; onNotice: (notice: Notice) => void }) {
  const share = async () => {
    const body = `${shopName}\nReceipt ${sale.receiptNumber}\n${sale.lines.map((line) => `${line.productName} · ${line.displayQuantity} ${line.displayUnit} · ${money(line.lineTotal)}`).join('\n')}\nTotal: ${money(sale.total)}`;
    try {
      if (navigator.share) await navigator.share({ title: `Receipt ${sale.receiptNumber}`, text: body });
      else { await navigator.clipboard.writeText(body); onNotice({ type: 'success', text: 'Receipt details copied.' }); }
    } catch (error) { if (error instanceof Error && error.name !== 'AbortError') onNotice({ type: 'error', text: 'Could not share the receipt.' }); }
  };
  return <Overlay onClose={onClose}>
    <div className="modal-head receipt-actions"><div><p className="eyebrow">BILL SAVED</p><h2>Receipt</h2></div><button className="icon-button" onClick={onClose} aria-label="Close"><X size={19} /></button></div>
    <div className="receipt-paper" id="receipt-paper">
      <div className="receipt-brand"><span className="receipt-brand-icon"><ShoppingBag size={18} /></span><strong>{shopName}</strong></div>
      <p className="receipt-subtitle">SALE RECEIPT</p><div className="receipt-meta"><span>Receipt</span><strong>{sale.receiptNumber}</strong></div>
      <div className="receipt-meta"><span>Date</span><span>{dateLabel(sale.createdAt)} · {timeLabel(sale.createdAt)}</span></div>
      {(sale.customerName || sale.customerPhone) && <div className="receipt-meta"><span>Customer</span><span>{sale.customerName || sale.customerPhone}</span></div>}
      <div className="receipt-divider" />
      <div className="receipt-items">{sale.lines.map((line) => <div className="receipt-line" key={line.id}><div><strong>{line.productName}</strong><small>{line.displayQuantity} {line.displayUnit} × {money(line.unitPrice)} / {line.category === 'kg' ? 'kg' : 'pc'}</small></div><strong>{money(line.lineTotal)}</strong></div>)}</div>
      <div className="receipt-divider" />
      <div className="receipt-meta"><span>Subtotal</span><span>{money(sale.subtotal)}</span></div>
      {sale.discountTotal > 0 && <div className="receipt-meta discount-row"><span>Discount</span><span>− {money(sale.discountTotal)}</span></div>}
      <div className="receipt-total"><span>Total paid</span><strong>{money(sale.total)}</strong></div>
      <div className="receipt-meta"><span>Paid by</span><span>{sale.payments.map((payment) => `${payment.method === 'upi' ? 'GPay / UPI' : 'Cash'} ${money(payment.amount)}`).join(' · ')}</span></div>
      <p className="receipt-thanks">Thank you for shopping with us.</p>
    </div>
    <div className="modal-foot receipt-buttons"><button className="button button-outline" onClick={() => window.print()}><Printer size={16} /> Print</button><button className="button button-primary" onClick={share}><Share2 size={16} /> Share receipt</button></div>
  </Overlay>;
}

function ProductForm({ product, onClose, onSave }: { product?: Product | null; onClose: () => void; onSave: (input: ProductInput) => Promise<void> }) {
  const [name, setName] = useState(product?.name ?? '');
  const [category, setCategory] = useState<'kg' | 'piece'>(product?.category ?? 'kg');
  const [purchase, setPurchase] = useState(String(product?.purchasePrice ?? 0));
  const [retail, setRetail] = useState(String(product?.retailPrice ?? ''));
  const [selling, setSelling] = useState(String(product?.sellingPrice ?? 0));
  const [discount, setDiscount] = useState(String(product?.discountPercent ?? 0));
  const [stock, setStock] = useState(product ? (product.stockQuantity >= 900000 ? '' : String(product.stockQuantity)) : '');
  const [lowStock, setLowStock] = useState(product ? (product.lowStockAt <= 0 ? '' : String(product.lowStockAt)) : '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const submit = async (event: FormEvent) => {
    event.preventDefault(); setError('');
    const rawStock = stock.trim();
    const rawLowStock = lowStock.trim();
    if (category === 'piece' && rawStock && !Number.isInteger(Number(rawStock))) { setError('Piece stock must be a whole number.'); return; }
    if (category === 'piece' && rawLowStock && !Number.isInteger(Number(rawLowStock))) { setError('Low-stock alert must be a whole number.'); return; }
    if (Number(discount) < 0 || Number(discount) > 100) { setError('Discount must be between 0% and 100%.'); return; }

    const parsedStock = rawStock === '' ? (category === 'kg' ? 999999 : 0) : Math.max(0, Number(rawStock));
    const parsedLowStock = rawLowStock === '' ? 0 : Math.max(0, Number(rawLowStock));

    setBusy(true);
    try {
      await onSave({
        name: name.trim(),
        category,
        purchasePrice: Math.max(0, Number(purchase)),
        retailPrice: retail === '' ? null : Math.max(0, Number(retail)),
        sellingPrice: Math.max(0, Number(selling)),
        discountPercent: Number(discount),
        stockQuantity: product ? (rawStock === '' ? product.stockQuantity : parsedStock) : parsedStock,
        lowStockAt: parsedLowStock,
      });
      onClose();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not save product.');
    } finally {
      setBusy(false);
    }
  };
  return <Overlay onClose={onClose}>
    <div className="modal-head"><div><p className="eyebrow">PRODUCT DETAILS</p><h2>{product ? 'Edit product' : 'Add product'}</h2></div><button className="icon-button" onClick={onClose} aria-label="Close"><X size={19} /></button></div>
    <form className="form-stack" onSubmit={submit}>
      <label>Product name<input autoFocus required value={name} onChange={(e) => setName(e.target.value)} placeholder="For example, Tomatoes, Rice, Sugar..." /></label>
      <div className="field-label">Sale type</div><div className="segmented type-selector">
        <button type="button" className={category === 'kg' ? 'selected' : ''} onClick={() => setCategory('kg')}><Scale size={16} /> Kg product</button>
        <button type="button" className={category === 'piece' ? 'selected' : ''} onClick={() => setCategory('piece')}><Boxes size={16} /> Piece product</button>
      </div>
      <p className="field-help">{category === 'kg' ? 'Price is per kilogram. Customers can be billed in grams or kilograms. Stock tracking is optional.' : 'Price is per item. Piece quantities are whole numbers.'}</p>
      <div className="form-grid two-col">
        <label>Purchase cost <span className="input-prefix"><b>₹</b><input type="number" min="0" step="0.01" required value={purchase} onChange={(e) => setPurchase(e.target.value)} /></span><small>per {category === 'kg' ? 'kg' : 'piece'}</small></label>
        <label>Retail price <span className="input-prefix"><b>₹</b><input type="number" min="0" step="0.01" value={retail} onChange={(e) => setRetail(e.target.value)} placeholder="Optional" /></span><small>per {category === 'kg' ? 'kg' : 'piece'}</small></label>
      </div>
      <div className="form-grid two-col">
        <label>Selling price <span className="input-prefix"><b>₹</b><input type="number" min="0" step="0.01" required value={selling} onChange={(e) => setSelling(e.target.value)} /></span><small>per {category === 'kg' ? 'kg' : 'piece'}</small></label>
        <label>Product discount <span className="input-suffix"><input type="number" min="0" max="100" step="0.1" value={discount} onChange={(e) => setDiscount(e.target.value)} /><b>%</b></span><small>Optional. Applied automatically to bills.</small></label>
      </div>
      <div className="form-grid two-col">
        {!product && <label>{category === 'kg' ? 'Opening stock (Total kg)' : 'Opening stock'} <span className="optional">Optional</span><input type="number" min="0" step={category === 'kg' ? '0.0001' : '1'} value={stock} onChange={(e) => setStock(e.target.value)} placeholder={category === 'kg' ? 'Optional (leave blank for open weight)' : 'Optional'} /><small>{category === 'kg' ? 'Optional for Kg products. Leave blank if you sell loose without tracking bulk stock.' : 'Current pieces in stock.'}</small></label>}
        <label>Low-stock alert <span className="optional">Optional</span><input type="number" min="0" step={category === 'kg' ? '0.0001' : '1'} value={lowStock} onChange={(e) => setLowStock(e.target.value)} placeholder="Optional" /><small>{category === 'kg' ? 'Alert below this many kg (optional).' : 'Alert below this many pieces (optional).'}</small></label>
      </div>
      {error && <p className="form-error">{error}</p>}
      <div className="modal-foot"><button type="button" className="button button-outline" onClick={onClose}>Cancel</button><button className="button button-primary" disabled={busy}>{busy ? 'Saving…' : product ? 'Save changes' : 'Add product'}</button></div>
    </form>
  </Overlay>;
}

function StockForm({ product, onClose, onSave }: { product: Product; onClose: () => void; onSave: (input: { quantity: number; unitCost: number; method: 'cash' | 'upi'; note: string }) => Promise<void> }) {
  const [quantity, setQuantity] = useState('');
  const [unitCost, setUnitCost] = useState(String(product.purchasePrice));
  const [method, setMethod] = useState<'cash' | 'upi'>('cash');
  const [note, setNote] = useState('Stock purchase');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const amount = Number(quantity || 0) * Number(unitCost || 0);
  const submit = async (event: FormEvent) => { event.preventDefault(); setError(''); setBusy(true); try { await onSave({ quantity: Number(quantity), unitCost: Number(unitCost), method, note }); onClose(); } catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not add stock.'); } finally { setBusy(false); } };
  return <Overlay onClose={onClose}>
    <div className="modal-head"><div><p className="eyebrow">INVENTORY IN</p><h2>Add stock</h2></div><button className="icon-button" onClick={onClose} aria-label="Close"><X size={19} /></button></div>
    <div className="selected-product"><span className="product-avatar">{product.category === 'kg' ? <Scale size={17} /> : <Package size={17} />}</span><div><strong>{product.name}</strong><small>Current stock: {stockLabel(product)} {safeProductQuantity(product)}</small></div></div>
    <form className="form-stack" onSubmit={submit}>
      <label>Quantity received ({product.category === 'kg' ? 'kg' : 'pieces'})<input type="number" min="0.000001" step={product.category === 'kg' ? '0.0001' : '1'} required value={quantity} onChange={(e) => setQuantity(e.target.value)} placeholder={product.category === 'kg' ? 'e.g. 100' : 'e.g. 24'} /></label>
      <label>Purchase cost per {product.category === 'kg' ? 'kg' : 'piece'}<span className="input-prefix"><b>₹</b><input type="number" min="0" step="0.01" required value={unitCost} onChange={(e) => setUnitCost(e.target.value)} /></span></label>
      <label>Paid using<select value={method} onChange={(e) => setMethod(e.target.value as 'cash' | 'upi')}><option value="cash">Cash</option><option value="upi">GPay / UPI</option></select></label>
      <label>Note<input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Optional note" /></label>
      <div className="stock-cost-preview"><span>Stock purchase value</span><strong>{money(amount)}</strong></div>
      {error && <p className="form-error">{error}</p>}
      <div className="modal-foot"><button type="button" className="button button-outline" onClick={onClose}>Cancel</button><button className="button button-primary" disabled={busy}>{busy ? 'Saving…' : 'Add stock'}</button></div>
    </form>
  </Overlay>;
}

function QuantityKeypad({ product, initialQuantity, initialUnit, mode, currentQuantity, onClose, onSave }: {
  product: Product; initialQuantity: number; initialUnit: 'g' | 'kg' | 'piece'; mode: 'add' | 'edit'; currentQuantity?: string; onClose: () => void;
  onSave: (quantity: number, unit: 'g' | 'kg' | 'piece') => void;
}) {
  const [value, setValue] = useState(initialQuantity > 0 ? String(initialQuantity) : '0');
  const [unit, setUnit] = useState<'g' | 'kg' | 'piece'>(initialUnit);
  const [firstKey, setFirstKey] = useState(true);
  const decimalAllowed = product.category === 'kg';
  const append = (key: string) => setValue((current) => {
    if (firstKey && key !== '.') return key;
    if (key === '.' && (!decimalAllowed || current.includes('.'))) return current;
    if (current === '0' && key !== '.') return key;
    return `${current}${key}`;
  });
  const changeUnit = (nextUnit: 'g' | 'kg') => {
    const quantity = Number(value);
    setUnit(nextUnit);
    if (value && quantity > 0) setValue(String(nextUnit === 'kg' ? quantity / 1000 : quantity * 1000));
  };
  return <Overlay onClose={onClose}>
    <div className="modal-head"><div><p className="eyebrow">QUICK ENTRY</p><h2>{mode === 'add' ? 'Add to bill' : 'Edit quantity'}</h2></div><button className="icon-button" onClick={onClose} aria-label="Close number pad"><X size={19} /></button></div>
    <div className="keypad-product"><span className={`product-avatar ${product.category === 'kg' ? 'avatar-kg' : 'avatar-piece'}`}>{product.category === 'kg' ? <Scale size={17} /> : <Package size={17} />}</span><div><strong>{product.name}</strong><small>{product.category === 'kg' ? `${money(product.sellingPrice)} per kg` : `${money(product.sellingPrice)} per piece`}</small></div></div>
    {mode === 'add' && <p className="keypad-hint">{product.category === 'kg' ? 'Enter the customer’s weight. Starts at 0 g; switch to kilograms for larger weights.' : 'Starts at 1 piece. Change it if needed.'}{currentQuantity ? ` Already in bill: ${currentQuantity}.` : ''}</p>}
    <div className="keypad-display"><span>QUANTITY</span><div><strong>{value || '0'}</strong><b>{unit === 'piece' ? 'pcs' : unit}</b></div></div>
    {product.category === 'kg' && <div className="keypad-units"><button className={unit === 'g' ? 'selected' : ''} onClick={() => changeUnit('g')}>Grams (g)</button><button className={unit === 'kg' ? 'selected' : ''} onClick={() => changeUnit('kg')}>Kilograms (kg)</button></div>}
    <div className="number-pad-grid">
      {['1', '2', '3', '4', '5', '6', '7', '8', '9', decimalAllowed ? '.' : 'Clear', '0', '⌫'].map((key, index) => <button key={`${key}-${index}`} className={key === 'Clear' ? 'keypad-clear' : key === '⌫' ? 'keypad-backspace' : ''} onClick={() => {
        if (key === 'Clear') { setFirstKey(false); setValue('0'); }
        else if (key === '⌫') { setFirstKey(false); setValue((current) => current.length <= 1 ? '0' : current.slice(0, -1)); }
        else { append(key); setFirstKey(false); }
      }}>{key === 'Clear' ? 'Clear' : key}</button>)}
    </div>
    <div className="keypad-actions"><button className="button button-outline" onClick={onClose}>Cancel</button><button className="button button-primary" disabled={Number(value) <= 0} onClick={() => onSave(Number(value) || 0, unit)}><Check size={16} /> {mode === 'add' ? 'Add to bill' : 'Save quantity'}</button></div>
  </Overlay>;
}

function ExpenseForm({ onClose, onSave }: { onClose: () => void; onSave: (input: Omit<Expense, 'id' | 'createdAt'>) => Promise<void> }) {
  const [category, setCategory] = useState('Other');
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState<'cash' | 'upi'>('cash');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const submit = async (event: FormEvent) => { event.preventDefault(); setError(''); setBusy(true); try { await onSave({ category, amount: Number(amount), method, note }); onClose(); } catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not save expense.'); } finally { setBusy(false); } };
  return <Overlay onClose={onClose}>
    <div className="modal-head"><div><p className="eyebrow">SHOP COST</p><h2>Add expense</h2></div><button className="icon-button" onClick={onClose} aria-label="Close"><X size={19} /></button></div>
    <form className="form-stack" onSubmit={submit}>
      <label>Category<select value={category} onChange={(e) => setCategory(e.target.value)}><option>Other</option><option>Rent</option><option>Transport</option><option>Electricity</option><option>Packaging</option><option>Phone / Internet</option><option>Repairs</option><option>Staff</option></select></label>
      <label>Amount<span className="input-prefix"><b>₹</b><input autoFocus type="number" min="0.01" step="0.01" required value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" /></span></label>
      <label>Paid using<select value={method} onChange={(e) => setMethod(e.target.value as 'cash' | 'upi')}><option value="cash">Cash</option><option value="upi">GPay / UPI</option></select></label>
      <label>Note <span className="optional">Optional</span><input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Add a short note" /></label>
      {error && <p className="form-error">{error}</p>}
      <div className="modal-foot"><button type="button" className="button button-outline" onClick={onClose}>Cancel</button><button className="button button-primary" disabled={busy}>{busy ? 'Saving…' : 'Save expense'}</button></div>
    </form>
  </Overlay>;
}

function App() {
  const [state, setState] = useState<ShopState>(emptyState);
  const [activeTab, setActiveTab] = useState<Tab>('dashboard');
  const [session, setSession] = useState<Session | null>(null);
  const [sessionChecked, setSessionChecked] = useState(false);
  const [cloudShop, setCloudShop] = useState<{ id: string; name: string } | null>(null);
  const [cloudReady, setCloudReady] = useState(false);
  const [cloudError, setCloudError] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);
  const [modal, setModal] = useState<'product' | 'expense' | 'stock' | null>(null);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [stockProduct, setStockProduct] = useState<Product | null>(null);
  const [receipt, setReceipt] = useState<Sale | null>(null);
  const [keypadProductId, setKeypadProductId] = useState<string | null>(null);
  const [keypadMode, setKeypadMode] = useState<'add' | 'edit'>('edit');
  const [cart, setCart] = useState<CartLine[]>([]);
  const [billSearch, setBillSearch] = useState('');
  const [billCategoryFilter, setBillCategoryFilter] = useState<'all' | 'kg' | 'piece'>('all');
  const [productSearch, setProductSearch] = useState('');
  const [customerSearch, setCustomerSearch] = useState('');
  const [customerBillsPhone, setCustomerBillsPhone] = useState<string | null>(null);
  const [historySearch, setHistorySearch] = useState('');
  const [historyDate, setHistoryDate] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [billDiscount, setBillDiscount] = useState('0');
  const [paymentMode, setPaymentMode] = useState<'cash' | 'upi' | 'split'>('cash');
  const [splitCash, setSplitCash] = useState('');
  const [splitUpi, setSplitUpi] = useState('');
  const [shopNameInput, setShopNameInput] = useState('My Shop');
  const [savingName, setSavingName] = useState(false);
  const [mobileMenu, setMobileMenu] = useState(false);

  const activeProducts = useMemo(() => state.products.filter((product) => product.active), [state.products]);
  const customerStats = useMemo(() => {
    const stats = new Map<string, { bills: number; spent: number; lastVisit: string }>();
    for (const sale of state.sales) {
      if (sale.status !== 'completed') continue;
      const phone = normalizedPhone(sale.customerPhone);
      if (!phone) continue;
      const current = stats.get(phone) ?? { bills: 0, spent: 0, lastVisit: sale.createdAt };
      stats.set(phone, { bills: current.bills + 1, spent: current.spent + sale.total, lastVisit: current.lastVisit > sale.createdAt ? current.lastVisit : sale.createdAt });
    }
    return stats;
  }, [state.sales]);

  useEffect(() => {
    if (!supabase) {
      setSessionChecked(true);
      return;
    }
    let alive = true;
    supabase.auth.getSession().then(({ data, error }) => {
      if (!alive) return;
      if (error) setCloudError(error.message);
      setSession(data.session);
      setSessionChecked(true);
    }).catch(() => {
      if (alive) setSessionChecked(true);
    });
    const { data: auth } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession); setCloudShop(null); setCloudReady(false); setCloudError('');
    });
    return () => { alive = false; auth.subscription.unsubscribe(); };
  }, []);

  useEffect(() => {
    if (!supabase || !session) return;
    let alive = true;
    setCloudReady(false); setCloudError('');
    (async () => {
      try {
        const shop = await getOwnedShop();
        if (!alive) return;
        setCloudShop(shop);
        if (shop) {
          const cloudState = await loadCloudState(shop.id, shop.name);
          if (alive) { setState(cloudState); setShopNameInput(shop.name); }
        }
      } catch (error) { if (alive) setCloudError(error instanceof Error ? error.message : 'Could not load the shop database.'); }
      finally { if (alive) setCloudReady(true); }
    })();
    return () => { alive = false; };
  }, [session]);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(null), 3800);
    return () => window.clearTimeout(timer);
  }, [notice]);

  const refreshCloud = async (shop = cloudShop) => {
    if (!shop) return;
    const next = await loadCloudState(shop.id, shop.name);
    setState(next);
    setShopNameInput(next.shopName);
  };

  const login = async (email: string, password: string) => {
    if (!supabase) throw new Error('Supabase is not configured.');
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    if (error) {
      if (error.message.toLowerCase().includes('invalid login credentials')) {
        throw new Error('Invalid email or password. If you haven’t created an account yet, switch to "Create account" above.');
      }
      throw error;
    }
  };

  const signup = async (email: string, password: string) => {
    if (!supabase) throw new Error('Supabase is not configured.');
    const { data, error } = await supabase.auth.signUp({ email: email.trim(), password });
    if (error) throw error;
    if (data.session) {
      setSession(data.session);
    }
  };

  const createShop = async (name: string) => {
    try {
      const shop = await createOwnedShop(name);
      setCloudShop(shop); setCloudError(''); setShopNameInput(shop.name);
      setState({ shopName: shop.name, products: [], customers: [], sales: [], expenses: [], stockMovements: [] });
      setNotice({ type: 'success', text: 'Your shop is ready.' });
    } catch (error) { setCloudError(error instanceof Error ? error.message : 'Could not create the shop.'); throw error; }
  };

  const saveProduct = async (input: ProductInput) => {
    setBusy(true);
    try {
      if (!cloudShop) throw new Error('Shop database is not loaded.');
      await saveCloudProduct(cloudShop.id, { ...input, id: editingProduct?.id });
      await refreshCloud();
      setNotice({ type: 'success', text: editingProduct ? 'Product updated.' : 'Product added.' });
    } catch (error) { setNotice({ type: 'error', text: error instanceof Error ? error.message : 'Could not save product.' }); throw error; }
    finally { setBusy(false); }
  };

  const deleteProduct = async (product: Product) => {
    if (!window.confirm(`Delete ${product.name} from new bills? Past receipts will be kept.`)) return;
    setBusy(true);
    try {
      if (!cloudShop) throw new Error('Shop database is not loaded.');
      await archiveCloudProduct(cloudShop.id, product.id);
      await refreshCloud();
      setCart((current) => current.filter((item) => item.productId !== product.id));
      setNotice({ type: 'success', text: `${product.name} was removed from active products.` });
    } catch (error) { setNotice({ type: 'error', text: error instanceof Error ? error.message : 'Could not delete product.' }); }
    finally { setBusy(false); }
  };

  const addStock = async (input: { quantity: number; unitCost: number; method: 'cash' | 'upi'; note: string }) => {
    if (!stockProduct || input.quantity <= 0) throw new Error('Enter a quantity greater than zero.');
    if (stockProduct.category === 'piece' && !Number.isInteger(input.quantity)) throw new Error('Piece quantities must be whole numbers.');
    await receiveCloudStock({ productId: stockProduct.id, quantity: input.quantity, unitCost: input.unitCost, method: input.method, type: 'purchase', note: input.note });
    await refreshCloud();
    setNotice({ type: 'success', text: `Added stock for ${stockProduct.name}.` });
  };

  const addExpense = async (input: Omit<Expense, 'id' | 'createdAt'>) => {
    if (input.amount <= 0) throw new Error('Enter an amount greater than zero.');
    if (!cloudShop) throw new Error('Shop database is not loaded.');
    await saveCloudExpense(cloudShop.id, input);
    await refreshCloud();
    setNotice({ type: 'success', text: 'Expense saved.' });
  };

  const todayKey = localDateKey(new Date());
  const todaySales = state.sales.filter((sale) => localDateKey(sale.createdAt) === todayKey && sale.status === 'completed');
  const todayExpenses = state.expenses.filter((expense) => localDateKey(expense.createdAt) === todayKey);
  const collectedToday = roundMoney(todaySales.reduce((sum, sale) => sum + sale.payments.reduce((n, payment) => n + payment.amount, 0), 0));
  const cashToday = roundMoney(todaySales.flatMap((sale) => sale.payments).filter((payment) => payment.method === 'cash').reduce((sum, payment) => sum + payment.amount, 0));
  const upiToday = roundMoney(todaySales.flatMap((sale) => sale.payments).filter((payment) => payment.method === 'upi').reduce((sum, payment) => sum + payment.amount, 0));
  const expenseTotalToday = roundMoney(todayExpenses.reduce((sum, expense) => sum + expense.amount, 0));
  const cashExpenseToday = roundMoney(todayExpenses.filter((expense) => expense.method === 'cash').reduce((sum, expense) => sum + expense.amount, 0));
  const upiExpenseToday = roundMoney(todayExpenses.filter((expense) => expense.method === 'upi').reduce((sum, expense) => sum + expense.amount, 0));
  const stockPurchasesToday = roundMoney(state.stockMovements.filter((movement) => movement.type === 'purchase' && localDateKey(movement.createdAt) === todayKey && movement.method === 'cash').reduce((sum, movement) => sum + Math.abs(movement.quantity) * movement.cost, 0));
  const netToday = roundMoney(collectedToday - expenseTotalToday);
  const cashBalanceToday = roundMoney(cashToday - cashExpenseToday - stockPurchasesToday);
  const todayProfit = roundMoney(todaySales.reduce((sum, sale) => sum + sale.lines.reduce((n, line) => n + line.lineTotal - line.costPrice * line.baseQuantity, 0), 0) - expenseTotalToday);

  const openAddQuantity = (product: Product) => {
    setKeypadMode('add');
    setKeypadProductId(product.id);
  };

  const addQuantityToCart = (product: Product, quantity: number, unit: 'g' | 'kg' | 'piece') => {
    if (quantity <= 0) { setNotice({ type: 'error', text: 'Enter a quantity greater than zero.' }); return; }
    if (product.category === 'piece' && (!Number.isInteger(quantity) || unit !== 'piece')) { setNotice({ type: 'error', text: 'Piece quantities must be whole numbers.' }); return; }
    setCart((current) => {
      const existing = current.find((line) => line.productId === product.id);
      if (!existing) return [...current, { productId: product.id, quantity, unit }];
      if (product.category === 'piece') return current.map((line) => line.productId === product.id ? { ...line, quantity: line.quantity + quantity } : line);
      const existingKg = existing.unit === 'g' ? existing.quantity / 1000 : existing.quantity;
      const addedKg = unit === 'g' ? quantity / 1000 : quantity;
      const combinedKg = existingKg + addedKg;
      const combinedQuantity = existing.unit === 'g' ? Math.round(combinedKg * 1000 * 1e6) / 1e6 : Math.round(combinedKg * 1e6) / 1e6;
      return current.map((line) => line.productId === product.id ? { ...line, quantity: combinedQuantity } : line);
    });
  };

  const cartQuote = useMemo(() => {
    const lines = cart.map((line) => {
      const product = activeProducts.find((item) => item.id === line.productId);
      if (!product) return { line, product: undefined, base: 0, gross: 0, discount: 0, total: 0 };
      const base = product.category === 'kg' ? (line.unit === 'g' ? line.quantity / 1000 : line.quantity) : line.quantity;
      const gross = roundMoney(base * product.sellingPrice);
      const discount = roundMoney(gross * product.discountPercent / 100);
      return { line, product, base, gross, discount, total: roundMoney(gross - discount) };
    });
    const subtotal = roundMoney(lines.reduce((sum, line) => sum + line.gross, 0));
    const productDiscount = roundMoney(lines.reduce((sum, line) => sum + line.discount, 0));
    const beforeBillDiscount = roundMoney(subtotal - productDiscount);
    const requestedDiscount = roundMoney(Number(billDiscount) || 0);
    const discount = Math.max(0, Math.min(requestedDiscount, beforeBillDiscount));
    return { lines, subtotal, productDiscount, beforeBillDiscount, discount, total: roundMoney(beforeBillDiscount - discount) };
  }, [cart, activeProducts, billDiscount]);

  const completeBill = async () => {
    if (!cart.length || cartQuote.total <= 0) { setNotice({ type: 'error', text: 'Add a product and enter a valid quantity first.' }); return; }
    if (Number(billDiscount) < 0 || Number(billDiscount) > cartQuote.beforeBillDiscount) { setNotice({ type: 'error', text: 'Discount cannot exceed the bill amount.' }); return; }
    if (customerPhone.trim() && (normalizedPhone(customerPhone).length < 6 || normalizedPhone(customerPhone).length > 15)) { setNotice({ type: 'error', text: 'Enter a valid WhatsApp number with 6–15 digits.' }); return; }
    const cash = paymentMode === 'cash' ? cartQuote.total : paymentMode === 'split' ? roundMoney(Number(splitCash) || 0) : 0;
    const upi = paymentMode === 'upi' ? cartQuote.total : paymentMode === 'split' ? roundMoney(Number(splitUpi) || 0) : 0;
    if (roundMoney(cash + upi) !== cartQuote.total) { setNotice({ type: 'error', text: `Cash and GPay must add up to ${money(cartQuote.total)}.` }); return; }
    setBusy(true);
    try {
      if (!cloudShop) throw new Error('Shop database not loaded.');
      const created = await saveCloudSale(cloudShop.id, { customerName, customerPhone, billDiscount: Number(billDiscount) || 0, cart, cashAmount: cash, upiAmount: upi });
      const refreshed = await loadCloudState(cloudShop.id, cloudShop.name);
      setState(refreshed);
      const newSale = refreshed.sales.find((sale) => sale.id === created.sale_id);
      if (newSale) setReceipt(newSale);
      setCart([]); setCustomerName(''); setCustomerPhone(''); setBillDiscount('0'); setSplitCash(''); setSplitUpi('');
      setNotice({ type: 'success', text: 'Bill saved successfully.' });
    } catch (error) { setNotice({ type: 'error', text: error instanceof Error ? error.message : 'Could not save bill.' }); }
    finally { setBusy(false); }
  };

  const updateShopName = async (event: FormEvent) => {
    event.preventDefault(); setSavingName(true);
    try {
      if (cloudShop) {
        await renameOwnedShop(cloudShop.id, shopNameInput);
        setCloudShop({ ...cloudShop, name: shopNameInput.trim() || 'My Shop' });
      }
      setState((previous) => ({ ...previous, shopName: shopNameInput.trim() || 'My Shop' }));
      setNotice({ type: 'success', text: 'Shop name saved.' });
    } catch (error) { setNotice({ type: 'error', text: error instanceof Error ? error.message : 'Could not save shop name.' }); }
    finally { setSavingName(false); }
  };

  const signOut = async () => {
    if (supabase) await supabase.auth.signOut();
    setSession(null);
    setCloudShop(null);
    setState(emptyState);
    setActiveTab('dashboard');
  };

  if (!isSupabaseConfigured) return <ConnectSupabaseScreen onConnect={(url, key) => { saveSupabaseConfig(key, url); window.location.reload(); }} />;
  if (!sessionChecked) return <main className="loading-screen"><LoaderCircle className="spin" size={28} /><span>Checking sign-in…</span></main>;
  if (!session) return <AuthScreen onLogin={login} onSignUp={signup} onResetKey={() => { clearSupabaseConfig(); window.location.reload(); }} />;
  if (session && !cloudReady) return <main className="loading-screen"><LoaderCircle className="spin" size={28} /><span>Loading shop database…</span></main>;
  if (session && !cloudShop && !cloudError) return <SetupShopScreen onCreate={createShop} error="" />;
  if (session && !cloudShop && cloudError) return <div className="setup-error"><div className="auth-card"><div className="auth-brand"><span className="brand-mark"><Store size={22} /></span><span>Shop Billing setup</span></div><h1>Database setup needed</h1><p className="muted">The app could not load the shop database. Apply the included SQL migration in Supabase, then reload this page.</p><pre>{cloudError}</pre><button className="button button-outline" onClick={() => window.location.reload()}><RefreshCw size={16} /> Reload</button></div></div>;

  const pageTitle = navItems.find((item) => item.id === activeTab)?.label ?? 'Settings';
  const pageSubtitle: Record<Tab, string> = {
    dashboard: 'Your shop at a glance', bill: 'Add products, collect payment, and save a receipt', products: 'Manage products, prices, and stock', customers: 'Keep customer names and WhatsApp numbers from bills', expenses: 'Track everyday shop spending', sales: 'Find and review saved receipts', settings: 'Set up your shop and app preferences',
  };
  const visibleProducts = activeProducts.filter((product) => `${product.name} ${product.category}`.toLowerCase().includes(productSearch.toLowerCase()));
  const visibleCustomers = state.customers.filter((customer) => `${customer.name} ${customer.phone}`.toLowerCase().includes(customerSearch.toLowerCase()));
  const selectedCustomer = state.customers.find((customer) => customer.phoneNormalized === customerBillsPhone);
  const selectedCustomerBills = selectedCustomer ? state.sales.filter((sale) => sale.status === 'completed' && normalizedPhone(sale.customerPhone) === selectedCustomer.phoneNormalized).sort((a, b) => b.createdAt.localeCompare(a.createdAt)) : [];
  const visibleBillProducts = activeProducts.filter((product) =>
    product.name.toLowerCase().includes(billSearch.toLowerCase()) &&
    (billCategoryFilter === 'all' || product.category === billCategoryFilter),
  );
  const keypadProduct = activeProducts.find((product) => product.id === keypadProductId);
  const keypadCartLine = cart.find((line) => line.productId === keypadProductId);
  const keypadInitialQuantity = keypadMode === 'edit' && keypadCartLine ? keypadCartLine.quantity : keypadProduct?.category === 'piece' ? 1 : 0;
  const keypadInitialUnit = keypadMode === 'edit' && keypadCartLine ? keypadCartLine.unit : keypadProduct?.category === 'piece' ? 'piece' : 'g';

  return <div className="app-shell">
    <aside className={`sidebar ${mobileMenu ? 'sidebar-open' : ''}`}>
      <div className="sidebar-brand"><span className="brand-mark"><ShoppingBag size={21} /></span><div><strong>Shop Billing</strong><small>Simple shop manager</small></div><button className="mobile-close icon-button" onClick={() => setMobileMenu(false)} aria-label="Close menu"><X size={18} /></button></div>
      <div className="shop-switcher"><span className="shop-avatar"><Store size={17} /></span><span><strong>{state.shopName}</strong><small>Cloud database</small></span><ChevronDown size={15} /></div>
      <nav className="side-nav" aria-label="Main navigation"><p className="nav-caption">MENU</p>{navItems.map(({ id: tabId, label, icon: Icon }) => <button key={tabId} className={`nav-link ${activeTab === tabId ? 'active' : ''}`} onClick={() => { setActiveTab(tabId); setMobileMenu(false); }}><Icon size={18} /><span>{label}</span>{tabId === 'bill' && <kbd>⌘ K</kbd>}</button>)}</nav>
      <div className="sidebar-bottom">
        <div className="mode-card mode-cloud"><span className="status-dot" /><div><strong>Supabase connected</strong><small>Live shop records</small></div><Info size={14} /></div>
        <button className={`nav-link ${activeTab === 'settings' ? 'active' : ''}`} onClick={() => { setActiveTab('settings'); setMobileMenu(false); }}><Settings size={18} /><span>Settings</span></button>
        <button className="nav-link signout-link" onClick={signOut} aria-label="Sign out"><LogOut size={18} /><span>Sign out</span></button>
        <div className="sidebar-footer"><span className="avatar-small">{(state.shopName || 'M').charAt(0).toUpperCase()}</span><span><strong>{session?.user.email ?? 'Shop owner'}</strong><small>Owner account</small></span><ChevronRight size={15} /></div>
      </div>
    </aside>

    <nav className="mobile-bottom-nav" aria-label="Mobile navigation">{navItems.map(({ id: tabId, label, icon: Icon }) => <button key={tabId} className={activeTab === tabId ? 'active' : ''} onClick={() => setActiveTab(tabId)}><Icon size={19} /><span>{label === 'Overview' ? 'Home' : label === 'New bill' ? 'Bill' : label === 'Sales history' ? 'Sales' : label}</span></button>)}<button className={activeTab === 'settings' ? 'active' : ''} onClick={() => setActiveTab('settings')}><Settings size={19} /><span>Settings</span></button></nav>

    <main className="main-area">
      <header className="topbar">
        <div className="topbar-left">
          <button className="mobile-menu-button icon-button" onClick={() => setMobileMenu(true)} aria-label="Open menu"><Menu size={20} /></button>
          <div><p className="eyebrow">{new Intl.DateTimeFormat('en-IN', { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date())}</p><h1>{pageTitle}</h1></div>
        </div>
        <div className="topbar-right">
          <span className="connection-pill is-cloud"><span className="status-dot" />Live Synced</span>
          <button className="topbar-date" aria-label="Today"><CalendarDays size={16} /><span>Today</span></button>
          <button className="button button-outline topbar-signout" onClick={signOut} title="Sign out of shop"><LogOut size={15} /><span>Sign out</span></button>
          <button className="button button-primary top-new-bill" onClick={() => setActiveTab('bill')}><Plus size={17} /> New bill</button>
        </div>
      </header>
      <section className="page-content">
        <div className="page-intro"><p>{pageSubtitle[activeTab]}</p></div>
        {cloudError && <div className="inline-warning"><AlertTriangle size={17} /><span>{cloudError}</span><button onClick={() => refreshCloud().catch((e) => setCloudError(e.message))}>Retry</button></div>}

        {activeTab === 'dashboard' && <>
          <div className="welcome-row"><div><h2>Good {new Date().getHours() < 12 ? 'morning' : new Date().getHours() < 17 ? 'afternoon' : 'evening'}, shop owner <span className="wave">✦</span></h2><p>Here’s what’s happening in your shop today.</p></div><button className="button button-primary" onClick={() => setActiveTab('bill')}><Plus size={17} /> Create a bill</button></div>
          <div className="metrics-grid">
            <MetricCard label="Today's sales" value={money(todaySales.reduce((sum, sale) => sum + sale.total, 0))} hint={`${todaySales.length} ${todaySales.length === 1 ? 'bill' : 'bills'} completed`} icon={ShoppingBag} tone="green" />
            <MetricCard label="Collected" value={money(collectedToday)} hint={`${money(cashToday)} cash · ${money(upiToday)} GPay`} icon={CircleDollarSign} tone="blue" />
            <MetricCard label="Expenses" value={money(expenseTotalToday)} hint={`${todayExpenses.length} recorded today`} icon={ArrowDownRight} tone="amber" />
            <MetricCard label="Net collection" value={money(netToday)} hint="Collected minus shop expenses" icon={WalletCards} tone={netToday >= 0 ? 'green' : 'rose'} />
          </div>
          <div className="dashboard-grid">
            <section className="panel collection-panel"><div className="panel-heading"><div><h3>Collection summary</h3><p>Money received and paid out today</p></div><span className="period-chip"><CalendarDays size={14} /> Today</span></div>
              <div className="collection-total"><div><span>Total received</span><strong>{money(collectedToday)}</strong></div><span className="positive-change"><ArrowUpRight size={15} /> {todaySales.length} bills</span></div>
              <div className="collection-bar"><span style={{ width: `${collectedToday > 0 ? Math.max(7, cashToday / collectedToday * 100) : 0}%` }} /><span style={{ width: `${collectedToday > 0 ? upiToday / collectedToday * 100 : 0}%` }} /></div>
              <div className="collection-legend"><div><i className="legend-cash" /><span>Cash</span><strong>{money(cashToday)}</strong></div><div><i className="legend-upi" /><span>GPay / UPI</span><strong>{money(upiToday)}</strong></div></div>
              <div className="net-strip"><div><span>Shop expenses</span><strong>− {money(expenseTotalToday)}</strong></div><div className="net-strip-total"><span>Net after expenses</span><strong>{money(netToday)}</strong></div></div>
              <div className="cash-footnote"><span>Estimated cash in hand</span><strong>{money(cashBalanceToday)}</strong><small>After cash expenses and stock purchases ({money(stockPurchasesToday)})</small></div>
            </section>
            <section className="panel recent-panel"><div className="panel-heading"><div><h3>Recent bills</h3><p>Your latest completed sales</p></div><button className="text-button" onClick={() => setActiveTab('sales')}>View all <ArrowRight size={15} /></button></div>
              {state.sales.filter((sale) => sale.status === 'completed').slice(0, 5).length ? <div className="recent-list">{state.sales.filter((sale) => sale.status === 'completed').slice(0, 5).map((sale) => <button className="recent-row" key={sale.id} onClick={() => setReceipt(sale)}><span className="recent-icon"><ReceiptText size={17} /></span><span className="recent-info"><strong>{sale.customerName || sale.customerPhone || 'Walk-in customer'}</strong><small>{sale.receiptNumber} · {timeLabel(sale.createdAt)}</small></span><span className="recent-amount"><strong>{money(sale.total)}</strong><small>{sale.payments.map((payment) => payment.method === 'upi' ? 'UPI' : 'Cash').join(' + ')}</small></span><ChevronRight size={15} /></button>)}</div> : <EmptyState icon={ReceiptText} title="No bills yet today" message="Create your first bill and it will show here." action={<button className="button button-outline button-sm" onClick={() => setActiveTab('bill')}>Create a bill</button>} />}
            </section>
          </div>
          <section className="panel inventory-panel"><div className="panel-heading"><div><h3>Inventory at a glance</h3><p>Stock that may need attention</p></div><button className="text-button" onClick={() => setActiveTab('products')}>Manage products <ArrowRight size={15} /></button></div>
            {activeProducts.length ? <div className="inventory-list">{activeProducts.slice(0, 5).map((product) => { const low = product.category === 'piece' ? product.stockQuantity <= product.lowStockAt : (!isUntrackedKg(product) && product.lowStockAt > 0 && product.stockQuantity <= product.lowStockAt); return <div className="inventory-row" key={product.id}><span className={`product-avatar ${low ? 'avatar-warning' : ''}`}>{product.category === 'kg' ? <Scale size={17} /> : <Package size={17} />}</span><span className="inventory-name"><strong>{product.name}</strong><small>{product.category === 'kg' ? 'Per kilogram' : 'Per piece'}</small></span><span className={`stock-value ${low ? 'stock-low' : ''}`}>{isUntrackedKg(product) ? 'Open' : stockLabel(product)} <small>{isUntrackedKg(product) ? '' : safeProductQuantity(product)}</small></span><span className={`stock-status ${low ? 'low' : ''}`}>{low ? 'Low stock' : isUntrackedKg(product) ? 'Open' : 'In stock'}</span></div>; })}</div> : <EmptyState title="No products yet" message="Add your products to start billing." action={<button className="button button-outline button-sm" onClick={() => { setEditingProduct(null); setModal('product'); }}>Add product</button>} />}
          </section>
          <div className="profit-banner"><span className="profit-icon"><Sparkles size={18} /></span><div><strong>Estimated profit today</strong><small>Sales after discounts − product cost − shop expenses</small></div><b>{money(todayProfit)}</b></div>
        </>}

        {activeTab === 'bill' && <div className="billing-layout">
          <section className="panel bill-products-panel"><div className="panel-heading"><div><h3>Select products</h3><p>Kg products open weight entry · pieces start at 1</p></div><span className="count-chip">{activeProducts.length} products</span></div>
            <div className="search-field bill-search"><Search size={17} /><input value={billSearch} onChange={(e) => setBillSearch(e.target.value)} placeholder="Search products…" /></div>
            <div className="quick-filter"><div className="bill-category-tabs" aria-label="Filter products"><button className={billCategoryFilter === 'all' ? 'selected' : ''} onClick={() => setBillCategoryFilter('all')}>All <b>{activeProducts.length}</b></button><button className={billCategoryFilter === 'kg' ? 'selected' : ''} onClick={() => setBillCategoryFilter('kg')}>Kg <b>{activeProducts.filter((product) => product.category === 'kg').length}</b></button><button className={billCategoryFilter === 'piece' ? 'selected' : ''} onClick={() => setBillCategoryFilter('piece')}>Piece <b>{activeProducts.filter((product) => product.category === 'piece').length}</b></button></div><span className="filter-count">Tap + to enter quantity</span></div>
            <div className="bill-product-list">{visibleBillProducts.map((product) => <button className="bill-product" key={product.id} onClick={() => openAddQuantity(product)} disabled={product.category === 'piece' && product.stockQuantity <= 0} aria-label={`Enter quantity for ${product.name}`}>
              <span className={`product-avatar ${product.category === 'kg' ? 'avatar-kg' : 'avatar-piece'}`}>{product.category === 'kg' ? <Scale size={17} /> : <Package size={17} />}</span><span className="bill-product-info"><strong>{product.name}</strong><small>{isUntrackedKg(product) ? 'Loose / By weight' : `${stockLabel(product)} ${safeProductQuantity(product)} left`}</small></span><span className="bill-product-price"><strong>{money(product.sellingPrice)}</strong><small>/ {product.category === 'kg' ? 'kg' : 'piece'}</small></span><span className="add-product-button"><Plus size={16} /></span>
            </button>)}{visibleBillProducts.length === 0 && <EmptyState icon={Search} title="No matching products" message="Try a different search or filter." />}</div>
          </section>
          <section className="panel cart-panel" id="current-bill"><div className="panel-heading cart-heading"><div><h3>Current bill</h3><p>{cart.length} {cart.length === 1 ? 'product' : 'products'} selected</p></div><span className="cart-badge"><ReceiptText size={16} />{cart.length > 0 && <b>{cart.length}</b>}</span></div>
            {cart.length === 0 ? <div className="cart-empty"><span className="cart-empty-icon"><ShoppingBag size={24} /></span><strong>Your bill is empty</strong><p>Select a product to start.</p></div> : <div className="cart-lines">{cart.map((line) => { const product = activeProducts.find((item) => item.id === line.productId); if (!product) return null; const quote = cartQuote.lines.find((item) => item.line.productId === line.productId); return <div className="cart-line" key={line.productId}>
              <div className="cart-line-top"><span><strong>{product.name}</strong>{product.discountPercent > 0 && <small className="discount-tag">{product.discountPercent}% offer</small>}</span><button className="icon-button quiet-icon" onClick={() => setCart((current) => current.filter((item) => item.productId !== line.productId))} aria-label={`Remove ${product.name}`}><Trash2 size={15} /></button></div>
              <div className="cart-line-bottom"><div className="qty-control"><input aria-label={`Quantity for ${product.name}`} type="number" min="0" step="any" value={line.quantity} onChange={(e) => setCart((current) => current.map((item) => item.productId === line.productId ? { ...item, quantity: Number(e.target.value) } : item))} /><select aria-label="Weight unit" value={line.unit} disabled={product.category === 'piece'} onChange={(e) => { const unit = e.target.value as 'g' | 'kg'; setCart((current) => current.map((item) => item.productId === line.productId ? { ...item, quantity: unit === 'kg' ? item.quantity / 1000 : item.quantity * 1000, unit } : item)); }}><option value="g">g</option><option value="kg">kg</option>{product.category === 'piece' && <option value="piece">piece</option>}</select><button type="button" className="keypad-open" onClick={() => { setKeypadMode('edit'); setKeypadProductId(product.id); }} aria-label={`Open number pad for ${product.name}`} title="Open number pad"><Calculator size={14} /></button></div><div className="cart-line-price"><small>{money(product.sellingPrice)} / {product.category === 'kg' ? 'kg' : 'pc'}</small><strong>{money(quote?.total ?? 0)}</strong></div></div>
            </div>; })}</div>}
            {cart.length > 0 && <>
              <div className="customer-fields"><p className="section-label">CUSTOMER <span>OPTIONAL · saved to Customers when WhatsApp is entered</span></p><div className="form-grid two-col"><input value={customerName} onChange={(e) => setCustomerName(e.target.value)} placeholder="Customer name" /><input inputMode="tel" value={customerPhone} onChange={(e) => setCustomerPhone(e.target.value)} placeholder="WhatsApp number" /></div></div>
              <div className="bill-totals"><div><span>Subtotal</span><strong>{money(cartQuote.subtotal)}</strong></div>{cartQuote.productDiscount > 0 && <div className="discount-row"><span>Product discount</span><strong>− {money(cartQuote.productDiscount)}</strong></div>}<div className="bill-discount-row"><label htmlFor="bill-discount">Bill discount</label><span className="input-prefix small-prefix"><b>₹</b><input id="bill-discount" type="number" min="0" max={cartQuote.beforeBillDiscount} step="0.01" value={billDiscount} onChange={(e) => setBillDiscount(e.target.value)} /></span></div><div className="bill-grand-total"><span>Total due</span><strong>{money(cartQuote.total)}</strong></div></div>
              <div className="payment-options"><p className="section-label">PAYMENT METHOD</p><div className="payment-mode-grid"><button className={paymentMode === 'cash' ? 'selected' : ''} onClick={() => setPaymentMode('cash')}><Banknote size={16} /> Cash</button><button className={paymentMode === 'upi' ? 'selected' : ''} onClick={() => setPaymentMode('upi')}><Smartphone size={16} /> GPay / UPI</button><button className={paymentMode === 'split' ? 'selected' : ''} onClick={() => setPaymentMode('split')}><CreditCard size={16} /> Split</button></div>
                {paymentMode === 'split' && <div className="split-fields"><label>Cash<input type="number" min="0" step="0.01" value={splitCash} onChange={(e) => setSplitCash(e.target.value)} placeholder="0.00" /></label><label>GPay / UPI<input type="number" min="0" step="0.01" value={splitUpi} onChange={(e) => setSplitUpi(e.target.value)} placeholder="0.00" /></label><small>Both amounts must add up to {money(cartQuote.total)}.</small></div>}
              </div>
              <button className="button button-primary complete-bill" onClick={completeBill} disabled={busy || cartQuote.total <= 0}>{busy ? <LoaderCircle className="spin" size={17} /> : <Check size={17} />} {busy ? 'Saving bill…' : 'Complete bill'}<strong>{money(cartQuote.total)}</strong></button>
              <p className="secure-note"><span className="secure-dot" /> Bill is saved directly to your Supabase shop database.</p>
            </>}
          </section>
        </div>}

        {activeTab === 'products' && <section className="panel page-panel"><div className="panel-heading panel-heading-wrap"><div><h3>Products</h3><p>Maintain selling prices and bulk stock</p></div><button className="button button-primary" onClick={() => { setEditingProduct(null); setModal('product'); }}><Plus size={17} /> Add product</button></div>
          <div className="toolbar"><div className="search-field"><Search size={17} /><input value={productSearch} onChange={(e) => setProductSearch(e.target.value)} placeholder="Search products…" /></div><div className="toolbar-summary"><span>{activeProducts.filter((product) => product.category === 'kg').length} kg</span><span className="toolbar-divider" /><span>{activeProducts.filter((product) => product.category === 'piece').length} piece</span></div></div>
          {visibleProducts.length ? <div className="table-wrap"><table><thead><tr><th>PRODUCT</th><th>TYPE</th><th>BUY COST</th><th>SELLING PRICE</th><th>STOCK</th><th>STATUS</th><th></th></tr></thead><tbody>{visibleProducts.map((product) => { const low = product.category === 'piece' ? product.stockQuantity <= product.lowStockAt : (!isUntrackedKg(product) && product.lowStockAt > 0 && product.stockQuantity <= product.lowStockAt); return <tr key={product.id}><td><div className="table-product"><span className="product-avatar">{product.category === 'kg' ? <Scale size={16} /> : <Package size={16} />}</span><span><strong>{product.name}</strong><small>{product.retailPrice ? `Retail ${money(product.retailPrice)}` : product.discountPercent ? `${product.discountPercent}% offer` : product.category === 'kg' ? 'Loose / weighed item' : 'Sold per piece'}</small></span></div></td><td><span className={`type-chip ${product.category}`}>{product.category === 'kg' ? 'Kg product' : 'Piece product'}</span></td><td>{money(product.purchasePrice)} <small>/ {product.category === 'kg' ? 'kg' : 'pc'}</small></td><td><strong>{money(product.sellingPrice)}</strong> <small>/ {product.category === 'kg' ? 'kg' : 'pc'}</small></td><td><strong>{isUntrackedKg(product) ? 'Loose / Open' : stockLabel(product)}</strong> <small>{isUntrackedKg(product) ? '' : safeProductQuantity(product)}</small></td><td><span className={`status-chip ${low ? 'warning' : 'success'}`}><i />{low ? 'Low stock' : isUntrackedKg(product) ? 'Open stock' : 'In stock'}</span></td><td><div className="table-actions"><button className="icon-button" title="Add stock" aria-label={`Add stock for ${product.name}`} onClick={() => { setStockProduct(product); setModal('stock'); }}><PackagePlus size={17} /></button><button className="icon-button" title="Edit product" aria-label={`Edit ${product.name}`} onClick={() => { setEditingProduct(product); setModal('product'); }}><Pencil size={16} /></button><button className="icon-button danger-icon" title="Delete product" aria-label={`Delete ${product.name}`} onClick={() => deleteProduct(product)}><Trash2 size={16} /></button></div></td></tr>; })}</tbody></table></div> : <EmptyState icon={Package} title="No products found" message={productSearch ? 'Try a different product name.' : 'Add products to begin creating bills.'} action={!productSearch && <button className="button button-primary button-sm" onClick={() => { setEditingProduct(null); setModal('product'); }}><Plus size={15} /> Add product</button>} />}
          <div className="stock-tip"><Info size={16} /><span><strong>Bulk stock:</strong> Add a product with its opening quantity, or choose the box icon to record a new stock purchase. Kg stock is tracked in kilograms; piece stock is tracked in whole pieces.</span></div>
        </section>}

        {activeTab === 'customers' && <section className="panel page-panel customer-page">
          <div className="panel-heading panel-heading-wrap"><div><h3>Customers</h3><p>Contacts from bills with a WhatsApp number</p></div><span className="count-chip">{state.customers.length} {state.customers.length === 1 ? 'contact' : 'contacts'}</span></div>
          <div className="toolbar"><div className="search-field"><Search size={17} /><input value={customerSearch} onChange={(e) => setCustomerSearch(e.target.value)} placeholder="Search name or WhatsApp number…" /></div><span className="customer-list-help">Saved automatically when a bill is completed.</span></div>
          {visibleCustomers.length ? <div className="customer-grid">{visibleCustomers.map((customer) => {
            const stats = customerStats.get(customer.phoneNormalized);
            const whatsappDigits = customer.phoneNormalized.length === 10 ? `91${customer.phoneNormalized}` : customer.phoneNormalized;
            return <article className="customer-card" key={customer.id}>
              <div className="customer-card-head"><span className="customer-avatar">{(customer.name || customer.phone).slice(0, 1).toUpperCase()}</span><span className="customer-card-name"><strong>{customer.name || 'Customer'}</strong><small>Customer contact</small></span><span className="customer-bill-count">{stats?.bills ?? 0} bills</span></div>
              <a className="customer-whatsapp" href={`https://wa.me/${whatsappDigits}`} target="_blank" rel="noreferrer"><Smartphone size={15} />{customer.phone}<span>WhatsApp</span></a>
              <div className="customer-card-foot"><span>Last bill <strong>{stats?.lastVisit ? dateLabel(stats.lastVisit) : 'Not yet'}</strong></span><span>Total spent <strong>{money(stats?.spent ?? 0)}</strong></span></div>
              <button type="button" className="customer-view-bills" onClick={() => setCustomerBillsPhone(customer.phoneNormalized)}>View shop bills <ChevronRight size={15} /></button>
            </article>;
          })}</div> : <EmptyState icon={Users} title={customerSearch ? 'No matching customers' : 'No customers yet'} message={customerSearch ? 'Try a different name or number.' : 'Enter a customer name and WhatsApp number on a bill. The contact will appear here after the bill is saved.'} action={!customerSearch && <button className="button button-primary button-sm" onClick={() => setActiveTab('bill')}><Plus size={15} /> New bill</button>} />}
        </section>}

        {activeTab === 'expenses' && <section className="panel page-panel"><div className="panel-heading panel-heading-wrap"><div><h3>Expenses</h3><p>Keep shop spending separate from stock purchases</p></div><button className="button button-primary" onClick={() => setModal('expense')}><Plus size={17} /> Add expense</button></div>
          <div className="expense-summary-row"><div><span>Today’s expenses</span><strong>{money(expenseTotalToday)}</strong></div><div><span>Cash paid</span><strong>{money(cashExpenseToday)}</strong></div><div><span>GPay / UPI paid</span><strong>{money(upiExpenseToday)}</strong></div><div><span>Entries today</span><strong>{todayExpenses.length}</strong></div></div>
          {state.expenses.length ? <div className="table-wrap"><table><thead><tr><th>EXPENSE</th><th>DATE</th><th>PAYMENT</th><th>NOTE</th><th className="align-right">AMOUNT</th></tr></thead><tbody>{state.expenses.map((expense) => <tr key={expense.id}><td><div className="expense-name"><span className="expense-icon"><WalletCards size={16} /></span><strong>{expense.category}</strong></div></td><td>{dateLabel(expense.createdAt)} <small>{timeLabel(expense.createdAt)}</small></td><td><span className={`payment-chip ${expense.method}`}>{expense.method === 'upi' ? <Smartphone size={13} /> : <Banknote size={13} />}{expense.method === 'upi' ? 'GPay / UPI' : 'Cash'}</span></td><td className="muted-cell">{expense.note || '—'}</td><td className="align-right"><strong>{money(expense.amount)}</strong></td></tr>)}</tbody></table></div> : <EmptyState icon={WalletCards} title="No expenses recorded" message="Add rent, transport, electricity, and other shop expenses here." action={<button className="button button-outline button-sm" onClick={() => setModal('expense')}><Plus size={15} /> Add expense</button>} />}
        </section>}

        {activeTab === 'sales' && <section className="panel page-panel"><div className="panel-heading panel-heading-wrap"><div><h3>Sales history</h3><p>Review bills and open receipts</p></div><button className="button button-primary" onClick={() => setActiveTab('bill')}><Plus size={17} /> New bill</button></div>
          <div className="toolbar history-toolbar"><div className="search-field"><Search size={17} /><input value={historySearch} onChange={(e) => setHistorySearch(e.target.value)} placeholder="Receipt, customer, or phone…" /></div><label className="date-filter"><CalendarDays size={16} /><input type="date" value={historyDate} onChange={(e) => setHistoryDate(e.target.value)} aria-label="Filter sales by date" /></label></div>
          {(() => { const filtered = state.sales.filter((sale) => `${sale.receiptNumber} ${sale.customerName} ${sale.customerPhone}`.toLowerCase().includes(historySearch.toLowerCase()) && (!historyDate || localDateKey(sale.createdAt) === historyDate)); return filtered.length ? <div className="table-wrap"><table><thead><tr><th>RECEIPT</th><th>CUSTOMER</th><th>DATE</th><th>PAYMENT</th><th>ITEMS</th><th className="align-right">TOTAL</th><th></th></tr></thead><tbody>{filtered.map((sale) => <tr className="click-row" key={sale.id} onClick={() => setReceipt(sale)}><td><strong className="receipt-number">{sale.receiptNumber}</strong></td><td>{sale.customerName || sale.customerPhone || 'Walk-in'}</td><td>{dateLabel(sale.createdAt)} <small>{timeLabel(sale.createdAt)}</small></td><td>{sale.payments.map((payment) => payment.method === 'upi' ? 'GPay / UPI' : 'Cash').join(' + ')}</td><td>{sale.lines.length} {sale.lines.length === 1 ? 'item' : 'items'}</td><td className="align-right"><strong>{money(sale.total)}</strong></td><td><button className="icon-button" onClick={(e) => { e.stopPropagation(); setReceipt(sale); }} aria-label="Open receipt"><ChevronRight size={17} /></button></td></tr>)}</tbody></table></div> : <EmptyState icon={ReceiptText} title="No matching bills" message="Your completed bills will appear here." />; })()}
        </section>}

        {activeTab === 'settings' && <div className="settings-layout"><section className="panel settings-panel"><div className="panel-heading"><div><h3>Shop settings</h3><p>Personalize your receipts and account</p></div><span className="settings-icon"><Settings size={19} /></span></div>
          <form onSubmit={updateShopName} className="settings-form"><label>Shop name<input value={shopNameInput} onChange={(e) => setShopNameInput(e.target.value)} placeholder="My Shop" /></label><p className="field-help">This name appears at the top of every receipt.</p><button className="button button-primary" disabled={savingName}>{savingName ? 'Saving…' : 'Save shop name'}</button></form>
          <div className="settings-divider" /><div className="setting-row"><span className="setting-icon"><Store size={18} /></span><span><strong>Database storage</strong><small>Live records are stored in Supabase PostgreSQL.</small></span><span className="status-chip success"><i />Connected</span></div>
          <div className="setting-row"><span className="setting-icon"><CreditCard size={18} /></span><span><strong>Payment methods</strong><small>Cash and manual GPay / UPI recording.</small></span><span className="setting-value">Enabled</span></div>
          <div className="setting-row"><span className="setting-icon"><FileText size={18} /></span><span><strong>Receipt number format</strong><small>Date followed by a daily sequence.</small></span><span className="setting-value">YYYYMMDD-0001</span></div>
          <div className="settings-divider" />
          <div className="setting-row"><span className="setting-icon"><Users size={18} /></span><span><strong>Owner account</strong><small>{session?.user.email ?? 'Shop owner'}</small></span><button className="button button-outline button-danger" onClick={signOut}><LogOut size={15} /> Sign out</button></div>
          <div className="setting-row"><span className="setting-icon"><Settings size={18} /></span><span><strong>Supabase credentials</strong><small>Change API key or reconnect.</small></span><button className="button button-outline button-sm" onClick={() => { clearSupabaseConfig(); window.location.reload(); }}>Reset API key</button></div>
        </section><section className="panel settings-side"><div className="panel-heading"><div><h3>About this app</h3><p>Shop Billing</p></div><span className="about-mark"><ShoppingBag size={20} /></span></div><p className="about-copy">A simple billing and stock tracker built for daily shop work. Created by Shiyas Ahmad. WhatsApp 7012587705 for support.</p><div className="about-stat"><span>Currency</span><strong>Indian Rupee · ₹</strong></div><div className="about-stat"><span>Product types</span><strong>Kg and Piece</strong></div><div className="about-stat"><span>Mobile app</span><strong>Installable PWA</strong></div><div className="about-stat"><span>Version</span><strong>1.0.0</strong></div><button className="button button-outline signout-button button-danger" onClick={signOut} style={{ width: '100%', marginTop: '16px' }}><LogOut size={16} /> Sign out of shop</button></section></div>}

        <footer className="page-footer"><span>Shop Billing <span>·</span> Simple daily shop management</span><span>Created by <strong>Shiyas Ahmad</strong> <span>·</span> <a href="https://wa.me/917012587705" target="_blank" rel="noreferrer">WhatsApp 7012587705</a></span></footer>
      </section>
    </main>

    {activeTab === 'bill' && cart.length > 0 && <button className="mobile-bill-fab" onClick={() => document.getElementById('current-bill')?.scrollIntoView({ behavior: 'smooth', block: 'start' })} aria-label={`Review bill, ${cart.length} products, ${money(cartQuote.total)}`}>
      <span className="bill-fab-icon"><ShoppingBag size={19} /><b>{cart.length}</b></span><span className="bill-fab-copy"><strong>{cart.length} {cart.length === 1 ? 'product' : 'products'}</strong><small>Tap to review bill</small></span><strong className="bill-fab-total">{money(cartQuote.total)} <ChevronRight size={17} /></strong>
    </button>}
    {mobileMenu && <button className="mobile-scrim" aria-label="Close menu" onClick={() => setMobileMenu(false)} />}
    {modal === 'product' && <ProductForm product={editingProduct} onClose={() => setModal(null)} onSave={saveProduct} />}
    {modal === 'stock' && stockProduct && <StockForm product={stockProduct} onClose={() => { setModal(null); setStockProduct(null); }} onSave={addStock} />}
    {modal === 'expense' && <ExpenseForm onClose={() => setModal(null)} onSave={addExpense} />}
    {selectedCustomer && <Overlay wide onClose={() => setCustomerBillsPhone(null)}>
      <div className="modal-head"><div><p className="eyebrow">CUSTOMER HISTORY</p><h2>{selectedCustomer.name || 'Customer bills'}</h2></div><button className="icon-button" onClick={() => setCustomerBillsPhone(null)} aria-label="Close customer bills"><X size={19} /></button></div>
      <div className="customer-bills-summary"><Smartphone size={15} /><span>{selectedCustomer.phone}</span><strong>{selectedCustomerBills.length} {selectedCustomerBills.length === 1 ? 'bill' : 'bills'}</strong><b>{money(selectedCustomerBills.reduce((sum, sale) => sum + sale.total, 0))}</b></div>
      {selectedCustomerBills.length ? <div className="customer-bill-list">{selectedCustomerBills.map((sale) => <button className="customer-bill-row" key={sale.id} onClick={() => { setCustomerBillsPhone(null); setReceipt(sale); }}>
        <span className="customer-bill-info"><strong>{sale.receiptNumber}</strong><small>{dateLabel(sale.createdAt)} · {timeLabel(sale.createdAt)}</small><small className="customer-bill-items">{sale.lines.map((line) => `${line.productName} × ${line.displayQuantity} ${line.displayUnit}`).join(' · ')}</small></span>
        <span className="customer-bill-meta"><strong>{money(sale.total)}</strong><small>{sale.payments.map((payment) => payment.method === 'upi' ? 'GPay' : 'Cash').join(' + ')}</small></span><ChevronRight size={17} />
      </button>)}</div> : <EmptyState icon={ReceiptText} title="No bills found" message="No saved shop bills were found for this WhatsApp number." />}
    </Overlay>}
    {receipt && <ReceiptView sale={receipt} shopName={state.shopName} onClose={() => setReceipt(null)} onNotice={setNotice} />}
    {keypadProduct && (keypadMode === 'add' || keypadCartLine) && <QuantityKeypad product={keypadProduct} initialQuantity={keypadInitialQuantity} initialUnit={keypadInitialUnit} mode={keypadMode} currentQuantity={keypadMode === 'add' && keypadCartLine ? `${keypadCartLine.quantity} ${keypadCartLine.unit}` : undefined} onClose={() => setKeypadProductId(null)} onSave={(quantity, unit) => { if (keypadMode === 'add') addQuantityToCart(keypadProduct, quantity, unit); else setCart((current) => current.map((line) => line.productId === keypadProduct.id ? { ...line, quantity, unit } : line)); setKeypadProductId(null); }} />}
    {notice && <div className={`toast toast-${notice.type}`} role="status"><span>{notice.type === 'success' ? <Check size={16} /> : notice.type === 'error' ? <AlertTriangle size={16} /> : <Info size={16} />}</span><p>{notice.text}</p><button onClick={() => setNotice(null)} aria-label="Dismiss notification"><X size={15} /></button></div>}
  </div>;
}

export default App;
