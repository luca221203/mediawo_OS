/* Mediawo OS – Oberfläche */
(function () {
  const C = window.MW_CONFIG, DB = window.DB;
  const $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)];
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const eur = n => (Number(n) || 0).toLocaleString('de-DE', { style: 'currency', currency: 'EUR' });
  const dDE = iso => iso ? iso.split('-').reverse().join('.') : '';
  const today = () => { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
  const addDays = (iso, n) => { const d = new Date(iso + 'T12:00:00'); d.setDate(d.getDate() + Number(n)); return d.toISOString().slice(0, 10); };
  const r2 = n => Math.round((Number(n) || 0) * 100) / 100;
  function num(v) { if (typeof v === 'number') return v; let s = String(v ?? '').trim().replace(/\s|€/g, ''); if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.'); const n = parseFloat(s); return isNaN(n) ? 0 : n; }
  const numIn = n => (Number(n) || 0).toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: false });

  const S = { firma: null, kunden: [], leistungen: [], rechnungen: [], view: 'start', draft: null, filter: { jahr: 'alle', status: 'alle' } };

  /* ---------- Hilfen ---------- */
  function toast(msg, err) { const t = $('#toast'); t.textContent = msg; t.className = err ? 'show err' : 'show'; clearTimeout(t._t); t._t = setTimeout(() => t.className = '', err ? 6000 : 2600); }
  function kundeName(k) { if (!k) return '–'; const p = [k.vorname, k.nachname].filter(Boolean).join(' '); return k.firma ? (k.firma + (p ? ' (' + p + ')' : '')) : (p || 'Ohne Namen'); }
  function status(r) {
    if (r.typ === 'storno') return 'storno';
    if (r.status === 'storniert') return 'storniert';
    if (r.status === 'bezahlt') return 'bezahlt';
    return r.faellig_am < today() ? 'ueberfaellig' : 'offen';
  }
  const STATUS_TXT = { offen: 'Offen', ueberfaellig: 'Überfällig', bezahlt: 'Bezahlt', storniert: 'Storniert', storno: 'Storno' };
  const badge = s => `<span class="badge b-${s}">${STATUS_TXT[s]}</span>`;

  const dlg = $('#dlg');
  function openDlg(html) { dlg.innerHTML = html; dlg.showModal(); return dlg; }
  function closeDlg() { dlg.close(); dlg.innerHTML = ''; }
  function confirmDlg(titel, text, ok = 'Bestätigen', danger) {
    return new Promise(res => {
      openDlg(`<h2>${esc(titel)}</h2><p class="sub">${text}</p><div class="actions"><button class="btn" data-x="no">Abbrechen</button><button class="btn ${danger ? 'primary' : 'primary'}" data-x="yes">${esc(ok)}</button></div>`);
      dlg.querySelector('[data-x=no]').onclick = () => { closeDlg(); res(false); };
      dlg.querySelector('[data-x=yes]').onclick = () => { closeDlg(); res(true); };
      dlg.oncancel = () => res(false);
    });
  }
  async function guard(fn, okMsg) {
    try { const r = await fn(); if (okMsg) toast(okMsg); return r; }
    catch (e) { console.error(e); toast(fehlerText(e), true); }
  }
  function fehlerText(e) {
    const m = e && e.message || String(e);
    if (/JWT|session|not authenticated/i.test(m)) return 'Sitzung abgelaufen. Bitte neu anmelden.';
    if (/Failed to fetch|NetworkError/i.test(m)) return 'Keine Verbindung zur Datenbank. Internet prüfen.';
    return m;
  }

  async function laden() {
    const [firma, kunden, leistungen, rechnungen] = await Promise.all([DB.getFirma(), DB.listKunden(), DB.listLeistungen(), DB.listRechnungen()]);
    Object.assign(S, { firma, kunden, leistungen, rechnungen });
  }

  /* ---------- Login ---------- */
  let aktuellerNutzer = null;
  async function zeigeApp(session) {
    if (!session) { aktuellerNutzer = null; $('#app').hidden = true; $('#login').hidden = false; return; }
    if (aktuellerNutzer === session.user.email && !$('#app').hidden) { linkPruefen(); return; }
    aktuellerNutzer = session.user.email;
    $('#login').hidden = true; $('#app').hidden = false;
    $('#userMail').textContent = session.user.email;
    $('#demoBadge').hidden = !DB.demo;
    await guard(laden);
    go(S.view);
    linkPruefen();
  }
  function linkPruefen() {
    const typ = DB.linkTyp && DB.linkTyp();
    if (typ === 'invite' || typ === 'recovery' || typ === 'signup') passwortDlg(true);
  }
  function passwortDlg(pflicht) {
    openDlg(`<form id="pwf"><h2>${pflicht ? 'Passwort festlegen' : 'Passwort ändern'}</h2>
      <p class="sub">${pflicht ? 'Lege jetzt dein Passwort fest. Damit meldest du dich künftig an.' : 'Mindestens 8 Zeichen.'}</p>
      <div class="stack" style="gap:12px;margin-top:16px">
        <label class="f">Neues Passwort<input type="password" name="p1" autocomplete="new-password" minlength="8" required></label>
        <label class="f">Passwort wiederholen<input type="password" name="p2" autocomplete="new-password" minlength="8" required></label>
      </div>
      <div class="actions">${pflicht ? '' : '<button type="button" class="btn" data-x>Abbrechen</button>'}<button class="btn primary">Speichern</button></div></form>`);
    const x = dlg.querySelector('[data-x]'); if (x) x.onclick = closeDlg;
    dlg.oncancel = e => { if (pflicht) e.preventDefault(); };
    $('#pwf').onsubmit = async e => {
      e.preventDefault(); const fd = new FormData(e.target);
      if (fd.get('p1') !== fd.get('p2')) { toast('Die Passwörter stimmen nicht überein.', true); return; }
      const ok = await guard(async () => { await DB.passwortSetzen(fd.get('p1')); return true; }, 'Passwort gespeichert');
      if (ok) { dlg.oncancel = null; closeDlg(); }
    };
  }
  $('#pwChange').onclick = () => passwortDlg(false);
  $('#pwForgot').onclick = async () => {
    const email = $('#loginForm [name=email]').value.trim();
    if (!email) { $('#loginErr').textContent = 'Bitte zuerst deine E-Mail-Adresse eintragen.'; return; }
    try { await DB.passwortVergessen(email); $('#loginErr').textContent = ''; toast('Link zum Zurücksetzen wurde an ' + email + ' geschickt.'); }
    catch (err) { $('#loginErr').textContent = fehlerText(err); }
  };
  $('#loginForm').onsubmit = async e => {
    e.preventDefault();
    const fd = new FormData(e.target); $('#loginErr').textContent = '';
    try { await DB.login(fd.get('email').trim(), fd.get('password')); }
    catch (err) { $('#loginErr').textContent = /invalid/i.test(err.message) ? 'E-Mail oder Passwort falsch.' : fehlerText(err); }
  };
  $('#logout').onclick = () => DB.logout();

  /* ---------- Navigation ---------- */
  $('#nav').onclick = e => { const b = e.target.closest('button[data-view]'); if (b) go(b.dataset.view); };
  function go(v) {
    S.view = v;
    $('#main').onclick = null;
    $$('#nav button').forEach(b => { if (b.dataset.view === v) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current'); });
    ({ start: viewStart, rechnungen: viewRechnungen, neu: viewNeu, kunden: viewKunden, leistungen: viewLeistungen, einstellungen: viewFirma })[v]();
    $('#main').focus({ preventScroll: true }); window.scrollTo(0, 0);
  }

  /* ---------- Übersicht ---------- */
  function viewStart() {
    const j = String(new Date().getFullYear());
    const imJahr = S.rechnungen.filter(r => r.datum.startsWith(j));
    const umsatz = r2(imJahr.reduce((a, r) => a + Number(r.brutto), 0));
    const eingang = r2(S.rechnungen.filter(r => r.typ === 'rechnung' && r.status === 'bezahlt' && (r.bezahlt_am || '').startsWith(j)).reduce((a, r) => a + Number(r.brutto), 0));
    const offen = S.rechnungen.filter(r => r.typ === 'rechnung' && r.status === 'offen');
    const offenSum = r2(offen.reduce((a, r) => a + Number(r.brutto), 0));
    const ueber = offen.filter(r => status(r) === 'ueberfaellig');
    const pct = Math.min(100, umsatz / C.grenzeVorjahr * 100);
    const cls = pct >= 90 ? 'crit' : pct >= 70 ? 'warn' : '';
    const rest = C.grenzeVorjahr - umsatz;
    $('#main').innerHTML = `
      <div class="head"><div><h1>Übersicht</h1><p class="sub">${esc(S.firma.marke)} · ${j}</p></div>
        <button class="btn primary" data-go="neu">Neue Rechnung</button></div>
      <div class="kpis">
        <div class="kpi"><small>Rechnungsumsatz ${j}</small><strong>${eur(umsatz)}</strong><span>${imJahr.filter(r => r.typ === 'rechnung').length} Rechnungen</span></div>
        <div class="kpi"><small>Bezahlt eingegangen ${j}</small><strong>${eur(eingang)}</strong></div>
        <div class="kpi"><small>Offen</small><strong>${eur(offenSum)}</strong><span>${offen.length} Rechnungen${ueber.length ? `, <b style="color:var(--red-dark)">${ueber.length} überfällig</b>` : ''}</span></div>
        <div class="kpi"><small>Kleinunternehmergrenze</small><div class="bar ${cls}"><i style="width:${pct}%"></i></div>
          <span>${rest > 0 ? `noch ${eur(rest)} bis ${eur(C.grenzeVorjahr)}` : `<b style="color:var(--red-dark)">${eur(C.grenzeVorjahr)} überschritten</b>`}</span></div>
      </div>
      ${rest <= C.grenzeVorjahr * 0.3 ? `<div class="panel" style="margin-bottom:24px;border-color:var(--warn)"><b>Hinweis:</b> Liegt der Umsatz ${j} über ${eur(C.grenzeVorjahr)}, gilt ab 1. Januar ${+j + 1} die Kleinunternehmerregelung nicht mehr. Über ${eur(C.grenzeLaufend)} im laufenden Jahr endet sie sofort. Rechtzeitig mit Steuerberater klären und den Wechsel zu lexoffice planen.</div>` : ''}
      <div class="panel"><h2>Offene Rechnungen</h2>${offen.length ? rechnungTabelle([...offen].sort((a, b) => a.faellig_am.localeCompare(b.faellig_am))) : '<p class="empty">Keine offenen Rechnungen.</p>'}</div>`;
    bindRechnungAktionen();
    $('[data-go=neu]').onclick = () => go('neu');
  }

  /* ---------- Rechnungen ---------- */
  function rechnungTabelle(list) {
    return `<div class="table-wrap"><table class="list"><thead><tr><th>Nummer</th><th>Datum</th><th>Kunde</th><th class="num">Betrag</th><th>Status</th><th>Fällig / bezahlt</th><th></th></tr></thead><tbody>
      ${list.map(r => {
        const s = status(r);
        const A = (a, l, c = '') => `<button class="btn link small ${c}" data-act="${a}" data-id="${r.id}">${l}</button>`;
        let akt = A('pdf', 'PDF');
        if (s === 'offen' || s === 'ueberfaellig') akt += A('paid', 'Bezahlt');
        if (s === 'bezahlt' && r.typ === 'rechnung') akt += A('unpaid', 'Zahlung zurücknehmen');
        if (s === 'offen' || s === 'ueberfaellig' || (s === 'bezahlt' && r.typ === 'rechnung')) akt += A('storno', 'Stornieren', 'danger');
        const info = s === 'bezahlt' && r.typ === 'rechnung' ? 'bezahlt ' + dDE(r.bezahlt_am)
          : s === 'storniert' ? 'storniert' : s === 'storno' ? 'zu ' + esc((S.rechnungen.find(x => x.id === r.storno_von) || {}).nummer || '')
          : dDE(r.faellig_am);
        return `<tr><td class="nowrap">${esc(r.nummer)}</td><td class="nowrap">${dDE(r.datum)}</td><td>${esc(kundeName(r.kunde_snapshot))}</td>
          <td class="num">${eur(r.brutto)}</td><td>${badge(s)}</td><td class="nowrap ${s === 'ueberfaellig' ? '' : 'muted'}">${info}</td><td><div class="row-actions">${akt}</div></td></tr>`;
      }).join('')}</tbody></table></div>`;
  }
  function viewRechnungen() {
    const jahre = [...new Set(S.rechnungen.map(r => r.datum.slice(0, 4)))].sort().reverse();
    const f = S.filter;
    let list = S.rechnungen;
    if (f.jahr !== 'alle') list = list.filter(r => r.datum.startsWith(f.jahr));
    if (f.status !== 'alle') list = list.filter(r => status(r) === f.status || (f.status === 'offen' && status(r) === 'ueberfaellig'));
    const opt = (v, l, cur) => `<option value="${v}" ${v === cur ? 'selected' : ''}>${l}</option>`;
    $('#main').innerHTML = `
      <div class="head"><div><h1>Rechnungen</h1><p class="sub">Rechnungen sind nach dem Erstellen festgeschrieben. Korrekturen nur per Storno.</p></div>
        <div class="actions"><button class="btn" id="csv">CSV für EÜR</button><button class="btn primary" data-go="neu">Neue Rechnung</button></div></div>
      <div class="filters">
        <select id="fJahr">${opt('alle', 'Alle Jahre', f.jahr)}${jahre.map(j => opt(j, j, f.jahr)).join('')}</select>
        <select id="fStatus">${opt('alle', 'Alle Status', f.status)}${opt('offen', 'Offen', f.status)}${opt('ueberfaellig', 'Überfällig', f.status)}${opt('bezahlt', 'Bezahlt', f.status)}${opt('storniert', 'Storniert', f.status)}${opt('storno', 'Stornorechnungen', f.status)}</select>
      </div>
      <div class="panel">${list.length ? rechnungTabelle(list) : '<p class="empty">Keine Rechnungen gefunden.</p>'}</div>`;
    $('#fJahr').onchange = e => { f.jahr = e.target.value; viewRechnungen(); };
    $('#fStatus').onchange = e => { f.status = e.target.value; viewRechnungen(); };
    $('[data-go=neu]').onclick = () => go('neu');
    $('#csv').onclick = () => csvExport(list);
    bindRechnungAktionen();
  }
  function bindRechnungAktionen() {
    $('#main').onclick = async e => {
      const b = e.target.closest('[data-act]'); if (!b || !b.dataset.id) return;
      const r = S.rechnungen.find(x => x.id === b.dataset.id); if (!r) return;
      const a = b.dataset.act;
      if (a === 'pdf') return pdfSpeichern(r);
      if (a === 'paid') return bezahltDlg(r);
      if (a === 'unpaid') {
        if (!await confirmDlg('Zahlung zurücknehmen?', `Rechnung ${esc(r.nummer)} wird wieder als offen geführt.`, 'Zurücknehmen')) return;
        await guard(async () => { await DB.setBezahlt(r.id, null); await laden(); go(S.view); }, 'Zahlung zurückgenommen');
      }
      if (a === 'storno') {
        if (!await confirmDlg('Rechnung stornieren?', `Für <b>${esc(r.nummer)}</b> über ${eur(r.brutto)} wird eine Stornorechnung mit eigener Nummer erstellt. Das lässt sich nicht rückgängig machen.`, 'Stornieren')) return;
        await guard(async () => {
          const id = await DB.stornieren(r.id); await laden(); go(S.view);
          const s = S.rechnungen.find(x => x.id === id); if (s) await pdfSpeichern(s);
        }, 'Stornorechnung erstellt');
      }
    };
  }
  function bezahltDlg(r) {
    openDlg(`<form id="pf"><h2>Zahlung eintragen</h2><p class="sub">Rechnung ${esc(r.nummer)} über ${eur(r.brutto)}</p>
      <label class="f" style="margin-top:16px">Zahlungseingang am<input type="date" name="d" value="${today()}" required></label>
      <div class="actions"><button type="button" class="btn" data-x>Abbrechen</button><button class="btn primary">Speichern</button></div></form>`);
    dlg.querySelector('[data-x]').onclick = closeDlg;
    $('#pf').onsubmit = async e => {
      e.preventDefault(); const d = new FormData(e.target).get('d'); closeDlg();
      await guard(async () => { await DB.setBezahlt(r.id, d); await laden(); go(S.view); }, 'Als bezahlt markiert');
    };
  }
  async function pdfSpeichern(r) {
    await guard(async () => { const doc = await MWPDF.rechnung(r); doc.save(MWPDF.dateiname(r)); });
  }
  function csvExport(list) {
    const rows = [['Nummer', 'Typ', 'Datum', 'Leistungsdatum', 'Kunde', 'Land', 'Netto', 'MwSt', 'Brutto', 'Status', 'Bezahlt am']];
    [...list].sort((a, b) => a.nummer.localeCompare(b.nummer)).forEach(r => rows.push([r.nummer, r.typ === 'storno' ? 'Storno' : 'Rechnung', dDE(r.datum), dDE(r.leistungsdatum),
      kundeName(r.kunde_snapshot), (r.kunde_snapshot || {}).land || '', numIn(r.netto), numIn(r.mwst), numIn(r.brutto), STATUS_TXT[status(r)], dDE(r.bezahlt_am)]));
    const csv = '﻿' + rows.map(z => z.map(v => '"' + String(v ?? '').replace(/"/g, '""') + '"').join(';')).join('\r\n');
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    a.download = 'Mediawo_Rechnungen_' + today() + '.csv'; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }

  /* ---------- Neue Rechnung ---------- */
  function neuerEntwurf() {
    const f = S.firma;
    return {
      kunde_id: '', datum: today(), leistungsdatum: today(), leistungszeitraum_bis: '', zeitraum: false,
      positionen: [{ bezeichnung: '', beschreibung: '', menge: 1, einheit: 'Stück', einzelpreis: 0 }],
      einleitung: 'Wir bedanken uns für die gute Zusammenarbeit und stellen Ihnen vereinbarungsgemäß folgende Leistungen in Rechnung:',
      schluss: `Bitte überweisen Sie den Rechnungsbetrag innerhalb von ${f.zahlungsziel_tage} Tagen auf das untenstehende Bankkonto. Für Rückfragen stehen wir Ihnen jederzeit gerne zur Verfügung.`
    };
  }
  function viewNeu() {
    if (!S.draft) S.draft = neuerEntwurf();
    const d = S.draft;
    $('#main').innerHTML = `
      <div class="head"><div><h1>Neue Rechnung</h1><p class="sub">Nächste Nummer wird beim Erstellen vergeben. Danach ist die Rechnung festgeschrieben.</p></div></div>
      <div class="stack">
        <div class="panel"><h2>Kunde & Daten</h2>
          <div class="grid3">
            <label class="f span2">Kunde<div style="display:flex;gap:8px"><select id="dKunde"><option value="">Bitte wählen …</option>
              ${S.kunden.filter(k => k.status !== 'inaktiv' || k.id === d.kunde_id).map(k => `<option value="${k.id}" ${k.id === d.kunde_id ? 'selected' : ''}>${esc(kundeName(k))}</option>`).join('')}</select>
              <button type="button" class="btn" id="dNeuKunde">Neu</button></div></label>
            <label class="f">Rechnungsdatum<input type="date" id="dDatum" value="${d.datum}"></label>
            <label class="f">${d.zeitraum ? 'Leistung von' : 'Leistungsdatum'}<input type="date" id="dLeist" value="${d.leistungsdatum}"></label>
            <label class="f" ${d.zeitraum ? '' : 'hidden'}>Leistung bis<input type="date" id="dBis" value="${d.leistungszeitraum_bis}"></label>
            <label class="check" style="align-self:end;padding-bottom:10px"><input type="checkbox" id="dZeitraum" ${d.zeitraum ? 'checked' : ''}> Leistungszeitraum</label>
          </div>
        </div>
        <div class="panel"><h2>Positionen</h2>
          <div class="table-wrap"><table class="pos-table" style="width:100%"><thead><tr class="hint"><td style="width:30%">Bezeichnung</td><td>Beschreibung (optional)</td><td style="width:80px">Menge</td><td style="width:110px">Einzelpreis</td><td style="width:100px" class="num">Gesamt</td><td style="width:30px"></td></tr></thead>
          <tbody id="posBody"></tbody></table></div>
          <div style="display:flex;gap:10px;margin-top:10px;flex-wrap:wrap">
            <button type="button" class="btn small" id="posAdd">+ Freie Position</button>
            <select id="posKatalog" style="width:auto"><option value="">+ Aus Leistungskatalog …</option>${S.leistungen.filter(l => l.aktiv).map(l => `<option value="${l.id}">${esc(l.name)} · ${eur(l.preis)}</option>`).join('')}</select>
          </div>
          <div class="totals" id="dTotals"></div>
        </div>
        <div class="panel"><h2>Texte</h2>
          <div class="stack" style="gap:12px">
            <label class="f">Text über der Tabelle<textarea id="dEin">${esc(d.einleitung)}</textarea></label>
            <label class="f">Text unter der Tabelle<textarea id="dSchluss">${esc(d.schluss)}</textarea></label>
          </div>
        </div>
        <div class="actions">
          <button class="btn link" id="dReset">Verwerfen</button>
          <button class="btn" id="dPreview">Vorschau als PDF</button>
          <button class="btn primary" id="dCreate">Rechnung erstellen</button>
        </div>
      </div>`;
    renderPos();
    const sync = () => { d.kunde_id = $('#dKunde').value; d.datum = $('#dDatum').value; d.leistungsdatum = $('#dLeist').value; d.leistungszeitraum_bis = $('#dBis').value; d.einleitung = $('#dEin').value; d.schluss = $('#dSchluss').value; };
    ['#dKunde', '#dDatum', '#dLeist', '#dBis', '#dEin', '#dSchluss'].forEach(s => $(s).addEventListener('input', sync));
    $('#dZeitraum').onchange = e => { sync(); d.zeitraum = e.target.checked; if (!d.zeitraum) d.leistungszeitraum_bis = ''; viewNeu(); };
    $('#dNeuKunde').onclick = () => kundeDlg(null, k => { sync(); d.kunde_id = k.id; viewNeu(); });
    $('#posAdd').onclick = () => { d.positionen.push({ bezeichnung: '', beschreibung: '', menge: 1, einheit: 'Stück', einzelpreis: 0 }); renderPos(); };
    $('#posKatalog').onchange = e => {
      const l = S.leistungen.find(x => x.id === e.target.value); e.target.value = ''; if (!l) return;
      const leer = d.positionen.length === 1 && !d.positionen[0].bezeichnung && !num(d.positionen[0].einzelpreis);
      const p = { bezeichnung: l.name, beschreibung: l.beschreibung || '', menge: 1, einheit: l.einheit || 'Stück', einzelpreis: Number(l.preis) };
      if (leer) d.positionen[0] = p; else d.positionen.push(p);
      renderPos();
    };
    $('#dReset').onclick = async () => { if (await confirmDlg('Entwurf verwerfen?', 'Alle Eingaben dieser Rechnung gehen verloren.', 'Verwerfen')) { S.draft = null; viewNeu(); } };
    $('#dPreview').onclick = async () => { sync(); const r = entwurfAlsRechnung(); if (!r) return; await guard(async () => { const doc = await MWPDF.rechnung(r); window.open(doc.output('bloburl'), '_blank'); }); };
    $('#dCreate').onclick = async () => {
      sync(); const r = entwurfAlsRechnung(); if (!r) return;
      const ok = await confirmDlg('Rechnung erstellen?', `Rechnung an <b>${esc(kundeName(r.kunde_snapshot))}</b> über <b>${eur(r.brutto)}</b>.<br><br>Sie bekommt die nächste fortlaufende Nummer und ist danach <b>nicht mehr änderbar</b>. Korrekturen gehen nur per Storno.`, 'Jetzt erstellen');
      if (!ok) return;
      $('#dCreate').disabled = true;
      await guard(async () => {
        const id = await DB.createRechnung({
          kunde_id: d.kunde_id, datum: d.datum, leistungsdatum: d.leistungsdatum, leistungszeitraum_bis: d.zeitraum ? d.leistungszeitraum_bis : null,
          positionen: r.rechnung_positionen.map(p => ({ bezeichnung: p.bezeichnung, beschreibung: p.beschreibung || null, menge: p.menge, einheit: p.einheit, einzelpreis: p.einzelpreis })),
          einleitung: d.einleitung, schluss: d.schluss
        });
        S.draft = null; await laden();
        const neu = S.rechnungen.find(x => x.id === id);
        toast('Rechnung ' + (neu ? neu.nummer : '') + ' erstellt');
        if (neu) await pdfSpeichern(neu);
        go('rechnungen');
      });
      const b = $('#dCreate'); if (b) b.disabled = false;
    };
  }
  function renderPos() {
    const d = S.draft;
    $('#posBody').innerHTML = d.positionen.map((p, i) => `<tr data-i="${i}">
      <td><input data-k="bezeichnung" value="${esc(p.bezeichnung)}" placeholder="z. B. Imagefilm"></td>
      <td><textarea data-k="beschreibung" rows="1" placeholder="optional">${esc(p.beschreibung)}</textarea></td>
      <td><input data-k="menge" inputmode="decimal" value="${esc(String(p.menge).replace('.', ','))}"></td>
      <td><input data-k="einzelpreis" inputmode="decimal" value="${numIn(p.einzelpreis)}"></td>
      <td class="num" style="padding-top:14px" data-sum>${eur(num(p.menge) * num(p.einzelpreis))}</td>
      <td><button type="button" class="btn link" data-del title="Position entfernen" ${d.positionen.length < 2 ? 'disabled' : ''}>✕</button></td></tr>`).join('');
    $('#posBody').oninput = e => {
      const tr = e.target.closest('tr'), k = e.target.dataset.k; if (!tr || !k) return;
      const p = d.positionen[+tr.dataset.i];
      p[k] = (k === 'menge' || k === 'einzelpreis') ? e.target.value : e.target.value;
      tr.querySelector('[data-sum]').textContent = eur(num(p.menge) * num(p.einzelpreis));
      totals();
    };
    $('#posBody').onclick = e => { if (e.target.closest('[data-del]')) { d.positionen.splice(+e.target.closest('tr').dataset.i, 1); renderPos(); } };
    totals();
  }
  function totals() {
    const f = S.firma, netto = r2(S.draft.positionen.reduce((a, p) => a + r2(num(p.menge) * num(p.einzelpreis)), 0));
    const satz = f.kleinunternehmer ? 0 : Number(f.mwst_satz), mwst = r2(netto * satz / 100);
    $('#dTotals').innerHTML = (satz ? `<span class="muted">Netto</span><span class="num">${eur(netto)}</span><span class="muted">MwSt. ${satz} %</span><span class="num">${eur(mwst)}</span>` : '')
      + `<span class="g">Gesamt</span><span class="g num">${eur(netto + mwst)}</span>`
      + (satz ? '' : `<span class="hint" style="grid-column:1/-1;text-align:right">${esc(f.hinweis_kleinunternehmer)}</span>`);
  }
  function entwurfAlsRechnung() {
    const d = S.draft, f = S.firma;
    const k = S.kunden.find(x => x.id === d.kunde_id);
    if (!k) { toast('Bitte einen Kunden wählen.', true); return null; }
    if (!d.datum || !d.leistungsdatum) { toast('Bitte Rechnungs- und Leistungsdatum angeben.', true); return null; }
    if (d.zeitraum && (!d.leistungszeitraum_bis || d.leistungszeitraum_bis < d.leistungsdatum)) { toast('Bitte ein gültiges Ende des Leistungszeitraums angeben.', true); return null; }
    const pos = d.positionen.filter(p => p.bezeichnung.trim() || num(p.einzelpreis));
    if (!pos.length) { toast('Bitte mindestens eine Position eintragen.', true); return null; }
    if (pos.some(p => !p.bezeichnung.trim())) { toast('Jede Position braucht eine Bezeichnung.', true); return null; }
    if (pos.some(p => num(p.menge) <= 0)) { toast('Mengen müssen größer als 0 sein.', true); return null; }
    const rp = pos.map((p, i) => ({ pos: i + 1, bezeichnung: p.bezeichnung.trim(), beschreibung: (p.beschreibung || '').trim(), menge: num(p.menge), einheit: p.einheit || 'Stück', einzelpreis: r2(num(p.einzelpreis)), gesamt: r2(num(p.menge) * num(p.einzelpreis)) }));
    const netto = r2(rp.reduce((a, p) => a + p.gesamt, 0)), satz = f.kleinunternehmer ? 0 : Number(f.mwst_satz), mwst = r2(netto * satz / 100);
    return { entwurf: true, typ: 'rechnung', kunde_snapshot: k, firma_snapshot: f, datum: d.datum, leistungsdatum: d.leistungsdatum,
      leistungszeitraum_bis: d.zeitraum ? d.leistungszeitraum_bis : null, einleitung: d.einleitung, schluss: d.schluss,
      mwst_satz: satz, netto, mwst, brutto: r2(netto + mwst), rechnung_positionen: rp };
  }

  /* ---------- Kunden ---------- */
  function viewKunden() {
    const stat = k => { const rs = S.rechnungen.filter(r => r.kunde_id === k.id); return { n: rs.filter(r => r.typ === 'rechnung').length, sum: r2(rs.reduce((a, r) => a + Number(r.brutto), 0)) }; };
    $('#main').innerHTML = `
      <div class="head"><div><h1>Kunden</h1><p class="sub">${S.kunden.length} Kunden</p></div><button class="btn primary" id="kNeu">Neuer Kunde</button></div>
      <div class="panel">${S.kunden.length ? `<div class="table-wrap"><table class="list"><thead><tr><th>Kunde</th><th>Ort</th><th>Status</th><th class="num">Rechnungen</th><th class="num">Umsatz gesamt</th><th></th></tr></thead><tbody>
        ${S.kunden.map(k => { const s = stat(k); return `<tr><td>${esc(kundeName(k))}${k.email ? `<br><span class="muted">${esc(k.email)}</span>` : ''}</td>
          <td>${esc([k.plz, k.ort].filter(Boolean).join(' '))}${k.land && k.land !== 'Deutschland' ? `<br><span class="muted">${esc(k.land)}</span>` : ''}</td>
          <td>${{ aktiv: 'Aktiv', inaktiv: 'Inaktiv', in_aussicht: 'In Aussicht' }[k.status] || ''}</td>
          <td class="num">${s.n}</td><td class="num">${eur(s.sum)}</td>
          <td><div class="row-actions"><button class="btn link small" data-r="${k.id}">Rechnung schreiben</button><button class="btn link small" data-e="${k.id}">Bearbeiten</button></div></td></tr>`; }).join('')}
        </tbody></table></div>` : '<p class="empty">Noch keine Kunden angelegt.</p>'}</div>`;
    $('#kNeu').onclick = () => kundeDlg(null, () => viewKunden());
    $('#main').onclick = e => {
      const r = e.target.closest('[data-r]'), ed = e.target.closest('[data-e]');
      if (r) { if (!S.draft) S.draft = neuerEntwurf(); S.draft.kunde_id = r.dataset.r; go('neu'); }
      if (ed) kundeDlg(S.kunden.find(k => k.id === ed.dataset.e), () => viewKunden());
    };
  }
  function kundeDlg(k, done) {
    k = k || { land: 'Deutschland', status: 'aktiv' };
    const f = (n, l, cls = '', t = 'text') => `<label class="f ${cls}">${l}<input name="${n}" type="${t}" value="${esc(k[n])}"></label>`;
    openDlg(`<form id="kf"><h2>${k.id ? 'Kunde bearbeiten' : 'Neuer Kunde'}</h2><p class="sub">Änderungen wirken nur auf neue Rechnungen.</p>
      <div class="grid2" style="margin-top:16px">
        ${f('firma', 'Firma', 'span2')}
        <label class="f">Anrede<select name="anrede">${['', 'Herr', 'Frau'].map(a => `<option ${a === (k.anrede || '') ? 'selected' : ''}>${a}</option>`).join('')}</select></label>
        ${f('kuerzel', 'Kürzel (für Ordner, z. B. SK)')}
        ${f('vorname', 'Vorname')}${f('nachname', 'Nachname')}
        ${f('strasse', 'Straße und Nr.', 'span2')}
        ${f('plz', 'PLZ')}${f('ort', 'Ort')}
        ${f('land', 'Land')}${f('ust_id', 'USt-IdNr. (bei Firmen im EU-Ausland)')}
        ${f('email', 'E-Mail', '', 'email')}${f('telefon', 'Telefon')}
        <label class="f">Status<select name="status">${[['aktiv', 'Aktiv'], ['in_aussicht', 'In Aussicht'], ['inaktiv', 'Inaktiv']].map(([v, l]) => `<option value="${v}" ${v === k.status ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
        <label class="f span2">Notiz<textarea name="notiz">${esc(k.notiz)}</textarea></label>
      </div>
      <div class="actions"><button type="button" class="btn" data-x>Abbrechen</button><button class="btn primary">Speichern</button></div></form>`);
    dlg.querySelector('[data-x]').onclick = closeDlg;
    $('#kf').onsubmit = async e => {
      e.preventDefault();
      const o = Object.fromEntries(new FormData(e.target)); Object.keys(o).forEach(x => o[x] = o[x].trim());
      if (!o.firma && !o.nachname) { toast('Bitte Firma oder Nachname angeben.', true); return; }
      if (!o.land) o.land = 'Deutschland';
      if (k.id) o.id = k.id;
      const saved = await guard(() => DB.saveKunde(o), 'Kunde gespeichert');
      if (!saved) return;
      closeDlg(); S.kunden = await DB.listKunden(); done && done(saved);
    };
  }

  /* ---------- Leistungen ---------- */
  function viewLeistungen() {
    $('#main').innerHTML = `
      <div class="head"><div><h1>Leistungen</h1><p class="sub">Vorlagen für Rechnungspositionen. Preise lassen sich in jeder Rechnung anpassen.</p></div><button class="btn primary" id="lNeu">Neue Leistung</button></div>
      <div class="panel">${S.leistungen.length ? `<div class="table-wrap"><table class="list"><thead><tr><th>Leistung</th><th>Einheit</th><th class="num">Preis</th><th>Aktiv</th><th></th></tr></thead><tbody>
        ${S.leistungen.map(l => `<tr><td>${esc(l.name)}${l.beschreibung ? `<br><span class="muted">${esc(l.beschreibung)}</span>` : ''}</td><td>${esc(l.einheit)}</td><td class="num">${eur(l.preis)}</td><td>${l.aktiv ? 'Ja' : 'Nein'}</td>
          <td><div class="row-actions"><button class="btn link small" data-e="${l.id}">Bearbeiten</button><button class="btn link small danger" data-d="${l.id}">Löschen</button></div></td></tr>`).join('')}
        </tbody></table></div>` : '<p class="empty">Noch keine Leistungen angelegt.</p>'}</div>`;
    $('#lNeu').onclick = () => leistungDlg(null);
    $('#main').onclick = async e => {
      const ed = e.target.closest('[data-e]'), del = e.target.closest('[data-d]');
      if (ed) leistungDlg(S.leistungen.find(l => l.id === ed.dataset.e));
      if (del) {
        const l = S.leistungen.find(x => x.id === del.dataset.d);
        if (!await confirmDlg('Leistung löschen?', `„${esc(l.name)}“ wird aus dem Katalog entfernt. Bestehende Rechnungen bleiben unverändert.`, 'Löschen')) return;
        await guard(async () => { await DB.deleteLeistung(l.id); S.leistungen = await DB.listLeistungen(); viewLeistungen(); }, 'Leistung gelöscht');
      }
    };
  }
  function leistungDlg(l) {
    l = l || { einheit: 'Stück', preis: 0, aktiv: true };
    openDlg(`<form id="lf"><h2>${l.id ? 'Leistung bearbeiten' : 'Neue Leistung'}</h2>
      <div class="grid2" style="margin-top:16px">
        <label class="f span2">Bezeichnung<input name="name" value="${esc(l.name)}" required></label>
        <label class="f span2">Beschreibung (erscheint klein unter der Bezeichnung)<textarea name="beschreibung">${esc(l.beschreibung)}</textarea></label>
        <label class="f">Preis in €<input name="preis" inputmode="decimal" value="${numIn(l.preis)}"></label>
        <label class="f">Einheit<input name="einheit" value="${esc(l.einheit)}" placeholder="Stück, Stunde, Pauschal"></label>
        <label class="check"><input type="checkbox" name="aktiv" ${l.aktiv ? 'checked' : ''}> Aktiv (im Rechnungsformular auswählbar)</label>
      </div>
      <div class="actions"><button type="button" class="btn" data-x>Abbrechen</button><button class="btn primary">Speichern</button></div></form>`);
    dlg.querySelector('[data-x]').onclick = closeDlg;
    $('#lf').onsubmit = async e => {
      e.preventDefault(); const fd = new FormData(e.target);
      const o = { name: fd.get('name').trim(), beschreibung: fd.get('beschreibung').trim() || null, preis: r2(num(fd.get('preis'))), einheit: fd.get('einheit').trim() || 'Stück', aktiv: fd.has('aktiv') };
      if (l.id) o.id = l.id;
      const ok = await guard(() => DB.saveLeistung(o), 'Leistung gespeichert'); if (!ok) return;
      closeDlg(); S.leistungen = await DB.listLeistungen(); viewLeistungen();
    };
  }

  /* ---------- Firmendaten ---------- */
  function viewFirma() {
    const f = S.firma;
    const i = (n, l, cls = '', t = 'text') => `<label class="f ${cls}">${l}<input name="${n}" type="${t}" value="${esc(f[n])}"></label>`;
    $('#main').innerHTML = `
      <div class="head"><div><h1>Firmendaten</h1><p class="sub">Erscheinen auf neuen Rechnungen. Bestehende Rechnungen bleiben unverändert.</p></div></div>
      <form id="ff" class="stack">
        <div class="panel"><h2>Firma</h2><div class="grid2">
          ${i('name', 'Firmenname')}${i('marke', 'Marke')}${i('inhaber', 'Inhaber (Grußzeile)', 'span2')}
          ${i('strasse', 'Straße', 'span2')}${i('plz', 'PLZ')}${i('ort', 'Ort')}
          ${i('email', 'E-Mail')}${i('telefon', 'Telefon')}${i('web', 'Website', 'span2')}</div></div>
        <div class="panel"><h2>Steuer</h2><div class="grid2">
          ${i('steuernummer', 'Steuernummer')}${i('ust_id', 'USt-IdNr.')}
          <label class="check span2"><input type="checkbox" name="kleinunternehmer" ${f.kleinunternehmer ? 'checked' : ''}> Kleinunternehmer nach § 19 UStG (keine Umsatzsteuer auf Rechnungen)</label>
          ${i('hinweis_kleinunternehmer', 'Hinweis auf der Rechnung', 'span2')}
          ${i('mwst_satz', 'MwSt.-Satz in % (nur ohne Kleinunternehmerregelung)', '', 'number')}</div></div>
        <div class="panel"><h2>Bank & Fristen</h2><div class="grid2">
          ${i('bank', 'Bank')}${i('kontoinhaber', 'Kontoinhaber')}${i('iban', 'IBAN')}${i('bic', 'BIC')}
          ${i('zahlungsziel_tage', 'Zahlungsziel in Tagen', '', 'number')}${i('mahnfrist_tage', 'Frist bei Zahlungserinnerung in Tagen', '', 'number')}</div></div>
        <div class="actions"><button class="btn primary">Speichern</button></div>
      </form>`;
    $('#ff').onsubmit = async e => {
      e.preventDefault(); const fd = new FormData(e.target), o = {};
      for (const [k, v] of fd.entries()) o[k] = String(v).trim();
      o.kleinunternehmer = fd.has('kleinunternehmer');
      ['mwst_satz', 'zahlungsziel_tage', 'mahnfrist_tage'].forEach(k => o[k] = num(o[k]));
      if (!o.kleinunternehmer && !(await confirmDlg('Kleinunternehmerregelung ausschalten?', 'Neue Rechnungen enthalten dann ' + o.mwst_satz + ' % Umsatzsteuer. Nur ausschalten, wenn ihr umsatzsteuerpflichtig seid.', 'Ausschalten'))) return;
      await guard(async () => { await DB.saveFirma(o); S.firma = await DB.getFirma(); }, 'Firmendaten gespeichert');
    };
  }

  /* ---------- Start ---------- */
  DB.onAuth(s => zeigeApp(s));
  DB.session().then(zeigeApp).catch(() => zeigeApp(null));
})();
