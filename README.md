# Trend Bazar — starter e-commerce project

This is the first working implementation of the Trend Bazar storefront and admin console.

## Included
- Responsive customer storefront, category filters and search
- Product details, cart and Cash on Delivery checkout
- Hidden internal product codes stored in order items
- Supabase database-backed products, categories, orders and reviews
- Private admin sign-in and admin-only product/order/category management
- Product image upload to Supabase Storage
- Product view counter
- Netlify-ready build and SPA routing

## 1. Create Supabase project
1. Create a free project at https://supabase.com.
2. Open SQL Editor and run all of `supabase/schema.sql`.
3. In Authentication > Providers, keep Email enabled.
4. In Authentication settings, set the site URL to your Netlify URL after deployment.

## 2. Create your admin account
1. In Supabase > Authentication > Users, create/invite your own email account (or use the site's admin sign-in after enabling email/password sign-up separately).
2. Sign in once from the Trend Bazar `/` site using that email/password.
3. In Supabase SQL Editor, run this one-time statement, replacing the email:
   `update public.profiles set is_admin=true where id=(select id from auth.users where email='YOUR_EMAIL_HERE');`
4. Sign out and sign in again. Only this explicitly promoted account has admin access.
Never set `is_admin=true` for customers. Never put the Supabase service-role key in the frontend or Netlify VITE variables.

## 3. Configure locally
1. Install Node.js LTS.
2. Copy `.env.example` to `.env`.
3. Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` (or publishable key) from Supabase Project Settings > API.
4. Set `VITE_WHATSAPP_NUMBER` to your support number in international format without `+`.
5. Run:
   - `npm install`
   - `npm run dev`
   - `npm run build`

## 4. Deploy to Netlify
1. Upload this project to a GitHub repository, or use Netlify's supported manual deploy/build workflow.
2. Build command: `npm run build`
3. Publish directory: `dist`
4. Add environment variables:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
   - `VITE_WHATSAPP_NUMBER`
5. Trigger a new deploy after setting variables.
6. In Supabase Authentication URL Configuration, set Site URL to your Netlify URL and add that URL to Redirect URLs.

## Important limitations / next development tasks
- This is a first functional foundation, not yet a production-hardened marketplace.
- Admin account creation is intentionally not exposed publicly.
- Reviews are held for admin approval, but review moderation controls need to be added to the admin UI.
- The dashboard currently shows basic sales/orders/product counts; product-level cost/profit reports, detailed traffic attribution, customer management, shipping fee settings, and downloadable reports are planned next.
- Public order form is protected by server-side database validation, but before a high-traffic launch add CAPTCHA/rate limiting and an order abuse monitoring strategy.
- Product stock is decremented when the order is placed. Admin should review pending COD orders and restore stock manually if an order is cancelled until automated stock-restoration logic is added.
- Use real product images/videos you own or are authorized to use.
