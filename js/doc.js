/* Dokument-Modell (Rechnung, Storno, Zahlungserinnerung) und HTML-Vorschau im A4-Format.
   Das PDF (pdf.js) wird aus demselben Modell gezeichnet, damit Vorschau und PDF übereinstimmen. */
(function () {
  const eur = n => (Number(n) || 0).toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
  const num = n => (Number(n) || 0).toLocaleString('de-DE', { maximumFractionDigits: 2 });
  const dDE = iso => iso ? iso.split('-').reverse().join('.') : '';
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  function kundeZeilen(k) {
    k = k || {};
    const name = [k.anrede, k.vorname, k.nachname].filter(Boolean).join(' ');
    return [k.firma, name, k.strasse, [k.plz, k.ort].filter(Boolean).join(' '),
      k.land && k.land !== 'Deutschland' ? k.land : ''].filter(s => s && String(s).trim());
  }
  function anrede(k) {
    k = k || {};
    if (k.nachname && k.anrede === 'Herr') return 'Sehr geehrter Herr ' + k.nachname + ',';
    if (k.nachname && k.anrede === 'Frau') return 'Sehr geehrte Frau ' + k.nachname + ',';
    return 'Sehr geehrte Damen und Herren,';
  }

  function modellRechnung(r) {
    const storno = r.typ === 'storno';
    const angaben = [];
    if (r.nummer) angaben.push([storno ? 'Stornonummer' : 'Rechnungsnummer', r.nummer]);
    angaben.push(['Rechnungsdatum', dDE(r.datum)]);
    if (r.leistungszeitraum_bis) angaben.push(['Leistungszeitraum', dDE(r.leistungsdatum) + ' – ' + dDE(r.leistungszeitraum_bis)]);
    else if (r.leistungsdatum) angaben.push(['Leistungsdatum', dDE(r.leistungsdatum)]);
    if (r.kunde_snapshot && r.kunde_snapshot.ust_id) angaben.push(['USt-IdNr. Kunde', r.kunde_snapshot.ust_id]);
    const summen = [];
    if (Number(r.mwst_satz) > 0) {
      summen.push({ l: 'Nettobetrag', v: eur(r.netto) });
      summen.push({ l: 'zzgl. ' + num(r.mwst_satz) + ' % MwSt.', v: eur(r.mwst) });
    }
    summen.push({ l: storno ? 'Gutschriftsbetrag' : 'Gesamtbetrag', v: eur(r.brutto), bold: true });
    const f = r.firma_snapshot;
    return {
      art: storno ? 'storno' : 'rechnung',
      titel: r.entwurf ? 'Rechnung' : storno ? 'Stornorechnung' : 'Rechnung',
      entwurf: !!r.entwurf, firma: f, kunde: r.kunde_snapshot, angaben,
      einleitung: r.einleitung, positionen: (r.rechnung_positionen || []).map(p => ({ ...p, gesamt: p.gesamt ?? Math.round(p.menge * p.einzelpreis * 100) / 100 })),
      summen, hinweis: Number(r.mwst_satz) === 0 && f.kleinunternehmer ? f.hinweis_kleinunternehmer : null,
      schluss: r.schluss, zahlung: storno ? null : { zweck: r.nummer ? 'Rechnung ' + r.nummer : 'Rechnungsnummer' }
    };
  }

  function modellMahnung(r, m) {
    const f = r.firma_snapshot, k = r.kunde_snapshot;
    const titel = (m.stufe > 1 ? m.stufe + '. ' : '') + 'Zahlungserinnerung';
    return {
      art: 'mahnung', titel, entwurf: false, firma: f, kunde: k,
      angaben: [['Rechnungsnummer', r.nummer], ['Rechnungsdatum', dDE(r.datum)], ['Erinnerung vom', dDE(m.datum)], ['Zahlbar bis', dDE(m.frist_bis)]],
      einleitung: anrede(k) + '\n\n' +
        `sicher ist es Ihrer Aufmerksamkeit entgangen: Für unsere Rechnung Nr. ${r.nummer} vom ${dDE(r.datum)} konnten wir bis heute keinen Zahlungseingang feststellen.\n\n` +
        `Bitte überweisen Sie den offenen Betrag bis zum ${dDE(m.frist_bis)} auf das unten genannte Konto. Sollte sich Ihre Zahlung mit diesem Schreiben überschnitten haben, betrachten Sie es bitte als gegenstandslos.`,
      positionen: null,
      summen: [{ l: 'Offener Betrag', v: eur(r.brutto), bold: true }],
      hinweis: null, schluss: null,
      zahlung: { zweck: 'Rechnung ' + r.nummer }
    };
  }

  /* HTML-Seite in pt, gleiche Maße wie das PDF */
  function html(md) {
    const f = md.firma, k = md.kunde || {};
    const zeilen = kundeZeilen(k);
    const ph = t => `<span class="ph">${esc(t)}</span>`;
    const adr = zeilen.length ? zeilen.map(esc).join('<br>') : ph('Kunde wählen');
    const par = t => t ? t.split('\n').map(p => p.trim() === '' ? '<div class="gap"></div>' : `<p>${esc(p)}</p>`).join('') : '';
    const tab = md.positionen ? `<table class="d-table"><thead><tr><th style="width:30pt">Pos.</th><th>Bezeichnung</th><th class="r" style="width:60pt">Menge</th><th class="r" style="width:85pt">Einzelpreis</th><th class="r" style="width:85pt">Gesamt</th></tr></thead><tbody>
      ${md.positionen.length ? md.positionen.map(p => `<tr><td>${p.pos}</td><td>${esc(p.bezeichnung) || ph('Bezeichnung')}${p.beschreibung ? `<div class="d-besch">${esc(p.beschreibung)}</div>` : ''}</td>
        <td class="r">${num(p.menge)}${p.einheit && p.einheit !== 'Stück' ? ' ' + esc(p.einheit) : ''}</td><td class="r">${eur(p.einzelpreis)}</td><td class="r">${eur(p.gesamt)}</td></tr>`).join('')
        : `<tr><td>1</td><td>${ph('Position')}</td><td></td><td></td><td></td></tr>`}</tbody></table>` : '';
    const sum = `<div class="d-sum">${md.summen.map((s, i) => `<div class="${s.bold ? 'b' : ''}${s.bold && i ? ' line' : s.bold ? ' line' : ''}"><span>${esc(s.l)}</span><span>${esc(s.v)}</span></div>`).join('')}</div>`;
    const zahlung = md.zahlung ? `<div class="d-pay"><p class="m">Zahlungsinformationen</p>
      <div class="d-kv"><span>Empfänger</span><span>${esc(f.kontoinhaber)}</span><span>IBAN</span><span>${esc(f.iban)}</span><span>BIC</span><span>${esc(f.bic)}</span><span>Verwendungszweck</span><span>${esc(md.zahlung.zweck)}</span></div></div>` : '';
    return `<div class="page">
      <img class="d-logo" src="img/logo.png" alt="">
      <div class="d-sender">${esc([f.name, f.strasse, f.plz + ' ' + f.ort].join(' · '))}</div>
      <div class="d-addr">${adr}</div>
      <div class="d-meta">${md.angaben.map(([l, v]) => `<span>${esc(l)}</span><b>${esc(v)}</b>`).join('')}</div>
      <div class="d-body">
        <div class="d-title">${esc(md.titel)}</div>
        ${par(md.einleitung)}
        ${tab}
        ${sum}
        ${md.hinweis ? `<p class="d-hint">${esc(md.hinweis)}</p>` : ''}
        ${md.schluss ? `<div class="d-sp"></div><div class="d-schluss">${par(md.schluss)}</div>` : ''}
        ${zahlung ? '<div class="d-sp"></div>' + zahlung : ''}
        <div class="d-sp"></div><div class="d-gruss"><p>Mit freundlichen Grüßen</p><p>${esc(f.inhaber)}</p></div>
      </div>
      ${md.entwurf ? '<div class="d-wm">ENTWURF</div>' : ''}
      <div class="d-foot">
        <div>${[f.name, f.strasse, f.plz + ' ' + f.ort, f.inhaber].map(esc).join('<br>')}</div>
        <div>${['Steuernummer: ' + f.steuernummer, f.ust_id ? 'USt-IdNr.: ' + f.ust_id : '', f.email, [f.web, f.telefon].filter(Boolean).join(' · ')].filter(Boolean).map(esc).join('<br>')}</div>
        <div>${[f.bank, 'IBAN: ' + f.iban, 'BIC: ' + f.bic, 'Kontoinhaber: ' + f.kontoinhaber].map(esc).join('<br>')}</div>
      </div>
    </div>`;
  }

  /* Seite in einen Container einpassen (skaliert) */
  const ro = new ResizeObserver(es => es.forEach(e => fit(e.target)));
  function fit(el) { const pg = el.querySelector('.page'); if (!pg) return; pg.style.transform = `scale(${el.clientWidth / pg.offsetWidth})`; }
  function mount(el, md) { el.innerHTML = html(md); fit(el); ro.observe(el); }

  window.MWDOC = { modellRechnung, modellMahnung, html, mount, kundeZeilen };
})();
