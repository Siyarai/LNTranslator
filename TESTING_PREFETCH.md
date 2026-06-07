# Background Prefetch — Test Prosedürü

## Genel Bakış

Kullanıcı N. bölümü okurken, N+1 ve N+2 (ayarlara göre) sessizce DeepL'e gönderilir ve DB'ye kaydedilir. Kullanıcı "Next" tuşuna bastığında bölüm zaten hazırdır.

---

## Manuel Test Senaryoları

### Senaryo 1 — Temel Prefetch Akışı

**Hazırlık:** En az 3 bölümü olan, bölümlerin `originalText` içerdiği (downloaded) ve henüz çevrilmemiş bir novel aç.

**Adımlar:**

1. 1. bölümü aç.
2. Metro/expo loglarını izle.
3. Logda şunları gör:
   ```
   [PrefetchQueue] Enqueue chapter {id_bölüm2} (novel X, index 1)
   [PrefetchQueue] Enqueue chapter {id_bölüm3} (novel X, index 2)
   [PrefetchQueue] Processing started
   [PrefetchQueue] Translating chapter {id_bölüm2}
   ```
4. Ekranın üst kısmında "Sonraki bölüm hazırlanıyor…" animasyonu görünür.
5. Çeviri bitince log: `[PrefetchQueue] Done chapter {id_bölüm2}`, animasyon kaybolur.
6. "Next ›" butonuna bas → Bölüm 2 açılır.
7. Settings → "🌐 Translate" butonuna bas → Hemen "✓ Translated" görünür, API çağrısı yok (cache'den okundu).

**Beklenen:** Bölüm 2 önceden çevrilmiş, anında hazır.

---

### Senaryo 2 — Manuel Çeviri Queue ile Race (Pending Durumu)

**Hazırlık:** Bölüm 2 henüz çevrilmemiş, bölüm 1 açık, prefetch başlamış ama bitmemiş.

**Adımlar:**

1. Bölüm 1 açık, log'da `[PrefetchQueue] Translating chapter {bölüm2_id}` görünürken Bölüm 2'ye geç.
2. Bölüm 2 açılınca Settings → "🌐 Translate" butonuna bas.
3. Log: `[PrefetchQueue] Promoted chapter {bölüm2_id} to high priority` (eğer pending'deyse).
4. Eğer in-flight ise: `setTranslating(true)` ile progress indicator görünür, queue'dan beslenir.
5. Çeviri bitince ekran güncellenir, DB'den okunur.

**Beklenen:** Duplicate API çağrısı yok. `isInFlight` veya `isPending` kontrolü çalıştı.

---

### Senaryo 3 — Background'a Al, Queue Duruyor Mu?

**Adımlar:**

1. Prefetch aktifken (log'da "Translating" görünürken) uygulamayı background'a al (home tuşu).
2. Log: `[PrefetchQueue] Paused (app_background)`.
3. Birkaç saniye bekle — "Translating" log'u durdu mu kontrol et.
4. Uygulamayı foreground'a geri al.
5. Log: `[PrefetchQueue] Resume (app_background)`, ardından `[PrefetchQueue] Processing started` ve "Translating" devam eder.

**Beklenen:** Background'da API çağrısı yok, foreground'a dönünce kaldığı yerden devam ediyor.

---

### Senaryo 4 — Network Kesintisi

**Adımlar:**

1. Cihazda Wi-Fi/mobile data kapat (veya uçak modu).
2. Log: `[PrefetchQueue] Paused (no_network)`.
3. Network'ü aç.
4. Log: `[PrefetchQueue] Resume (no_network)`, işlem devam eder.

**Not:** Hem `no_network` hem `app_background` aynı anda aktifse, ikisi de kalkana kadar queue başlamaz (multi-reason pause).

---

### Senaryo 5 — Bölüm Değiştirince Eski Prefetch İptali

**Hazırlık:** Bölüm 1 açık, bölüm 2 ve 3 queue'da.

**Adımlar:**

1. Bölüm 5'e doğrudan geç (chapter listesinden veya birden fazla "Next").
2. Log'da: bölüm 2 ve 3 için `enqueue` çağrıları queue'dan temizlendi (stale, `chapterIndex < currentIndex - 2`).
3. Bunun yerine bölüm 6 ve 7 queue'ya eklendi.

**Beklenen:** Atlanmış bölümler için quota harcanmıyor.

---

### Senaryo 6 — Otomatik Prefetch Kapatma

**Adımlar:**

1. Reader → Settings → "Sonraki bölümleri otomatik çevir" toggle'ını kapat.
2. Bölüm değiştir.
3. Log'da `[PrefetchQueue] Enqueue` mesajı YOK.

**Beklenen:** Prefetch tamamen durdu.

---

### Senaryo 7 — Prefetch Bölüm Sayısı Ayarı

**Adımlar:**

1. Reader → Settings → "Kaç bölüm önden çevrilsin" stepperini 1'e çek.
2. Bölüm değiştir.
3. Log'da sadece 1 `Enqueue` mesajı görün (N+1 için).
4. Stepperi 4'e çek → 4 `Enqueue` mesajı görün.

---

### Senaryo 8 — Quota Exceeded Bildirimi

**Hazırlık:** DeepL 456 yanıtını simüle etmek için `translationService.ts`'i geçici olarak şu şekilde değiştir:

```typescript
// Geçici test kodu — üretimde kaldırma!
throw Object.assign(new Error('Quota Exceeded'), {
  response: { status: 456 }
});
```

**Adımlar:**

1. Prefetch başladıktan sonra yukarıdaki mock'u ekle.
2. Mevcut çeviri girişimi 456 ile sonuçlanınca:
   - Log: `[PrefetchQueue] 456 quota exceeded, stopping queue`
   - `[PrefetchQueue] Paused (quota_exceeded)`
3. Reader'da turuncu banner görünür: "⚠ DeepL kotası doldu. Otomatik çeviri duraklatıldı."
4. ✕ butonuyla banner dismiss edilir (sadece görsel, queue pause state'ini değiştirmez).
5. Uygulama yeniden başlatılınca `quota_exceeded` pause temizlenir (in-memory).

**Mock'u kaldırmayı unutma.**

---

## Edge Case'ler

### EC-P1: Çevrilmiş bölüm tekrar prefetch kuyruğuna girerse

`processItem` içinde `chapter.isTranslated === true` kontrolü var, `done` event'i fırlatılır ama API çağrısı yapılmaz. Quota harcanmaz.

### EC-P2: `originalText` null olan bölüm

`prefetchItems` oluşturulurken `t.originalText && !t.isTranslated` kontrolü var. `null` text olan bölümler enqueue edilmez.

### EC-P3: Novel'ın son bölümü açık

`idx + 1 >= chapters.length` olduğundan `prefetchItems` boş kalır. Hiçbir şey enqueue edilmez.

### EC-P4: 503 retry sırasında kullanıcı bölümü iptal ederse

`cancel(chapterId)` çağrısı hem queue'dan kaldırır hem de `retryTimers.get(chapterId)` ile beklenen retry timer'ı iptal eder. Bölüm bir daha çevrilmez.

### EC-P5: App restart sonrası prefetch state

Queue in-memory, restart sonrası tamamen sıfırlanır. Reader açıldığında `loadChapter` yeniden tetiklenir ve prefetch yeniden başlar.

---

## TypeScript Kontrolü

```bash
npx tsc --noEmit
```

Hata olmamalı.

## Log Referansı

| Log | Anlam |
|---|---|
| `[PrefetchQueue] Enqueue chapter X` | Chapter queue'ya eklendi |
| `[PrefetchQueue] Processing started` | İşlem döngüsü başladı |
| `[PrefetchQueue] Translating chapter X` | DeepL'e gönderim başladı |
| `[PrefetchQueue] Done chapter X` | Çeviri tamamlandı, DB'ye yazıldı |
| `[PrefetchQueue] Paused (reason)` | Queue durdu, sebep belirtilmiş |
| `[PrefetchQueue] Resume (reason)` | O sebep kalktı |
| `[PrefetchQueue] 429 rate limit, pausing 60s` | Rate limit, 60s beklenecek |
| `[PrefetchQueue] 456 quota exceeded` | Kota bitti, queue kalıcı durduruldu |
| `[PrefetchQueue] Promoted chapter X` | Manuel "Çevir" tetikledi, high priority |
