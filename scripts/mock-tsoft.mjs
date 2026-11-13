// Yerel test için sahte T-Soft Admin API'si (2026-01, JSON:API). Gerçek mağaza olmadan senkronu denemeyi sağlar.
//   node scripts/mock-tsoft.mjs
// Uygulamayı şu değişkenlerle başlatın:
//   TSOFT_CLIENT_ID=app.test TSOFT_CLIENT_SECRET=gizli
//   TSOFT_API_URL="http://localhost:4020/{domain}/api/v3/admin/2026-01" TSOFT_TOKEN_URL=http://localhost:4020/oauth/token
//   TSOFT_INSTALL_URL=http://localhost:4020/install TSOFT_PANEL_URL=http://localhost:4020/panel
// Mağaza: alan adı "tsoft-magaza.test", store_id "ts-1".
// Sipariş simülasyonu:  curl -X POST "localhost:4020/_order?sku=TS-001&qty=2"
// Elle stok değişimi:   curl -X POST "localhost:4020/_set?sku=TS-001&stock=40"
// Durum:                curl localhost:4020/_state
import http from "node:http";

const DOMAIN = "tsoft-magaza.test";
const products = [
  { id: "101", name: "Basic Tişört", price: 349.9, discountPrice: 0, purchasePrice: 120, stock: 37, barcode: null },
  // Varyantsız ürün: stok kodu ürünün kendisinde.
  { id: "102", name: "Kapüşonlu Sweatshirt", productCode: "SW-001", price: 349.9, discountPrice: 0, purchasePrice: 120, stock: 8, barcode: "869000000102" },
  { id: "103", name: "Sadece T-Soft'ta Atkı", productCode: "AT-T01", price: 199, discountPrice: 149, purchasePrice: 60, stock: 4, barcode: null },
];
const variants = [
  { id: "9001", productId: 101, typeName1: "S", typeName2: "", subProductCode: "TS-001", productBarcode: "869000009001", stock: 25, salePrice: 349.9, salePriceDiscount: 0, purchasePrice: 120 },
  { id: "9002", productId: 101, typeName1: "M", typeName2: "", subProductCode: "TS-002", productBarcode: null, stock: 12, salePrice: 349.9, salePriceDiscount: 299.9, purchasePrice: 120 },
];
const statuses = [{ id: "1", name: "Onay Bekliyor" }, { id: "4", name: "Kargoya Verildi" }, { id: "9", name: "İptal Edildi" }];
const orders = [];
let nextOrder = 5001, nextLine = 7001;
const writes = [];

const res1 = (type, { id, ...attributes }) => ({ type, id: String(id), attributes });
const page = (url, rows, extra = {}) => {
  const size = Math.min(100, Number(url.searchParams.get("page[size]")) || 15);
  const n = Number(url.searchParams.get("page[number]")) || 1;
  const last = Math.max(1, Math.ceil(rows.length / size));
  return { jsonapi: { version: "1.0" }, meta: { page: { currentPage: n, lastPage: last, perPage: size, total: rows.length } }, links: n < last ? { next: "next" } : {}, data: rows.slice((n - 1) * size, n * size), ...extra };
};
const find = (sku) => variants.find((v) => v.subProductCode === sku) ?? products.find((p) => p.productCode === sku);

http
  .createServer(async (req, res) => {
    const url = new URL(req.url, "http://x");
    let body = "";
    for await (const c of req) body += c;
    const json = (o, code = 200) => {
      res.writeHead(code, { "Content-Type": "application/vnd.api+json" });
      res.end(JSON.stringify(o));
    };
    const err = (code, detail) => json({ jsonapi: { version: "1.0" }, errors: [{ status: String(code), title: "Error", detail }] }, code);
    const input = body ? JSON.parse(body) : {};

    if (url.pathname === "/oauth/token") return input.client_secret === "gizli" && input.store === "ts-1" ? json({ token_type: "Bearer", expires_in: 3600, access_token: "tok-ts-1" }) : json({ error: "invalid_client" }, 401);
    if (url.pathname === "/install") return input.code === "kod-1" ? json({ client_id: input.client_id, store_id: "ts-1", store_domain: DOMAIN, scopes: ["read_products"], shared: true }) : json({ error: "invalid_grant" }, 400);
    if (url.pathname === "/_state") return json({ products, variants, orders, writes });
    if (url.pathname === "/_set") {
      const t = find(url.searchParams.get("sku"));
      if (!t) return err(404, "sku yok");
      t.stock = Number(url.searchParams.get("stock"));
      return json({ ok: true, stock: t.stock });
    }
    if (url.pathname === "/_order") {
      const sku = url.searchParams.get("sku"), qty = Number(url.searchParams.get("qty") ?? 1);
      const t = find(sku);
      if (!t) return err(404, "sku yok");
      t.stock -= qty;
      const isVariant = "subProductCode" in t;
      const p = isVariant ? products.find((x) => Number(x.id) === t.productId) : t;
      const unit = isVariant ? t.salePrice : t.price;
      const o = { id: String(nextOrder), orderNumber: `T${nextOrder}`, orderStatus: 1, currency: "TRY", orderTotal: unit * qty, cargoNumber: "", cargoCompanyName: "", discountCoupon: "", createdAt: new Date().toISOString(),
        // Müşteri alanları kapsam istenmediği için null döner.
        customerFirstName: null, customerLastName: null, customerEmail: null, customerPhone: null,
        items: [{ id: String(nextLine++), productName: p.name, productCode: p.productCode ?? "", variantName: isVariant ? t.typeName1 : "", variantProductCode: isVariant ? t.subProductCode : "", quantity: qty, salePrice: unit.toFixed(8) }] };
      nextOrder++;
      orders.push(o);
      return json({ ok: true, order: o.orderNumber, stock: t.stock });
    }

    const m = url.pathname.match(/^\/([^/]+)\/api\/v3\/admin\/2026-01(\/.*)$/);
    if (!m || m[1] !== DOMAIN) return err(404, "not found");
    if (req.headers.authorization !== "Bearer tok-ts-1") return err(401, "token geçersiz");
    if (req.headers.accept !== "application/vnd.api+json") return err(406, "Accept");
    const path = m[2];

    if (req.method === "GET" && path === "/catalog/products") return json(page(url, products.map((p) => res1("products", p))));
    if (req.method === "GET" && path === "/catalog/variants") return json(page(url, variants.map((v) => res1("variants", v))));
    const patch = path.match(/^\/catalog\/(products|variants)\/(\d+)$/);
    if (req.method === "PATCH" && patch) {
      if (req.headers["content-type"] !== "application/vnd.api+json") return err(415, "Content-Type");
      const t = (patch[1] === "products" ? products : variants).find((x) => x.id === patch[2]);
      if (!t || input.data?.type !== patch[1] || input.data?.id !== patch[2]) return err(422, "gövde geçersiz");
      Object.assign(t, input.data.attributes);
      writes.push({ type: patch[1], id: patch[2], ...input.data.attributes });
      return json({ data: res1(patch[1], t) });
    }
    if (req.method === "GET" && path === "/order/order-statuses") return json(page(url, statuses.map((s) => res1("order-statuses", s))));
    if (req.method === "GET" && path === "/order/orders") {
      const rows = [...orders].reverse();
      return json(page(url, rows.map(({ items, ...o }) => ({ ...res1("orders", o), relationships: { items: { data: items.map((i) => ({ type: "order-products", id: i.id })) } } })),
        { included: rows.flatMap((o) => o.items.map((i) => res1("order-products", i))) }));
    }
    if (req.method === "GET" && path === "/order/order-addresses") {
      const ids = (url.searchParams.get("filter[orderId]") ?? "").split(",");
      return json(page(url, orders.filter((o) => ids.includes(o.id)).map((o) => res1("order-addresses", { id: `a${o.id}`, orderId: Number(o.id), addressType: "0", city: "İzmir", town: "Bornova", district: "Kazımdirik", address: null, name: null, surname: null }))));
    }
    return err(404, `not found: ${req.method} ${path}`);
  })
  .listen(4020, () => console.log("sahte T-Soft API: http://localhost:4020"));
