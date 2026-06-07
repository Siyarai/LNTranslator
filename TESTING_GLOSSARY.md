# Glossary Özelliği — Test Prosedürü

## Otomatik Testler

```bash
npm test
```

`src/utils/glossary.test.ts` — 22 test, sıfır bağımlılık (DB yok, API yok).

---

## Manuel Test Senaryoları

### Senaryo A — Temel Akış

**Hazırlık:** Birden fazla bölümü olan bir novel içe aktar.

**Adımlar:**

1. Novel listesinde bir novele bas → Novel detay ekranı açılır
2. Sağ üstteki 📝 ikonuna bas → Glossary ekranı açılır
3. Empty state görünür: "Henüz terim eklenmedi" mesajı ve açıklama
4. **"+ Yeni Terim Ekle"** butonuna bas → Modal açılır
5. Kaynak Metin: `Tanaka-san`, Hedef Metin: `Tanaka-san` gir → Kaydet
6. Listede `Tanaka-san → Tanaka-san` satırı görünür, toggle aktif (mor)
7. Adım 4-6'yı tekrarla: `Yamamoto` → `Yamamoto`, `Dragon` → `Ejderha`
8. 3 entry alfabetik sırada görünür: Dragon, Tanaka-san, Yamamoto

**Beklenen:** Entry'ler kaydedildi, sıra doğru.

---

### Senaryo B — Çeviri Entegrasyonu

**Hazırlık:** Senaryo A'daki 3 entry mevcut. `Tanaka-san walks. Yamamoto bows. A Dragon appears.` içeren bir bölüm indir.

**Adımlar:**

1. Bölümü aç, Settings → Translate
2. Çeviri tamamlandıktan sonra Türkçe görünüme geç

**Beklenen:**
- `Tanaka-san` metinde aynen `Tanaka-san` olarak kalır (DeepL'e gönderilmeden korundu)
- `Yamamoto` aynen kalır
- `Dragon` → `Ejderha` olarak değişir
- DeepL çeviri kalitesi isimlerin çevrilmemiş olmasıyla artar

**Doğrulama:** Orijinal metinde `Tanaka-san` geçen yerleri gör, çeviri metninde de `Tanaka-san` olduğunu kontrol et.

---

### Senaryo C — Toggle (Aktif/Pasif)

**Adımlar:**

1. Glossary ekranında `Tanaka-san` entry'sinin toggle'ına bas → Soluklaşır (pasif)
2. Aynı bölümü yeniden çevir (Settings → Retranslate)
3. Türkçe görünüme geç

**Beklenen:** `Tanaka-san` bu sefer DeepL tarafından çevrilir (pasif entry korunmaz).

4. Toggle'a tekrar bas → Aktif olur
5. Retranslate → `Tanaka-san` tekrar korunur

---

### Senaryo D — Entry Düzenleme

**Adımlar:**

1. `Dragon → Ejderha` entry'sine tap → Düzenleme modalı açılır, değerler dolu gelir
2. Hedef Metni `Canavar` olarak değiştir → Kaydet
3. Listede `Dragon → Canavar` olarak güncellendi
4. Retranslate → Türkçe metinde `Dragon` yerine `Canavar` görünür

---

### Senaryo E — Export / Import

**Adımlar:**

1. Glossary ekranı, sağ üst **⋯** → "Dışa Aktar"
2. Paylaşım sheet'i açılır, `lntranslator_glossary_{id}_{tarih}.json` dosyası teklif edilir
3. Dosyayı kaydet, içeriğini kontrol et:

```json
[
  { "sourceText": "Dragon", "targetText": "Ejderha", "isActive": 1 },
  { "sourceText": "Tanaka-san", "targetText": "Tanaka-san", "isActive": 1 },
  { "sourceText": "Yamamoto", "targetText": "Yamamoto", "isActive": 1 }
]
```

4. ⋯ → "İçe Aktar" → Aynı dosyayı seç
5. Alert: **"0 terim eklendi, 3 duplicate atlandı."** (aynı terimler zaten var)
6. Başka bir novelda ⋯ → İçe Aktar → Aynı dosyayı seç
7. Alert: **"3 terim eklendi."**

---

### Senaryo F — Silme

**Adımlar:**

1. `Yamamoto` entry'sinde 🗑 ikonuna bas → Onay alert'i çıkar
2. "Sil" → Entry listeden kalkar
3. Retranslate → `Yamamoto` artık korunmaz, DeepL tarafından çevrilir

---

## Edge Case'ler

### EC-1: Regex özel karakteri içeren terim

- `Mr. Smith` ekle (nokta içeriyor)
- Bölümde `Mr. Smith` geçiyorsa doğru replace edilmeli
- `Mr` veya `Smith` ayrı ayrı match edilmemeli

**Beklenen:** `Mr. Smith` → `｢G{id}｣` olarak tek parça işlenir.

---

### EC-2: Çakışan (overlapping) terimler

- `Tanaka` ve `Tanaka-san` ikisi de glossary'de olsun
- Bölümde `"Tanaka-san bowed. Tanaka watched."` geçsin

**Beklenen:** `Tanaka-san` ilk replace edilir, ardından kalan `Tanaka` replace edilir.
`Tanaka-san` içindeki `Tanaka` yanlışlıkla ayrı eşleşmez.

---

### EC-3: Boş hedef metin

- Modal'da Kaynak Metin dolu, Hedef Metin boş bırak → Kaydet
- Alert: "Hedef metin boş olamaz."
- Entry kaydedilmez.

---

### EC-4: Duplicate entry

- `Tanaka` zaten varken tekrar `Tanaka` eklemeye çalış
- Alert: `"Tanaka" bu novel'da zaten mevcut.`
- Mevcut entry korunur.

---

### EC-5: CASCADE delete (novel silindiğinde glossary temizlenmeli)

1. Glossary'si olan bir noveli ana ekranda long-press → Sil
2. DB'yi kontrol et (geliştirici konsolunda veya DB browser ile):
   `SELECT * FROM glossary_entries WHERE novelId = {silinen id}` → boş dönmeli
3. `ON DELETE CASCADE` sayesinde manüel temizlik gerekmez.

---

### EC-6: Import — geçersiz JSON

- İçi `[{source: "a"}]` (yanlış alan adı) olan bir `.json` dosyası seç
- Alert: "Dosyada geçerli terim bulunamadı."
- DB değişmez.

---

### EC-7: Placeholder bozulması (fallback restore)

Bu durum üretimde nadiren yaşanır ama yaşanırsa sessizce düzelir.

- `console.warn` logunda `[Glossary] Fallback restore used for entry id=X` görünürse DeepL placeholder içine boşluk eklemiş demektir
- Çeviri yine de doğru sonucu döner
- Unit test'te `"｢ G1 ｣"` → fallback tetiklenir, `console.warn` beklenir (bkz. `glossary.test.ts` satır ~162)

---

## TypeScript Kontrolü

```bash
npx tsc --noEmit
```

Hata olmamalı.
