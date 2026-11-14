/* eslint-disable */
/* ShipToEcom vitrin betiği. ikas temasına şu satırla eklenir:
   <script async src="https://<uygulama>/sf/loader.js" data-key="<mağaza anahtarı>"></script>
   Panel önizlemesinde betik satır içi gömülür ve data-config ile yapılandırma doğrudan verilir (ağ isteği ve olay kaydı yapılmaz);
   data-editor varsa üst pencereden postMessage ile gelen ayarlarla anında yeniden çizilir. */
(function () {
  var sc = document.currentScript;
  if (!sc || window.__ste) return;
  window.__ste = true;
  var base = sc.src ? new URL(sc.src).origin : "", key = sc.getAttribute("data-key"), inline = sc.getAttribute("data-config"), editor = sc.hasAttribute("data-editor");
  var P = "ste_onizleme", pv = null;
  function ss(k, v) { try { if (v === undefined) return sessionStorage.getItem(k); if (v === null) sessionStorage.removeItem(k); else sessionStorage.setItem(k, v); } catch (e) {} return null; }
  pv = (function () { try { return new URLSearchParams(location.search).get(P); } catch (e) { return null; } })();
  if (pv) ss(P, pv); else pv = ss(P);

  var queue = [], live = false, timer;
  function flush() {
    if (!queue.length || !live) return (queue = []);
    var body = JSON.stringify({ e: queue.splice(0, 20) });
    var url = base + "/api/sf/" + key + "/event";
    if (!(navigator.sendBeacon && navigator.sendBeacon(url, body))) fetch(url, { method: "POST", body: body, keepalive: true, headers: { "Content-Type": "text/plain" } });
  }
  function track(m) {
    return function (t, v) {
      if (t === "view") { var k = "ste_v_" + m; if (ss(k)) return; ss(k, "1"); }
      queue.push({ m: m, t: t, v: v });
      clearTimeout(timer); timer = setTimeout(flush, 1500);
    };
  }
  addEventListener("pagehide", flush);

  function el(tag, css, text) { var e = document.createElement(tag); if (css) e.style.cssText = css; if (text != null) e.textContent = text; return e; }
  var safeUrl = function (u) { return typeof u === "string" && (/^https:\/\//i.test(u) || /^\/(?!\/)/.test(u)) ? u : ""; };
  var mq = window.matchMedia ? matchMedia("(max-width: 767px)") : { matches: false };
  var path = location.pathname.replace(/\/+$/, "") || "/";
  function refreshPath() { path = location.pathname.replace(/\/+$/, "") || "/"; }

  // Ortak hedefleme: tarih (Türkiye saati), sayfa ve cihaz. Alanı olmayan modül etkilenmez.
  function tr(v) { return v ? Date.parse(v + ":00+03:00") : NaN; }
  function pathMatch(line) {
    line = line.trim(); if (!line || line[0] !== "/") return false;
    if (line.slice(-1) === "*") return path.indexOf(line.slice(0, -1).replace(/\/$/, "")) === 0;
    return path === (line.replace(/\/+$/, "") || "/");
  }
  function allowed(s, ignoreDates) {
    var now = Date.now();
    if (!ignoreDates && (tr(s.startAt) > now || tr(s.endAt) <= now)) return false;
    if ((mq.matches && s.showMobile === false) || (!mq.matches && s.showDesktop === false)) return false;
    var lines = String(s.paths || "").split("\n");
    if (s.pageMode === "home") return path === "/";
    if (s.pageMode === "include") return lines.some(pathMatch);
    if (s.pageMode === "exclude") return !lines.some(pathMatch);
    return true;
  }

  var FONTS = { system: "system-ui,-apple-system,Segoe UI,Roboto,sans-serif", serif: "Georgia,Times New Roman,serif", mono: "ui-monospace,Menlo,Consolas,monospace" };
  function styleOnce() {
    if (document.getElementById("ste-css")) return;
    var st = el("style"); st.id = "ste-css";
    st.textContent = "@keyframes ste-mq{from{transform:translateX(0)}to{transform:translateX(-50%)}}@keyframes ste-fade{from{opacity:0}to{opacity:1}}@keyframes ste-down{from{transform:translateY(-100%)}to{transform:none}}@keyframes ste-up{from{transform:translateY(100%)}to{transform:none}}@media (prefers-reduced-motion:reduce){.ste-anim,.ste-anim *{animation:none!important}}";
    document.head.appendChild(st);
  }

  // ikas ürün sayfası: tema (Next.js) sayfa verisinde pageType "PRODUCT", ürün kimliği ve kategorileri bulunur.
  // İstemci tarafı gezinmede güncel veri next.router içindedir; yoksa ilk yüklemedeki __NEXT_DATA__ kullanılır.
  function product() {
    try {
      var r = window.next && window.next.router, pp = r && r.components && r.components[r.route] && r.components[r.route].props && r.components[r.route].props.pageProps;
      if (!pp || !pp.pageType) pp = window.__NEXT_DATA__ && window.__NEXT_DATA__.props && window.__NEXT_DATA__.props.pageProps;
      if (!pp || pp.pageType !== "PRODUCT" || !pp.pageSpecificData) return null;
      var d = pp.pageSpecificData, cats = [];
      (d.categories || []).forEach(function (c) { if (c && c.id) cats.push(c.id); (c && c.categoryPath || []).forEach(function (x) { if (typeof x === "string") cats.push(x); }); });
      return { id: String(d.id || ""), cats: cats };
    } catch (e) { return null; }
  }
  function copy(text, done) {
    function legacy() { var ta = el("textarea", "position:fixed;opacity:0"); ta.value = text; document.body.appendChild(ta); ta.select(); var ok = false; try { ok = document.execCommand("copy"); } catch (e) {} ta.remove(); done(ok); }
    if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(text).then(function () { done(true); }, legacy); else legacy();
  }
  var ICONS = { truck: "M3 7h11v8H3zM14 10h4l3 3v2h-7M7 18a1.5 1.5 0 100-3 1.5 1.5 0 000 3zM17 18a1.5 1.5 0 100-3 1.5 1.5 0 000 3z", "return": "M9 14L4 9l5-5M4 9h11a5 5 0 010 10h-3", card: "M3 6h18v12H3zM3 10h18M7 15h3", installment: "M4 5h16v14H4zM4 9h16M8 3v4M16 3v4M8 13h2M12 13h2M8 16h2", discount: "M9 9h.01M15 15h.01M16 8l-8 8M12 3l2.5 2H18v3.5L20 12l-2 3.5V19h-3.5L12 21l-2.5-2H6v-3.5L4 12l2-3.5V5h3.5L12 3z", info: "M12 3a9 9 0 100 18 9 9 0 000-18zM12 11v5M12 8h.01", gift: "M4 10h16v10H4zM3 7h18v3H3zM12 7v13M12 7c-2-4-6-3-5 0M12 7c2-4 6-3 5 0", clock: "M12 3a9 9 0 100 18 9 9 0 000-18zM12 7v5l3 2", fire: "M12 3c1 4 5 5 5 10a5 5 0 01-10 0c0-3 2-4 2-7 2 1 3 3 3 5", alert: "M12 3l9 16H3l9-16zM12 10v4M12 17h.01", box: "M4 7l8-4 8 4v10l-8 4-8-4V7zM4 7l8 4 8-4M12 11v10", bolt: "M13 3L4 14h7l-1 7 9-11h-7l1-7z" };
  // Ürün sayfasında konumlandırma (Bilgi Şeridi, Çok Al Az Öde): tema öğesinin hemen önüne/arkasına.
  // Öğe hidratasyondan sonra gelebilir ve tema yeniden çizince silinebilir; 10 sn boyunca beklenir, silinirse geri takılır.
  function placeNear(host, s, onShow) {
    var SEL = { "below-name": s.nameSelector || "h1.product-name", "below-price": s.priceSelector || ".product-detail-page-detail-price-box", "above-cart": s.cartSelector || "button.add-to-cart", "below-cart": s.cartSelector || "button.add-to-cart" };
    function anchor() {
      var list = []; try { list = [].slice.call(document.querySelectorAll(SEL[s.placement])); } catch (e) {}
      if (!list.length && /cart/.test(s.placement)) list = [].slice.call(document.querySelectorAll("button")).filter(function (b) { return /sepete\s*ekle/i.test(b.textContent); });
      var a = list.filter(function (x) { return x.offsetParent !== null && !x.closest("[class*=slider],[class*=overlay],[class*=card]"); })[0] || list[0];
      if (!a) return null;
      // Sepet butonu yatay bir satırdaysa (adet seçici ile yan yana) satırın dışına yerleşilir.
      if (/cart/.test(s.placement)) for (var n = 0; n < 2 && a.parentElement; n++) { var cs = getComputedStyle(a.parentElement); if (/flex/.test(cs.display) && !/column/.test(cs.flexDirection)) a = a.parentElement; else break; }
      return a;
    }
    function insert() { var a = anchor(); if (!a) return false; s.placement === "above-cart" ? a.parentNode.insertBefore(host, a) : a.parentNode.insertBefore(host, a.nextSibling); return true; }
    var seen = insert(), tries = 0;
    if (seen) onShow();
    var mo = new MutationObserver(function () { if (!host.isConnected && tries++ < 20 && insert() && !seen) { seen = true; onShow(); } });
    mo.observe(document.body, { childList: true, subtree: true });
    var stop = setTimeout(function () { if (!host.isConnected) { mo.disconnect(); console.warn("[ShipToEcom] konum öğesi bulunamadı", SEL[s.placement]); } }, 10000);
    return function () { mo.disconnect(); clearTimeout(stop); host.remove(); };
  }
  function fill(tpl, v) { return String(tpl).replace(/\{(\w+)\}/g, function (m, k) { return v[k] != null ? v[k] : m; }); }
  function shadowHost(name) { var h = el("div", "display:block;margin:10px 0;width:100%"); h.setAttribute("data-ste", name); return [h, h.attachShadow ? h.attachShadow({ mode: "open" }) : h]; }
  // ikas ürün verisi (varyant ve stoklarla). Seçili varyant adresteki parametrelerden çözülür (ör. ?beden=m);
  // ikas, varyant seçince sayfa verisini değil yalnızca adresi günceller (dev-btest temasında doğrulandı).
  function productData() {
    try {
      var r = window.next && window.next.router, pp = r && r.components && r.components[r.route] && r.components[r.route].props && r.components[r.route].props.pageProps;
      if (!pp || !pp.pageType) pp = window.__NEXT_DATA__ && window.__NEXT_DATA__.props && window.__NEXT_DATA__.props.pageProps;
      return pp && pp.pageType === "PRODUCT" && pp.pageSpecificData ? pp.pageSpecificData : null;
    } catch (e) { return null; }
  }
  function slug(x) { return String(x || "").toLocaleLowerCase("tr").replace(/ı/g, "i").replace(/ğ/g, "g").replace(/ü/g, "u").replace(/ş/g, "s").replace(/ö/g, "o").replace(/ç/g, "c").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""); }
  function selectedVariant(d) {
    var vs = (d.variants || []).filter(function (v) { return v && v.isActive !== false && !v.deleted; });
    if (vs.length <= 1) return vs[0] || null;
    var q = []; try { new URLSearchParams(location.search).forEach(function (v) { q.push(slug(v)); }); } catch (e) {}
    var byUrl = vs.filter(function (v) { var vv = v.variantValues || []; return vv.length && vv.every(function (x) { return q.indexOf(slug(x.name)) >= 0; }); })[0];
    if (byUrl) return byUrl;
    var sel = (d.selectedVariantValues || []).map(function (x) { return x.id; });
    return vs.filter(function (v) { return (v.variantValues || []).every(function (x) { return sel.indexOf(x.id) >= 0; }); })[0] || vs[0];
  }
  // Sayfa içine blok yerleştirme (Flash Ürünler): üst menünün altı, footer'ın üstü ya da verilen seçicinin altı.
  function placeBlock(host, s) {
    function anchor() {
      if (s.position === "selector" && s.anchorSelector) { try { var x = document.querySelector(s.anchorSelector); if (x) return [x, "after"]; } catch (e) {} }
      if (s.position === "beforeFooter") { var f = document.querySelector("footer"); if (f) return [f, "before"]; }
      var h = document.querySelector("header"); if (h) return [h, "after"];
      var m = document.querySelector("main"); return m ? [m, "prepend"] : [document.body, "prepend"];
    }
    function insert() { var a = anchor(), n = a[0]; if (a[1] === "after") n.parentNode.insertBefore(host, n.nextSibling); else if (a[1] === "before") n.parentNode.insertBefore(host, n); else n.insertBefore(host, n.firstChild); }
    insert();
    var tries = 0, mo = new MutationObserver(function () { if (!host.isConnected && tries++ < 20) insert(); });
    mo.observe(document.body, { childList: true, subtree: true });
    return function () { mo.disconnect(); host.remove(); };
  }
  function money(n, sym) { try { return new Intl.NumberFormat("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n) + " " + (sym || "₺"); } catch (e) { return n + " ₺"; } }
  // Modül çiziciler: (ayarlar, olay fonksiyonu, ortam) → eklenen kök öğe ve temizleme. Metinler yalnızca textContent ile yazılır.
  var R = {
    "kampanya-bari": function (s, t, env) {
      var closedKey = "ste_kapali_kampanya-bari_" + env.version;
      if (!env.editor && ss(closedKey)) return null;
      styleOnce();
      var mob = mq.matches, h = mob ? s.mobileHeight : s.height, fs = mob ? s.mobileFontSize : s.fontSize;
      var text = (mob && s.mobileText) || s.text, href = safeUrl(s.link), showBtn = s.buttonText && href && (!mob || s.mobileButton);
      var pos = s.position, fixed = pos !== "static";
      var bar = el("div", "box-sizing:border-box;width:100%;min-height:" + h + "px;display:flex;align-items:center;gap:12px;padding:6px " + (s.closable ? 40 : 16) + "px 6px 16px;overflow:hidden;line-height:1.3;" +
        "justify-content:" + ({ left: "flex-start", right: "flex-end" }[s.align] || "center") + ";background:" + s.bg + ";color:" + s.color + ";font-size:" + fs + "px;font-weight:" + (s.fontWeight ? 600 : 400) + ";" +
        (FONTS[s.fontFamily] ? "font-family:" + FONTS[s.fontFamily] + ";" : "") +
        (fixed ? "position:fixed;left:0;right:0;" + (pos === "fixed-bottom" ? "bottom:0" : "top:0") + ";z-index:2147483000;" : "position:relative;z-index:2147483000;") +
        (s.animation === "fade" ? "animation:ste-fade .4s ease-out;" : s.animation === "slide" ? "animation:" + (pos === "fixed-bottom" ? "ste-up" : "ste-down") + " .35s ease-out;" : ""));
      bar.className = "ste-anim"; bar.setAttribute("role", "region"); bar.setAttribute("aria-label", "Kampanya");
      function go(e) { if (env.editor) return e.preventDefault(); t("click"); if (href[0] === "/" || new URL(href).host === location.host) ss("ste_gecis_kampanya-bari", JSON.stringify({ p: new URL(href, location.href).pathname.replace(/\/+$/, "") || "/", at: Date.now() })); }
      var msg;
      if (s.marquee) {
        msg = el("div", "flex:1;min-width:0;overflow:hidden;white-space:nowrap");
        var track_ = el("div", "display:inline-flex;animation:ste-mq " + s.marqueeSpeed + "s linear infinite");
        for (var i = 0; i < 2; i++) track_.appendChild(el("span", "padding-right:4em", text));
        msg.appendChild(track_);
      } else msg = el("span", "min-width:0", text);
      if (href && !showBtn) {
        var a = el("a", "color:inherit;text-decoration:none;display:contents"); a.href = href; if (s.newTab) { a.target = "_blank"; a.rel = "noopener"; }
        a.addEventListener("click", go); a.appendChild(msg); bar.appendChild(a);
      } else bar.appendChild(msg);
      if (showBtn) {
        var b = el("a", "flex-shrink:0;padding:6px 14px;border-radius:6px;text-decoration:none;font-size:" + Math.max(fs - 1, 11) + "px;font-weight:600;white-space:nowrap;background:" + s.buttonBg + ";color:" + s.buttonColor, s.buttonText);
        b.href = href; if (s.newTab) { b.target = "_blank"; b.rel = "noopener"; }
        b.addEventListener("click", go); bar.appendChild(b);
      }
      var spacer = null;
      if (s.closable) {
        var x = el("button", "position:absolute;right:8px;top:50%;transform:translateY(-50%);width:28px;height:28px;background:none;border:0;color:inherit;font-size:20px;line-height:1;cursor:pointer", "×");
        x.type = "button"; x.setAttribute("aria-label", "Kampanyayı kapat");
        x.addEventListener("click", function () { cleanup(); if (!env.editor) ss(closedKey, "1"); });
        bar.appendChild(x);
      }
      // Sabit barlarda tema içeriği barın altında kalmasın diye gövdeye bar yüksekliği kadar boşluk eklenir.
      if (fixed) spacer = el("div", "height:" + h + "px");
      function insert() {
        var b = document.body;
        if (pos === "fixed-bottom") { if (spacer) b.appendChild(spacer); b.appendChild(bar); }
        else { b.insertBefore(bar, b.firstChild); if (spacer) b.insertBefore(spacer, b.firstChild); }
      }
      insert();
      // Next.js tabanlı temalar (ikas) gövdeyi yeniden çizerken barı silebilir: kapatılmadıysa en fazla 5 kez geri takılır.
      var tries = 0, mo = new MutationObserver(function () { if (!bar.isConnected && tries++ < 5) insert(); });
      mo.observe(document.body, { childList: true });
      function cleanup() { mo.disconnect(); bar.remove(); if (spacer) spacer.remove(); }
      t("view");
      return cleanup;
    },
    "bilgi-seridi": function (s, t, env) {
      var prod = env.editor ? { id: "", cats: [] } : product();
      if (!prod) return null; // yalnızca ürün sayfasında
      var now = Date.now();
      var msgs = (s.messages || []).filter(function (m) {
        if (!m.text) return false;
        if (env.editor) return true;
        if (tr(m.startAt) > now || tr(m.endAt) <= now) return false;
        if (m.target === "products") return String(m.productIds).split(",").indexOf(prod.id) >= 0;
        if (m.target === "categories") { var ids = String(m.categoryIds).split(","); return prod.cats.some(function (c) { return ids.indexOf(c) >= 0; }); }
        return true;
      });
      if (!msgs.length) return null;

      var host = el("div", "display:block;margin:10px 0;width:100%"), root = host.attachShadow ? host.attachShadow({ mode: "open" }) : host;
      host.setAttribute("data-ste", "bilgi-seridi");
      var c = s.brandColor, th = s.theme;
      var css = ":host{all:initial;display:block;font-family:" + (s.storeFont ? "inherit" : "system-ui,-apple-system,Segoe UI,Roboto,sans-serif") + ";font-size:" + s.fontSize + "px;line-height:1.4;color:#1f2937}" +
        ".w{display:flex;gap:8px;" + (s.layout === "inline" ? "flex-wrap:wrap" : "flex-direction:column") + "}" +
        ".m{display:flex;align-items:center;gap:8px;padding:" + (th === "minimal" ? "2px 0" : "8px 12px") + ";border-radius:8px;box-sizing:border-box;" +
        (th === "solid" ? "background:" + c + ";color:#fff" : th === "outline" ? "border:1px solid " + c : th === "soft" ? "background:" + c + "14" : "") + "}" +
        (s.layout === "inline" ? ".m{flex:1 1 auto}" : "") +
        ".i{flex-shrink:0;width:18px;height:18px;color:" + (th === "solid" ? "#fff" : c) + "}.x{flex:1;min-width:0;overflow-wrap:anywhere}" +
        ".k{flex-shrink:0;display:inline-flex;align-items:center;gap:6px;padding:3px 8px;border:1px dashed currentColor;border-radius:6px;background:none;color:inherit;font:inherit;font-weight:700;cursor:pointer;letter-spacing:.03em}" +
        ".l{flex-shrink:0;color:inherit;font-weight:600}.r .m{display:none}.r .m.on{display:flex;animation:f .4s}" +
        "@keyframes f{from{opacity:0}to{opacity:1}}@media (max-width:767px){:host{font-size:" + Math.max(s.fontSize - 1, 11) + "px}.k{padding:2px 6px}}@media (prefers-reduced-motion:reduce){.r .m.on{animation:none}}";
      var st = document.createElement("style"); st.textContent = css; root.appendChild(st);
      var wrap = el("div"); wrap.className = "w" + (s.layout === "rotate" ? " r" : ""); root.appendChild(wrap);
      msgs.forEach(function (m) {
        var row = el("div"); row.className = "m";
        if (ICONS[m.icon]) { var sv = document.createElementNS("http://www.w3.org/2000/svg", "svg"); sv.setAttribute("viewBox", "0 0 24 24"); sv.setAttribute("class", "i"); sv.setAttribute("fill", "none"); sv.setAttribute("stroke", "currentColor"); sv.setAttribute("stroke-width", "1.8"); sv.setAttribute("stroke-linecap", "round"); sv.setAttribute("stroke-linejoin", "round"); sv.setAttribute("aria-hidden", "true"); var pa = document.createElementNS("http://www.w3.org/2000/svg", "path"); pa.setAttribute("d", ICONS[m.icon]); sv.appendChild(pa); row.appendChild(sv); }
        var tx = el("span", null, m.text); tx.className = "x"; row.appendChild(tx);
        if (m.code) {
          var k = el("button", null, m.code); k.className = "k"; k.type = "button"; k.setAttribute("aria-label", "İndirim kodunu kopyala: " + m.code);
          k.addEventListener("click", function () { copy(m.code, function (ok) { k.textContent = ok ? "Kopyalandı" : m.code; setTimeout(function () { k.textContent = m.code; }, 1500); }); t("use"); });
          row.appendChild(k);
        }
        var href = safeUrl(m.link);
        if (href) { var a = el("a", null, m.linkText || "Detaylar"); a.className = "l"; a.href = href; a.addEventListener("click", function (e) { if (env.editor) return e.preventDefault(); t("click"); }); row.appendChild(a); }
        wrap.appendChild(row);
      });
      var rows = wrap.children, idx = 0, timer = null;
      if (s.layout === "rotate") { rows[0].classList.add("on"); if (rows.length > 1) timer = setInterval(function () { rows[idx].classList.remove("on"); idx = (idx + 1) % rows.length; rows[idx].classList.add("on"); }, s.rotateSeconds * 1000); }

      var unmount = placeNear(host, s, function () { t("view"); });
      return function () { unmount(); if (timer) clearInterval(timer); };
    },
    "cok-al-az-ode": function (s, t, env) {
      var now = Date.now(), all = (s.campaigns || []).filter(function (c) { return env.editor || (c.active !== false && !(tr(c.startAt) > now) && !(tr(c.endAt) <= now)); });
      function tiers(c) { var r = []; for (var n = 1; n <= 4; n++) { var q = +c["t" + n + "q"], a = +c["t" + n + "a"]; if (q >= 2 && a > 0) r.push({ q: q, a: a }); } return r.sort(function (x, y) { return x.q - y.q; }); }
      function label(c, a) { return c.discountType === "RATIO" ? "%" + a : a + " TL"; }
      function fits(c, pid, cats) {
        if (c.scope === "products") return String(c.productIds).split(",").indexOf(pid) >= 0;
        if (c.scope === "categories") { var ids = String(c.categoryIds).split(","); return (cats || []).some(function (x) { return ids.indexOf(x) >= 0; }); }
        return true;
      }
      var font = s.storeFont ? "inherit" : "system-ui,-apple-system,Segoe UI,Roboto,sans-serif";
      var base = ":host{all:initial;display:block;font-family:" + font + ";font-size:" + s.fontSize + "px;line-height:1.4;color:" + s.color + "}";
      var cleanups = [];

      // 1) Ürün sayfası: bu ürüne uyan kampanyaların kademeleri.
      var prod = env.editor ? { id: "", cats: [] } : product();
      var here = prod ? all.filter(function (c) { return tiers(c).length && (env.editor || fits(c, prod.id, prod.cats)); }) : [];
      if (here.length) {
        var hs = shadowHost("cok-al-az-ode"), host = hs[0], root = hs[1];
        var st = document.createElement("style");
        st.textContent = base + ".b{background:" + s.bg + ";border:1px solid " + s.accent + "33;border-radius:10px;padding:10px 12px}.h{font-weight:700;margin-bottom:8px;color:" + s.accent + "}" +
          ".g{display:flex;flex-wrap:wrap;gap:8px}.c{flex:1 1 90px;text-align:center;padding:8px 6px;border-radius:8px;background:#fff;border:1px solid " + s.accent + "55}.c b{display:block;font-size:1.25em;color:" + s.accent + "}" +
          ".l{margin:0;padding-left:18px}.l li{margin:2px 0}.n{margin-top:6px;font-size:.85em;opacity:.8}";
        root.appendChild(st);
        here.forEach(function (c) {
          var box = el("div"); box.className = "b"; box.style.marginTop = root.childNodes.length > 1 ? "8px" : "0";
          box.appendChild(el("div", null, s.title || c.name)).className = "h";
          var tl = tiers(c);
          if (s.style === "list") { var ul = el("ul"); ul.className = "l"; tl.forEach(function (x) { ul.appendChild(el("li", null, fill(s.tierText, { adet: x.q, indirim: label(c, x.a) }))); }); box.appendChild(ul); }
          else { var g = el("div"); g.className = "g"; tl.forEach(function (x) { var cd = el("div"); cd.className = "c"; cd.appendChild(el("b", null, label(c, x.a))); cd.appendChild(el("span", null, fill(s.tierText, { adet: x.q, indirim: label(c, x.a) }))); g.appendChild(cd); }); box.appendChild(g); }
          if (c.scope !== "all") { var n = el("div", null, c.scope === "categories" ? "Kampanyalı kategorilerdeki ürünler birlikte sayılır." : "Kampanyalı ürünler birlikte sayılır."); n.className = "n"; box.appendChild(n); }
          root.appendChild(box);
        });
        cleanups.push(placeNear(host, s, function () { t("view"); }));
      }

      // 2) Sepet: ikas IkasEvents ile gönderilen sepet nesnesinden uygun ürün adedi sayılır, ulaşılan ve sonraki kademe gösterilir.
      if (s.showCart && all.length) {
        var toast = null, hideT;
        function show(cart) {
          var items = (cart && (cart.items || cart.orderLineItems)) || [], best = null;
          all.forEach(function (c) {
            var tl = tiers(c); if (!tl.length) return;
            if (c.scope === "categories") return; // sepet satırında kategori bilgisi yok: tahmin yürütülmez
            var qty = items.reduce(function (sum, it) { var pid = (it.variant && it.variant.productId) || it.productId; return sum + (fits(c, String(pid || ""), []) ? (+it.quantity || 0) : 0); }, 0);
            if (!qty) return;
            var reached = null, next = null; tl.forEach(function (x) { if (qty >= x.q) reached = x; else if (!next) next = x; });
            if (!best || (reached && (!best.reached || reached.a > best.reached.a))) best = { c: c, qty: qty, reached: reached, next: next };
          });
          if (toast) toast.remove(); clearTimeout(hideT);
          if (!best) return;
          var hs2 = shadowHost("cok-al-az-ode-sepet"); toast = hs2[0]; var r2 = hs2[1];
          toast.style.cssText = "position:fixed;left:50%;bottom:16px;transform:translateX(-50%);z-index:2147483000;width:min(92vw,420px);margin:0";
          var st2 = document.createElement("style");
          st2.textContent = base + ".t{display:flex;gap:10px;align-items:flex-start;background:" + s.bg + ";border:1px solid " + s.accent + ";border-radius:12px;padding:12px 14px;box-shadow:0 8px 24px rgba(0,0,0,.15)}.t div{flex:1}.r{font-weight:700;color:" + s.accent + "}.x{background:none;border:0;font-size:18px;line-height:1;cursor:pointer;color:inherit}";
          r2.appendChild(st2);
          var box2 = el("div"); box2.className = "t"; var txt = el("div");
          if (best.reached) { var p1 = el("div", null, fill(s.cartReached, { adet: best.qty, indirim: label(best.c, best.reached.a) })); p1.className = "r"; txt.appendChild(p1); }
          if (best.next) txt.appendChild(el("div", null, fill(s.cartNext, { adet: best.qty, kalan: best.next.q - best.qty, indirim: label(best.c, best.next.a) })));
          box2.appendChild(txt);
          var x = el("button", null, "×"); x.className = "x"; x.type = "button"; x.setAttribute("aria-label", "Kapat"); x.addEventListener("click", function () { toast.remove(); }); box2.appendChild(x);
          r2.appendChild(box2); document.body.appendChild(toast);
          if (!env.editor) hideT = setTimeout(function () { if (toast) toast.remove(); }, 8000);
        }
        if (env.editor) {
          // Önizleme: ilk kampanyanın ilk kademesine 1 eksik örnek sepet.
          var c0 = all.filter(function (c) { return tiers(c).length && c.scope !== "categories"; })[0];
          if (c0) { var q0 = tiers(c0)[0].q; show({ items: [{ productId: String(c0.productIds).split(",")[0], quantity: Math.max(q0 - 1, 1) }] }); }
        } else if (window.IkasEvents && IkasEvents.subscribe) {
          // Aynı kimlikle yeniden abone olmak eski aboneliğin yerine geçer (ikas kodunda doğrulandı); yeniden çizimde eskisi susturulur.
          var alive = true;
          IkasEvents.subscribe({ id: "shiptoecom-cok-al-az-ode", callback: function (e) { if (alive && e && /^(ADD_TO_CART|REMOVE_FROM_CART|VIEW_CART)$/.test(e.type)) show(e.data && e.data.cart); } });
          cleanups.push(function () { alive = false; });
        }
        cleanups.push(function () { if (toast) toast.remove(); clearTimeout(hideT); });
      }
      return function () { cleanups.forEach(function (f) { f(); }); };
    },
    "tukenmek-uzere": function (s, t, env) {
      var d = env.editor ? { id: "", categories: [], variants: [{ id: "ornek", stock: Math.max(1, Math.min(3, s.threshold)), sellIfOutOfStock: false }] } : productData();
      if (!d) return null;
      if (!env.editor) {
        if (s.scope === "products" && String(s.productIds).split(",").indexOf(String(d.id)) < 0) return null;
        if (s.scope === "categories") { var ids = String(s.categoryIds).split(","), cats = []; (d.categories || []).forEach(function (c) { if (c && c.id) cats.push(c.id); (c && c.categoryPath || []).forEach(function (x) { cats.push(x); }); }); if (!cats.some(function (x) { return ids.indexOf(x) >= 0; })) return null; }
      }
      var loadedAt = Date.now(), fresh = null, shown = false, lastKey = "";
      var hs = shadowHost("tukenmek-uzere"), host = hs[0], root = hs[1];
      var st = document.createElement("style"), th = s.theme;
      st.textContent = ":host{all:initial;display:block;font-family:" + (s.storeFont ? "inherit" : "system-ui,-apple-system,Segoe UI,Roboto,sans-serif") + ";font-size:" + s.fontSize + "px;line-height:1.4;color:" + (th === "solid" ? "#fff" : s.color) + "}" +
        ".w{padding:" + (th === "minimal" ? "2px 0" : "10px 12px") + ";border-radius:8px;text-align:" + s.align + ";" + (th === "solid" ? "background:" + s.accent : th === "outline" ? "border:1px solid " + s.accent : th === "soft" ? "background:" + s.bg : "") + "}" +
        ".m{display:flex;align-items:center;gap:8px;font-weight:600;justify-content:" + ({ left: "flex-start", right: "flex-end" }[s.align] || "center") + "}.i{width:18px;height:18px;flex-shrink:0;color:" + (th === "solid" ? "#fff" : s.accent) + "}" +
        ".b{margin-top:8px;height:6px;border-radius:3px;background:" + (th === "solid" ? "rgba(255,255,255,.35)" : s.accent + "22") + ";overflow:hidden}.b span{display:block;height:100%;background:" + (th === "solid" ? "#fff" : s.accent) + ";transition:width .4s}" +
        ".d{margin-top:8px;display:flex;gap:4px;flex-wrap:wrap;justify-content:inherit}.d span{width:10px;height:10px;border-radius:50%;background:" + (th === "solid" ? "rgba(255,255,255,.35)" : s.accent + "33") + "}.d span.on{background:" + (th === "solid" ? "#fff" : s.accent) + "}" +
        "@media (max-width:767px){:host{font-size:" + s.mobileFontSize + "px}}";
      root.appendChild(st);
      var box = el("div"); box.className = "w"; box.setAttribute("role", "status"); box.setAttribute("aria-live", "polite"); root.appendChild(box);

      function stockOf(v) {
        if (fresh && fresh.stocks && fresh.stocks[v.id] != null) return +fresh.stocks[v.id];
        if (typeof v.stock === "number") return v.stock;
        return (v.stocks || []).reduce(function (a, x) { return a + (+x.stockCount || 0); }, 0);
      }
      // Gösterim kuralı: 0 < stok <= eşik. Stok 0 ise uyarı gösterilmez (ürün tükenmiştir; tema bunu kendisi belirtir).
      function render() {
        var v = selectedVariant(d); if (!v) return hide();
        var n = stockOf(v);
        if (!(n > 0 && n <= s.threshold)) return hide();
        var k = v.id + ":" + n; if (k === lastKey && host.isConnected) return; lastKey = k;
        box.textContent = "";
        var m = el("div"); m.className = "m";
        if (ICONS[s.icon]) { var sv = document.createElementNS("http://www.w3.org/2000/svg", "svg"); sv.setAttribute("viewBox", "0 0 24 24"); sv.setAttribute("class", "i"); sv.setAttribute("fill", "none"); sv.setAttribute("stroke", "currentColor"); sv.setAttribute("stroke-width", "1.8"); sv.setAttribute("stroke-linecap", "round"); sv.setAttribute("stroke-linejoin", "round"); sv.setAttribute("aria-hidden", "true"); var pa = document.createElementNS("http://www.w3.org/2000/svg", "path"); pa.setAttribute("d", ICONS[s.icon]); sv.appendChild(pa); m.appendChild(sv); }
        m.appendChild(el("span", null, s.showCount ? fill(s.textCount, { stok: n }) : s.text));
        box.appendChild(m);
        if (s.indicator === "bar") { var b = el("div"); b.className = "b"; var f = el("span"); f.style.width = Math.max(4, Math.min(100, (n / s.barMax) * 100)) + "%"; b.appendChild(f); box.appendChild(b); }
        if (s.indicator === "dots") { var ds = el("div"); ds.className = "d"; for (var i = 0; i < Math.min(s.threshold, 20); i++) { var dot = el("span"); if (i < n) dot.className = "on"; ds.appendChild(dot); } box.appendChild(ds); }
        if (!unmount) unmount = placeNear(host, s, function () { shown = true; t("view"); });
      }
      var unmount = null;
      function hide() { lastKey = ""; if (unmount) { unmount(); unmount = null; } }
      render();
      if (env.editor) return function () { hide(); };

      // Varyant seçimi adresi değiştirir: adres izlenir. Sayfa açıkken stok değiştiyse panelin ikas'tan aldığı daha yeni stok uygulanır.
      var lastSearch = location.search, poll = setInterval(function () { if (location.search !== lastSearch) { lastSearch = location.search; render(); } }, 400);
      function refresh() {
        if (document.hidden || !key || !d.id) return;
        fetch(base + "/api/sf/" + key + "/stock?p=" + encodeURIComponent(d.id), { credentials: "omit", cache: "no-store" }).then(function (r) { return r.ok ? r.json() : null; })
          .then(function (j) { if (j && j.syncedAt > loadedAt) { fresh = j; lastKey = ""; render(); } }).catch(function () {});
      }
      var refreshT = setInterval(refresh, 60000);
      function onVis() { if (!document.hidden) refresh(); }
      document.addEventListener("visibilitychange", onVis);
      // Tıklanma: uyarı görünürken Sepete Ekle'ye basılması.
      function onClick(e) {
        if (!host.isConnected) return;
        var b = e.target && e.target.closest && e.target.closest(s.cartSelector || "button.add-to-cart");
        if (!b) { var bt = e.target && e.target.closest && e.target.closest("button"); if (bt && /sepete\s*ekle/i.test(bt.textContent)) b = bt; }
        if (b) t("click");
      }
      document.addEventListener("click", onClick, true);
      return function () { clearInterval(poll); clearInterval(refreshT); document.removeEventListener("click", onClick, true); document.removeEventListener("visibilitychange", onVis); hide(); };
    },
    "hediye-carki": function (s, t, env) {
      var ps = s.prizes || []; if (ps.length < 2) return null;
      var ls = function (k, v) { try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch (e) {} return null; };
      var PAL = { pastel: ["#fda4af", "#fcd34d", "#86efac", "#93c5fd", "#c4b5fd", "#f9a8d4"], koyu: ["#1f2937", "#374151", "#111827", "#4b5563"] };
      var colorOf = function (p, i) { return PAL[s.preset] ? PAL[s.preset][i % PAL[s.preset].length] : p.color; };
      var textOf = function (p) { return s.preset === "koyu" ? "#f9fafb" : s.preset === "pastel" ? "#1f2937" : p.textColor; };
      var cid = ls("ste_cid"); if (!cid || !/^[a-f0-9]{32}$/.test(cid)) { var a = new Uint8Array(16); (window.crypto || {}).getRandomValues ? crypto.getRandomValues(a) : a.forEach(function (_, i) { a[i] = Math.random() * 256; }); cid = [].map.call(a, function (b) { return ("0" + b.toString(16)).slice(-2); }).join(""); ls("ste_cid", cid); }
      var mob = mq.matches, size = mob ? 260 : ({ sm: 220, md: 280, lg: 340 }[s.size] || 280);
      var hs = shadowHost("hediye-carki"), host = hs[0], root = hs[1]; host.style.cssText = "display:block;margin:0";
      var font = s.storeFont ? "inherit" : "system-ui,-apple-system,Segoe UI,Roboto,sans-serif";
      var pos = mob ? (s.mobileMode === "center" ? "center" : "sheet") : s.position;
      var st = document.createElement("style");
      st.textContent = ":host{all:initial;font-family:" + font + ";color:" + s.color + "}" +
        ".o{position:fixed;inset:0;z-index:2147483002;display:flex;" + (pos === "center" ? "align-items:center;justify-content:center;background:rgba(0,0,0,.45)" : pos === "sheet" ? "align-items:flex-end;background:rgba(0,0,0,.45)" : "align-items:flex-end;justify-content:" + (pos === "left" ? "flex-start" : "flex-end") + ";pointer-events:none;padding:16px") + "}" +
        ".c{pointer-events:auto;position:relative;box-sizing:border-box;background:" + s.bg + ";color:" + s.color + ";border-radius:" + (pos === "sheet" ? "16px 16px 0 0;width:100%" : "16px;width:min(94vw," + (size + 80) + "px)") + ";max-height:94vh;overflow:auto;padding:20px;text-align:center;box-shadow:0 20px 50px rgba(0,0,0,.3)}" +
        "h2{margin:0 0 4px;font-size:20px}p{margin:0 0 12px;font-size:14px;opacity:.85}.x{position:absolute;right:10px;top:8px;border:0;background:none;font-size:22px;cursor:pointer;color:inherit}" +
        ".wh{position:relative;width:" + size + "px;height:" + size + "px;margin:8px auto 14px}.wh svg.r{width:100%;height:100%;transition:transform 4.5s cubic-bezier(.17,.67,.12,1)}.pt{position:absolute;left:50%;top:-6px;transform:translateX(-50%);width:0;height:0;border-left:12px solid transparent;border-right:12px solid transparent;border-top:22px solid " + s.pointerColor + ";filter:drop-shadow(0 2px 2px rgba(0,0,0,.3))}" +
        "input[type=email],input[type=tel],input[type=text]{box-sizing:border-box;width:100%;padding:10px 12px;border:1px solid #d1d5db;border-radius:8px;font:inherit;font-size:15px;margin-bottom:8px;color:#111827;background:#fff}" +
        "label.k{display:flex;gap:8px;text-align:left;font-size:12px;align-items:flex-start;margin-bottom:10px}label.k a{color:inherit}" +
        ".b{width:100%;padding:12px;border:0;border-radius:8px;font:inherit;font-weight:700;font-size:15px;cursor:pointer;background:" + s.buttonBg + ";color:" + s.buttonColor + "}.b:disabled{opacity:.6;cursor:default}" +
        ".e{color:#dc2626;font-size:13px;min-height:18px;margin:4px 0}.code{display:flex;gap:8px;justify-content:center;align-items:center;margin:10px 0}.code b{font-size:20px;letter-spacing:.08em;padding:8px 12px;border:2px dashed " + s.pointerColor + ";border-radius:8px}" +
        ".lau{position:fixed;" + (s.position === "left" ? "left" : "right") + ":16px;bottom:16px;z-index:2147483001;width:56px;height:56px;border-radius:50%;border:0;cursor:pointer;background:" + s.buttonBg + ";color:" + s.buttonColor + ";font-size:26px;box-shadow:0 6px 16px rgba(0,0,0,.25)}" +
        "@media (prefers-reduced-motion:reduce){.wh svg.r{transition-duration:.8s}}";
      root.appendChild(st);

      // Çark: dilimler görsel olarak eşittir; kazanma olasılığı sunucudadır ve buradan okunamaz.
      var NS = "http://www.w3.org/2000/svg", n = ps.length, seg = 360 / n, R = 100;
      function svgEl(tag, at) { var e = document.createElementNS(NS, tag); for (var k in at) e.setAttribute(k, at[k]); return e; }
      function wheel() {
        var svg = svgEl("svg", { viewBox: "-104 -104 208 208", class: "r", role: "img", "aria-label": "Hediye çarkı" });
        ps.forEach(function (p, i) {
          var a0 = (i * seg - 90) * Math.PI / 180, a1 = ((i + 1) * seg - 90) * Math.PI / 180;
          svg.appendChild(svgEl("path", { d: "M0 0L" + (R * Math.cos(a0)).toFixed(2) + " " + (R * Math.sin(a0)).toFixed(2) + "A" + R + " " + R + " 0 " + (seg > 180 ? 1 : 0) + " 1 " + (R * Math.cos(a1)).toFixed(2) + " " + (R * Math.sin(a1)).toFixed(2) + "Z", fill: colorOf(p, i), stroke: "#fff", "stroke-width": "1" }));
          var g = svgEl("g", { transform: "rotate(" + (i * seg + seg / 2) + ")" });
          var tx = svgEl("text", { x: "0", y: "-62", "text-anchor": "middle", fill: textOf(p), "font-size": n > 8 ? "8" : "10", "font-weight": "700", transform: "rotate(0)" }); tx.textContent = String(p.label).slice(0, 18); g.appendChild(tx);
          if (ICONS[p.icon]) { var ic = svgEl("path", { d: ICONS[p.icon], transform: "translate(-6 -88) scale(.5)", fill: "none", stroke: textOf(p), "stroke-width": "2.4", "stroke-linecap": "round", "stroke-linejoin": "round" }); g.appendChild(ic); }
          svg.appendChild(g);
        });
        svg.appendChild(svgEl("circle", { r: R, fill: "none", stroke: s.borderColor, "stroke-width": "5" }));
        svg.appendChild(svgEl("circle", { r: "16", fill: s.centerColor, stroke: "#fff", "stroke-width": "3" }));
        return svg;
      }

      var overlay = null, launcher = null, opened = false;
      function close() { if (overlay) overlay.remove(); overlay = null; if (!env.editor) ls("ste_cark_kapali", String(Date.now())); showLauncher(); }
      function result(card, r) {
        card.textContent = ""; var x = el("button", null, "×"); x.className = "x"; x.type = "button"; x.setAttribute("aria-label", "Kapat"); x.addEventListener("click", close); card.appendChild(x);
        if (r.type === "NONE") { card.appendChild(el("h2", null, s.noWinText)); return; }
        card.appendChild(el("h2", null, fill(s.winTitle, { odul: r.label })));
        if (r.code) {
          card.appendChild(el("p", null, s.codeLabel));
          var row = el("div"); row.className = "code"; row.appendChild(el("b", null, r.code));
          var cp = el("button", null, "Kopyala"); cp.className = "b"; cp.type = "button"; cp.style.width = "auto"; cp.style.padding = "8px 12px";
          cp.addEventListener("click", function () { copy(r.code, function (ok) { cp.textContent = ok ? "Kopyalandı" : "Kopyala"; }); });
          row.appendChild(cp); card.appendChild(row);
        } else if (r.type === "FREE_SHIPPING") card.appendChild(el("p", null, "Ödülünüz sepette uygulanır."));
        if (env.editor) card.appendChild(el("p", null, "Önizleme: sonuç örnektir, kupon üretilmez."));
      }
      function open() {
        if (overlay) return; opened = true; if (launcher) { launcher.remove(); launcher = null; }
        overlay = el("div"); overlay.className = "o"; overlay.setAttribute("role", "dialog"); overlay.setAttribute("aria-modal", pos === "center" || pos === "sheet" ? "true" : "false"); overlay.setAttribute("aria-label", s.title);
        if (pos === "center" || pos === "sheet") overlay.addEventListener("click", function (e) { if (e.target === overlay) close(); });
        var card = el("div"); card.className = "c"; overlay.appendChild(card); root.appendChild(overlay);
        var past = !env.editor && ls("ste_cark_sonuc");
        if (past) { try { return result(card, JSON.parse(past)); } catch (e) {} }
        var x = el("button", null, "×"); x.className = "x"; x.type = "button"; x.setAttribute("aria-label", "Kapat"); x.addEventListener("click", close); card.appendChild(x);
        card.appendChild(el("h2", null, s.title)); if (s.subtitle) card.appendChild(el("p", null, s.subtitle));
        var wh = el("div"); wh.className = "wh"; var svg = wheel(); wh.appendChild(svg); var pt = el("div"); pt.className = "pt"; wh.appendChild(pt); card.appendChild(wh);
        var form = el("form"); form.noValidate = true; var inp = null, chk = null;
        if (s.contactMode !== "none") {
          inp = el("input"); inp.type = s.contactMode === "phone" ? "tel" : s.contactMode === "email" ? "email" : "text"; inp.required = true; inp.autocomplete = s.contactMode === "phone" ? "tel" : "email";
          inp.placeholder = s.contactMode === "phone" ? "Cep telefonu (5xx xxx xx xx)" : s.contactMode === "email" ? "E-posta adresiniz" : "E-posta ya da cep telefonu"; inp.setAttribute("aria-label", inp.placeholder); form.appendChild(inp);
          var lb = el("label"); lb.className = "k"; chk = el("input"); chk.type = "checkbox"; lb.appendChild(chk); var sp = el("span", null, s.consentText + " ");
          var pu = safeUrl(s.privacyUrl); if (pu) { var la = el("a", null, "Aydınlatma metni"); la.href = pu; la.target = "_blank"; la.rel = "noopener"; sp.appendChild(la); }
          lb.appendChild(sp); form.appendChild(lb);
        }
        var err = el("div"); err.className = "e"; err.setAttribute("role", "alert"); form.appendChild(err);
        var btn = el("button", null, s.buttonText); btn.className = "b"; btn.type = "submit"; form.appendChild(btn); card.appendChild(form);
        form.addEventListener("submit", function (e) {
          e.preventDefault(); err.textContent = "";
          if (inp && !inp.value.trim()) return (err.textContent = "Bilgi alanını doldurun.");
          if (chk && !chk.checked) return (err.textContent = "Devam etmek için onay kutusunu işaretleyin.");
          btn.disabled = true;
          var go = function (r) {
            var turn = 360 * 6 + (360 - (r.index * seg + seg / 2));
            svg.style.transform = "rotate(" + turn + "deg)";
            setTimeout(function () { if (!env.editor) ls("ste_cark_sonuc", JSON.stringify({ type: r.type, label: r.label, code: r.code })); result(card, r); }, matchMedia("(prefers-reduced-motion: reduce)").matches ? 900 : 4700);
          };
          if (env.editor) { var i = Math.floor(Math.random() * n); return go({ index: i, label: ps[i].label, type: ps[i].type, code: ps[i].type === "NONE" ? null : ps[i].type === "FREE_SHIPPING" ? null : "ORNEK-KOD" }); }
          fetch(base + "/api/sf/" + key + "/wheel", { method: "POST", credentials: "omit", headers: { "Content-Type": "text/plain" }, body: JSON.stringify({ contact: inp ? inp.value : "", consent: chk ? chk.checked : false, cookieId: cid }) })
            .then(function (r) { return r.json().then(function (j) { return { ok: r.ok, j: j }; }); })
            .then(function (x) { if (x.ok) go(x.j); else { err.textContent = x.j.error || "Bir sorun oluştu."; btn.disabled = false; if (x.j.repeat) btn.disabled = true; } })
            .catch(function () { err.textContent = "Bağlantı hatası, tekrar deneyin."; btn.disabled = false; });
        });
        t("view");
      }
      function showLauncher() {
        if (!s.launcher || launcher || overlay) return;
        launcher = el("button", null, "🎁"); launcher.className = "lau"; launcher.type = "button"; launcher.setAttribute("aria-label", s.title); launcher.addEventListener("click", open); root.appendChild(launcher);
      }
      document.body.appendChild(host);
      if (env.editor) { open(); return function () { host.remove(); }; }
      var closedAt = +ls("ste_cark_kapali") || 0, quiet = Date.now() - closedAt < s.reshowDays * 86400000, done = !!ls("ste_cark_sonuc");
      showLauncher();
      var timer = null, onOut = null;
      if (!quiet && !done && s.trigger !== "launcher") {
        if (s.trigger === "delay" || s.trigger === "both" || (s.trigger === "exit" && mob)) timer = setTimeout(open, s.delaySeconds * 1000); // mobilde çıkış niyeti algılanamaz: süreyle açılır
        if ((s.trigger === "exit" || s.trigger === "both") && !mob) { onOut = function (e) { if (!e.relatedTarget && e.clientY <= 0 && !opened) open(); }; document.addEventListener("mouseout", onOut); }
      }
      return function () { clearTimeout(timer); if (onOut) document.removeEventListener("mouseout", onOut); host.remove(); };
    },
    "flash-urunler": function (s, t, env) {
      var hs = shadowHost("flash-urunler"), host = hs[0], root = hs[1], timers = [], unmount = null, cancelled = false;
      host.style.cssText = "display:block;margin:0;width:100%";
      var P = { koyu: { bg: "#111827", card: "#1f2937", color: "#f9fafb" }, canli: { bg: s.accent, card: "#ffffff", color: "#111827" } }[s.preset] || { bg: s.bg, card: s.cardBg, color: s.color };
      var st = document.createElement("style");
      st.textContent = ":host{all:initial;display:block;font-family:" + (s.storeFont ? "inherit" : "system-ui,-apple-system,Segoe UI,Roboto,sans-serif") + ";font-size:" + s.fontSize + "px;color:" + P.color + "}" +
        ".s{background:" + P.bg + ";padding:20px 16px;margin:12px 0}.in{max-width:1280px;margin:0 auto}.hd{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:10px;margin-bottom:14px}" +
        "h2{margin:0;font-size:1.5em;color:" + (s.preset === "canli" ? "#fff" : P.color) + "}.d{margin:2px 0 0;opacity:.8;color:" + (s.preset === "canli" ? "#fff" : P.color) + "}" +
        ".cd{display:flex;gap:6px}.cd span{min-width:42px;text-align:center;background:" + (s.preset === "canli" ? "#fff" : s.accent) + ";color:" + (s.preset === "canli" ? s.accent : "#fff") + ";border-radius:8px;padding:6px 4px;font-weight:700;line-height:1.1}.cd small{display:block;font-size:.65em;font-weight:500;opacity:.9}" +
        ".g{display:grid;grid-template-columns:repeat(" + s.columns + ",minmax(0,1fr));gap:" + s.gap + "px}@media (max-width:767px){.g{grid-template-columns:repeat(" + s.mobileColumns + ",minmax(0,1fr))}h2{font-size:1.25em}}" +
        "a.c{display:block;text-decoration:none;color:" + P.color + ";background:" + P.card + ";border-radius:" + s.radius + "px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,.08);transition:transform .15s}a.c:hover{transform:translateY(-2px)}" +
        ".im{position:relative;aspect-ratio:1/1;background:#f3f4f6}.im img{width:100%;height:100%;object-fit:cover;display:block}.b{position:absolute;left:8px;top:8px;background:" + s.accent + ";color:#fff;font-weight:700;font-size:.8em;padding:3px 8px;border-radius:999px}" +
        ".oos{position:absolute;inset:auto 0 0 0;background:rgba(0,0,0,.6);color:#fff;text-align:center;font-size:.8em;padding:4px}" +
        ".tx{padding:10px}.n{margin:0 0 6px;font-size:.95em;line-height:1.3;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;min-height:2.6em}.p{display:flex;flex-wrap:wrap;gap:6px;align-items:baseline}.o{text-decoration:line-through;opacity:.55;font-size:.85em}.np{font-weight:700;color:" + s.accent + ";font-size:1.05em}";
      root.appendChild(st);

      function draw(list) {
        if (cancelled || !list || !list.length) return;
        var wrap = el("div");
        list.forEach(function (c) {
          var sec = el("section"); sec.className = "s"; sec.setAttribute("aria-label", c.title);
          var inn = el("div"); inn.className = "in"; sec.appendChild(inn);
          var hd = el("div"); hd.className = "hd"; var ttl = el("div"); ttl.appendChild(el("h2", null, c.title)); if (c.description) { var d = el("p", null, c.description); d.className = "d"; ttl.appendChild(d); } hd.appendChild(ttl);
          if (s.showCountdown && c.endAt) {
            var cd = el("div"); cd.className = "cd"; cd.setAttribute("role", "timer"); cd.setAttribute("aria-label", "Kampanyanın bitmesine kalan süre");
            var parts = ["gün", "saat", "dk", "sn"].map(function (lbl) { var sp = el("span"); var v = el("b", null, "0"); sp.appendChild(v); sp.appendChild(el("small", null, lbl)); cd.appendChild(sp); return v; });
            var tick = function () { var ms = Math.max(0, c.endAt - Date.now()), sec2 = Math.floor(ms / 1000); [Math.floor(sec2 / 86400), Math.floor(sec2 / 3600) % 24, Math.floor(sec2 / 60) % 60, sec2 % 60].forEach(function (n, i) { parts[i].textContent = ("0" + n).slice(-2); }); if (!ms && !env.editor) sec.remove(); };
            tick(); timers.push(setInterval(tick, 1000)); hd.appendChild(cd);
          }
          inn.appendChild(hd);
          var g = el("div"); g.className = "g";
          c.items.forEach(function (it) {
            var a = el("a"); a.className = "c"; a.href = "/" + encodeURI(it.slug);
            a.addEventListener("click", function (e) { if (env.editor) return e.preventDefault(); t("click"); });
            var im = el("div"); im.className = "im";
            if (it.image) { var img = el("img"); img.src = it.image; img.alt = it.name; img.loading = "lazy"; im.appendChild(img); }
            var b = el("span", null, "-%" + it.rate); b.className = "b"; im.appendChild(b);
            if (!it.inStock) { var o = el("span", null, "Tükendi"); o.className = "oos"; im.appendChild(o); }
            a.appendChild(im);
            var tx = el("div"); tx.className = "tx"; var n = el("p", null, it.name); n.className = "n"; tx.appendChild(n);
            var pr = el("div"); pr.className = "p"; var op = el("span", null, money(it.oldPrice)); op.className = "o"; var np = el("span", null, money(it.newPrice)); np.className = "np"; pr.appendChild(op); pr.appendChild(np); tx.appendChild(pr);
            a.appendChild(tx); g.appendChild(a);
          });
          inn.appendChild(g); wrap.appendChild(sec);
        });
        root.appendChild(wrap);
        unmount = placeBlock(host, s);
        t("view");
      }
      if (env.editor) draw(env.data && env.data.campaigns);
      else fetch(base + "/api/sf/" + key + "/flash", { credentials: "omit" }).then(function (r) { return r.ok ? r.json() : null; }).then(function (j) { if (j) draw(j.campaigns); }).catch(function () {});
      return function () { cancelled = true; timers.forEach(clearInterval); if (unmount) unmount(); else host.remove(); };
    },
    "fiyat-alti-indirim": function (s, t, env) {
      var d = env.editor ? { id: "", categories: [], variants: [{ id: "ornek", isActive: true, prices: [{ sellPrice: 900, discountPrice: null, currencySymbol: "₺" }] }] } : productData();
      if (!d) return null;
      var now = Date.now(), camps = (s.campaigns || []).filter(function (c) { return env.editor || (c.active !== false && !(tr(c.startAt) > now) && !(tr(c.endAt) <= now)); });
      if (!camps.length) return null;
      function match(c, v) {
        if (env.editor) return true;
        var has = function (list, x) { return String(list || "").split(",").indexOf(String(x)) >= 0; };
        if (c.scope === "products") return has(c.productIds, d.id);
        if (c.scope === "categories") return has(c.catProducts, d.id);
        if (c.scope === "variants") return has(c.variantIds, v.id);
        return true;
      }
      function priceOf(v) { var p = (v.prices && v.prices[0]) || v.price || {}; return { sell: +p.sellPrice || 0, disc: p.discountPrice != null && +p.discountPrice < +p.sellPrice ? +p.discountPrice : null, sym: p.currencySymbol || "₺" }; }
      // ikas'ın uygulayacağı fiyat (sunucudaki campaignPrice ile aynı formül). Yuvarlama ikas'ta farklı olabilir.
      function calc(c, p) { var base = c.applicablePrice === "DISCOUNT_PRICE" ? (p.disc != null ? p.disc : p.sell) : p.sell, a = +c.amount || 0, v = c.discountType === "FIXED_AMOUNT" ? base - a : base * (1 - a / 100); return Math.max(0, Math.round(v * 100) / 100); }
      var hs = shadowHost("fiyat-alti-indirim"), host = hs[0], root = hs[1], th = s.preset, unmount = null, lastKey = "", cdT = null;
      var st = document.createElement("style");
      st.textContent = ":host{all:initial;display:block;font-family:" + (s.storeFont ? "inherit" : "system-ui,-apple-system,Segoe UI,Roboto,sans-serif") + ";font-size:" + s.fontSize + "px;line-height:1.4;color:" + (th === "solid" ? "#fff" : s.color) + "}" +
        ".w{cursor:pointer;padding:" + (th === "minimal" ? "2px 0" : "10px 12px") + ";border-radius:10px;" + (th === "solid" ? "background:" + s.accent : th === "outline" ? "border:1px solid " + s.accent : th === "soft" ? "background:" + s.bg : "") + "}" +
        ".r{display:flex;flex-wrap:wrap;align-items:center;gap:8px}.i{width:18px;height:18px;flex-shrink:0;color:" + (th === "solid" ? "#fff" : s.accent) + "}.m{font-weight:700}" +
        ".bd{padding:2px 8px;font-weight:700;font-size:.85em;background:" + (th === "solid" ? "#fff" : s.accent) + ";color:" + (th === "solid" ? s.accent : "#fff") + ";border-radius:" + ({ pill: "999px", square: "0", rounded: "6px" }[s.badgeShape] || "999px") + "}" +
        ".p{margin-top:6px;display:flex;flex-wrap:wrap;gap:8px;align-items:baseline}.o{text-decoration:line-through;opacity:.6}.n{font-weight:800;font-size:1.15em}.sv{font-size:.9em}.ds{margin-top:6px;font-size:.9em;opacity:.85}.cd{margin-top:6px;font-size:.85em;font-weight:600}";
      root.appendChild(st);
      var box = el("div"); box.className = "w"; box.setAttribute("role", "note"); root.appendChild(box);
      box.addEventListener("click", function () { if (!env.editor) t("click"); });
      function hide() { lastKey = ""; clearInterval(cdT); if (unmount) { unmount(); unmount = null; } }
      function render() {
        var v = selectedVariant(d); if (!v) return hide();
        var p = priceOf(v); if (!p.sell) return hide();
        var old = p.disc != null ? p.disc : p.sell;
        // Listede üstteki ve müşterinin gördüğü fiyatı gerçekten düşüren ilk kampanya; hiçbiri düşürmüyorsa gösterilmez.
        var c = camps.filter(function (x) { return match(x, v) && calc(x, p) < old; })[0]; if (!c) return hide();
        var np = calc(c, p);
        var k = v.id + ":" + old + ":" + c.name; if (k === lastKey && host.isConnected) return; lastKey = k;
        var rate = Math.round((1 - np / old) * 100), save = Math.round((old - np) * 100) / 100;
        var vals = { oran: "%" + rate, tutar: money(+c.amount, p.sym), yeni: money(np, p.sym), kazanc: money(save, p.sym) };
        box.textContent = ""; clearInterval(cdT);
        var r = el("div"); r.className = "r";
        if (ICONS[s.icon]) { var sv = document.createElementNS("http://www.w3.org/2000/svg", "svg"); sv.setAttribute("viewBox", "0 0 24 24"); sv.setAttribute("class", "i"); sv.setAttribute("fill", "none"); sv.setAttribute("stroke", "currentColor"); sv.setAttribute("stroke-width", "1.8"); sv.setAttribute("stroke-linecap", "round"); sv.setAttribute("stroke-linejoin", "round"); sv.setAttribute("aria-hidden", "true"); var pa = document.createElementNS("http://www.w3.org/2000/svg", "path"); pa.setAttribute("d", ICONS[s.icon]); sv.appendChild(pa); r.appendChild(sv); }
        if (s.badgeText) { var bd = el("span", null, fill(s.badgeText, vals)); bd.className = "bd"; r.appendChild(bd); }
        var m = el("span", null, fill(c.message, vals)); m.className = "m"; r.appendChild(m); box.appendChild(r);
        if (s.showPrices) { var pr = el("div"); pr.className = "p"; var o = el("span", null, money(old, p.sym)); o.className = "o"; var n = el("span", null, money(np, p.sym)); n.className = "n"; pr.appendChild(o); pr.appendChild(n); if (s.showSaving) { var sg = el("span", null, money(save, p.sym) + " kazanç"); sg.className = "sv"; pr.appendChild(sg); } box.appendChild(pr); }
        else if (s.showSaving) { var sg2 = el("div", null, money(save, p.sym) + " kazanç"); sg2.className = "sv"; box.appendChild(sg2); }
        if (c.description) { var ds = el("div", null, c.description); ds.className = "ds"; box.appendChild(ds); }
        var end = tr(c.endAt);
        if (s.showCountdown && end > Date.now()) {
          var cd = el("div"); cd.className = "cd"; box.appendChild(cd);
          var tick = function () { var ms = Math.max(0, end - Date.now()), x = Math.floor(ms / 1000); cd.textContent = "Bitmesine " + (x >= 86400 ? Math.floor(x / 86400) + " gün " : "") + ("0" + Math.floor(x / 3600) % 24).slice(-2) + ":" + ("0" + Math.floor(x / 60) % 60).slice(-2) + ":" + ("0" + x % 60).slice(-2); if (!ms) render(); };
          tick(); cdT = setInterval(tick, 1000);
        }
        if (!unmount) unmount = placeNear(host, s, function () { t("view"); });
      }
      render();
      if (env.editor) return function () { hide(); };
      var lastSearch = location.search, poll = setInterval(function () { if (location.search !== lastSearch) { lastSearch = location.search; render(); } }, 400);
      function onClick(e) { if (!host.isConnected) return; var b = e.target && e.target.closest && e.target.closest(s.cartSelector || "button.add-to-cart"); if (!b) { var bt = e.target && e.target.closest && e.target.closest("button"); if (bt && /sepete\s*ekle/i.test(bt.textContent)) b = bt; } if (b) t("use"); }
      document.addEventListener("click", onClick, true);
      return function () { clearInterval(poll); document.removeEventListener("click", onClick, true); hide(); };
    },
    "urun-etiketleri": function (s, t, env) {
      var labels = s.labels || [], max = Math.max(1, +s.maxPerProduct || 1), mob = mq.matches;
      var SZ = { sm: "2px 6px", md: "4px 9px", lg: "6px 12px" }[s.size] || "4px 9px";
      var css = ":host{all:initial;position:absolute;inset:0;pointer-events:none;z-index:5;font-family:" + (s.storeFont ? "inherit" : "system-ui,-apple-system,Segoe UI,Roboto,sans-serif") + ";font-size:" + (mob ? s.mobileFontSize : s.fontSize) + "px;line-height:1.2}" +
        ".c{position:absolute;display:flex;flex-direction:column;gap:4px;padding:8px}.top-left{top:0;left:0;align-items:flex-start}.top-right{top:0;right:0;align-items:flex-end}.bottom-left{bottom:0;left:0;align-items:flex-start}.bottom-right{bottom:0;right:0;align-items:flex-end}" +
        ".b{display:inline-flex;align-items:center;gap:4px;font-weight:700;padding:" + SZ + ";box-shadow:0 1px 2px rgba(0,0,0,.15);white-space:nowrap}.b svg{width:1.1em;height:1.1em}.b.circle{border-radius:50%;aspect-ratio:1/1;justify-content:center;padding:6px}.b img{display:block;max-height:3em;max-width:7em}.b.img{padding:0;background:none!important;box-shadow:none}";
      var R0 = { pill: "999px", rounded: "6px", square: "0", circle: "50%" };
      function badges(list) {
        var h = el("div"); h.setAttribute("data-ste", "urun-etiketleri"); h.style.cssText = "position:absolute;inset:0;pointer-events:none;z-index:5";
        var root = h.attachShadow ? h.attachShadow({ mode: "open" }) : h; var st = document.createElement("style"); st.textContent = css; root.appendChild(st);
        var corners = {};
        list.slice(0, max).forEach(function (x) {
          var l = labels[x[0]]; if (!l) return;
          var pos = l.position || "top-left", c = corners[pos];
          if (!c) { c = corners[pos] = el("div"); c.className = "c " + pos; root.appendChild(c); }
          var b = el("span"); b.className = "b" + (l.shape === "circle" ? " circle" : "");
          var img = safeUrl(l.imageUrl);
          if (img) { b.className += " img"; var im = el("img"); im.src = img; im.alt = fill(l.text, { oran: x[1] }); b.appendChild(im); }
          else {
            b.style.cssText = "background:" + l.bg + ";color:" + l.color + ";border-radius:" + (R0[l.shape] || "999px");
            if (ICONS[l.icon]) { var sv = document.createElementNS("http://www.w3.org/2000/svg", "svg"); sv.setAttribute("viewBox", "0 0 24 24"); sv.setAttribute("fill", "none"); sv.setAttribute("stroke", "currentColor"); sv.setAttribute("stroke-width", "2"); sv.setAttribute("stroke-linecap", "round"); sv.setAttribute("stroke-linejoin", "round"); sv.setAttribute("aria-hidden", "true"); var pa = document.createElementNS("http://www.w3.org/2000/svg", "path"); pa.setAttribute("d", ICONS[l.icon]); sv.appendChild(pa); b.appendChild(sv); }
            b.appendChild(el("span", null, fill(l.text, { oran: x[1] })));
          }
          c.appendChild(b);
        });
        return h;
      }
      // Etiket katmanı görselin konumlu kapsayıcısına eklenir; kapsayıcı konumsuzsa yalnızca position:relative verilir.
      function attach(img, list) {
        var box = img.parentElement; if (!box || box.querySelector(":scope > [data-ste=urun-etiketleri]")) return null;
        if (getComputedStyle(box).position === "static") box.style.position = "relative";
        var h = badges(list); box.appendChild(h); return h;
      }
      var hosts = [], seen = false;
      function shown() { if (!seen) { seen = true; t("view"); } }

      if (env.editor) {
        // Önizleme: örnek kartlarda tüm aktif etiketler (öncelik ve en fazla etiket sınırı uygulanır).
        var act = labels.map(function (l, i) { return [i, 25]; }).filter(function (x) { return labels[x[0]].active !== false; });
        var wrap = el("div", "display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;padding:16px;max-width:720px");
        for (var k = 0; k < 3; k++) { var cell = el("div", "position:relative;aspect-ratio:1/1;background:#e5e7eb;border-radius:8px"); var ph = el("div", "position:absolute;inset:0"); cell.appendChild(ph); wrap.appendChild(cell); cell.appendChild(badges(act.slice(k, k + max).concat(act.slice(0, k)).slice(0, max))); }
        var main = document.querySelector("main") || document.body; main.insertBefore(wrap, main.firstChild);
        return function () { wrap.remove(); };
      }

      var mo = null, data = null;
      function scan() {
        if (!data) return;
        if (s.showOn !== "detail") {
          [].forEach.call(document.querySelectorAll("a[href]"), function (a) {
            if (a.__steL) return; var href = a.getAttribute("href"); if (!href || href[0] !== "/") return;
            var pid = data.bySlug[href.replace(/[?#].*$/, "").replace(/\/+$/, "").slice(1)]; if (!pid) return;
            var img = a.querySelector("img"); if (!img) return; a.__steL = true;
            var h = attach(img, data.map[pid]); if (h) { hosts.push(h); shown(); a.addEventListener("click", function () { t("click"); }); }
          });
        }
        if (s.showOn !== "listing" && !data.detailDone) {
          var d = productData(); if (!d || !data.map[d.id]) return;
          var img = null;
          if (s.detailImageSelector) { try { img = document.querySelector(s.detailImageSelector); } catch (e) {} }
          if (!img) { var best = 0; [].forEach.call(document.querySelectorAll("main img, img"), function (x) { if (x.closest("a[href],header,footer")) return; var r = x.getBoundingClientRect(); if (r.width > 250 && r.width * r.height > best) { best = r.width * r.height; img = x; } }); }
          if (img) { var h2 = attach(img, data.map[d.id]); if (h2) { hosts.push(h2); data.detailDone = true; shown(); } }
        }
      }
      fetch(base + "/api/sf/" + key + "/labels", { credentials: "omit" }).then(function (r) { return r.ok ? r.json() : null; }).then(function (j) {
        if (!j) return; var bySlug = {}; for (var id in j.slugs) bySlug[j.slugs[id]] = id;
        data = { map: j.map, bySlug: bySlug, detailDone: false }; scan();
        var q = null; mo = new MutationObserver(function () { clearTimeout(q); q = setTimeout(scan, 200); }); mo.observe(document.body, { childList: true, subtree: true });
      }).catch(function () {});
      return function () { if (mo) mo.disconnect(); hosts.forEach(function (h) { h.remove(); }); [].forEach.call(document.querySelectorAll("a[href]"), function (a) { a.__steL = false; }); };
    },
    "duyuru-cubugu": function (s, t) {
      var bar = el("div", "position:fixed;left:0;right:0;" + (s.position === "bottom" ? "bottom:0" : "top:0") + ";z-index:2147483000;display:flex;align-items:center;justify-content:center;gap:12px;padding:10px 40px;font:14px/1.4 system-ui,sans-serif;background:" + s.bg + ";color:" + s.color);
      var href = safeUrl(s.link), txt = el(href ? "a" : "span", "color:inherit;text-decoration:" + (href ? "underline" : "none"), s.text);
      if (href) { txt.href = href; txt.addEventListener("click", function () { t("click"); }); }
      bar.appendChild(txt);
      if (s.closable) {
        var x = el("button", "position:absolute;right:12px;background:none;border:0;color:inherit;font-size:18px;cursor:pointer", "×");
        x.setAttribute("aria-label", "Kapat");
        x.addEventListener("click", function () { bar.remove(); t("use"); });
        bar.appendChild(x);
      }
      document.body.appendChild(bar);
      t("view");
      return function () { bar.remove(); };
    },
  };

  // Kampanya bağlantısına tıklanıp hedef sayfaya gerçekten varıldıysa (30 dk içinde, aynı mağaza) "geçiş" sayılır.
  function landings(cfg) {
    (cfg.modules || []).forEach(function (m) {
      var k = "ste_gecis_" + m.key, raw = ss(k); if (!raw) return;
      try { var d = JSON.parse(raw); if (Date.now() - d.at < 1800000 && d.p === path) { ss(k, null); track(m.key)("use"); } else if (Date.now() - d.at >= 1800000) ss(k, null); } catch (e) { ss(k, null); }
    });
  }

  var mounted = [], current = null;
  function run(cfg) {
    mounted.forEach(function (f) { try { f(); } catch (e) {} }); mounted = [];
    current = cfg;
    var badge = document.getElementById("ste-onizleme"); if (badge) badge.remove();
    (cfg.modules || []).forEach(function (m) {
      try {
        if (!R[m.key] || !allowed(m.settings, cfg.preview)) return;
        var c = R[m.key](m.settings, track(m.key), { editor: editor, version: m.version || 0, data: m.data });
        if (c) mounted.push(c);
      } catch (e) { console.warn("[ShipToEcom]", m.key, e); }
    });
    if (cfg.preview && !editor) { var b = el("div", "position:fixed;left:12px;bottom:12px;z-index:2147483001;padding:6px 10px;border-radius:6px;background:#4f46e5;color:#fff;font:12px system-ui,sans-serif", "ShipToEcom önizleme: yayınlanmamış taslak gösteriliyor"); b.id = "ste-onizleme"; document.body.appendChild(b); }
  }
  // Tema hidratasyonu bitsin diye sayfa yüklendikten sonra çizilir (editörde hemen).
  function start(cfg) { var go = function () { if (!editor) hook(); run(cfg); }; document.readyState === "complete" || editor ? go() : addEventListener("load", go); }
  // Cihaz değişince (döndürme, pencere boyutu) yeniden çiz.
  if (mq.addEventListener) mq.addEventListener("change", function () { if (current) run(current); });
  // ikas temaları sayfalar arasında tam yükleme yapmadan geçer: yol değişince modüller yeni sayfaya göre yeniden çizilir.
  function onRoute() { var old = path; refreshPath(); if (path !== old && current && !editor) { landings(current); run(current); } }
  var hooked = false;
  function hook() { if (hooked) return; hooked = true; var r = window.next && window.next.router; if (r && r.events) r.events.on("routeChangeComplete", function () { setTimeout(onRoute, 50); }); else addEventListener("popstate", onRoute); }

  if (inline) {
    try { start(JSON.parse(inline)); } catch (e) {}
    if (editor) addEventListener("message", function (e) { if (e.source === parent && e.data && e.data.ste === "cfg") run(e.data.cfg); });
    return;
  }
  if (!key) return;
  fetch(base + "/api/sf/" + key + "/config" + (pv ? "?preview=" + encodeURIComponent(pv) : ""), { credentials: "omit" })
    .then(function (r) { return r.ok ? r.json() : null; })
    .then(function (cfg) { if (!cfg) return; live = !cfg.preview; landings(cfg); start(cfg); })
    .catch(function () {});
})();
