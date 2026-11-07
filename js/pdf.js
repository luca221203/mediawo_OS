/* Rechnungs-PDF im Mediawo-Layout (weißes Papier, Logo, Poppins) */
(function () {
  const RED = '#E84344', INK = '#111111', GREY = '#6B6B6B', LINE = '#DDDDDD', HEAD = '#F4F4F4';
  const PW = 595.28, PH = 841.89, X = 56, W = PW - 2 * X, FOOT_Y = 772, LIMIT = 735;

  const eur = n => (Number(n) || 0).toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
  const num = n => (Number(n) || 0).toLocaleString('de-DE', { maximumFractionDigits: 2 });
  const dDE = iso => iso ? iso.split('-').reverse().join('.') : '';

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

  function kundeZeilen(k) {
    const name = [k.anrede, k.vorname, k.nachname].filter(Boolean).join(' ');
    return [k.firma, name, k.strasse, [k.plz, k.ort].filter(Boolean).join(' '),
      k.land && k.land !== 'Deutschland' ? k.land : ''].filter(s => s && s.trim());
  }

  /* r: Rechnung (wie aus der DB, mit rechnung_positionen) oder Entwurf mit entwurf:true */
  async function rechnungPdf(r) {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ unit: 'pt', format: 'a4', compress: true });
    const F = window.PDF_FONTS;
    doc.addFileToVFS('PL.ttf', F.light); doc.addFont('PL.ttf', 'PL', 'normal');
    doc.addFileToVFS('PM.ttf', F.medium); doc.addFont('PM.ttf', 'PM', 'normal');
    const font = (w, size, color) => { doc.setFont(w === 'm' ? 'PM' : 'PL', 'normal'); doc.setFontSize(size); doc.setTextColor(color || INK); };
    const f = r.firma_snapshot, k = r.kunde_snapshot || {};
    const storno = r.typ === 'storno';
    const titel = r.entwurf ? 'Rechnung (Entwurf)' : storno ? 'Stornorechnung' : 'Rechnung';
    doc.setProperties({ title: titel + ' ' + (r.nummer || ''), author: f.name, creator: 'Mediawo OS' });

    const logo = await loadLogo();
    function kopf() {
      if (logo) { const lw = 150; doc.addImage(logo.data, 'PNG', X, 46, lw, lw * logo.h / logo.w, undefined, 'FAST'); }
    }
    function fuss() {
      doc.setDrawColor(RED); doc.setLineWidth(0.8); doc.line(X, FOOT_Y - 12, X + W, FOOT_Y - 12);
      font('l', 7.2, GREY);
      const cols = [
        [f.name, f.strasse, f.plz + ' ' + f.ort, f.inhaber],
        ['Steuernummer: ' + f.steuernummer, f.ust_id ? 'USt-IdNr.: ' + f.ust_id : '', f.email, [f.web, f.telefon].filter(Boolean).join(' · ')],
        [f.bank, 'IBAN: ' + f.iban, 'BIC: ' + f.bic, 'Kontoinhaber: ' + f.kontoinhaber]
      ];
      const cw = W / 3;
      cols.forEach((c, i) => c.filter(Boolean).forEach((t, j) => doc.text(String(t), X + i * cw, FOOT_Y + j * 10)));
    }

    kopf();
    let y = 132;
    font('l', 7.2, GREY);
    doc.text([f.name, f.strasse, f.plz + ' ' + f.ort].join(' · '), X, y);
    y += 18;
    font('l', 10.5);
    kundeZeilen(k).forEach((z, i) => doc.text(z, X, y + i * 14.5));

    // Angaben rechts
    const lx = 350, vx = PW - X;
    const angaben = [];
    if (r.nummer) angaben.push([storno ? 'Stornonummer' : 'Rechnungsnummer', r.nummer]);
    angaben.push(['Rechnungsdatum', dDE(r.datum)]);
    if (r.leistungszeitraum_bis) angaben.push(['Leistungszeitraum', dDE(r.leistungsdatum) + ' – ' + dDE(r.leistungszeitraum_bis)]);
    else if (r.leistungsdatum) angaben.push(['Leistungsdatum', dDE(r.leistungsdatum)]);
    if (k.ust_id) angaben.push(['USt-IdNr. Kunde', k.ust_id]);
    angaben.forEach(([l, v], i) => {
      font('l', 9, GREY); doc.text(l, lx, y + i * 14.5);
      font('m', 9); doc.text(String(v), vx, y + i * 14.5, { align: 'right' });
    });

    y = 268;
    font('m', 19); doc.text(titel, X, y);
    doc.setDrawColor(RED); doc.setLineWidth(2); doc.line(X, y + 9, X + 34, y + 9);
    y += 34;

    function absatz(text, size = 10, color) {
      if (!text) return;
      font('l', size, color);
      text.split('\n').forEach(par => {
        if (par.trim() === '') { y += size * 0.8; return; }
        doc.splitTextToSize(par, W).forEach(line => { neueSeiteWennNoetig(size * 1.5); doc.text(line, X, y); y += size * 1.5; });
      });
    }

    let seiteNeu = false;
    function neueSeiteWennNoetig(h) {
      if (y + h <= LIMIT) return false;
      doc.addPage(); kopf(); y = 120; seiteNeu = true; return true;
    }

    absatz(r.einleitung);
    y += 10;

    // Tabelle
    const cols = [{ t: 'Pos.', w: 30, a: 'left' }, { t: 'Bezeichnung', w: W - 30 - 60 - 85 - 85, a: 'left' },
      { t: 'Menge', w: 60, a: 'right' }, { t: 'Einzelpreis', w: 85, a: 'right' }, { t: 'Gesamt', w: 85, a: 'right' }];
    const cx = []; cols.reduce((a, c) => { cx.push(a); return a + c.w; }, X);
    function tabKopf() {
      doc.setFillColor(HEAD); doc.rect(X, y, W, 20, 'F');
      font('m', 8.5);
      cols.forEach((c, i) => doc.text(c.t, c.a === 'right' ? cx[i] + c.w - 6 : cx[i] + 6, y + 13.5, { align: c.a }));
      y += 20;
    }
    tabKopf();
    (r.rechnung_positionen || []).forEach(p => {
      font('l', 9.5);
      const bez = doc.splitTextToSize(p.bezeichnung || '', cols[1].w - 12);
      font('l', 8.5);
      const besch = p.beschreibung ? doc.splitTextToSize(p.beschreibung, cols[1].w - 12) : [];
      const h = 10 + bez.length * 13 + besch.length * 11.5 + 4;
      if (neueSeiteWennNoetig(h)) tabKopf();
      const ty = y + 15;
      font('l', 9.5);
      doc.text(String(p.pos), cx[0] + 6, ty);
      doc.text(bez, cx[1] + 6, ty, { lineHeightFactor: 1.37 });
      if (besch.length) { font('l', 8.5, GREY); doc.text(besch, cx[1] + 6, ty + bez.length * 13, { lineHeightFactor: 1.35 }); font('l', 9.5); }
      doc.text(num(p.menge) + (p.einheit && p.einheit !== 'Stück' ? ' ' + p.einheit : ''), cx[2] + cols[2].w - 6, ty, { align: 'right' });
      doc.text(eur(p.einzelpreis), cx[3] + cols[3].w - 6, ty, { align: 'right' });
      doc.text(eur(p.gesamt ?? p.menge * p.einzelpreis), cx[4] + cols[4].w - 6, ty, { align: 'right' });
      y += h;
      doc.setDrawColor(LINE); doc.setLineWidth(0.5); doc.line(X, y, X + W, y);
    });

    // Summen
    neueSeiteWennNoetig(70);
    y += 16;
    const sx = X + W - 230, ex = X + W - 6;
    const zeile = (l, v, bold) => { font(bold ? 'm' : 'l', bold ? 10.5 : 9.5); doc.text(l, sx, y); doc.text(v, ex, y, { align: 'right' }); y += 16; };
    if (Number(r.mwst_satz) > 0) {
      zeile('Nettobetrag', eur(r.netto));
      zeile('zzgl. ' + num(r.mwst_satz) + ' % MwSt.', eur(r.mwst));
    }
    doc.setDrawColor(INK); doc.setLineWidth(0.8); doc.line(sx, y - 11, X + W, y - 11);
    y += 3;
    zeile(storno ? 'Gutschriftsbetrag' : 'Gesamtbetrag', eur(r.brutto), true);
    y += 6;
    if (Number(r.mwst_satz) === 0 && f.kleinunternehmer) { absatz(f.hinweis_kleinunternehmer, 9, GREY); }
    y += 12;

    absatz(r.schluss);
    if (!storno) {
      y += 8; neueSeiteWennNoetig(70);
      font('m', 9.5); doc.text('Zahlungsinformationen', X, y); y += 15;
      font('l', 9.5);
      [['Empfänger', f.kontoinhaber], ['IBAN', f.iban], ['BIC', f.bic], ['Verwendungszweck', r.nummer ? 'Rechnung ' + r.nummer : 'Rechnungsnummer']]
        .forEach(([l, v]) => { doc.setTextColor(GREY); doc.text(l, X, y); doc.setTextColor(INK); doc.text(String(v), X + 105, y); y += 14; });
      y += 4;
    }
    y += 14; neueSeiteWennNoetig(45);
    absatz('Mit freundlichen Grüßen');
    y += 4;
    absatz(f.inhaber);

    if (r.entwurf) {
      const n = doc.getNumberOfPages();
      for (let i = 1; i <= n; i++) { doc.setPage(i); font('m', 70, '#F1C9CA'); doc.text('ENTWURF', PW / 2, PH / 2, { align: 'center', angle: 30 }); }
    }
    const n = doc.getNumberOfPages();
    for (let i = 1; i <= n; i++) {
      doc.setPage(i); fuss();
      if (n > 1) { font('l', 7.2, GREY); doc.text('Seite ' + i + ' von ' + n, PW - X, 60, { align: 'right' }); }
    }
    return doc;
  }

  window.MWPDF = {
    async rechnung(r) { return rechnungPdf(r); },
    dateiname(r) {
      const k = r.kunde_snapshot || {};
      const name = (k.firma || [k.vorname, k.nachname].filter(Boolean).join(' ') || 'Kunde').replace(/[^\wäöüÄÖÜß-]+/g, '_').replace(/_+/g, '_').slice(0, 40);
      return (r.typ === 'storno' ? 'Stornorechnung_' : 'Rechnung_') + (r.nummer || 'Entwurf').replace(/[^\w-]/g, '_') + '_' + name + '.pdf';
    }
  };
})();
