/* Rivet.Co storefront — shared logic and page renderers.
   All store content lives in /content/*.json and is edited from /admin. */
(function () {
  "use strict";

  // ---------- helpers ----------
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const esc = (v) => String(v == null ? "" : v)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  const params = new URLSearchParams(location.search);
  const cache = {};

  async function load(name) {
    if (!cache[name]) {
      cache[name] = fetch(`/content/${name}.json`, { cache: "no-cache" }).then((r) => {
        if (!r.ok) throw new Error(`Could not load ${name}`);
        return r.json();
      });
    }
    return cache[name];
  }

  let SETTINGS = null;
  function money(n) {
    const label = (SETTINGS && SETTINGS.currency_label) || "LE";
    return `${label} ${Number(n || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }
  const isOnSale = (p) => p.compare_at_price && Number(p.compare_at_price) > Number(p.price);
  const inStock = (p) => (p.sizes || []).some((s) => s.in_stock);
  const productUrl = (p) => `/product.html?id=${encodeURIComponent(p.id)}`;
  const img = (src, alt, cls = "") =>
    src ? `<img src="${esc(src)}" alt="${esc(alt)}" loading="lazy" class="${cls}" onerror="this.style.visibility='hidden'">` : "";

  function toast(msg) {
    let t = $(".toast");
    if (!t) { t = document.createElement("div"); t.className = "toast"; t.setAttribute("role", "status"); document.body.appendChild(t); }
    t.textContent = msg;
    t.classList.add("show");
    clearTimeout(t._h);
    t._h = setTimeout(() => t.classList.remove("show"), 2200);
  }

  // ---------- cart (stored in the shopper's browser) ----------
  const CART_KEY = "rivet_cart_v1";
  const Cart = {
    get() {
      try { const c = JSON.parse(localStorage.getItem(CART_KEY) || "[]"); return Array.isArray(c) ? c : []; }
      catch (e) { return []; }
    },
    save(items) {
      try { localStorage.setItem(CART_KEY, JSON.stringify(items)); } catch (e) { /* storage blocked */ }
      document.dispatchEvent(new CustomEvent("cart:change"));
    },
    add(id, size, qty) {
      const items = Cart.get();
      const hit = items.find((i) => i.id === id && i.size === size);
      if (hit) hit.qty = Math.min(10, hit.qty + qty); else items.push({ id, size, qty: Math.min(10, qty) });
      Cart.save(items);
    },
    setQty(id, size, qty) {
      let items = Cart.get();
      if (qty <= 0) items = items.filter((i) => !(i.id === id && i.size === size));
      else items.forEach((i) => { if (i.id === id && i.size === size) i.qty = Math.min(10, qty); });
      Cart.save(items);
    },
    clear() { Cart.save([]); },
    count() { return Cart.get().reduce((n, i) => n + i.qty, 0); },
  };

  // Join cart entries with current product data; drop anything no longer sold.
  function cartLines(products) {
    const byId = Object.fromEntries(products.map((p) => [p.id, p]));
    return Cart.get().map((i) => {
      const p = byId[i.id];
      if (!p) return null;
      const s = (p.sizes || []).find((x) => x.size === i.size);
      return { ...i, product: p, available: !!(s && s.in_stock), total: Number(p.price) * i.qty };
    }).filter(Boolean);
  }

  const GOVERNORATES = ["Cairo", "Giza", "Alexandria", "Qalyubia", "Sharqia", "Dakahlia", "Gharbia", "Monufia",
    "Beheira", "Kafr El Sheikh", "Damietta", "Port Said", "Ismailia", "Suez", "Faiyum", "Beni Suef", "Minya",
    "Asyut", "Sohag", "Qena", "Luxor", "Aswan", "Red Sea", "New Valley", "Matrouh", "North Sinai", "South Sinai"];

  function shippingFor(governorate, subtotal) {
    const sh = (SETTINGS && SETTINGS.shipping) || {};
    if (sh.free_over && subtotal >= Number(sh.free_over)) return 0;
    const zone = (sh.zones || []).find((z) => (z.governorates || []).includes(governorate));
    return Number(zone ? zone.fee : sh.default_fee) || 0;
  }

  // ---------- icons ----------
  const I = {
    menu: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M3 7h18M3 12h18M3 17h18"/></svg>',
    bag: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M5 8h14l-1 13H6L5 8Z"/><path d="M9 8V6a3 3 0 0 1 6 0v2"/></svg>',
    close: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M6 6l12 12M18 6 6 18"/></svg>',
    support: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4"><path d="M4 13v-1a8 8 0 0 1 16 0v1"/><rect x="3" y="13" width="4" height="6" rx="1"/><rect x="17" y="13" width="4" height="6" rx="1"/></svg>',
    lock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4"><rect x="5" y="10" width="14" height="10" rx="1"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/></svg>',
    returns: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4"><path d="M4 9h11a5 5 0 0 1 0 10H8"/><path d="M8 5 4 9l4 4"/></svg>',
    truck: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4"><path d="M2 6h12v10H2zM14 10h4l3 3v3h-7z"/><circle cx="6" cy="18" r="1.8"/><circle cx="17" cy="18" r="1.8"/></svg>',
    fb: '<svg viewBox="0 0 24 24"><path d="M13.5 21v-7.5h2.5l.4-3h-2.9V8.6c0-.9.3-1.5 1.5-1.5h1.5V4.4c-.3 0-1.2-.1-2.2-.1-2.2 0-3.8 1.4-3.8 3.9v2.3H8v3h2.5V21h3Z"/></svg>',
    ig: '<svg viewBox="0 0 24 24"><path d="M12 7.3a4.7 4.7 0 1 0 0 9.4 4.7 4.7 0 0 0 0-9.4Zm0 7.7a3 3 0 1 1 0-6 3 3 0 0 1 0 6Zm6-7.9a1.1 1.1 0 1 1-2.2 0 1.1 1.1 0 0 1 2.2 0ZM21 8c-.1-1.5-.4-2.8-1.5-3.9S17 2.7 15.5 2.6C14 2.5 10 2.5 8.5 2.6 7 2.7 5.6 3 4.5 4.1S3.1 6.5 3 8c-.1 1.5-.1 6.5 0 8 .1 1.5.4 2.8 1.5 3.9s2.5 1.4 4 1.5c1.5.1 5.5.1 7 0 1.5-.1 2.8-.4 3.9-1.5s1.4-2.4 1.5-3.9c.1-1.5.1-6.5.1-8Zm-2 9.6a3 3 0 0 1-1.7 1.7c-1.2.5-4 .4-5.3.4s-4.1.1-5.3-.4a3 3 0 0 1-1.7-1.7c-.5-1.2-.4-4-.4-5.3s-.1-4.1.4-5.3A3 3 0 0 1 6.7 5c1.2-.5 4-.4 5.3-.4s4.1-.1 5.3.4A3 3 0 0 1 19 6.7c.5 1.2.4 4 .4 5.3s.1 4.1-.4 5.3Z"/></svg>',
    tt: '<svg viewBox="0 0 24 24"><path d="M16.6 3h-3.1v12.3a2.7 2.7 0 1 1-2.7-2.7c.3 0 .6 0 .8.1V9.5a5.8 5.8 0 1 0 5 5.8V9a7.5 7.5 0 0 0 4.4 1.4V7.3A4.4 4.4 0 0 1 16.6 3Z"/></svg>',
    wa: '<svg viewBox="0 0 24 24"><path d="M12 2.5a9.4 9.4 0 0 0-8.1 14.2L2.6 21.5l4.9-1.3A9.4 9.4 0 1 0 12 2.5Zm0 17.1a7.7 7.7 0 0 1-3.9-1.1l-.3-.2-2.9.8.8-2.8-.2-.3A7.7 7.7 0 1 1 12 19.6Zm4.2-5.8c-.2-.1-1.4-.7-1.6-.8-.2-.1-.4-.1-.5.1l-.7.9c-.1.2-.3.2-.5.1a6.3 6.3 0 0 1-3.1-2.7c-.2-.4.2-.4.7-1.3.1-.1 0-.3 0-.4l-.7-1.7c-.2-.5-.4-.4-.5-.4h-.5c-.2 0-.4.1-.6.3-.2.2-.8.8-.8 2s.8 2.3 1 2.5c.1.2 1.7 2.6 4.1 3.6 1.5.7 2.1.7 2.9.6.5-.1 1.4-.6 1.6-1.1.2-.6.2-1 .1-1.1l-.4-.3Z"/></svg>',
  };

  // ---------- header, drawers, footer ----------
  function renderChrome(s, collections) {
    const top = $("#chrome-top");
    const bottom = $("#chrome-bottom");
    const colLinks = collections.map((c) => `<a href="/shop.html?collection=${esc(c.slug)}">${esc(c.title)}</a>`).join("");
    if (top) {
      top.innerHTML = `
        <a class="skip" href="#main">Skip to content</a>
        ${s.announcement ? `<div class="announce">${esc(s.announcement)}</div>` : ""}
        <header class="site-header">
          <div class="container header-row">
            <div>
              <button class="icon-btn menu-toggle" aria-label="Open menu" data-open="menu">${I.menu}</button>
              <nav class="nav" aria-label="Main">
                <a href="/">Home</a>
                <div class="has-sub"><button aria-haspopup="true">Category</button>
                  <div class="sub"><a href="/shop.html?gender=men">Men</a><a href="/shop.html?gender=women">Women</a></div></div>
                <div class="has-sub"><a href="/collections.html">Collections</a>
                  <div class="sub">${colLinks}</div></div>
                <a href="/shop.html">All Products</a>
                <div class="has-sub"><button aria-haspopup="true">Help</button>
                  <div class="sub"><a href="/policy.html?p=shipping-policy">Shipping Policy</a><a href="/policy.html?p=refund-policy">Return &amp; Refund Policy</a><a href="/faq.html">FAQs</a><a href="/contact.html">Contact us</a></div></div>
              </nav>
            </div>
            <a class="logo" href="/">${esc(s.store_name || "Rivet.Co")}</a>
            <div class="header-actions">
              <button class="icon-btn" aria-label="Open cart" data-open="cart">${I.bag}<span class="cart-count" data-n="0">0</span></button>
            </div>
          </div>
        </header>
        <div class="drawer-backdrop" data-close></div>
        <aside class="drawer left" aria-label="Menu">
          <div class="drawer-head"><h2>Menu</h2><button class="icon-btn" aria-label="Close menu" data-close>${I.close}</button></div>
          <nav>
            <a href="/">Home</a>
            <a href="/shop.html">All Products</a>
            <div class="group-label">Category</div>
            <a class="indent" href="/shop.html?gender=men">Men</a>
            <a class="indent" href="/shop.html?gender=women">Women</a>
            <div class="group-label">Collections</div>
            ${collections.map((c) => `<a class="indent" href="/shop.html?collection=${esc(c.slug)}">${esc(c.title)}</a>`).join("")}
            <div class="group-label">Help</div>
            <a class="indent" href="/policy.html?p=shipping-policy">Shipping Policy</a>
            <a class="indent" href="/policy.html?p=refund-policy">Return &amp; Refund Policy</a>
            <a class="indent" href="/faq.html">FAQs</a>
            <a class="indent" href="/contact.html">Contact us</a>
          </nav>
        </aside>
        <aside class="drawer right" aria-label="Cart">
          <div class="drawer-head"><h2>Your cart</h2><button class="icon-btn" aria-label="Close cart" data-close>${I.close}</button></div>
          <div class="cart-lines" id="drawer-lines"></div>
          <div class="cart-foot" id="drawer-foot"></div>
        </aside>`;
    }
    if (bottom) {
      const year = new Date().getFullYear();
      bottom.innerHTML = `
        <footer class="site-footer">
          <div class="container">
            <div class="foot-grid">
              <div>
                <div class="brand">${esc(s.store_name)}</div>
                <p style="max-width:34ch;margin-top:10px">${esc(s.tagline || "")}</p>
                <div class="socials">
                  ${s.facebook ? `<a href="${esc(s.facebook)}" target="_blank" rel="noopener" aria-label="Facebook">${I.fb}</a>` : ""}
                  ${s.instagram ? `<a href="${esc(s.instagram)}" target="_blank" rel="noopener" aria-label="Instagram">${I.ig}</a>` : ""}
                  ${s.tiktok ? `<a href="${esc(s.tiktok)}" target="_blank" rel="noopener" aria-label="TikTok">${I.tt}</a>` : ""}
                  ${s.whatsapp ? `<a href="https://wa.me/${esc(s.whatsapp)}" target="_blank" rel="noopener" aria-label="WhatsApp">${I.wa}</a>` : ""}
                </div>
              </div>
              <div><h4>Shop</h4><ul>
                <li><a href="/shop.html?gender=men">Men</a></li>
                <li><a href="/shop.html?gender=women">Women</a></li>
                <li><a href="/collections.html">Collections</a></li>
                <li><a href="/shop.html">All Products</a></li></ul></div>
              <div><h4>Terms and Policies</h4><ul>
                <li><a href="/policy.html?p=privacy-policy">Privacy policy</a></li>
                <li><a href="/policy.html?p=refund-policy">Refund policy</a></li>
                <li><a href="/policy.html?p=terms-of-service">Terms of service</a></li>
                <li><a href="/policy.html?p=shipping-policy">Shipping policy</a></li></ul></div>
              <div><h4>Contact Us</h4><ul>
                ${s.email ? `<li><a href="mailto:${esc(s.email)}">${esc(s.email)}</a></li>` : ""}
                ${s.phone ? `<li><a href="tel:${esc(s.phone)}">${esc(s.phone)}</a></li>` : ""}
                <li><a href="/contact.html">Send us a message</a></li>
                <li><a href="/faq.html">FAQs</a></li></ul></div>
            </div>
            <div class="foot-bottom"><span>© ${year} ${esc(s.store_name)}</span><span>Visa · Mastercard · Meeza · Apple Pay</span></div>
          </div>
        </footer>`;
    }

    document.addEventListener("click", (e) => {
      const open = e.target.closest("[data-open]");
      if (open) { document.body.classList.add(open.dataset.open === "cart" ? "cart-open" : "menu-open"); return; }
      if (e.target.closest("[data-close]")) document.body.classList.remove("cart-open", "menu-open");
    });
    document.addEventListener("keydown", (e) => { if (e.key === "Escape") document.body.classList.remove("cart-open", "menu-open"); });
  }

  function qtyControl(id, size, qty) {
    return `<div class="qty" data-id="${esc(id)}" data-size="${esc(size)}">
      <button type="button" data-step="-1" aria-label="Decrease quantity">−</button>
      <input type="number" min="1" max="10" value="${qty}" aria-label="Quantity" readonly>
      <button type="button" data-step="1" aria-label="Increase quantity">+</button></div>`;
  }

  function lineHtml(l, editable = true) {
    const p = l.product;
    return `<div class="line">
      <a href="${productUrl(p)}">${img((p.images || [])[0], p.name)}</a>
      <div>
        <div class="t"><a href="${productUrl(p)}">${esc(p.name)}</a></div>
        <div class="m">${esc(p.color || "")}${p.color ? " · " : ""}Size ${esc(l.size)}${editable ? "" : ` · Qty ${l.qty}`}</div>
        ${!l.available ? '<div class="m" style="color:var(--sale)">No longer in stock — please remove</div>' : ""}
        ${editable ? qtyControl(p.id, l.size, l.qty) : ""}
      </div>
      <div class="r"><span>${money(l.total)}</span>${editable ? `<button class="remove" data-remove data-id="${esc(p.id)}" data-size="${esc(l.size)}">Remove</button>` : ""}</div>
    </div>`;
  }

  function bindQty(root) {
    root.addEventListener("click", (e) => {
      const step = e.target.closest("[data-step]");
      if (step) {
        const box = step.closest(".qty");
        if (!box.dataset.id) return;
        const cur = Cart.get().find((i) => i.id === box.dataset.id && i.size === box.dataset.size);
        if (cur) Cart.setQty(box.dataset.id, box.dataset.size, cur.qty + Number(step.dataset.step));
      }
      const rm = e.target.closest("[data-remove]");
      if (rm) Cart.setQty(rm.dataset.id, rm.dataset.size, 0);
    });
  }

  function freeShipBar(subtotal) {
    const free = SETTINGS.shipping && Number(SETTINGS.shipping.free_over);
    if (!free) return "";
    const pct = Math.min(100, (subtotal / free) * 100);
    const msg = subtotal >= free ? "You've unlocked free shipping." : `You're ${money(free - subtotal)} away from free shipping.`;
    return `<div class="note">${msg}</div><div class="progress"><span style="width:${pct}%"></span></div>`;
  }

  async function renderDrawer() {
    const products = (await load("products")).products || [];
    const lines = cartLines(products);
    const count = lines.reduce((n, l) => n + l.qty, 0);
    $$(".cart-count").forEach((el) => { el.textContent = count; el.dataset.n = count; });
    const box = $("#drawer-lines"), foot = $("#drawer-foot");
    if (!box) return;
    if (!lines.length) {
      box.innerHTML = `<div class="empty"><p>Your cart is empty.</p><a class="btn ghost" href="/shop.html">Continue shopping</a></div>`;
      foot.innerHTML = "";
      return;
    }
    const subtotal = lines.reduce((n, l) => n + l.total, 0);
    box.innerHTML = lines.map((l) => lineHtml(l)).join("");
    foot.innerHTML = `${freeShipBar(subtotal)}
      <div class="row total"><span>Subtotal</span><span>${money(subtotal)}</span></div>
      <p class="note" style="margin:-8px 0 14px">Shipping calculated at checkout.</p>
      <a class="btn block" href="/checkout.html">Checkout</a>
      <a class="btn ghost block" style="margin-top:8px" href="/cart.html">View cart</a>`;
  }

  // ---------- product card ----------
  function card(p) {
    const imgs = p.images || [];
    const tag = !inStock(p) ? '<span class="tag">Sold out</span>' : isOnSale(p) ? '<span class="tag sale">Sale</span>' : "";
    return `<a class="card" href="${productUrl(p)}">
      <div class="media">${tag}${img(imgs[0], `${p.name} ${p.color || ""}`)}${imgs[1] ? img(imgs[1], "", "alt") : ""}</div>
      <div class="info">
        <div class="name">${esc(p.name)}</div>
        ${p.color ? `<div class="color">${esc(p.color)}</div>` : ""}
        <div class="price">${isOnSale(p) ? `<span class="now on-sale">${money(p.price)}</span><s>${money(p.compare_at_price)}</s>` : `<span class="now">${money(p.price)}</span>`}</div>
      </div></a>`;
  }

  // ---------- pages ----------
  const pages = {};

  pages.home = async (main) => {
    const [home, data] = await Promise.all([load("home"), load("products")]);
    const products = data.products || [];
    const featured = products.filter((p) => p.featured).slice(0, 8);
    const list = featured.length ? featured : products.slice(0, 8);
    const h = home.hero || {};
    const slides = home.slides || [];
    const badgeIcons = [I.support, I.lock, I.returns, I.truck];
    document.title = `${SETTINGS.store_name} — ${h.heading || "Premium essentials"}`;
    main.innerHTML = `
      <section class="hero">
        ${h.image ? `<img src="${esc(h.image)}" alt="" fetchpriority="high">` : ""}
        <div class="hero-copy">
          <h1>${esc(h.heading)}</h1>
          <p>${esc(h.subheading)}</p>
          ${h.button_text ? `<a class="btn light" href="${esc(h.button_link || "/shop.html")}">${esc(h.button_text)}</a>` : ""}
        </div>
      </section>

      <section class="section">
        <div class="container">
          <div class="section-head"><h2>${esc(home.featured_heading || "New Arrivals")}</h2><a class="link-u" href="/shop.html">View all</a></div>
          <div class="grid">${list.map(card).join("")}</div>
        </div>
      </section>

      ${slides.length ? `<section class="slides" aria-roledescription="carousel">
        ${slides.map((s, i) => `<div class="slide ${i === 0 ? "active" : ""}">
          ${s.image ? `<img src="${esc(s.image)}" alt="" loading="lazy">` : ""}
          <div class="copy"><h2>${esc(s.title)}</h2>${s.button_text ? `<a class="btn light" href="${esc(s.link || "/shop.html")}">${esc(s.button_text)}</a>` : ""}</div>
        </div>`).join("")}
        ${slides.length > 1 ? `<div class="slide-dots">${slides.map((_, i) => `<button aria-label="Slide ${i + 1}" class="${i === 0 ? "on" : ""}" data-slide="${i}"></button>`).join("")}</div>` : ""}
      </section>` : ""}

      <section class="section">
        <div class="container">
          <div class="section-head"><h2>${esc(home.gender_heading || "Shop by gender")}</h2></div>
          <div class="tiles">
            <a class="tile" href="/shop.html?gender=men">${img(home.men_image, "Men")}<div class="label"><h3>Men</h3><span>Shop now</span></div></a>
            <a class="tile" href="/shop.html?gender=women">${img(home.women_image, "Women")}<div class="label"><h3>Women</h3><span>Shop now</span></div></a>
          </div>
        </div>
      </section>

      <section class="section tight"><div class="container"><div class="badges">
        ${(home.badges || []).map((b, i) => `<div class="badge">${badgeIcons[i % 4]}<h3>${esc(b.title)}</h3><p>${esc(b.text)}</p></div>`).join("")}
      </div></div></section>`;

    if (slides.length > 1) {
      let cur = 0;
      const show = (n) => {
        cur = (n + slides.length) % slides.length;
        $$(".slide").forEach((el, i) => el.classList.toggle("active", i === cur));
        $$(".slide-dots button").forEach((el, i) => el.classList.toggle("on", i === cur));
      };
      $(".slide-dots").addEventListener("click", (e) => { const b = e.target.closest("[data-slide]"); if (b) show(Number(b.dataset.slide)); });
      setInterval(() => show(cur + 1), 6000);
    }
  };

  pages.shop = async (main) => {
    const products = (await load("products")).products || [];
    const collections = SETTINGS.collections || [];
    let gender = params.get("gender") || "";
    let collection = params.get("collection") || "";
    let sort = params.get("sort") || "featured";
    const col = collections.find((c) => c.slug === collection);
    const title = col ? col.title : gender === "men" ? "Men" : gender === "women" ? "Women" : "All Products";
    document.title = `${title} — ${SETTINGS.store_name}`;

    main.innerHTML = `
      <div class="container">
        <div class="page-title"><div class="eyebrow">Shop</div><h1>${esc(title)}</h1>${col && col.description ? `<p>${esc(col.description)}</p>` : ""}</div>
        <div class="toolbar">
          <div class="chips" role="group" aria-label="Filter">
            <button class="chip" data-g="">All</button>
            <button class="chip" data-g="men">Men</button>
            <button class="chip" data-g="women">Women</button>
          </div>
          <label>Sort by <select class="select" id="sort">
            <option value="featured">Featured</option>
            <option value="price-asc">Price, low to high</option>
            <option value="price-desc">Price, high to low</option>
            <option value="name">Alphabetical</option>
          </select></label>
        </div>
        <div id="results"></div>
      </div>`;

    const draw = () => {
      let list = products.filter((p) =>
        (!gender || p.gender === gender || p.gender === "unisex") &&
        (!collection || (p.collections || []).includes(collection)));
      const stockFirst = (a, b) => Number(inStock(b)) - Number(inStock(a));
      if (sort === "price-asc") list.sort((a, b) => a.price - b.price);
      else if (sort === "price-desc") list.sort((a, b) => b.price - a.price);
      else if (sort === "name") list.sort((a, b) => a.name.localeCompare(b.name));
      else list.sort((a, b) => stockFirst(a, b) || Number(!!b.featured) - Number(!!a.featured));
      $$(".chip").forEach((c) => c.classList.toggle("on", c.dataset.g === gender));
      $("#sort").value = sort;
      $("#results").innerHTML = list.length
        ? `<p class="note" style="margin:-14px 0 18px">${list.length} product${list.length === 1 ? "" : "s"}</p><div class="grid">${list.map(card).join("")}</div>`
        : `<div class="empty"><p>No products here yet.</p><a class="btn ghost" href="/shop.html">View all products</a></div>`;
      const q = new URLSearchParams();
      if (gender) q.set("gender", gender);
      if (collection) q.set("collection", collection);
      if (sort !== "featured") q.set("sort", sort);
      history.replaceState(null, "", `/shop.html${q.toString() ? "?" + q : ""}`);
    };
    $(".chips").addEventListener("click", (e) => { const c = e.target.closest("[data-g]"); if (c) { gender = c.dataset.g; draw(); } });
    $("#sort").addEventListener("change", (e) => { sort = e.target.value; draw(); });
    draw();
  };

  pages.collections = async (main) => {
    const collections = SETTINGS.collections || [];
    document.title = `Collections — ${SETTINGS.store_name}`;
    main.innerHTML = `<div class="container">
      <div class="page-title"><div class="eyebrow">Browse</div><h1>Collections</h1></div>
      <div class="tiles three" style="padding-bottom:60px">
        ${collections.map((c) => `<a class="tile" href="/shop.html?collection=${esc(c.slug)}">${img(c.image, c.title)}<div class="label"><h3>${esc(c.title)}</h3><span>Explore</span></div></a>`).join("")}
      </div></div>`;
  };

  pages.product = async (main) => {
    const products = (await load("products")).products || [];
    const p = products.find((x) => x.id === params.get("id"));
    if (!p) {
      main.innerHTML = `<div class="container status"><h1>Product not found</h1><p>It may have sold out or moved.</p><div class="actions"><a class="btn" href="/shop.html">Shop all</a></div></div>`;
      return;
    }
    document.title = `${p.name}${p.color ? " — " + p.color : ""} — ${SETTINGS.store_name}`;
    const siblings = p.group ? products.filter((x) => x.group === p.group) : [p];
    const sizes = p.sizes || [];
    const firstAvailable = sizes.filter((s) => s.in_stock);
    let size = firstAvailable.length === 1 ? firstAvailable[0].size : "";
    let qty = 1;
    const imgs = p.images || [];
    const pct = isOnSale(p) ? Math.round((1 - p.price / p.compare_at_price) * 100) : 0;
    const sh = SETTINGS.shipping || {};

    main.innerHTML = `<div class="container"><div class="pdp">
      <div>
        <div class="gallery" id="gallery">${imgs.map((src, i) => `<img src="${esc(src)}" alt="${esc(p.name)} ${esc(p.color || "")} — image ${i + 1}" ${i ? 'loading="lazy"' : ""} onerror="this.style.visibility='hidden'">`).join("")}</div>
        ${imgs.length > 1 ? `<div class="gallery-count" id="gcount">1 / ${imgs.length}</div>` : ""}
      </div>
      <div class="buy">
        <div class="eyebrow">${esc(p.gender === "women" ? "Women" : p.gender === "men" ? "Men" : "Unisex")}</div>
        <h1>${esc(p.name)}</h1>
        ${p.color ? `<div class="color-line">${esc(p.color)}</div>` : ""}
        <div class="price">${isOnSale(p) ? `<span class="now on-sale">${money(p.price)}</span><s>${money(p.compare_at_price)}</s> <span class="save">Save ${pct}%</span>` : `<span class="now">${money(p.price)}</span>`}</div>
        <div class="note">Tax included. Shipping calculated at checkout.</div>

        ${siblings.length > 1 ? `<div class="opt-label"><span>Colour</span><span>${esc(p.color)}</span></div>
          <div class="swatches">${siblings.map((s) => `<a class="swatch ${s.id === p.id ? "on" : ""}" href="${productUrl(s)}">${esc(s.color || s.name)}</a>`).join("")}</div>` : ""}

        <div class="opt-label"><span>Size</span><span id="size-label">${size ? esc(size) : "Select a size"}</span></div>
        <div class="sizes" role="radiogroup" aria-label="Size">
          ${sizes.map((s) => `<button type="button" role="radio" class="size ${s.size === size ? "on" : ""}" data-size="${esc(s.size)}" ${s.in_stock ? "" : "disabled"} aria-checked="${s.size === size}">${esc(s.size)}</button>`).join("")}
        </div>

        <div class="opt-label"><span>Quantity</span></div>
        <div class="qty" id="pdp-qty"><button type="button" data-step="-1" aria-label="Decrease">−</button><input type="number" value="1" readonly aria-label="Quantity"><button type="button" data-step="1" aria-label="Increase">+</button></div>

        <div class="buy-actions">
          ${inStock(p) ? `<button class="btn block" id="add">Add to cart</button><button class="btn ghost block" id="buy-now">Buy it now</button>` : `<button class="btn block" disabled>Sold out</button>`}
        </div>
        <div class="form-msg" id="pdp-msg" aria-live="polite"></div>

        <ul class="perks">
          <li>Fast delivery — Cairo &amp; Giza ${esc((sh.zones && sh.zones[0] && sh.zones[0].eta) || "1–3 business days")}</li>
          <li>Inspect on delivery</li>
          <li>Easy returns and exchanges within 14 days</li>
          <li>Secure payment</li>
        </ul>

        <div class="accs">
          <details class="acc" open><summary>Description</summary><div class="acc-body"><p>${esc(p.description || "")}</p>
            ${(p.details || []).length ? `<ul>${p.details.map((d) => `<li>${esc(d)}</li>`).join("")}</ul>` : ""}</div></details>
          <details class="acc"><summary>Shipping</summary><div class="acc-body">
            <p>${(sh.zones || []).map((z) => `${esc(z.name)}: ${esc(z.eta)}`).join(". ")}${sh.default_eta ? `. Other governorates: ${esc(sh.default_eta)}` : ""}.</p>
            ${sh.free_over ? `<p>Free shipping on orders over ${money(sh.free_over)}.</p>` : ""}
            <a class="link-u" href="/policy.html?p=shipping-policy">Shipping policy</a></div></details>
          <details class="acc"><summary>Returns</summary><div class="acc-body"><p>Return unworn items with tags attached within 14 days of delivery. Sale items can't be returned.</p><a class="link-u" href="/policy.html?p=refund-policy">Return &amp; refund policy</a></div></details>
        </div>
      </div>
    </div></div>`;

    const msg = $("#pdp-msg");
    $(".sizes").addEventListener("click", (e) => {
      const b = e.target.closest(".size:not([disabled])");
      if (!b) return;
      size = b.dataset.size;
      $$(".size").forEach((x) => { x.classList.toggle("on", x === b); x.setAttribute("aria-checked", x === b); });
      $("#size-label").textContent = size;
      msg.textContent = ""; msg.className = "form-msg";
    });
    $("#pdp-qty").addEventListener("click", (e) => {
      const s = e.target.closest("[data-step]");
      if (!s) return;
      qty = Math.max(1, Math.min(10, qty + Number(s.dataset.step)));
      $("#pdp-qty input").value = qty;
    });
    const add = (then) => {
      if (!size) { msg.textContent = "Please choose a size."; msg.className = "form-msg err"; return; }
      Cart.add(p.id, size, qty);
      then();
    };
    const addBtn = $("#add");
    if (addBtn) addBtn.addEventListener("click", () => add(() => { document.body.classList.add("cart-open"); }));
    const buyBtn = $("#buy-now");
    if (buyBtn) buyBtn.addEventListener("click", () => add(() => { location.href = "/checkout.html"; }));

    const g = $("#gallery"), gc = $("#gcount");
    if (g && gc) g.addEventListener("scroll", () => { gc.textContent = `${Math.round(g.scrollLeft / g.clientWidth) + 1} / ${imgs.length}`; }, { passive: true });
  };

  pages.cart = async (main) => {
    document.title = `Your cart — ${SETTINGS.store_name}`;
    const draw = async () => {
      const products = (await load("products")).products || [];
      const lines = cartLines(products);
      if (!lines.length) {
        main.innerHTML = `<div class="container status"><h1>Your cart is empty</h1><div class="actions"><a class="btn" href="/shop.html">Continue shopping</a></div></div>`;
        return;
      }
      const subtotal = lines.reduce((n, l) => n + l.total, 0);
      const blocked = lines.some((l) => !l.available);
      main.innerHTML = `<div class="container">
        <div class="page-title"><h1>Your cart</h1></div>
        <div class="checkout" style="padding-top:0">
          <div id="cart-page-lines">${lines.map((l) => lineHtml(l)).join("")}</div>
          <div class="summary">
            <h2>Order summary</h2>
            ${freeShipBar(subtotal)}
            <div class="row"><span>Subtotal</span><span>${money(subtotal)}</span></div>
            <div class="row"><span>Shipping</span><span class="note">Calculated at checkout</span></div>
            <div class="row total"><span>Estimated total</span><span>${money(subtotal)}</span></div>
            ${blocked ? '<p class="form-msg err">Remove out-of-stock items to continue.</p>' : ""}
            <a class="btn block" href="/checkout.html" ${blocked ? 'aria-disabled="true" style="pointer-events:none;opacity:.45"' : ""}>Checkout</a>
            <a class="btn ghost block" style="margin-top:8px" href="/shop.html">Continue shopping</a>
          </div>
        </div></div>`;
    };
    document.addEventListener("cart:change", draw);
    await draw();
  };

  pages.checkout = async (main) => {
    document.title = `Checkout — ${SETTINGS.store_name}`;
    const products = (await load("products")).products || [];
    const lines = cartLines(products);
    if (!lines.length) {
      main.innerHTML = `<div class="container status"><h1>Your cart is empty</h1><div class="actions"><a class="btn" href="/shop.html">Continue shopping</a></div></div>`;
      return;
    }
    const subtotal = lines.reduce((n, l) => n + l.total, 0);
    const blocked = lines.some((l) => !l.available);

    main.innerHTML = `<div class="container">
      <div class="page-title"><div class="eyebrow">Secure checkout</div><h1>Checkout</h1></div>
      <div class="checkout">
        <form id="checkout-form" novalidate>
          <fieldset><legend>Contact</legend>
            <div class="field"><label for="email">Email</label><input id="email" name="email" type="email" autocomplete="email" required></div>
            <div class="field"><label for="phone">Mobile number</label><input id="phone" name="phone" type="tel" autocomplete="tel" placeholder="01xxxxxxxxx" required></div>
          </fieldset>
          <fieldset><legend>Delivery</legend>
            <div class="two">
              <div class="field"><label for="first_name">First name</label><input id="first_name" name="first_name" autocomplete="given-name" required></div>
              <div class="field"><label for="last_name">Last name</label><input id="last_name" name="last_name" autocomplete="family-name" required></div>
            </div>
            <div class="two">
              <div class="field"><label for="governorate">Governorate</label><select id="governorate" name="governorate" required>
                <option value="">Select…</option>${GOVERNORATES.map((g) => `<option>${g}</option>`).join("")}</select></div>
              <div class="field"><label for="city">City / Area</label><input id="city" name="city" autocomplete="address-level2" required></div>
            </div>
            <div class="field"><label for="address">Street address</label><input id="address" name="address" autocomplete="street-address" placeholder="Street, building number" required></div>
            <div class="two">
              <div class="field"><label for="floor">Floor</label><input id="floor" name="floor"></div>
              <div class="field"><label for="apartment">Apartment</label><input id="apartment" name="apartment"></div>
            </div>
            <div class="field"><label for="notes">Delivery notes (optional)</label><textarea id="notes" name="notes" rows="2" placeholder="Landmark, best time to call…"></textarea></div>
          </fieldset>
          <fieldset><legend>Payment</legend>
            <p class="note" style="margin-top:-6px">You'll be taken to our secure payment page (Paymob) to pay by card or Apple Pay. Your card details never touch this website.</p>
            <div class="pay-logos"><span>VISA</span><span>MASTERCARD</span><span>MEEZA</span><span>APPLE PAY</span></div>
          </fieldset>
          <button class="btn block" id="pay" type="submit" ${blocked ? "disabled" : ""}>Pay now</button>
          <div class="form-msg" id="co-msg" aria-live="polite">${blocked ? "Some items are out of stock. Go back to your cart to remove them." : ""}</div>
          <p class="note">By placing your order you agree to our <a class="link-u" href="/policy.html?p=terms-of-service">terms</a> and <a class="link-u" href="/policy.html?p=refund-policy">refund policy</a>.</p>
        </form>
        <aside class="summary" aria-label="Order summary">
          <h2>Order summary</h2>
          ${lines.map((l) => lineHtml(l, false)).join("")}
          <div style="margin-top:14px">
            <div class="row"><span>Subtotal</span><span>${money(subtotal)}</span></div>
            <div class="row"><span>Shipping</span><span id="ship">Select governorate</span></div>
            <div class="row total"><span>Total</span><span id="total">${money(subtotal)}</span></div>
          </div>
          <a class="link-u note" href="/cart.html">Edit cart</a>
        </aside>
      </div></div>`;

    const form = $("#checkout-form"), msg = $("#co-msg");
    const gov = $("#governorate");
    gov.addEventListener("change", () => {
      if (!gov.value) { $("#ship").textContent = "Select governorate"; $("#total").textContent = money(subtotal); return; }
      const fee = shippingFor(gov.value, subtotal);
      $("#ship").textContent = fee ? money(fee) : "Free";
      $("#total").textContent = money(subtotal + fee);
    });

    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      msg.className = "form-msg"; msg.textContent = "";
      const data = Object.fromEntries(new FormData(form).entries());
      const phone = (data.phone || "").replace(/[\s-]/g, "");
      const errors = [];
      ["first_name", "last_name", "governorate", "city", "address"].forEach((k) => { if (!String(data[k] || "").trim()) errors.push(k); });
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email || "")) errors.push("email");
      if (!/^(\+?20|0)?1[0125]\d{8}$/.test(phone)) errors.push("phone");
      $$(".field input, .field select", form).forEach((el) => el.setAttribute("aria-invalid", errors.includes(el.name)));
      if (errors.length) {
        msg.className = "form-msg err";
        msg.textContent = errors.length === 1 && errors[0] === "phone" ? "Please enter a valid Egyptian mobile number (e.g. 01012345678)." : errors.length === 1 && errors[0] === "email" ? "Please enter a valid email address." : "Please fill in the highlighted fields.";
        const first = form.querySelector(`[name="${errors[0]}"]`); if (first) first.focus();
        return;
      }
      const btn = $("#pay");
      btn.disabled = true; btn.textContent = "Redirecting to payment…";
      try {
        const res = await fetch("/api/create-payment", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ items: Cart.get(), customer: { ...data, phone } }),
        });
        const out = await res.json().catch(() => ({}));
        if (!res.ok || !out.checkout_url) throw new Error(out.error || "Payment could not be started. Please try again.");
        try { sessionStorage.setItem("rivet_pending_order", out.reference || ""); } catch (err) { /* ignore */ }
        location.href = out.checkout_url;
      } catch (err) {
        msg.className = "form-msg err";
        msg.textContent = err.message;
        btn.disabled = false; btn.textContent = "Pay now";
      }
    });
  };

  pages["thank-you"] = async (main) => {
    const success = params.get("success");
    const pending = params.get("pending");
    const ref = params.get("merchant_order_id") || (function () { try { return sessionStorage.getItem("rivet_pending_order"); } catch (e) { return ""; } })();
    if (success === "true") {
      Cart.clear();
      document.title = `Thank you — ${SETTINGS.store_name}`;
      main.innerHTML = `<div class="container status">
        <div class="eyebrow">Order confirmed</div><h1>Thank you for your order</h1>
        <p>Your payment went through. We'll send you a message with tracking details once your order ships.</p>
        ${ref ? `<p class="note">Order reference: <strong>${esc(ref)}</strong></p>` : ""}
        <div class="actions"><a class="btn" href="/shop.html">Continue shopping</a></div></div>`;
    } else if (pending === "true") {
      main.innerHTML = `<div class="container status"><h1>Payment pending</h1>
        <p>Your payment is still being processed. You'll get a confirmation once it completes. If you're unsure, contact us before paying again.</p>
        <div class="actions"><a class="btn" href="/contact.html">Contact us</a></div></div>`;
    } else {
      main.innerHTML = `<div class="container status"><h1>Payment not completed</h1>
        <p>Your payment didn't go through and you haven't been charged. Your cart is saved, so you can try again.</p>
        <div class="actions"><a class="btn" href="/checkout.html">Try again</a><a class="btn ghost" href="/cart.html">View cart</a></div></div>`;
    }
  };

  pages.faq = async (main) => {
    const faq = await load("faq");
    document.title = `FAQs — ${SETTINGS.store_name}`;
    main.innerHTML = `<div class="container">
      <div class="page-title"><div class="eyebrow">Help</div><h1>FAQs</h1></div>
      <div class="prose">${(faq.items || []).map((f, i) => `<details class="acc" ${i === 0 ? "open" : ""}><summary>${esc(f.question)}</summary><div class="acc-body"><p>${esc(f.answer)}</p></div></details>`).join("")}
      <p style="margin-top:30px">Still need help? <a class="link-u" href="/contact.html">Contact us</a>.</p></div></div>`;
  };

  // Tiny formatter for policy text: "## Heading", "- bullet", blank line = new paragraph.
  function formatText(text) {
    const blocks = String(text || "").split(/\n\s*\n/);
    return blocks.map((b) => {
      const lines = b.split("\n").filter((l) => l.trim());
      let out = "", list = [];
      const flush = () => { if (list.length) { out += `<ul>${list.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>`; list = []; } };
      const para = [];
      const flushP = () => { if (para.length) { out += `<p>${para.map(esc).join("<br>")}</p>`; para.length = 0; } };
      lines.forEach((l) => {
        if (/^##\s+/.test(l)) { flushP(); flush(); out += `<h2>${esc(l.replace(/^##\s+/, ""))}</h2>`; }
        else if (/^[-*]\s+/.test(l)) { flushP(); list.push(l.replace(/^[-*]\s+/, "")); }
        else { flush(); para.push(l); }
      });
      flushP(); flush();
      return out;
    }).join("");
  }

  pages.policy = async (main) => {
    const data = await load("policies");
    const pol = (data.policies || []).find((p) => p.slug === params.get("p")) || (data.policies || [])[0];
    if (!pol) { main.innerHTML = `<div class="container status"><h1>Page not found</h1></div>`; return; }
    document.title = `${pol.title} — ${SETTINGS.store_name}`;
    main.innerHTML = `<div class="container">
      <div class="page-title"><div class="eyebrow">Policies</div><h1>${esc(pol.title)}</h1></div>
      <div class="prose">${formatText(pol.body)}</div></div>`;
  };

  pages.contact = async () => {
    // The form is static HTML; fill in contact details and send messages to /api/contact.
    document.title = `Contact us — ${SETTINGS.store_name}`;
    const s = SETTINGS;
    const list = $("#contact-list");
    if (list) list.innerHTML = `
      ${s.email ? `<li><div class="k">Email</div><a class="link-u" href="mailto:${esc(s.email)}">${esc(s.email)}</a></li>` : ""}
      ${s.phone ? `<li><div class="k">Phone</div><a class="link-u" href="tel:${esc(s.phone)}">${esc(s.phone)}</a></li>` : ""}
      ${s.whatsapp ? `<li><div class="k">WhatsApp</div><a class="link-u" href="https://wa.me/${esc(s.whatsapp)}" target="_blank" rel="noopener">Chat with us</a></li>` : ""}
      <li><div class="k">Follow</div>${[["Facebook", s.facebook], ["Instagram", s.instagram], ["TikTok", s.tiktok]].filter((x) => x[1]).map((x) => `<a class="link-u" href="${esc(x[1])}" target="_blank" rel="noopener">${x[0]}</a>`).join(" · ")}</li>`;
    const form = $("#contact-form"), msg = $("#contact-msg");
    if (!form) return;
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      if (!form.checkValidity()) { msg.className = "form-msg err"; msg.textContent = "Please fill in your name, email and message."; return; }
      const btn = form.querySelector("button"); btn.disabled = true;
      try {
        const res = await fetch("/api/contact", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(Object.fromEntries(new FormData(form).entries())) });
        const out = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(out.error || "");
        form.reset(); msg.className = "form-msg ok"; msg.textContent = "Thanks — we'll get back to you soon.";
      } catch (err) {
        msg.className = "form-msg err"; msg.textContent = err.message || "Something went wrong. Please email us instead.";
      }
      btn.disabled = false;
    });
  };

  // ---------- boot ----------
  async function boot() {
    const main = $("#main");
    try {
      SETTINGS = await load("settings");
      renderChrome(SETTINGS, SETTINGS.collections || []);
      bindQty(document.body);
      document.addEventListener("cart:change", renderDrawer);
      window.addEventListener("storage", (e) => { if (e.key === CART_KEY) renderDrawer(); });
      const page = document.body.dataset.page;
      if (pages[page]) await pages[page](main);
      await renderDrawer();
    } catch (err) {
      console.error(err);
      if (main) main.innerHTML = `<div class="container status"><h1>Something went wrong</h1><p>Please refresh the page.</p></div>`;
    }
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot); else boot();

})();
