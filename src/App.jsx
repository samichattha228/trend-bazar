import React, { useEffect, useMemo, useState } from 'react';
import { supabase, configured } from './supabase';
import { Search, ShoppingCart, Menu, X, ArrowLeft, Plus, Pencil, Trash2, LogOut, Package, BarChart3, Settings, Star, MessageCircle, Eye, CheckCircle, Clock, Truck } from 'lucide-react';

const money = n => `Rs. ${Number(n || 0).toLocaleString('en-PK')}`;
const placeholder = 'https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=900&q=80';
const waNumber = import.meta.env.VITE_WHATSAPP_NUMBER || '';
const blankProduct = { name:'', slug:'', product_code:'', category:'General', description:'', price:'', compare_at_price:'', cost_price:'', stock:0, image_url:'', video_url:'', active:true };

export default function App() {
  const [products,setProducts] = useState([]);
  const [categories,setCategories] = useState([]);
  const [cart,setCart] = useState(() => JSON.parse(localStorage.getItem('tb-cart') || '[]'));
  const [search,setSearch] = useState('');
  const [category,setCategory] = useState('All');
  const [page,setPage] = useState('home');
  const [selected,setSelected] = useState(null);
  const [mobileMenu,setMobileMenu] = useState(false);
  const [notice,setNotice] = useState('');
  const [loading,setLoading] = useState(false);
  const [admin,setAdmin] = useState(false);
  const [session,setSession] = useState(null);
  const [adminTab,setAdminTab] = useState('overview');
  const [orders,setOrders] = useState([]);
  const [form,setForm] = useState(blankProduct);
  const [editing,setEditing] = useState(null);
  const [loginEmail,setLoginEmail] = useState('');
  const [loginPassword,setLoginPassword] = useState('');
  const [checkout,setCheckout] = useState({name:'',phone:'',city:'',address:'',notes:''});
  const [orderResult,setOrderResult] = useState(null);
  const [reviews,setReviews] = useState([]);
  const [reviewForm,setReviewForm] = useState({name:'',rating:5,body:''});

  useEffect(() => { localStorage.setItem('tb-cart', JSON.stringify(cart)); }, [cart]);
  useEffect(() => {
    if (!configured) return;
    loadStore();
    supabase.auth.getSession().then(({data}) => setSession(data.session));
    const { data:{subscription} } = supabase.auth.onAuthStateChange((_event,s) => setSession(s));
    return () => subscription.unsubscribe();
  }, []);
  useEffect(() => {
    if (!configured || !selected) return;
    supabase.rpc('record_product_view', { p_product_id:selected.id }).then(()=>{});
    supabase.from('reviews').select('id,customer_name,rating,body,created_at').eq('product_id',selected.id).eq('approved',true).order('created_at',{ascending:false}).then(({data})=>setReviews(data||[]));
  }, [selected]);
  useEffect(() => {
    if (!configured || !session) { setAdmin(false); return; }
    supabase.from('profiles').select('is_admin').eq('id',session.user.id).maybeSingle()
      .then(({data}) => { setAdmin(Boolean(data?.is_admin)); });
  }, [session]);

  async function loadStore() {
    setLoading(true);
    const [{data:p,error:pe},{data:c}] = await Promise.all([
      supabase.from('products').select('id,name,slug,category,description,price,compare_at_price,image_url,video_url,stock,average_rating,review_count,views').eq('active',true).order('created_at',{ascending:false}),
      supabase.from('categories').select('id,name').eq('active',true).order('name')
    ]);
    if (pe) setNotice(pe.message);
    setProducts(p||[]); setCategories(c||[]); setLoading(false);
  }
  const visible = useMemo(()=>products.filter(p=>(category==='All'||p.category===category) && (p.name.toLowerCase().includes(search.toLowerCase()) || p.description?.toLowerCase().includes(search.toLowerCase()))),[products,category,search]);
  const cartCount = cart.reduce((n,x)=>n+x.qty,0);
  const total = cart.reduce((n,x)=>n+x.price*x.qty,0);
  function addCart(p) { setCart(old=>{const found=old.find(x=>x.id===p.id); return found?old.map(x=>x.id===p.id?{...x,qty:x.qty+1}:x):[...old,{id:p.id,name:p.name,price:p.price,image_url:p.image_url,qty:1}]}); setNotice('Added to cart'); }
  function setQty(id,qty) { setCart(old=>old.map(x=>x.id===id?{...x,qty:Math.max(1,Math.min(20,Number(qty)||1))}:x)); }
  function openProduct(p) { setSelected(p); setPage('product'); setReviews([]); window.scrollTo(0,0); }
  function go(p) { setPage(p); setSelected(null); setMobileMenu(false); window.scrollTo(0,0); }
  async function submitOrder(e) {
    e.preventDefault();
    if (!configured) return;
    if (!checkout.phone.trim() || !checkout.name.trim() || !checkout.address.trim() || cart.length===0) { setNotice('Please complete the required fields.'); return; }
    setLoading(true);
    const {data,error}=await supabase.rpc('place_order',{p_customer_name:checkout.name.trim(),p_phone:checkout.phone.trim(),p_city:checkout.city.trim(),p_address:checkout.address.trim(),p_notes:checkout.notes.trim(),p_items:cart.map(x=>({product_id:x.id,quantity:x.qty}))});
    setLoading(false);
    if (error) { setNotice(error.message); return; }
    setOrderResult(data); setCart([]); setCheckout({name:'',phone:'',city:'',address:'',notes:''}); go('success');
  }
  async function login(e) {
    e.preventDefault();
    const {error}=await supabase.auth.signInWithPassword({email:loginEmail,password:loginPassword});
    if(error) setNotice(error.message); else { setNotice('Signed in. Checking admin permissions…'); }
  }
  async function logout() { await supabase.auth.signOut(); setAdmin(false); go('home'); }
  async function loadAdmin() {
    const [{data:o},{data:p},{data:c}] = await Promise.all([
      supabase.from('orders').select('id,order_number,customer_name,phone,city,address,total,status,created_at').order('created_at',{ascending:false}).limit(100),
      supabase.rpc('admin_list_products'),
      supabase.from('categories').select('*').order('name')
    ]);
    setOrders(o||[]); setProducts(p||[]); setCategories(c||[]);
  }
  useEffect(()=>{ if(admin && page==='admin') loadAdmin(); },[admin,page]);
  async function saveProduct(e) {
    e.preventDefault();
    const payload={...form,price:Number(form.price),compare_at_price:form.compare_at_price?Number(form.compare_at_price):null,cost_price:Number(form.cost_price||0),stock:Number(form.stock||0),slug:form.slug||form.name.toLowerCase().trim().replace(/[^a-z0-9]+/g,'-').replace(/(^-|-$)/g,'')};
    delete payload.id;
    const result=editing?await supabase.from('products').update(payload).eq('id',editing):await supabase.from('products').insert(payload);
    if(result.error) setNotice(result.error.message); else {setNotice('Product saved');setForm(blankProduct);setEditing(null);loadAdmin();loadStore();}
  }
  async function deleteProduct(id) {
    if(!confirm('Delete this product? Existing order history will remain.')) return;
    const {error}=await supabase.from('products').delete().eq('id',id);
    setNotice(error?error.message:'Product deleted'); loadAdmin(); loadStore();
  }
  async function updateOrder(id,status) {
    const {error}=await supabase.from('orders').update({status}).eq('id',id);
    setNotice(error?error.message:'Order updated'); loadAdmin();
  }
  async function saveCategory(name) {
    if(!name.trim()) return;
    const {error}=await supabase.from('categories').insert({name:name.trim()});
    setNotice(error?error.message:'Category added'); loadAdmin(); loadStore();
  }
  async function uploadFile(file,kind='products') {
    const ext=file.name.split('.').pop(); const path=`${kind}/${crypto.randomUUID()}.${ext}`;
    const {error}=await supabase.storage.from('store-media').upload(path,file,{upsert:false});
    if(error){setNotice(error.message);return null;}
    const {data}=supabase.storage.from('store-media').getPublicUrl(path); return data.publicUrl;
  }
  async function submitReview(e) {
    e.preventDefault();
    const {error}=await supabase.from('reviews').insert({product_id:selected.id,customer_name:reviewForm.name,rating:Number(reviewForm.rating),body:reviewForm.body});
    setNotice(error?error.message:'Review submitted for approval'); if(!error)setReviewForm({name:'',rating:5,body:''});
  }

  if(!configured) return <SetupScreen />;
  return <div className="app">
    <header className="topbar">
      <button className="icon-btn mobile-only" onClick={()=>setMobileMenu(!mobileMenu)}>{mobileMenu?<X/>:<Menu/>}</button>
      <button className="brand" onClick={()=>go('home')}><span className="brand-mark">T</span><span>Trend <b>Bazar</b></span></button>
      <nav className={mobileMenu?'nav open':'nav'}>
        <button onClick={()=>go('home')}>Home</button><button onClick={()=>go('home')}>Shop</button>
        <button onClick={()=>go('home')}>Categories</button>
        <button onClick={()=>go('admin-login')}>Admin</button>
      </nav>
      <div className="header-actions"><div className="searchbox"><Search size={18}/><input value={search} onChange={e=>{setSearch(e.target.value);go('home')}} placeholder="Search products..."/></div>
      <button className="cart-button" onClick={()=>go('cart')}><ShoppingCart size={19}/> <span>Cart</span><b>{cartCount}</b></button></div>
    </header>
    {notice && <div className="toast" onClick={()=>setNotice('')}>{notice} <X size={15}/></div>}
    <main>
      {page==='home' && <><section className="hero"><div><span className="eyebrow">A smarter way to shop</span><h1>Find your next<br/><em>favourite thing.</em></h1><p>Everyday essentials and trending finds, all in one place.</p><button className="primary" onClick={()=>document.getElementById('catalog')?.scrollIntoView({behavior:'smooth'})}>Explore products <ArrowLeft className="arrow-right" size={17}/></button></div><div className="hero-art"><div className="hero-circle"></div><img src={placeholder} alt="Featured shopping product"/></div></section>
      <section className="benefits"><span>✓ Carefully selected products</span><span>✓ Cash on delivery</span><span>✓ Friendly support</span></section>
      <section id="catalog" className="catalog"><div className="section-head"><div><span className="eyebrow">Our collection</span><h2>Shop the latest</h2></div><span className="muted">{visible.length} products</span></div>
      <div className="chips"><button className={category==='All'?'chip active':'chip'} onClick={()=>setCategory('All')}>All</button>{categories.map(c=><button key={c.id} className={category===c.name?'chip active':'chip'} onClick={()=>setCategory(c.name)}>{c.name}</button>)}</div>
      {loading?<p className="muted">Loading products…</p>:visible.length===0?<div className="empty"><Package size={35}/><h3>No products found yet</h3><p>Products added by the store admin will appear here.</p></div>:<div className="product-grid">{visible.map(p=><ProductCard key={p.id} p={p} open={()=>openProduct(p)} add={()=>addCart(p)}/>)}</div>}</section></>}
      {page==='product' && selected && <section className="product-detail"><button className="back" onClick={()=>go('home')}><ArrowLeft size={17}/> Back to shop</button><div className="detail-grid"><div className="detail-image"><img src={selected.image_url||placeholder} alt={selected.name}/>{selected.video_url&&<video controls src={selected.video_url}/>}</div><div className="detail-info"><span className="eyebrow">{selected.category}</span><h1>{selected.name}</h1><Rating rating={selected.average_rating} count={selected.review_count}/><div className="detail-price">{money(selected.price)} {selected.compare_at_price>selected.price&&<del>{money(selected.compare_at_price)}</del>}</div><p>{selected.description||'More product details coming soon.'}</p><p className="stock">{selected.stock>0?'In stock':'Contact us for availability'}</p><div className="detail-actions"><button className="primary" onClick={()=>{addCart(selected);go('cart')}}>Order now</button><button className="secondary" onClick={()=>addCart(selected)}>Add to cart</button></div></div></div>
      <div className="reviews"><h2>Customer reviews</h2>{reviews.length?reviews.map(r=><div className="review" key={r.id}><b>{r.customer_name}</b><Rating rating={r.rating}/><p>{r.body}</p></div>):<p className="muted">No approved reviews yet.</p>}<form className="review-form" onSubmit={submitReview}><h3>Write a review</h3><input required placeholder="Your name" value={reviewForm.name} onChange={e=>setReviewForm({...reviewForm,name:e.target.value})}/><select value={reviewForm.rating} onChange={e=>setReviewForm({...reviewForm,rating:e.target.value})}>{[5,4,3,2,1].map(n=><option value={n}>{n} stars</option>)}</select><textarea required placeholder="Share your experience" value={reviewForm.body} onChange={e=>setReviewForm({...reviewForm,body:e.target.value})}/><button className="primary">Submit review</button></form></div></section>}
      {page==='cart' && <section className="page-wrap"><h1>Your cart</h1>{!cart.length?<div className="empty"><ShoppingCart size={36}/><h3>Your cart is empty</h3><button className="primary" onClick={()=>go('home')}>Continue shopping</button></div>:<div className="cart-layout"><div className="cart-items">{cart.map(x=><div className="cart-item" key={x.id}><img src={x.image_url||placeholder}/><div className="cart-name"><b>{x.name}</b><span>{money(x.price)}</span><div className="qty"><button onClick={()=>setQty(x.id,x.qty-1)}>−</button>{x.qty}<button onClick={()=>setQty(x.id,x.qty+1)}>+</button><button className="remove" onClick={()=>setCart(cart.filter(y=>y.id!==x.id))}>Remove</button></div></div><b>{money(x.price*x.qty)}</b></div>)}</div><aside className="summary"><h3>Order summary</h3><p><span>Subtotal</span><b>{money(total)}</b></p><p><span>Delivery</span><b>Confirmed at checkout</b></p><button className="primary full" onClick={()=>go('checkout')}>Proceed to checkout</button></aside></div>}</section>}
      {page==='checkout' && <section className="page-wrap narrow"><button className="back" onClick={()=>go('cart')}><ArrowLeft size={16}/> Back to cart</button><h1>Checkout</h1><div className="cod-note"><CheckCircle/> Cash on Delivery — pay when your order arrives.</div><form className="form-card" onSubmit={submitOrder}><label>Full name *<input required value={checkout.name} onChange={e=>setCheckout({...checkout,name:e.target.value})}/></label><label>Phone number *<input required inputMode="tel" value={checkout.phone} onChange={e=>setCheckout({...checkout,phone:e.target.value})} placeholder="03XXXXXXXXX"/></label><label>City<input value={checkout.city} onChange={e=>setCheckout({...checkout,city:e.target.value})}/></label><label>Complete delivery address *<textarea required value={checkout.address} onChange={e=>setCheckout({...checkout,address:e.target.value})}/></label><label>Order notes (optional)<textarea value={checkout.notes} onChange={e=>setCheckout({...checkout,notes:e.target.value})}/></label><div className="summary-line"><b>Total</b><strong>{money(total)}</strong></div><button className="primary full" disabled={loading}>{loading?'Placing order…':'Place COD order'}</button></form></section>}
      {page==='success' && <section className="success"><CheckCircle size={55}/><h1>Order received!</h1><p>Your order has been submitted successfully.</p><div className="order-number">Order number: <b>{orderResult?.order_number||'Confirmed'}</b></div><p>Our team will contact you to confirm delivery details.</p><button className="primary" onClick={()=>go('home')}>Continue shopping</button></section>}
      {page==='admin-login' && <section className="page-wrap narrow"><button className="back" onClick={()=>go('home')}><ArrowLeft size={16}/> Back to store</button><div className="login-card"><span className="brand-mark">T</span><h1>Admin sign in</h1><p className="muted">Private access for the store administrator.</p><form onSubmit={login}><label>Email<input type="email" required value={loginEmail} onChange={e=>setLoginEmail(e.target.value)}/></label><label>Password<input type="password" required value={loginPassword} onChange={e=>setLoginPassword(e.target.value)}/></label><button className="primary full">Sign in</button></form></div></section>}
      {page==='admin' && admin && <section className="admin-layout"><aside className="admin-side"><h2>Trend Bazar</h2><small>ADMIN CONSOLE</small>{[['overview','Overview',BarChart3],['products','Products',Package],['orders','Orders',ShoppingCart],['categories','Categories',Settings]].map(([id,label,Icon])=><button className={adminTab===id?'selected':''} onClick={()=>setAdminTab(id)}><Icon size={17}/>{label}</button>)}<button onClick={logout}><LogOut size={17}/>Sign out</button></aside><div className="admin-main"><div className="admin-title"><div><span className="eyebrow">STORE MANAGEMENT</span><h1>{adminTab[0].toUpperCase()+adminTab.slice(1)}</h1></div><button className="secondary" onClick={loadAdmin}>Refresh</button></div>
        {adminTab==='overview'&&<><div className="stat-grid"><Stat label="Orders" value={orders.length}/><Stat label="Gross sales" value={money(orders.filter(o=>o.status==='delivered').reduce((n,o)=>n+Number(o.total),0))}/><Stat label="Products" value={products.length}/><Stat label="Pending orders" value={orders.filter(o=>o.status==='pending').length}/></div><h3>Recent orders</h3><OrderTable orders={orders.slice(0,8)} update={updateOrder}/></>}
        {adminTab==='products'&&<div className="admin-columns"><div className="form-card"><h3>{editing?'Edit product':'Add product'}</h3><form onSubmit={saveProduct}><label>Product name *<input required value={form.name} onChange={e=>setForm({...form,name:e.target.value})}/></label><label>Internal product code *<input required value={form.product_code} onChange={e=>setForm({...form,product_code:e.target.value})}/></label><label>Category<input value={form.category} onChange={e=>setForm({...form,category:e.target.value})}/></label><label>Description<textarea value={form.description} onChange={e=>setForm({...form,description:e.target.value})}/></label><div className="two"><label>Selling price *<input type="number" min="1" required value={form.price} onChange={e=>setForm({...form,price:e.target.value})}/></label><label>Purchase cost *<input type="number" min="0" required value={form.cost_price} onChange={e=>setForm({...form,cost_price:e.target.value})}/></label></div><div className="two"><label>Compare-at price<input type="number" value={form.compare_at_price} onChange={e=>setForm({...form,compare_at_price:e.target.value})}/></label><label>Stock<input type="number" value={form.stock} onChange={e=>setForm({...form,stock:e.target.value})}/></label></div><label>Product image<input type="file" accept="image/*" onChange={async e=>{if(e.target.files[0]){const url=await uploadFile(e.target.files[0]);if(url)setForm(f=>({...f,image_url:url}));}}}/></label><label>Image URL<input value={form.image_url} onChange={e=>setForm({...form,image_url:e.target.value})}/></label><label>Product video URL<input value={form.video_url} onChange={e=>setForm({...form,video_url:e.target.value})}/></label><label className="check"><input type="checkbox" checked={form.active} onChange={e=>setForm({...form,active:e.target.checked})}/> Visible in store</label><button className="primary full">{editing?'Update product':'Add product'}</button>{editing&&<button type="button" className="secondary full" onClick={()=>{setForm(blankProduct);setEditing(null)}}>Cancel edit</button>}</form></div><div><h3>All products</h3>{products.map(p=><div className="admin-product" key={p.id}><img src={p.image_url||placeholder}/><div><b>{p.name}</b><small>{p.product_code} · {money(p.price)}</small></div><button className="icon-btn" onClick={()=>{setForm({...p});setEditing(p.id);window.scrollTo(0,0)}}><Pencil size={16}/></button><button className="icon-btn danger" onClick={()=>deleteProduct(p.id)}><Trash2 size={16}/></button></div>)}</div></div>}
        {adminTab==='orders'&&<OrderTable orders={orders} update={updateOrder}/>}
        {adminTab==='categories'&&<CategoryManager categories={categories} add={saveCategory} reload={loadAdmin}/>}
      </div></section>}
      {page==='admin'&&!admin&&<section className="page-wrap narrow"><h2>Admin access required</h2><p>Your account is not marked as an administrator. Sign in with the authorized admin account.</p><button className="primary" onClick={()=>go('admin-login')}>Admin sign in</button></section>}
    </main>
    <footer><div className="brand"><span className="brand-mark">T</span><span>Trend <b>Bazar</b></span></div><p>Shop smart. Live better.</p><small>© {new Date().getFullYear()} Trend Bazar. All rights reserved.</small></footer>
    {waNumber&&<a className="whatsapp" href={`https://wa.me/${waNumber}`} target="_blank" rel="noreferrer" aria-label="WhatsApp support"><MessageCircle/></a>}
  </div>;
}

function ProductCard({p,open,add}) { return <article className="product-card"><button className="product-photo" onClick={open}><img src={p.image_url||placeholder} alt={p.name}/>{p.compare_at_price>p.price&&<span className="sale">SALE</span>}</button><div className="product-content"><small>{p.category}</small><button className="product-name" onClick={open}>{p.name}</button><Rating rating={p.average_rating} count={p.review_count}/><div className="price-row"><b>{money(p.price)}</b>{p.compare_at_price>p.price&&<del>{money(p.compare_at_price)}</del>}</div><div className="card-actions"><button className="secondary" onClick={add}>Add to cart</button><button className="primary" onClick={()=>{add(p);open()}}>Order now</button></div></div></article>; }
function Rating({rating=0,count}) { return <div className="rating"><span>★</span> {Number(rating||0).toFixed(1)} {count!==undefined&&<small>({count||0})</small>}</div>; }
function Stat({label,value}) { return <div className="stat"><small>{label}</small><b>{value}</b></div>; }
function OrderTable({orders,update}) { return <div className="table-wrap"><table><thead><tr><th>Order</th><th>Customer</th><th>Total</th><th>Date</th><th>Status</th></tr></thead><tbody>{orders.map(o=><tr key={o.id}><td><b>{o.order_number}</b></td><td>{o.customer_name}<small>{o.phone}</small></td><td>{money(o.total)}</td><td>{new Date(o.created_at).toLocaleDateString()}</td><td><select value={o.status} onChange={e=>update(o.id,e.target.value)}>{['pending','confirmed','processing','shipped','delivered','cancelled'].map(s=><option>{s}</option>)}</select></td></tr>)}</tbody></table>{!orders.length&&<p className="muted">No orders yet.</p>}</div>; }
function CategoryManager({categories,add,reload}) { const [name,setName]=useState(''); return <div className="form-card"><h3>Manage categories</h3><form onSubmit={e=>{e.preventDefault();add(name);setName('')}}><label>New category<input value={name} onChange={e=>setName(e.target.value)} placeholder="e.g. Kitchen"/></label><button className="primary">Add category</button></form><div className="category-list">{categories.map(c=><div key={c.id}><span>{c.name}</span><button className="icon-btn danger" onClick={async()=>{if(confirm('Delete category?')){await supabase.from('categories').delete().eq('id',c.id);reload();}}}><Trash2 size={16}/></button></div>)}</div></div>; }
function SetupScreen() { return <div className="setup"><div className="brand"><span className="brand-mark">T</span><span>Trend <b>Bazar</b></span></div><h1>Your store is almost ready.</h1><p>Add your Supabase project URL and publishable/anon key to the Netlify environment variables, then redeploy.</p><pre>VITE_SUPABASE_URL=https://YOUR_PROJECT.supabase.co{"\\n"}VITE_SUPABASE_ANON_KEY=YOUR_PUBLISHABLE_OR_ANON_KEY</pre><p>Run the SQL file <b>supabase/schema.sql</b> in Supabase SQL Editor first.</p></div>; }
