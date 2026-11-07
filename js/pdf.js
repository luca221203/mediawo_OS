/* PDF aus dem Dokument-Modell (doc.js): weißes Papier, Logo, Poppins */
(function () {
  const C = () => window.MW_THEME || {};
  const PW = 595.28, PH = 841.89, X = 56, W = PW - 2 * X, FOOT_Y = 772, LIMIT = 735;
  const eur = n => (Number(n) || 0).toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
  const num = n => (Number(n) || 0).toLocaleString('de-DE', { maximumFractionDigits: 2 });

  let logoCache = null;
  function loadLogo() {
    if (logoCache) return Promise.resolve(logoCache);
    return new Promise(res => {
      const img = new Image();
      img.onload = () => {
        const c = document.createElement('canvas'); c.width = img.naturalWidth; c.height = img.naturalHeight;
        c.getContext('2d').drawImage(img, 0, 0);
        logoCache = { data: c.toDataURL('image/png'), w: img.naturalWidth, h: img.naturalHeight }; res(logoCache);
      };
      img.onerror = () => res(null);
      img.src = 'img/logo.png';
    });
  }

  async function zeichnen(md) {
    const ACC = C().akzent || '#E84344', INK = C().text || '#111111', GREY = '#6B6B6B', LINE = '#DDDDDD', HEAD = C().tabelleKopf || '#F4F4F4';
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ unit: 'pt', format: 'a4', compress: true });
    const F = window.PDF_FONTS;
    doc.addFileToVFS('PL.ttf', F.light); doc.addFont('PL.ttf', 'PL', 'normal');
    doc.addFileToVFS('PM.ttf', F.medium); doc.addFont('PM.ttf', 'PM', 'normal');
    const font = (w, size, color) => { doc.setFont(w === 'm' ? 'PM' : 'PL', 'normal'); doc.setFontSize(size); doc.setTextColor(color || INK); };
    const f = md.firma;
    doc.setProperties({ title: md.titel + ' ' + (md.angaben[0] ? md.angaben[0][1] : ''), author: f.name, creator: 'Mediawo OS' });

    const logo = await loadLogo();
    const kopf = () => { if (logo) { const lw = 150; doc.addImage(logo.data, 'PNG', X, 46, lw, lw * logo.h / logo.w, undefined, 'FAST'); } };
    function fuss() {
      doc.setDrawColor(ACC); doc.setLineWidth(0.8); doc.line(X, FOOT_Y - 12, X + W, FOOT_Y - 12);
      font('l', 7.2, GREY);
      const cols = [
        [f.name, f.strasse, f.plz + ' ' + f.ort, f.inhaber],
        ['Steuernummer: ' + f.steuernummer, f.ust_id ? 'USt-IdNr.: ' + f.ust_id : '', f.email, [f.web, f.telefon].filter(Boolean).join(' · ')],
        [f.bank, 'IBAN: ' + f.iban, 'BIC: ' + f.bic, 'Kontoinhaber: ' + f.kontoinhaber]
      ];
      cols.forEach((c, i) => c.filter(Boolean).forEach((t, j) => doc.text(String(t), X + i * W / 3, FOOT_Y + j * 10)));
    }

    kopf();
    let y = 132;
    font('l', 7.2, GREY); doc.text([f.name, f.strasse, f.plz + ' ' + f.ort].join(' · '), X, y);
    y += 18;
    font('l', 10.5); MWDOC.kundeZeilen(md.kunde).forEach((z, i) => doc.text(z, X, y + i * 14.5));
    md.angaben.forEach(([l, v], i) => {
      font('l', 9, GREY); doc.text(l, 350, y + i * 14.5);
      font('m', 9); doc.text(String(v), PW - X, y + i * 14.5, { align: 'right' });
    });

    y = 268;
    font('m', 19); doc.text(md.titel, X, y);
    doc.setDrawColor(ACC); doc.setLineWidth(2); doc.line(X, y + 9, X + 34, y + 9);
    y += 34;

    const neueSeite = h => { if (y + h <= LIMIT) return false; doc.addPage(); kopf(); y = 120; return true; };
    function absatz(text, size = 10, color) {
      if (!text) return;
      font('l', size, color);
      text.split('\n').forEach(p => {
        if (p.trim() === '') { y += size * 0.8; return; }
        doc.splitTextToSize(p, W).forEach(line => { neueSeite(size * 1.5); doc.text(line, X, y); y += size * 1.5; });
      });
    }

    absatz(md.einleitung);
    y += 10;

    if (md.positionen) {
      const cols = [{ t: 'Pos.', w: 30, a: 'left' }, { t: 'Bezeichnung', w: W - 30 - 60 - 85 - 85, a: 'left' },
        { t: 'Menge', w: 60, a: 'right' }, { t: 'Einzelpreis', w: 85, a: 'right' }, { t: 'Gesamt', w: 85, a: 'right' }];
      const cx = []; cols.reduce((a, c) => { cx.push(a); return a + c.w; }, X);
      const tabKopf = () => {
        doc.setFillColor(HEAD); doc.rect(X, y, W, 20, 'F'); font('m', 8.5);
        cols.forEach((c, i) => doc.text(c.t, c.a === 'right' ? cx[i] + c.w - 6 : cx[i] + 6, y + 13.5, { align: c.a }));
        y += 20;
      };
      tabKopf();
      md.positionen.forEach(p => {
        font('l', 9.5); const bez = doc.splitTextToSize(p.bezeichnung || '', cols[1].w - 12);
        font('l', 8.5); const besch = p.beschreibung ? doc.splitTextToSize(p.beschreibung, cols[1].w - 12) : [];
        const h = 10 + bez.length * 13 + besch.length * 11.5 + 4;
        if (neueSeite(h)) tabKopf();
        const ty = y + 15;
        font('l', 9.5);
        doc.text(String(p.pos), cx[0] + 6, ty);
        doc.text(bez, cx[1] + 6, ty, { lineHeightFactor: 1.37 });
        if (besch.length) { font('l', 8.5, GREY); doc.text(besch, cx[1] + 6, ty + bez.length * 13, { lineHeightFactor: 1.35 }); font('l', 9.5); }
        doc.text(num(p.menge) + (p.einheit && p.einheit !== 'Stück' ? ' ' + p.einheit : ''), cx[2] + cols[2].w - 6, ty, { align: 'right' });
        doc.text(eur(p.einzelpreis), cx[3] + cols[3].w - 6, ty, { align: 'right' });
        doc.text(eur(p.gesamt), cx[4] + cols[4].w - 6, ty, { align: 'right' });
        y += h; doc.setDrawColor(LINE); doc.setLineWidth(0.5); doc.line(X, y, X + W, y);
      });
    }

    neueSeite(70);
    y += 16;
    const sx = X + W - 230, ex = X + W - 6;
    md.summen.forEach(s => {
      if (s.bold) { doc.setDrawColor(INK); doc.setLineWidth(0.8); doc.line(sx, y - 11, X + W, y - 11); y += 3; }
      font(s.bold ? 'm' : 'l', s.bold ? 10.5 : 9.5); doc.text(s.l, sx, y); doc.text(s.v, ex, y, { align: 'right' }); y += 16;
    });
    y += 6;
    if (md.hinweis) absatz(md.hinweis, 9, GREY);

    /* Unteres Drittel: Schlusstext, Zahlungsinformationen und Gruß gleichmäßig bis zur Fußzeile verteilen */
    font('l', 10);
    const schlussZeilen = md.schluss ? md.schluss.split('\n').reduce((n, p) => n + (p.trim() ? doc.splitTextToSize(p, W).length : 0.55), 0) : 0;
    const bloecke = [];
    if (md.schluss) bloecke.push({ h: schlussZeilen * 15, zeichne: () => absatz(md.schluss) });
    if (md.zahlung) bloecke.push({ h: 15 + 4 * 14, zeichne: () => {
      font('m', 9.5); doc.text('Zahlungsinformationen', X, y); y += 15;
      font('l', 9.5);
      [['Empfänger', f.kontoinhaber], ['IBAN', f.iban], ['BIC', f.bic], ['Verwendungszweck', md.zahlung.zweck]]
        .forEach(([l, v]) => { doc.setTextColor(GREY); doc.text(l, X, y); doc.setTextColor(INK); doc.text(String(v), X + 105, y); y += 14; });
    } });
    bloecke.push({ h: 15 + 4 + 15, zeichne: () => { absatz('Mit freundlichen Grüßen'); y += 4; absatz(f.inhaber); } });
    const frei = LIMIT - 10 - y - bloecke.reduce((a, b) => a + b.h, 0);
    const luecke = Math.max(18, Math.min(48, frei / bloecke.length));
    bloecke.forEach(b => { y += luecke; neueSeite(b.h); b.zeichne(); });

    const n = doc.getNumberOfPages();
    for (let i = 1; i <= n; i++) {
      doc.setPage(i);
      if (md.entwurf) { font('m', 70, '#F1C9CA'); doc.text('ENTWURF', PW / 2, PH / 2, { align: 'center', angle: 30 }); }
      fuss();
      if (n > 1) { font('l', 7.2, GREY); doc.text('Seite ' + i + ' von ' + n, PW - X, 60, { align: 'right' }); }
    }
    return doc;
  }

  function safe(s) {
    return String(s || '').replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/Ä/g, 'Ae').replace(/Ö/g, 'Oe').replace(/Ü/g, 'Ue').replace(/ß/g, 'ss')
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^\x20-\x7E]/g, '').replace(/[\/\\:*?"<>|.,;'`´&]+/g, ' ').trim().replace(/\s+/g, '_').replace(/_+/g, '_').slice(0, 40).replace(/^_+|_+$/g, '') || 'Kunde';
  }
  function kundeKurz(k) { k = k || {}; return safe(k.firma || [k.vorname, k.nachname].filter(Boolean).join(' ') || 'Kunde'); }

  window.MWPDF = {
    zeichnen,
    async blob(md) { return (await zeichnen(md)).output('blob'); },
    /* Dateiname und Jahresordner für die Ablage: <PDF-Ordner>/<Jahr>/<Datei> */
    datei(art, r, m) {
      const jahr = (m ? m.datum : r.datum).slice(0, 4);
      if (art === 'mahnung') return { jahr, name: `Zahlungserinnerung_${m.stufe}_${String(r.nummer).replace(/[^0-9A-Za-z-]/g, '')}_${kundeKurz(r.kunde_snapshot)}.pdf` };
      if (art === 'storno') return { jahr, name: `Stornorechnung_${String(r.nummer).replace(/[^0-9A-Za-z-]/g, '')}_${kundeKurz(r.kunde_snapshot)}.pdf` };
      return { jahr, name: `Rechnung_${String(r.nummer || 'Entwurf').replace(/[^0-9A-Za-z-]/g, '')}_${kundeKurz(r.kunde_snapshot)}.pdf` };
    }
  };
})();
