// Ortak stok hesabı — saf fonksiyonlar, ağ/DB yok.
//
// Her mağaza için "en son yazdığımız/gördüğümüz stok" (lastSeen) tutulur. Mağazadaki güncel
// değer ile lastSeen arasındaki fark, o mağazada bizim dışımızda olan değişimdir
// (sipariş = eksi, iade/elle stok girişi = artı). Tüm mağazaların farkları ortak stoğa
// uygulanır. Sonra her mağazaya, ortak stoktan hesaplanan "yayınlanan" değer yazılır;
// lastSeen = yazılan değer olduğu için kendi yazdığımız değer yeni bir fark üretmez.

export type StoreStock = { current: number; lastSeen: number | null };

export function reconcile(shared: number | null, stores: StoreStock[], pending = 0): number {
  if (shared === null) {
    // İlk eşleşme: fazla satış riskine karşı düşük olan değer esas alınır.
    return Math.max(0, Math.min(...stores.map((s) => s.current)) + pending);
  }
  let next = shared + pending;
  for (const s of stores) {
    if (s.lastSeen !== null) next += s.current - s.lastSeen;
  }
  return Math.max(0, next);
}

/**
 * Bir mağazaya yazılacak stok: ortak stoktan güvenlik stoğu düşülür,
 * sonra mağazanın payı (%) uygulanır ve aşağı yuvarlanır.
 */
export function publish(shared: number, safetyStock: number, sharePercent: number): number {
  const available = Math.max(0, shared - Math.max(0, safetyStock));
  const pct = Math.min(100, Math.max(0, sharePercent));
  return Math.max(0, Math.floor((available * pct) / 100 + 1e-9));
}

export type AllocStore = { sharePercent: number; minStock: number; priority: boolean };

/**
 * Akıllı dağıtım: her mağazaya yazılacak stok.
 * - Normal: mağaza payı (publish), stok yetiyorsa en az minStock.
 * - Kritik: satılabilir stok (ortak − güvenlik) criticalStock ve altındaysa ve öncelikli mağaza
 *   seçiliyse, stok yalnızca öncelikli mağazada satışa açılır; diğerlerine 0 yazılır.
 *   Böylece son adetler iki mağazada aynı anda satılamaz.
 * Ayarlar kapalıyken (minStock 0, criticalStock null) sonuç publish() ile birebir aynıdır.
 */
export function allocate(shared: number, safetyStock: number, stores: AllocStore[], criticalStock: number | null): { targets: number[]; critical: boolean } {
  const available = Math.max(0, Math.floor(shared - Math.max(0, safetyStock) + 1e-9));
  const critical = criticalStock !== null && available <= criticalStock && stores.some((s) => s.priority);
  if (critical) return { critical, targets: stores.map((s) => (s.priority ? available : 0)) };
  return {
    critical,
    targets: stores.map((s) => Math.max(publish(shared, safetyStock, s.sharePercent), Math.min(Math.max(0, Math.floor(s.minStock)), available))),
  };
}
