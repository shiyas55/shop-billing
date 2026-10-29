# Shop Billing

A mobile-first shop billing PWA for two sale types: Kg products and Piece products. It supports measured weights in grams or kilograms, bulk stock entries, cash and GPay/UPI collection, receipts, expenses, customer contacts from bills, and collection summaries.

## Start in demo mode

The app starts without Supabase credentials in browser-local demo mode. It seeds sample Kg and Piece products, bills, expenses, and stock so the dashboard and billing flow have example data. Demo records stay in that browser and do not sync to another device. The New Bill screen includes compact product cards and an on-screen number pad for mouse or touch entry. Customers with a WhatsApp number are saved to the Customers list when a bill is completed. Products can be archived from new bills without removing them from past receipts.

```sh
npm install
npm run dev
```

## Connect Supabase

1. Create a Supabase project and run `supabase/migrations/001_shop_billing.sql`, then `supabase/migrations/002_customers.sql`, in the Supabase SQL Editor.
2. Create the owner's login under Supabase Authentication. Public sign-up is not used.
3. Copy `.env.example` to `.env.local` and set the project URL and publishable/anon key:

   ```env
   VITE_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
   VITE_SUPABASE_ANON_KEY=YOUR_PUBLISHABLE_OR_ANON_KEY
   ```

4. Restart the development server and sign in with the owner account. The app will ask for the shop name once.
5. For a static deployment, provide the same two `VITE_` values at build time, then build and deploy the `dist/` directory.

The publishable key is designed for browser use when Row Level Security is enabled. Never put a Supabase secret or service-role key in this front end.

## Price and collection rules

- Kg product prices are per kilogram. Grams are converted to kilograms before calculation. Example: 70.5 g at ₹899/kg is ₹63.38 after rounding to paise.
- Piece product quantities must be whole numbers.
- A saved sale and its item snapshots, payments, and stock deductions are created by one Postgres function transaction.
- Net collection after expenses is customer payments received minus operating expenses. Stock purchases are shown separately in cash flow and are not counted as operating expenses.
- Estimated gross profit is sold amount after discounts minus the saved product cost. Estimated net profit subtracts operating expenses.

## Build

```sh
npm run build
```

The app is an online-first billing tool. Its shell may open offline after it has been cached, but live Supabase billing requires a connection. Demo mode is local to one browser.
