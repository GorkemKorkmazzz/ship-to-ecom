// Yerel test için sahte ikas API'si. Gerçek mağaza olmadan senkronu denemeyi sağlar.
//   node scripts/mock-ikas.mjs
// Uygulamayı şu değişkenlerle başlatın:
//   IKAS_GRAPHQL_URL=http://localhost:4010/graphql IKAS_TOKEN_URL=http://localhost:4010/{store}/token IKAS_IMAGE_URL=http://localhost:4010/image
// Mağaza adları: "magaza-a" ve "magaza-b" (Client ID/Secret: herhangi bir değer; secret "yanlis" ise reddeder)
// Sipariş simülasyonu:  curl -X POST "localhost:4010/_order?store=magaza-a&sku=TS-001&qty=2"
// Elle stok değişimi:   curl -X POST "localhost:4010/_set?store=magaza-b&sku=TS-001&stock=40"
import http from "node:http";

const mk = (stocks) => ({
  loc: "loc-1",
  orders: [],
  products: [
    { id: "p1", name: "Basic Tişört", variants: [["v1", "TS-001", stocks[0]], ["v2", "TS-002", stocks[1]]] },
    { id: "p2", name: "Kapüşonlu Sweatshirt", variants: [["v3", "SW-001", stocks[2]]] },
    { id: "p3", name: stocks[4], variants: [["v4", stocks[5], stocks[3]]] },
  ].map((p) => ({ ...p, variants: p.variants.map(([id, sku, stockCount]) => ({ id, sku, stockCount, sellPrice: 349.9, discountPrice: sku === "TS-002" ? 299.9 : null, buyPrice: 120, imageId: `img-${sku}` })) })),
});
const stores = {
  // (fiyatlar: sellPrice 349.9; saveVariantPrices ile değişir)
  "magaza-a": mk([25, 10, 8, 5, "Sadece A'da Şapka", "SP-A01"]),
  "magaza-b": mk([25, 12, 8, 3, "Sadece B'de Çorap", "CR-B01"]),
};
const findVariant = (st, pred) => st.products.flatMap((p) => p.variants.map((v) => ({ p, v }))).find(pred);
let orderNo = 1001;
let nextId = 100;

http
  .createServer(async (req, res) => {
    const url = new URL(req.url, "http://x");
    let body = "";
    for await (const c of req) body += c;
    const json = (o, code = 200) => {
      res.writeHead(code, { "Content-Type": "application/json" });
      res.end(JSON.stringify(o));
    };

    const tok = url.pathname.match(/^\/([^/]+)\/token$/);
    if (tok) {
      if (!stores[tok[1]] || new URLSearchParams(body).get("client_secret") === "yanlis") return json({ error: "invalid_client" }, 401);
      return json({ access_token: `tok:${tok[1]}`, token_type: "Bearer", expires_in: 14400 });
    }

    if (url.pathname === "/_order" || url.pathname === "/_set") {
      const st = stores[url.searchParams.get("store")];
      const hit = st && findVariant(st, ({ v }) => v.sku === url.searchParams.get("sku"));
      if (!hit) return json({ error: "store/sku yok" }, 404);
      if (url.pathname === "/_set") {
        hit.v.stockCount = Number(url.searchParams.get("stock"));
      } else {
        const qty = Number(url.searchParams.get("qty") ?? 1);
        hit.v.stockCount -= qty;
        st.orders.push({
          id: `o${orderNo}`, orderNumber: String(orderNo++), status: "CREATED", orderPaymentStatus: "PAID",
          orderPackageStatus: "UNFULFILLED", currencyCode: "TRY", totalFinalPrice: 349.9 * qty, orderedAt: Date.now(), updatedAt: Date.now(),
          // Gerçek ikas'ta olduğu gibi müşteri verisi burada VAR; platform bunu hiç istememeli.
          customer: { fullName: "Gizli Müşteri", email: "gizli@example.com" },
          shippingMethod: "SHIPMENT",
          salesChannel: { name: orderNo % 2 ? "Online Mağaza" : "Instagram", type: "STOREFRONT" },
          sessionInfo: {
            referer: orderNo % 2 ? "https://www.google.com/search?q=x" : "https://l.instagram.com/",
            utm: orderNo % 2 ? { source: "google", medium: "cpc", campaign: "kis-indirimi" } : { source: "instagram", medium: "social", campaign: null },
            trafficSource: { source: orderNo % 2 ? "google" : "instagram", type: orderNo % 2 ? "SEARCH" : "SOCIAL" },
          },
          couponCode: orderNo % 2 ? "KASIM15" : null,
          orderAdjustments: orderNo % 2 ? [{ name: "Kasım indirimi", type: "DECREMENT", amount: 52.5, campaignType: "RATIO" }] : [],
          shippingAddress: { city: { name: ["İstanbul", "Ankara", "İzmir"][orderNo % 3] }, district: { name: ["Kadıköy", "Çankaya", "Bornova"][orderNo % 3] }, firstName: "Gizli", addressLine1: "Gizli adres" },
          orderPackages: orderNo % 3 === 0 ? [] : [{ id: `pk-${orderNo}`, orderPackageNumber: `${orderNo - 1}-1`, orderPackageFulfillStatus: "READY_FOR_SHIPMENT", orderLineItemIds: [`li-${orderNo}`], trackingInfo: { barcode: `7340000${orderNo}`, cargoCompany: "Deneme Kargo", trackingNumber: `TR${orderNo}99`, trackingLink: "https://example.com/takip" } }],
          orderLineItems: [{ id: `li-${orderNo}`, status: "UNFULFILLED", quantity: qty, finalPrice: 349.9, variant: { name: hit.p.name, sku: hit.v.sku, mainImageId: hit.v.imageId ?? null } }],
        });
      }
      return json({ ok: true, sku: hit.v.sku, stock: hit.v.stockCount });
    }

    if (url.pathname === "/image") {
      const img = JSON.parse(body).productImage;
      console.log("görsel:", JSON.stringify({ variantIds: img.variantIds, order: img.order, isMain: img.isMain, url: img.url, base64Length: img.base64?.length }));
      res.writeHead(200);
      return res.end("OK");
    }

    if (url.pathname === "/graphql") {
      const st = stores[(req.headers.authorization ?? "").replace("Bearer tok:", "")];
      if (!st) return json({ errors: [{ message: "unauthorized" }] }, 401);
      const { query, variables } = JSON.parse(body);
      if (/customer|shippingAddress|billingAddress|email|phone/i.test(query)) console.log("!!! MÜŞTERİ ALANI İSTENDİ:", query);
      const op = query.match(/\{\s*(\w+)/)?.[1];
      const named = { listProductBrand: "brands", listCategory: "categories", listProductTag: "tags", saveProductBrand: "brands", saveCategory: "categories", saveProductTag: "tags" };
      if (op === "listStockLocation") return json({ data: { listStockLocation: [{ id: st.loc, name: "Ana Depo" }] } });
      if (op === "listSalesChannel") return json({ data: { listSalesChannel: [{ id: "sc-web" }] } });
      if (op in named && op.startsWith("list")) return json({ data: { [op]: (st[named[op]] ??= []) } });
      if (op in named) {
        const item = { id: `${named[op]}-${nextId++}`, name: variables.input.name };
        (st[named[op]] ??= []).push(item);
        return json({ data: { [op]: item } });
      }
      if (op === "listVariantType") return json({ data: { listVariantType: (st.variantTypes ??= []) } });
      if (op === "saveVariantType") {
        const i = variables.input;
        const values = i.values.map((v) => ({ id: v.id ?? `vv-${nextId++}`, name: v.name }));
        let t = (st.variantTypes ??= []).find((x) => x.id === i.id);
        if (t) t.values = values;
        else st.variantTypes.push((t = { id: `vt-${nextId++}`, name: i.name, selectionType: i.selectionType, values }));
        return json({ data: { saveVariantType: t } });
      }
      if (op === "saveProduct") {
        const i = variables.input;
        if (!i.name || !i.type || !i.variants?.length || i.variants.some((v) => typeof v.isActive !== "boolean" || typeof v.prices?.[0]?.sellPrice !== "number"))
          return json({ errors: [{ message: "ProductInput geçersiz" }] }, 400);
        const p = { id: `p-${nextId++}`, name: i.name, input: i, variants: i.variants.map((v) => ({ id: `v-${nextId++}`, sku: v.sku, stockCount: 0, ...v.prices[0] })) };
        st.products.push(p);
        console.log("ürün oluşturuldu:", JSON.stringify(i));
        return json({ data: { saveProduct: { id: p.id, variants: p.variants.map((v) => ({ id: v.id, sku: v.sku })) } } });
      }
      if (op === "listProduct") {
        const data = st.products.map((p) => ({
          id: p.id, name: p.name,
          variants: p.variants.map((v) => ({
            id: v.id, sku: v.sku,
            stocks: [{ stockLocationId: st.loc, stockCount: v.stockCount }],
            prices: [{ sellPrice: v.sellPrice ?? 0, discountPrice: v.discountPrice ?? null, buyPrice: v.buyPrice ?? null, priceListId: null }],
            images: v.imageId ? [{ imageId: v.imageId, isMain: true, order: 0 }] : [],
          })),
        }));
        return json({ data: { listProduct: { hasNext: false, data } } });
      }
      if (op === "saveVariantPrices") {
        for (const i of variables.input.variantPriceInputs) {
          const hit = findVariant(st, ({ v }) => v.id === i.variantId);
          if (hit) Object.assign(hit.v, i.price);
        }
        console.log("fiyat yazıldı:", JSON.stringify(variables.input.variantPriceInputs.map((i) => [i.variantId, i.price.sellPrice, i.price.discountPrice])));
        return json({ data: { saveVariantPrices: true } });
      }
      if (op === "getMerchant") return json({ data: { getMerchant: { id: "merchant-test" } } });
      if (op === "listCampaign") return json({ data: { listCampaign: { hasNext: false, data: (st.campaigns ??= []) } } });
      if (op === "saveCampaign") {
        const i = variables.input;
        if (!i.title || !i.type || !i.applicablePrice || typeof i.canCombineWithOtherCampaigns !== "boolean" || typeof i.hasCoupon !== "boolean")
          return json({ errors: [{ message: "CampaignInput geçersiz" }] }, 400);
        const c = { id: `c-${nextId++}`, usageCount: 0, usageLimit: null, dateRange: null, fixedDiscount: null, ...i };
        (st.campaigns ??= []).push(c);
        console.log("kampanya:", JSON.stringify(i));
        return json({ data: { saveCampaign: { id: c.id } } });
      }
      if (op === "campaignAddCoupons") {
        console.log("kupon:", JSON.stringify(variables.input));
        return json({ data: { campaignAddCoupons: [{ id: `cp-${nextId++}` }] } });
      }
      if (op === "deleteCampaignList") {
        st.campaigns = (st.campaigns ?? []).filter((c) => !variables.idList.includes(c.id));
        return json({ data: { deleteCampaignList: true } });
      }
      if (op === "saveProductStockLocations") {
        for (const i of variables.input.productStockLocationInputs) {
          const hit = findVariant(st, ({ v }) => v.id === i.variantId);
          if (hit) hit.v.stockCount = i.stockCount;
        }
        console.log("stok yazıldı:", JSON.stringify(variables.input.productStockLocationInputs.map((i) => [i.variantId, i.stockCount])));
        return json({ data: { saveProductStockLocations: true } });
      }
      if (op === "listOrder") {
        const since = Number(query.match(/gte:\s*(\d+)/)?.[1] ?? 0);
        const data = st.orders.filter((o) => o.updatedAt >= since).map((o) => ({ ...o, customer: undefined, updatedAt: undefined }));
        return json({ data: { listOrder: { hasNext: false, data } } });
      }
      if (op === "listAbandonedCheckouts") {
        const item = (sku, q) => ({ quantity: q, finalPrice: 349.9, variant: { name: findVariant(st, ({ v }) => v.sku === sku)?.p.name ?? sku, sku, mainImageId: `img-${sku}` } });
        const data = [
          { id: "ck-1", status: "OPEN", recoveryStatus: "NOT_RECOVERED", recoverEmailStatus: "SENT", totalFinalPrice: 699.8, couponCode: null, shippingAddress: { city: { name: "İstanbul" } }, cart: { itemCount: 2, currencyCode: "TRY", lastActivityDate: Date.now() - 3600e3, items: [item("TS-001", 2)] } },
          { id: "ck-2", status: "OPEN", recoveryStatus: "NOT_RECOVERED", recoverEmailStatus: "NOT_SENT", totalFinalPrice: 349.9, couponCode: "KASIM15", shippingAddress: null, cart: { itemCount: 1, currencyCode: "TRY", lastActivityDate: Date.now() - 7200e3, items: [item("SW-001", 1)] } },
          { id: "ck-3", status: "COMPLETED", recoveryStatus: "RECOVERED", recoverEmailStatus: "SENT", totalFinalPrice: 1049.7, couponCode: null, shippingAddress: { city: { name: "Ankara" } }, cart: { itemCount: 3, currencyCode: "TRY", lastActivityDate: Date.now() - 86400e3, items: [item("TS-002", 3)] } },
        ];
        return json({ data: { listAbandonedCheckouts: { hasNext: false, data } } });
      }
      if (op === "fulfillOrder" || op === "updateOrderPackageStatus" || op === "cancelOrderLine") {
        const i = variables.input;
        const o = st.orders.find((x) => x.id === i.orderId);
        if (!o) return json({ errors: [{ message: "sipariş yok" }] }, 400);
        console.log(op + ":", JSON.stringify(i));
        if (op === "fulfillOrder") {
          const status = i.markAsReadyForShipment ? "READY_FOR_SHIPMENT" : "FULFILLED";
          o.orderPackages.push({ id: `pk-${nextId++}`, orderPackageNumber: `${o.orderNumber}-1`, orderPackageFulfillStatus: status, orderLineItemIds: i.lines.map((l) => l.orderLineItemId), trackingInfo: { barcode: null, cargoCompany: null, trackingNumber: null, trackingLink: null, ...i.trackingInfoDetail } });
          o.orderPackageStatus = status;
        } else if (op === "updateOrderPackageStatus") {
          for (const p of i.packages) {
            const pk = o.orderPackages.find((x) => x.id === p.packageId);
            if (!pk) return json({ errors: [{ message: "paket yok" }] }, 400);
            pk.orderPackageFulfillStatus = p.status;
            if (p.trackingInfo) pk.trackingInfo = { ...pk.trackingInfo, ...p.trackingInfo };
            o.orderPackageStatus = p.status;
          }
        } else {
          o.status = "CANCELLED"; o.orderPackageStatus = "CANCELLED";
          for (const l of i.orderLineItems) if (l.restockItems) { const li = o.orderLineItems.find((x) => x.id === l.orderLineItemId); const hit = li && findVariant(st, ({ v }) => v.sku === li.variant.sku); if (hit) hit.v.stockCount += l.quantity; }
        }
        o.updatedAt = Date.now();
        return json({ data: { [op]: { id: o.id } } });
      }
      if (op === "saveWebhook") return json({ data: { saveWebhook: [{ id: "w1" }] } });
      return json({ errors: [{ message: "bilinmeyen sorgu" }] }, 400);
    }
    json({ error: "not found" }, 404);
  })
  .listen(4010, () => console.log("Sahte ikas API: http://localhost:4010"));
