/* Belege auslesen, kostenlos im Browser:
   - PDF mit Text: pdf.js liest den Text direkt
   - Fotos und gescannte PDFs: Texterkennung (Tesseract, Deutsch), wird erst bei Bedarf geladen
   Danach werden Betrag, Datum, Lieferant und Kategorie aus dem Text geraten. Der Nutzer bestätigt immer selbst. */
(function () {
  const BILD = /\.(jpe?g|png|webp)$/i, PDF = /\.pdf$/i, HEIC = /\.(heic|heif)$/i;
  const istBeleg = name => PDF.test(name) || BILD.test(name) || HEIC.test(name);

  function ladeSkript(src) {
    return new Promise((res, rej) => { const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = () => rej(new Error('Konnte ' + src + ' nicht laden')); document.head.appendChild(s); });
  }
  let pdfBereit = null, ocrWorker = null;
  async function pdfjs() {
    if (!pdfBereit) pdfBereit = (async () => {
      if (!window.pdfjsLib) await ladeSkript('vendor/pdf.min.js');
      window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'vendor/pdf.worker.min.js';
      return window.pdfjsLib;
    })();
    return pdfBereit;
  }
  async function ocr(bild) {
    if (!ocrWorker) ocrWorker = (async () => {
      if (!window.Tesseract) await ladeSkript('vendor/ocr/tesseract.min.js');
      const basis = new URL('vendor/ocr/', location.href).href;
      return window.Tesseract.createWorker('deu', 1, { workerPath: basis + 'worker.min.js', corePath: basis + 'core', langPath: basis + 'lang', gzip: true, cacheMethod: 'none' });
    })();
    const w = await ocrWorker;
    const { data } = await w.recognize(bild);
    return data.text || '';
  }

  /* Text aus PDF: Zeilen nach Höhe gruppieren */
  async function pdfText(file) {
    const lib = await pdfjs();
    const doc = await lib.getDocument({ data: await file.arrayBuffer() }).promise;
    let text = '';
    for (let i = 1; i <= Math.min(3, doc.numPages); i++) {
      const page = await doc.getPage(i), tc = await page.getTextContent(), zeilen = new Map();
      tc.items.forEach(it => { if (!it.str.trim()) return; const y = Math.round(it.transform[5] / 3); (zeilen.get(y) || zeilen.set(y, []).get(y)).push(it); });
      text += [...zeilen.entries()].sort((a, b) => b[0] - a[0]).map(([, its]) => its.sort((a, b) => a.transform[4] - b.transform[4]).map(x => x.str).join(' ')).join('\n') + '\n';
    }
    if (text.replace(/\s/g, '').length >= 40) return { text, art: 'pdf' };
    /* gescanntes PDF ohne Text: erste Seite als Bild erkennen */
    const page = await doc.getPage(1), vp = page.getViewport({ scale: 2.2 });
    const c = document.createElement('canvas'); c.width = vp.width; c.height = vp.height;
    await page.render({ canvasContext: c.getContext('2d'), viewport: vp }).promise;
    return { text: await ocr(c), art: 'ocr' };
  }

  async function text(file, name) {
    if (PDF.test(name)) return pdfText(file);
    if (BILD.test(name)) return { text: await ocr(file), art: 'ocr' };
    return { text: '', art: 'keins' };
  }

  /* ---------- Auswerten ---------- */
  const BEKANNT = [
    ['amazon', 'Amazon', 'Technik'], ['adobe', 'Adobe', 'Software'], ['deutsche bahn', 'Deutsche Bahn', 'Fahrtkosten'], ['db fernverkehr', 'Deutsche Bahn', 'Fahrtkosten'], ['bahn.de', 'Deutsche Bahn', 'Fahrtkosten'],
    ['flixbus', 'FlixBus', 'Fahrtkosten'], ['google', 'Google', 'Software'], ['ionos', 'IONOS', 'Software'], ['thomann', 'Thomann', 'Technik'], ['mediamarkt', 'MediaMarkt', 'Technik'], ['media markt', 'MediaMarkt', 'Technik'],
    ['saturn', 'Saturn', 'Technik'], ['apple', 'Apple', 'Technik'], ['calumet', 'Calumet', 'Technik'], ['foto koch', 'Foto Koch', 'Technik'], ['canva', 'Canva', 'Software'], ['meta platforms', 'Meta', 'Werbung'], ['facebook', 'Meta', 'Werbung'],
    ['linkedin', 'LinkedIn', 'Werbung'], ['vistaprint', 'Vistaprint', 'Werbung'], ['flyeralarm', 'Flyeralarm', 'Werbung'], ['anthropic', 'Anthropic', 'Software'], ['openai', 'OpenAI', 'Software'], ['epidemic sound', 'Epidemic Sound', 'Software'],
    ['artlist', 'Artlist', 'Software'], ['shell', 'Shell', 'Fahrtkosten'], ['aral', 'Aral', 'Fahrtkosten'], ['esso', 'Esso', 'Fahrtkosten'], ['total energies', 'TotalEnergies', 'Fahrtkosten'], ['jet tankstelle', 'JET', 'Fahrtkosten'],
    ['rewe', 'Rewe', 'Material'], ['edeka', 'Edeka', 'Material'], ['lidl', 'Lidl', 'Material'], ['aldi', 'Aldi', 'Material'], ['kaufland', 'Kaufland', 'Material'], ['dm-drogerie', 'dm', 'Material'], ['rossmann', 'Rossmann', 'Material'],
    ['obi', 'OBI', 'Material'], ['hornbach', 'Hornbach', 'Material'], ['ikea', 'IKEA', 'Büro'], ['staples', 'Staples', 'Büro'], ['mcdonald', "McDonald's", 'Bewirtung'], ['starbucks', 'Starbucks', 'Bewirtung'], ['uber', 'Uber', 'Fahrtkosten'], ['telekom', 'Telekom', 'Telefon'], ['vodafone', 'Vodafone', 'Telefon']
  ];
  const KAT_WORT = [[/restaurant|pizzeria|ristorante|trattoria|caf[eé]|bistro|gasthaus|brauhaus|bar\b|imbiss|bewirtung|speisen|getränke/i, 'Bewirtung'],
    [/tankstelle|kraftstoff|diesel|super e10|benzin|parkhaus|parken|fahrkarte|ticket|bahncard|taxi/i, 'Fahrtkosten'],
    [/kamera|objektiv|mikrofon|stativ|speicherkarte|sd-karte|akku|ladegerät|kabel|festplatte|ssd|monitor|laptop/i, 'Technik'],
    [/abonnement|subscription|lizenz|license|software|cloud/i, 'Software'], [/anzeige|werbung|ads\b|druck|visitenkarte|flyer/i, 'Werbung']];
  const MON = { januar: 1, jan: 1, februar: 2, feb: 2, märz: 3, maerz: 3, mär: 3, mrz: 3, april: 4, apr: 4, mai: 5, juni: 6, jun: 6, juli: 7, jul: 7, august: 8, aug: 8, september: 9, sep: 9, sept: 9, oktober: 10, okt: 10, november: 11, nov: 11, dezember: 12, dez: 12,
    january: 1, march: 3, may: 5, june: 6, july: 7, october: 10, oct: 10, december: 12, dec: 12 };
  const pad = n => String(n).padStart(2, '0');
  const isoHeute = () => { const d = new Date(); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); };

  function betraege(zeile) {
    const out = [], re = /(?<![\d.,])(\d{1,3}(?:[.\s'’]\d{3})+|\d{1,6})([.,])(\d{2})(?![\d])/g; let m;
    while ((m = re.exec(zeile))) {
      const ganz = m[1].replace(/[.\s'’,]/g, ''), v = parseFloat(ganz + '.' + m[3]);
      if (v > 0 && v < 100000) out.push(v);
    }
    return out;
  }
  function daten(zeile) {
    const out = [];
    let m; const re1 = /(?<!\d)(\d{1,2})\.\s?(\d{1,2})\.\s?(\d{4}|\d{2})(?!\d)/g;
    while ((m = re1.exec(zeile))) out.push([+(m[3].length === 2 ? '20' + m[3] : m[3]), +m[2], +m[1]]);
    const re2 = /(?<!\d)(\d{4})-(\d{2})-(\d{2})(?!\d)/g; while ((m = re2.exec(zeile))) out.push([+m[1], +m[2], +m[3]]);
    const re3 = /(?<!\d)(\d{1,2})\.?\s+([A-Za-zäÄ]{3,9})\.?\s+(\d{4})/g; while ((m = re3.exec(zeile))) { const mo = MON[m[2].toLowerCase()]; if (mo) out.push([+m[3], mo, +m[1]]); }
    const re4 = /([A-Za-z]{3,9})\.?\s+(\d{1,2}),\s+(\d{4})/g; while ((m = re4.exec(zeile))) { const mo = MON[m[1].toLowerCase()]; if (mo) out.push([+m[3], mo, +m[2]]); }
    return out.filter(([y, mo, d]) => mo >= 1 && mo <= 12 && d >= 1 && d <= 31).map(([y, mo, d]) => y + '-' + pad(mo) + '-' + pad(d))
      .filter(iso => iso >= '2024-01-01' && iso <= isoHeute());
  }

  function auswerten(text, dateiname, geaendert) {
    const zeilen = String(text || '').split(/\n/).map(z => z.replace(/\s+/g, ' ').trim()).filter(Boolean);
    const klein = zeilen.join('\n').toLowerCase();
    const r = { betrag: null, datum: null, lieferant: '', kategorie: '', beschreibung: '' };

    /* Betrag: zuerst Zeilen mit „Gesamt“, „Summe“, „zu zahlen“ … */
    const STARK = /(gesamtbetrag|rechnungsbetrag|endbetrag|zu zahlen|zahlbetrag|gesamtsumme|summe brutto|bruttobetrag|amount due|grand total|total\b|gesamt\b|summe eur|summe €|^summe\b)/i;
    const MITTEL = /(summe|betrag|brutto|ec-?karte|kartenzahlung|girocard|visa|mastercard|maestro|paypal|bezahlt|bar\b)/i;
    const NEIN = /(netto|mwst|ust|steuer|zwischensumme|rabatt|rückgeld|rueckgeld|wechselgeld|gegeben|vat\b|tax\b|ohne)/i;
    for (const [stufe, re] of [[3, STARK], [2, MITTEL]]) {
      let kand = [];
      zeilen.forEach((z, i) => { if (re.test(z) && !NEIN.test(z)) { let b = betraege(z); if (!b.length && zeilen[i + 1]) b = betraege(zeilen[i + 1]); kand = kand.concat(b); } });
      if (kand.length) { r.betrag = Math.max(...kand); r.sicherBetrag = stufe === 3; break; }
    }
    if (r.betrag == null) {
      const mitEur = zeilen.filter(z => /€|eur\b/i.test(z) && !NEIN.test(z)).flatMap(betraege);
      const alle = mitEur.length ? mitEur : zeilen.filter(z => !NEIN.test(z)).flatMap(betraege);
      if (alle.length) r.betrag = Math.max(...alle);
    }

    /* Datum: bevorzugt neben „Rechnungsdatum“, „Datum“ */
    const dz = zeilen.filter(z => /(rechnungsdatum|belegdatum|leistungsdatum|datum|date|invoice date)/i.test(z)).flatMap(daten);
    const alleD = zeilen.flatMap(daten);
    r.datum = dz[0] || alleD[0] || null;
    if (!r.datum && geaendert) { const d = new Date(geaendert); r.datum = d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }

    /* Lieferant */
    const treffer = BEKANNT.find(([k]) => klein.includes(k));
    if (treffer) { r.lieferant = treffer[1]; r.kategorie = treffer[2]; }
    else {
      const ausDatei = String(dateiname || '').replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').replace(/\d{4}\s?\d{2}\s?\d{2}|\d+([.,]\d+)?/g, ' ').replace(/\s+/g, ' ').trim();
      if (ausDatei.length >= 3 && !/^(img|scan|scanned|dokument|document|rechnung|beleg|foto|photo|pxl|dsc|whatsapp image|screenshot|unbenannt|untitled)\b/i.test(ausDatei)) r.lieferant = ausDatei.slice(0, 40);
      else {
        const z = zeilen.slice(0, 8).find(z => /[A-Za-zÄÖÜäöü]{3,}/.test(z) && z.length <= 45 && !/(rechnung|quittung|beleg|kassenbon|mediawo|olbrich|wunderlich|seite|page|invoice|datum|tel|www|@)/i.test(z));
        if (z) r.lieferant = z.replace(/[^\wÄÖÜäöüß&.,' -]/g, '').trim().slice(0, 40);
      }
    }
    if (!r.kategorie) { const k = KAT_WORT.find(([re]) => re.test(klein)); r.kategorie = k ? k[1] : ''; }
    return r;
  }

  window.MWBELEG = { istBeleg, istBild: n => BILD.test(n), istPdf: n => PDF.test(n), istHeic: n => HEIC.test(n), text, auswerten,
    async lesen(file, name) {
      try { const t = await text(file, name || file.name); return { ...auswerten(t.text, name || file.name, file.lastModified), art: t.art, rohtext: t.text }; }
      catch (e) { console.warn('Beleg lesen', e); return { ...auswerten('', name || file.name, file.lastModified), art: 'fehler' }; }
    } };
})();
