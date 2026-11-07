/* Mediawo OS – Oberfläche */
(function () {
  const C = window.MW_CONFIG, DB = window.DB, AB = window.ABLAGE;
  const $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)];
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const eur = n => (Number(n) || 0).toLocaleString('de-DE', { style: 'currency', currency: 'EUR' });
  const dDE = iso => iso ? iso.split('-').reverse().join('.') : '';
  const today = () => { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
  const addDays = (iso, n) => { const d = new Date(iso + 'T12:00:00'); d.setDate(d.getDate() + Number(n)); return d.toISOString().slice(0, 10); };
  const r2 = n => Math.round((Number(n) || 0) * 100) / 100;
  function num(v) { if (typeof v === 'number') return v; let s = String(v ?? '').trim().replace(/\s|€/g, ''); if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.'); const n = parseFloat(s); return isNaN(n) ? 0 : n; }
  const numIn = n => (Number(n) || 0).toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: false });
  const whenTxt = iso => { if (!iso) return ''; const d = new Date(iso), t = d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }); return d.toDateString() === new Date().toDateString() ? 'heute ' + t : d.toLocaleDateString('de-DE') + ' ' + t; };

  const S = { firma: null, kunden: [], leistungen: [], rechnungen: [], mahnungen: [], zahlungen: [], fixkosten: [], ausgaben: [], belegNeu: [], zOk: true, ui: { zAlle: false, aAlle: false, fAlle: false }, view: 'start', draft: null, filter: { jahr: 'alle', status: 'alle' }, periode: { art: 'jahr', ref: today() } };

  /* ---------- Hilfen ---------- */
  function toast(msg, err) { const t = $('#toast'); t.textContent = msg; t.className = err ? 'show err' : 'show'; clearTimeout(t._t); t._t = setTimeout(() => t.className = '', err ? 6000 : 2600); }
  function kundeName(k) { if (!k) return '–'; const p = [k.vorname, k.nachname].filter(Boolean).join(' '); return k.firma ? (k.firma + (p ? ' (' + p + ')' : '')) : (p || 'Ohne Namen'); }
  const mahnungenZu = r => S.mahnungen.filter(m => m.rechnung_id === r.id).sort((a, b) => a.stufe - b.stufe);
  const zahlungenZu = r => S.zahlungen.filter(z => z.rechnung_id === r.id);
  const gezahlt = (r, bis) => r2(zahlungenZu(r).filter(z => !bis || z.datum <= bis).reduce((a, z) => a + Number(z.betrag), 0));
  const offenBetrag = r => r.typ === 'rechnung' && r.status === 'offen' ? Math.max(0, r2(Number(r.brutto) - gezahlt(r))) : 0;
  const mahnModell = (r, m) => MWDOC.modellMahnung(r, m, gezahlt(r, m.datum));
  const faellig = r => { const ms = mahnungenZu(r); return ms.length ? ms[ms.length - 1].frist_bis : r.faellig_am; };
  function status(r) {
    if (r.typ === 'storno') return 'storno';
    if (r.status === 'storniert') return 'storniert';
    if (r.status === 'bezahlt') return 'bezahlt';
    return faellig(r) < today() ? 'ueberfaellig' : 'offen';
  }
  const STATUS_TXT = { offen: 'Offen', ueberfaellig: 'Überfällig', bezahlt: 'Bezahlt', storniert: 'Storniert', storno: 'Storno' };
  const badge = s => `<span class="badge b-${s}">${STATUS_TXT[s]}</span>`;
  const artVon = r => r.typ === 'storno' ? 'storno' : 'rechnung';

  const dlg = $('#dlg');
  function openDlg(html, wide) { dlg.className = wide ? 'wide' : ''; dlg.innerHTML = html; dlg.showModal(); }
  function closeDlg() { if (dlg.open) dlg.close(); dlg.innerHTML = ''; }
  dlg.addEventListener('click', e => { if (e.target === dlg && !dlg.dataset.pflicht) closeDlg(); });
  function confirmDlg(titel, text, ok = 'Bestätigen', danger) {
    return new Promise(res => {
      openDlg(`<div class="dlg"><h2>${esc(titel)}</h2><p class="sub">${text}</p><div class="actions"><button class="btn" data-x="no">Abbrechen</button><button class="btn ${danger ? 'danger-solid' : 'primary'}" data-x="yes">${esc(ok)}</button></div></div>`);
      dlg.querySelector('[data-x=no]').onclick = () => { closeDlg(); res(false); };
      dlg.querySelector('[data-x=yes]').onclick = () => { closeDlg(); res(true); };
      dlg.addEventListener('close', () => res(false), { once: true });
    });
  }
  async function guard(fn, okMsg) {
    try { const r = await fn(); if (okMsg) toast(okMsg); return r; }
    catch (e) { console.error(e); toast(fehlerText(e), true); }
  }
  function fehlerText(e) {
    const m = e && e.message || String(e);
    if (/JWT|session|not authenticated/i.test(m)) return 'Sitzung abgelaufen. Bitte neu anmelden.';
    if (/Failed to fetch|NetworkError|Load failed/i.test(m)) return 'Keine Verbindung zur Datenbank. Internet prüfen.';
    return m;
  }
  function download(name, blob) {
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 800);
  }

  async function laden() {
    const [firma, kunden, leistungen, rechnungen, mahnungen] = await Promise.all([DB.getFirma(), DB.listKunden(), DB.listLeistungen(), DB.listRechnungen(), DB.listMahnungen()]);
    Object.assign(S, { firma, kunden, leistungen, rechnungen, mahnungen });
    /* Zahlungen und Fixkosten gibt es erst nach 03_zahlungen_fixkosten.sql. Bis dahin: bezahlte Rechnungen als je eine Zahlung werten. */
    try { S.ausgaben = await DB.listAusgaben(); } catch (e) { console.warn('Ausgaben', e); S.ausgaben = []; }
    belegeScannen();
    try { [S.zahlungen, S.fixkosten] = await Promise.all([DB.listZahlungen(), DB.listFixkosten()]); S.zOk = true; }
    catch (e) {
      console.warn('Zahlungen/Fixkosten', e); S.zOk = false; S.fixkosten = [];
      S.zahlungen = rechnungen.filter(r => r.typ === 'rechnung' && r.status === 'bezahlt').map(r => ({ id: 'alt-' + r.id, rechnung_id: r.id, datum: r.bezahlt_am || r.datum, betrag: Number(r.brutto) }));
    }
    ablageSyncSpaeter();
  }

  /* ---------- PDF-Ablage & Datensicherung ---------- */
  let syncLaeuft = false, syncNochmal = false, syncTimer = null, fehlend = 0;
  function ablageSyncSpaeter() { clearTimeout(syncTimer); syncTimer = setTimeout(ablageSync, 800); }
  function sicherungsDaten() { return { firma: S.firma, kunden: S.kunden, leistungen: S.leistungen, rechnungen: S.rechnungen, mahnungen: S.mahnungen, zahlungen: S.zOk ? S.zahlungen : [], fixkosten: S.fixkosten, ausgaben: S.ausgaben }; }
  async function ablageSync() {
    if (!S.firma) return;
    if (syncLaeuft) { syncNochmal = true; return; }
    syncLaeuft = true; renderSide();
    try {
      if (AB.backup.state === 'on') await AB.sicherung(sicherungsDaten());
      if (AB.pdf.state === 'on') {
        const jobs = [];
        S.rechnungen.filter(r => !r.importiert).forEach(r => jobs.push({ info: MWPDF.datei(artVon(r), r), md: () => MWDOC.modellRechnung(r) }));
        S.mahnungen.forEach(m => { const r = S.rechnungen.find(x => x.id === m.rechnung_id); if (r) jobs.push({ info: MWPDF.datei('mahnung', r, m), md: () => mahnModell(r, m) }); });
        fehlend = 0;
        for (const j of jobs) {
          if (AB.pdf.state !== 'on') break;
          if (!(await AB.existiertPdf(j.info)) && !(await AB.speicherePdf(j.info, await MWPDF.blob(j.md())))) fehlend++;
        }
      }
    } catch (e) { console.warn('Ablage', e); }
    syncLaeuft = false; renderSide();
    if (S.view === 'einstellungen') { const a = $('#ablagePanels'); if (a) a.innerHTML = ablagePanels(); }
    if (syncNochmal) { syncNochmal = false; ablageSync(); }
  }
  /* ---------- Belege-Ordner: neue Dateien finden ---------- */
  let scanLaeuft = false;
  async function belegIgnoriert() { try { return new Set(await AB.kv('get', 'belegIgnoriert') || []); } catch (e) { return new Set(); } }
  async function belegeScannen() {
    if (AB.belege.state !== 'on' || scanLaeuft) { S.belegNeu = []; belegZaehler(); return; }
    scanLaeuft = true;
    try {
      const [dateien, ign] = await Promise.all([AB.belege.dateien(MWBELEG.istBeleg), belegIgnoriert()]);
      const bekannt = new Set(S.ausgaben.map(a => a.beleg_pfad).filter(Boolean));
      S.belegNeu = dateien.filter(f => !bekannt.has(f.pfad) && !ign.has(f.pfad)).sort((a, b) => b.geaendert - a.geaendert);
    } catch (e) { console.warn('Belege', e); }
    scanLaeuft = false; belegZaehler();
    if (S.view === 'ausgaben' && !dlg.open) viewAusgaben();
    if (S.view === 'start' && !dlg.open) { const k = $('#belegHinweis'); if (k) k.innerHTML = belegHinweis(); }
  }
  function belegZaehler() {
    const c = $('#navBelege'); if (c) { c.hidden = !S.belegNeu.length; c.textContent = S.belegNeu.length; c.title = S.belegNeu.length + ' neue Belege'; }
    renderSide();
  }
  const belegHinweis = () => S.belegNeu.length ? `<button class="belegbox" data-beleg-pruefen><b>${S.belegNeu.length} ${S.belegNeu.length === 1 ? 'neuer Beleg' : 'neue Belege'}</b> im Ordner ${esc(AB.belege.name)}<span>Jetzt prüfen →</span></button>` : '';
  let fokusTimer = null;
  window.addEventListener('focus', () => { clearTimeout(fokusTimer); fokusTimer = setTimeout(() => { if (S.firma && !dlg.open) belegeScannen(); }, 600); });
  document.addEventListener('click', e => { if (e.target.closest('[data-beleg-pruefen]')) belegePruefen(0); });

  function renderSide() {
    const box = $('#ablageBox'); if (!box) return;
    const P = AB.pdf, B = AB.backup, zeilen = [];
    let warn = false;
    const z = (label, st, ok, act) => {
      if (st === 'on') return `<div><span class="dot ok"></span>${label}: <b>${ok}</b></div>`;
      warn = true;
      if (st === 'needs-permission') return `<div><span class="dot warn"></span>${label} pausiert</div>`;
      if (st === 'error') return `<div><span class="dot warn"></span>${label}: Ordner fehlt</div>`;
      if (st === 'unsupported') return `<div><span class="dot"></span>${label}: nur in Chrome</div>`;
      return `<div><span class="dot warn"></span>${label}: aus</div>`;
    };
    zeilen.push(z('PDF-Ablage', P.state, esc(P.name)));
    zeilen.push(z('Sicherung', B.state, syncLaeuft ? 'läuft …' : AB.letzteSicherung ? whenTxt(AB.letzteSicherung) : esc(B.name)));
    zeilen.push(z('Belege', AB.belege.state, S.belegNeu.length ? S.belegNeu.length + ' neu' : esc(AB.belege.name)));
    if (fehlend) zeilen.push(`<div class="err">${fehlend} Belege nicht abgelegt</div>`);
    const pause = [P, B, AB.belege].some(x => x.state === 'needs-permission');
    box.className = 'ablage' + (warn ? ' warn' : '');
    box.innerHTML = zeilen.join('') + (pause ? `<button class="btn small primary" data-ab="freigeben">Ordner freigeben</button>`
      : warn && AB.supported ? `<button class="btn small" data-go-settings>Einrichten</button>` : '');
  }
  async function ablageAktion(a) {
    const [was, ziel] = a.split(':');
    const st = ziel === 'pdf' ? AB.pdf : ziel === 'backup' ? AB.backup : ziel === 'belege' ? AB.belege : null;
    if (was === 'waehlen' && await st.waehlen()) toast({ pdf: 'PDF-Ordner', backup: 'Sicherungsordner', belege: 'Belege-Ordner' }[ziel] + ' gewählt: ' + st.name);
    if (was === 'aus') { await st.aus(); toast({ pdf: 'PDF-Ablage ausgeschaltet', backup: 'Automatische Sicherung ausgeschaltet', belege: 'Belege-Ordner getrennt' }[ziel]); }
    if (was === 'freigeben') { let ok = false; for (const x of [AB.pdf, AB.backup, AB.belege]) if (x.state === 'needs-permission') ok = (await x.freigeben()) || ok; if (ok) toast('Ordner wieder freigegeben'); }
    if (was === 'download') {
      const json = JSON.stringify({ app: 'Mediawo OS', erstellt: new Date().toISOString(), ...sicherungsDaten() }, null, 2);
      download('Mediawo-Sicherung-' + today() + '.json', new Blob([json], { type: 'application/json' })); return;
    }
    if (was === 'jetzt') toast('Wird gesichert …');
    renderSide(); const a2 = $('#ablagePanels'); if (a2) a2.innerHTML = ablagePanels();
    ablageSync(); belegeScannen();
  }
  document.addEventListener('click', e => {
    const b = e.target.closest('[data-ab]'); if (b) ablageAktion(b.dataset.ab);
    if (e.target.closest('[data-go-settings]')) go('einstellungen');
  });
  function ordnerPanel(st, ziel, beispiel, leerText, aktivText) {
    const n = esc(st.name);
    if (st.state === 'unsupported') return `<p class="note">Funktioniert nur in <b>Google Chrome</b> oder <b>Microsoft Edge</b>. Bitte Mediawo OS dort öffnen.</p>`;
    if (st.state === 'on') return `<p>${aktivText.replace('{n}', `<b>${n}</b>`)}<br><span class="hint">${beispiel.replace('{n}', n)}</span></p>
      <div class="btn-row"><button class="btn" data-ab="waehlen:${ziel}">Anderen Ordner wählen</button><button class="btn danger" data-ab="aus:${ziel}">Ausschalten</button></div>`;
    if (st.state === 'needs-permission') return `<p class="note">Der Ordner <b>${n}</b> braucht eine kurze Bestätigung. Der Browser fragt aus Sicherheitsgründen gelegentlich erneut nach.</p>
      <div class="btn-row"><button class="btn primary" data-ab="freigeben">Ordner freigeben</button><button class="btn" data-ab="waehlen:${ziel}">Anderen Ordner wählen</button></div>`;
    if (st.state === 'error') return `<p class="note">Der Ordner <b>${n}</b> ist nicht erreichbar (${esc(st.fehler)}). Vielleicht wurde er verschoben oder gelöscht.</p><button class="btn primary" data-ab="waehlen:${ziel}">Ordner neu wählen</button>`;
    return `<p class="hint">${leerText}</p><button class="btn primary" data-ab="waehlen:${ziel}">Ordner wählen</button>`;
  }
  function ablagePanels() {
    const j = today().slice(0, 4);
    return `<div class="panel"><h2>PDF-Ablage</h2>
        ${ordnerPanel(AB.pdf, 'pdf', `Beispiel: {n}/${j}/Rechnung_${j}-009_Kunde.pdf`,
          'Wählen Sie einmal einen Ordner, am besten in Google Drive (z. B. „Mediawo_Buchhaltung/Rechnungen“). Danach legt die App jede Rechnung, Stornorechnung und Zahlungserinnerung dort automatisch als PDF ab, sortiert nach Jahr. Fehlende Belege werden beim Öffnen nachgeholt, auch die vom anderen Nutzer.',
          'PDFs werden automatisch im Ordner {n} abgelegt, sortiert nach Jahr.')}
        ${fehlend ? `<p class="note" style="margin-top:12px">${fehlend} Belege konnten nicht abgelegt werden.</p>` : ''}</div>
      <div class="panel"><h2>Belege-Ordner (Ausgaben)</h2>
        ${ordnerPanel(AB.belege, 'belege', 'Beispiel: {n}/' + j + '/Rechnung_Amazon.pdf',
          'Wählen Sie den Ordner, in den ihr Belege und Eingangsrechnungen legt (z. B. „Mediawo_Buchhaltung/Belege“). Die App erkennt neue PDFs und Fotos, liest Betrag, Datum und Lieferant aus und schlägt sie als Ausgabe vor. Belege, die ihr in der App anhängt, landen ebenfalls dort.',
          'Neue Belege im Ordner {n} werden beim Öffnen der App erkannt' + (S.belegNeu.length ? ` (gerade ${S.belegNeu.length} neu)` : '') + '.')}</div>
      <div class="panel"><h2>Datensicherung</h2>
        <p class="hint">Die Daten liegen in der Datenbank (Supabase). Zusätzlich schreibt die App nach jeder Änderung eine vollständige Sicherung in einen Ordner Ihrer Wahl. Pro Tag entsteht eine Datei, dazu immer eine aktuelle.</p>
        ${ordnerPanel(AB.backup, 'backup', 'Beispiel: {n}/Mediawo-Sicherung-' + today() + '.json',
          'Am besten einen eigenen Ordner in Google Drive wählen (z. B. „MW_Buchhaltung/Sicherungen“).',
          'Automatisch aktiv im Ordner {n}' + (AB.letzteSicherung ? ', zuletzt ' + whenTxt(AB.letzteSicherung) : '') + '.')}
        <h3>Von Hand</h3>
        <div class="btn-row"><button class="btn" data-ab="download">Sicherung herunterladen</button><button class="btn" id="csvAll">Rechnungsliste als CSV</button>${AB.backup.state === 'on' || AB.pdf.state === 'on' ? '<button class="btn" data-ab="jetzt">Jetzt abgleichen</button>' : ''}</div>
      </div>`;
  }

  /* ---------- Login & Passwort ---------- */
  let aktuellerNutzer = null;
  async function zeigeApp(session) {
    if (!session) { aktuellerNutzer = null; $('#app').hidden = true; $('#login').hidden = false; return; }
    if (aktuellerNutzer === session.user.email && !$('#app').hidden) { linkPruefen(); return; }
    aktuellerNutzer = session.user.email;
    $('#login').hidden = true; $('#app').hidden = false;
    $('#userMail').textContent = session.user.email;
    $('#demoBadge').hidden = !DB.demo;
    await AB.init(); renderSide();
    await guard(laden);
    go(S.view);
    linkPruefen();
  }
  function linkPruefen() {
    const typ = DB.linkTyp && DB.linkTyp();
    if (typ === 'invite' || typ === 'recovery' || typ === 'signup') passwortDlg(true);
  }
  function passwortDlg(pflicht) {
    openDlg(`<form id="pwf" class="dlg"><h2>${pflicht ? 'Passwort festlegen' : 'Passwort ändern'}</h2>
      <p class="sub">${pflicht ? 'Lege jetzt dein Passwort fest. Damit meldest du dich künftig an.' : 'Mindestens 8 Zeichen.'}</p>
      <div class="stack" style="gap:12px;margin-top:16px">
        <label class="f">Neues Passwort<input type="password" name="p1" autocomplete="new-password" minlength="8" required></label>
        <label class="f">Passwort wiederholen<input type="password" name="p2" autocomplete="new-password" minlength="8" required></label>
      </div>
      <div class="actions">${pflicht ? '' : '<button type="button" class="btn" data-x>Abbrechen</button>'}<button class="btn primary">Speichern</button></div></form>`);
    if (pflicht) dlg.dataset.pflicht = '1';
    const x = dlg.querySelector('[data-x]'); if (x) x.onclick = closeDlg;
    dlg.oncancel = e => { if (pflicht) e.preventDefault(); };
    $('#pwf').onsubmit = async e => {
      e.preventDefault(); const fd = new FormData(e.target);
      if (fd.get('p1') !== fd.get('p2')) { toast('Die Passwörter stimmen nicht überein.', true); return; }
      const ok = await guard(async () => { await DB.passwortSetzen(fd.get('p1')); return true; }, 'Passwort gespeichert');
      if (ok) { dlg.oncancel = null; delete dlg.dataset.pflicht; closeDlg(); }
    };
  }
  $('#loginForm').onsubmit = async e => {
    e.preventDefault();
    const fd = new FormData(e.target); $('#loginErr').textContent = '';
    try { await DB.login(fd.get('email').trim(), fd.get('password')); }
    catch (err) { $('#loginErr').textContent = /invalid/i.test(err.message) ? 'E-Mail oder Passwort falsch.' : fehlerText(err); }
  };
  $('#pwForgot').onclick = async () => {
    const email = $('#loginForm [name=email]').value.trim();
    if (!email) { $('#loginErr').textContent = 'Bitte zuerst deine E-Mail-Adresse eintragen.'; return; }
    try { await DB.passwortVergessen(email); $('#loginErr').textContent = ''; toast('Link zum Zurücksetzen wurde an ' + email + ' geschickt.'); }
    catch (err) { $('#loginErr').textContent = fehlerText(err); }
  };
  $('#pwChange').onclick = () => passwortDlg(false);
  $('#logout').onclick = () => DB.logout();

  /* ---------- Navigation ---------- */
  $('#nav').onclick = e => { const b = e.target.closest('button[data-view]'); if (b) go(b.dataset.view); };
  function go(v) {
    menuZu();
    S.view = v;
    $$('#nav button').forEach(b => { if (b.dataset.view === v) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current'); });
    const ue = S.rechnungen.filter(r => status(r) === 'ueberfaellig').length;
    const c = $('#navOverdue'); c.hidden = !ue; c.textContent = ue;
    $('#main').onclick = null; $('#main').oninput = null;
    ({ start: viewStart, rechnungen: viewRechnungen, neu: viewNeu, kunden: viewKunden, leistungen: viewLeistungen, ausgaben: viewAusgaben, einstellungen: viewFirma })[v]();
    $('#main').focus({ preventScroll: true }); window.scrollTo(0, 0);
  }

  /* ---------- Aktionsmenü (ein Symbol pro Zeile) ---------- */
  const menu = $('#menu');
  function menuZu() { menu.hidden = true; menu.innerHTML = ''; }
  document.addEventListener('click', e => { if (!e.target.closest('#menu') && !e.target.closest('[data-menu]')) menuZu(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') menuZu(); });
  window.addEventListener('scroll', menuZu, { passive: true });
  function menuAuf(btn, r) {
    const s = status(r), offen = s === 'offen' || s === 'ueberfaellig';
    const n = mahnungenZu(r).length;
    const items = r.importiert ? [['original', 'Original in Drive öffnen']] : [['show', 'Ansehen'], ['pdf', 'PDF herunterladen']];
    const nz = S.zOk ? zahlungenZu(r).length : 0;
    if (offen) items.push([S.zOk ? 'pay' : 'paid', S.zOk ? 'Zahlung eintragen' : 'Als bezahlt markieren', 'ok'], ['remind', (n ? (n + 1) + '. ' : '') + 'Zahlungserinnerung erstellen']);
    if (nz) items.push(['zahlungen', `Zahlungen ansehen (${nz})`]);
    else if (!S.zOk && s === 'bezahlt' && r.typ === 'rechnung') items.push(['unpaid', 'Zahlung zurücknehmen']);
    n && items.push(['mahnungen', `Erinnerungen ansehen (${n})`]);
    if (offen || (s === 'bezahlt' && r.typ === 'rechnung')) items.push(['sep'], ['storno', 'Stornieren', 'danger']);
    menu.innerHTML = items.map(([a, l, c]) => a === 'sep' ? '<hr>' : `<button class="${c || ''}" data-act="${a}" data-id="${r.id}">${l}</button>`).join('');
    menu.hidden = false;
    const b = btn.getBoundingClientRect(), mw = menu.offsetWidth, mh = menu.offsetHeight;
    let top = b.bottom + 6; if (top + mh > innerHeight - 10) top = b.top - mh - 6;
    menu.style.top = Math.max(10, top) + 'px'; menu.style.left = Math.max(10, b.right - mw) + 'px';
    menu.querySelector('button').focus();
  }
  menu.onclick = async e => {
    const b = e.target.closest('[data-act]'); if (!b) return;
    const r = S.rechnungen.find(x => x.id === b.dataset.id); menuZu(); if (!r) return;
    aktion(b.dataset.act, r);
  };

  async function aktion(a, r) {
    if (a === 'original') { if (r.original_url) window.open(r.original_url, '_blank', 'noopener'); else toast('Kein Original hinterlegt.', true); return; }
    if (a === 'show') return zeigeBeleg(MWDOC.modellRechnung(r), (r.typ === 'storno' ? 'Stornorechnung ' : 'Rechnung ') + r.nummer, MWPDF.datei(artVon(r), r));
    if (a === 'pdf') return guard(async () => { const info = MWPDF.datei(artVon(r), r); download(info.name, await MWPDF.blob(MWDOC.modellRechnung(r))); });
    if (a === 'paid') return bezahltDlg(r);
    if (a === 'pay') return zahlungDlg(r);
    if (a === 'zahlungen') return zahlungenDlg(r);
    if (a === 'mahnungen') return mahnungenDlg(r);
    if (a === 'unpaid') {
      if (!await confirmDlg('Zahlung zurücknehmen?', `Rechnung ${esc(r.nummer)} wird wieder als offen geführt.`, 'Zurücknehmen')) return;
      return guard(async () => { await DB.setBezahlt(r.id, null); await laden(); go(S.view); }, 'Zahlung zurückgenommen');
    }
    if (a === 'remind') {
      const stufe = mahnungenZu(r).length + 1, d = today(), frist = addDays(d, S.firma.mahnfrist_tage || 7);
      if (!await confirmDlg((stufe > 1 ? stufe + '. ' : '') + 'Zahlungserinnerung erstellen?', `Für Rechnung <b>${esc(r.nummer)}</b> über ${eur(r.brutto)}${gezahlt(r) ? ` (offen ${eur(offenBetrag(r))})` : ''} wird eine Zahlungserinnerung mit heutigem Datum erstellt. Neue Zahlungsfrist: <b>${dDE(frist)}</b>.`, 'Erinnerung erstellen')) return;
      return guard(async () => {
        const m = await DB.createMahnung({ rechnung_id: r.id, stufe, datum: d, frist_bis: frist });
        await laden(); go(S.view);
        await belegErstellt(mahnModell(r, m), (stufe > 1 ? stufe + '. ' : '') + 'Zahlungserinnerung zu ' + r.nummer, MWPDF.datei('mahnung', r, m));
      });
    }
    if (a === 'storno') {
      if (!await confirmDlg('Rechnung stornieren?', `Für <b>${esc(r.nummer)}</b> über ${eur(r.brutto)} wird eine Stornorechnung mit eigener Nummer erstellt. Das lässt sich nicht rückgängig machen.`, 'Stornieren', true)) return;
      return guard(async () => {
        const id = await DB.stornieren(r.id); await laden(); go(S.view);
        const s = S.rechnungen.find(x => x.id === id);
        if (s) await belegErstellt(MWDOC.modellRechnung(s), 'Stornorechnung ' + s.nummer, MWPDF.datei('storno', s));
      });
    }
  }

  /* Beleg anzeigen (mit A4-Vorschau) und Ablage-Status */
  function zeigeBeleg(md, titel, info, gespeichert) {
    openDlg(`<div class="dlg"><h2>${esc(titel)}</h2><div id="saveWhere"></div><div class="doc"><div class="paper" id="docPaper"></div></div>
      <div class="actions"><button class="btn" data-x="close">Schließen</button><button class="btn primary" data-x="dl">PDF herunterladen</button></div></div>`, true);
    MWDOC.mount($('#docPaper'), md);
    dlg.querySelector('[data-x=close]').onclick = closeDlg;
    dlg.querySelector('[data-x=dl]').onclick = () => guard(async () => download(info.name, await MWPDF.blob(md)));
    const box = (kind, head, sub) => { $('#saveWhere').innerHTML = `<div class="savebox ${kind}"><span class="ic">${{ ok: '✓', err: '!', info: 'i' }[kind]}</span><div><strong>${esc(head)}</strong>${sub ? `<span class="path">${esc(sub)}</span>` : ''}</div></div>`; };
    if (gespeichert && gespeichert.path) box('ok', 'Automatisch abgelegt', gespeichert.path + '/' + gespeichert.name);
    else if (gespeichert === null) box('err', 'Automatische Ablage hat nicht geklappt', AB.pdf.state === 'needs-permission' ? 'Bitte links „Ordner freigeben“ klicken. Die Datei wird dann nachgeholt.' : 'Bitte PDF herunterladen und von Hand ablegen.');
    else if (AB.pdf.state === 'on') box('ok', 'Liegt in der PDF-Ablage', `${AB.pdf.name}/${info.jahr}/${info.name}`);
    else box('info', 'Keine PDF-Ablage eingerichtet', 'Unter Einstellungen einen Ordner wählen, dann wird jeder Beleg automatisch gespeichert.');
  }
  async function belegErstellt(md, titel, info) {
    let res;
    if (AB.pdf.state === 'on') res = await AB.speicherePdf(info, await MWPDF.blob(md));
    else if (AB.pdf.state === 'needs-permission') res = null;
    zeigeBeleg(md, titel, info, res);
    ablageSyncSpaeter();
  }
  function mahnungenDlg(r) {
    const ms = mahnungenZu(r);
    openDlg(`<div class="dlg"><h2>Zahlungserinnerungen zu ${esc(r.nummer)}</h2><div class="list-simple">${ms.map(m => `<div><span>${m.stufe}. Erinnerung vom ${dDE(m.datum)} · Frist ${dDE(m.frist_bis)}</span><button class="btn small" data-m="${m.id}">Ansehen</button></div>`).join('')}</div>
      <div class="actions"><button class="btn" data-x>Schließen</button></div></div>`);
    dlg.querySelector('[data-x]').onclick = closeDlg;
    dlg.querySelectorAll('[data-m]').forEach(b => b.onclick = () => { const m = ms.find(x => x.id === b.dataset.m); zeigeBeleg(mahnModell(r, m), m.stufe + '. Zahlungserinnerung zu ' + r.nummer, MWPDF.datei('mahnung', r, m)); });
  }
  function bezahltDlg(r) {
    openDlg(`<form id="pf" class="dlg"><h2>Zahlung eintragen</h2><p class="sub">Rechnung ${esc(r.nummer)} über ${eur(r.brutto)}</p>
      <label class="f" style="margin-top:16px">Zahlungseingang am<input type="date" name="d" value="${today()}" required></label>
      <div class="actions"><button type="button" class="btn" data-x>Abbrechen</button><button class="btn primary">Speichern</button></div></form>`);
    dlg.querySelector('[data-x]').onclick = closeDlg;
    $('#pf').onsubmit = async e => {
      e.preventDefault(); const d = new FormData(e.target).get('d'); closeDlg();
      await guard(async () => { await DB.setBezahlt(r.id, d); await laden(); go(S.view); }, 'Als bezahlt markiert');
    };
  }

  function zahlungDlg(r) {
    const rest = offenBetrag(r), schon = gezahlt(r);
    openDlg(`<form id="zf" class="dlg"><h2>Zahlung eintragen</h2><p class="sub">Rechnung ${esc(r.nummer)} über ${eur(r.brutto)}${schon ? ` · bereits bezahlt ${eur(schon)} · offen ${eur(rest)}` : ''}</p>
      <div class="grid2" style="margin-top:16px">
        <label class="f">Betrag in €<input name="b" inputmode="decimal" value="${numIn(rest)}" required></label>
        <label class="f">Eingang am<input type="date" name="d" value="${today()}" max="${today()}" required></label>
        <label class="f span2">Notiz (optional)<input name="n" placeholder="z. B. Teilzahlung, über Vollstreckung"></label>
      </div>
      <p class="hint" style="margin-top:12px">Weniger als offen = Teilzahlung, die Rechnung bleibt offen. Ab dem vollen Betrag gilt sie als bezahlt.</p>
      <div class="actions"><button type="button" class="btn" data-x>Abbrechen</button><button class="btn primary">Speichern</button></div></form>`);
    dlg.querySelector('[data-x]').onclick = closeDlg;
    $('#zf').onsubmit = async e => {
      e.preventDefault(); const fd = new FormData(e.target), b = r2(num(fd.get('b'))), d = fd.get('d'), n = fd.get('n').trim();
      if (b <= 0) { toast('Bitte einen Betrag größer als 0 eingeben.', true); return; }
      if (b > rest + 0.005 && !await confirmDlg('Mehr als offen?', `Offen sind ${eur(rest)}, eingetragen werden ${eur(b)}. Das passt z. B. bei Zinsen und Kosten aus einer Vollstreckung.`, 'Trotzdem speichern')) return;
      closeDlg();
      await guard(async () => { await DB.createZahlung({ rechnung_id: r.id, datum: d, betrag: b, notiz: n || null }); await laden(); go(S.view); },
        b >= rest - 0.005 ? 'Zahlung eingetragen, Rechnung bezahlt' : 'Teilzahlung eingetragen');
    };
  }
  function zahlungenDlg(r) {
    const zs = zahlungenZu(r), sum = gezahlt(r);
    openDlg(`<div class="dlg"><h2>Zahlungen zu ${esc(r.nummer)}</h2><p class="sub">Rechnung über ${eur(r.brutto)} · bezahlt ${eur(sum)}${offenBetrag(r) ? ` · offen ${eur(offenBetrag(r))}` : ''}</p>
      <div class="list-simple" style="margin-top:14px">${zs.map(z => `<div><span>${dDE(z.datum)} · <b>${eur(z.betrag)}</b>${z.notiz ? ` <span class="muted">· ${esc(z.notiz)}</span>` : ''}</span><button class="btn small danger" data-z="${z.id}">Entfernen</button></div>`).join('')}</div>
      <div class="actions">${offenBetrag(r) ? '<button class="btn" data-pay>Weitere Zahlung</button>' : ''}<button class="btn" data-x>Schließen</button></div></div>`);
    dlg.querySelector('[data-x]').onclick = closeDlg;
    const p = dlg.querySelector('[data-pay]'); if (p) p.onclick = () => zahlungDlg(r);
    dlg.querySelectorAll('[data-z]').forEach(b => b.onclick = async () => {
      const z = zs.find(x => x.id === b.dataset.z);
      if (!await confirmDlg('Zahlung entfernen?', `Die Zahlung vom ${dDE(z.datum)} über ${eur(z.betrag)} wird gelöscht. Nur für Tippfehler gedacht.`, 'Entfernen', true)) return;
      await guard(async () => { await DB.deleteZahlung(z.id); await laden(); go(S.view); }, 'Zahlung entfernt');
    });
  }

  /* ---------- Rechnungstabelle ---------- */
  function rechnungTabelle(list) {
    return `<div class="table-wrap"><table class="list"><thead><tr><th>Nummer</th><th>Datum</th><th>Kunde</th><th class="num">Betrag</th><th>Status</th><th>Fällig / bezahlt</th><th class="col-menu"></th></tr></thead><tbody>
      ${list.map(r => {
        const s = status(r), n = mahnungenZu(r).length;
        let info;
        if (s === 'bezahlt' && r.typ === 'rechnung') info = `<small>bezahlt am</small>${dDE(r.bezahlt_am)}`;
        else if (s === 'storniert') info = `<small>storniert durch</small>${esc((S.rechnungen.find(x => x.id === r.storniert_durch) || {}).nummer || '')}`;
        else if (s === 'storno') info = `<small>storniert</small>${esc((S.rechnungen.find(x => x.id === r.storno_von) || {}).nummer || '')}`;
        else info = `<small>fällig am</small>${dDE(faellig(r))}${n ? `<small>${n}× erinnert</small>` : ''}`;
        const teil = (s === 'offen' || s === 'ueberfaellig') && gezahlt(r) > 0;
        return `<tr><td class="nowrap">${esc(r.nummer)}</td><td class="nowrap">${dDE(r.datum)}</td><td>${esc(kundeName(r.kunde_snapshot))}</td>
          <td class="num">${eur(r.brutto)}${teil ? `<small class="teil">offen ${eur(offenBetrag(r))}</small>` : ''}</td><td>${badge(s)}</td><td><div class="due ${s === 'ueberfaellig' ? 'late' : ''}">${info}</div></td>
          <td class="col-menu"><button class="icon-btn" data-menu="${r.id}" aria-label="Aktionen für ${esc(r.nummer)}" title="Aktionen">⋯</button></td></tr>`;
      }).join('')}</tbody></table></div>`;
  }
  function bindTabelle() {
    $('#main').onclick = e => {
      const b = e.target.closest('[data-menu]'); if (!b) return;
      const r = S.rechnungen.find(x => x.id === b.dataset.menu);
      if (!menu.hidden && menu.dataset.for === r.id) return menuZu();
      menu.dataset.for = r.id; menuAuf(b, r);
    };
  }

  /* ---------- Übersicht: Jahr → Monat → Woche ---------- */
  const MON = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];
  const TAG = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];
  const U = iso => new Date(iso + 'T00:00:00Z');
  const isoU = d => d.toISOString().slice(0, 10);
  const plusU = (iso, n) => { const d = U(iso); d.setUTCDate(d.getUTCDate() + n); return isoU(d); };
  const montag = iso => plusU(iso, -((U(iso).getUTCDay() + 6) % 7));
  const tageZw = (a, b) => Math.round((U(b) - U(a)) / 864e5) + 1;
  function kw(iso) { const d = U(iso); d.setUTCDate(d.getUTCDate() + 3 - (d.getUTCDay() + 6) % 7); const j = new Date(Date.UTC(d.getUTCFullYear(), 0, 4)); return 1 + Math.round(((d - j) / 864e5 - 3 + (j.getUTCDay() + 6) % 7) / 7); }
  const ddmm = iso => iso.slice(8, 10) + '.' + iso.slice(5, 7) + '.';
  const monatsEnde = (y, m) => isoU(new Date(Date.UTC(y, m + 1, 0)));

  /* Fixkosten: alles auf Monatsbasis, Jahresbeträge anteilig */
  const fixMonat = f => Number(f.betrag) / ({ monatlich: 1, quartalsweise: 3, 'jährlich': 12 }[f.intervall] || 1);
  const fixProMonat = () => r2(S.fixkosten.filter(f => f.aktiv).reduce((a, f) => a + fixMonat(f), 0));
  function fixFuer(art, von, bis) {
    const m = fixProMonat();
    if (art === 'jahr') return m * 12;
    if (art === 'monat') return m;
    if (art === 'woche' && tageZw(von, bis) === 7) return m * 12 / 52;
    return m * 12 / 365 * tageZw(von, bis);
  }

  function periode(art, ref) {
    const y = +ref.slice(0, 4), mo = +ref.slice(5, 7) - 1;
    if (art === 'jahr') return { art, von: y + '-01-01', bis: y + '-12-31', titel: String(y),
      teile: MON.map((n, i) => { const v = `${y}-${String(i + 1).padStart(2, '0')}-01`; return { art: 'monat', von: v, bis: monatsEnde(y, i), kurz: n.slice(0, 3), lang: n + ' ' + y }; }) };
    if (art === 'monat') {
      const von = ref.slice(0, 8) + '01', bis = monatsEnde(y, mo), teile = [];
      for (let w = montag(von); w <= bis; w = plusU(w, 7)) {
        const a = w < von ? von : w, b = plusU(w, 6) > bis ? bis : plusU(w, 6);
        teile.push({ art: 'woche', von: a, bis: b, ref: w, kurz: 'KW ' + kw(w), lang: `KW ${kw(w)} · ${ddmm(a)}–${ddmm(b)}${tageZw(a, b) < 7 ? ' (anteilig)' : ''}` });
      }
      return { art, von, bis, titel: MON[mo] + ' ' + y, teile };
    }
    const von = montag(ref), bis = plusU(von, 6);
    return { art, von, bis, titel: `KW ${kw(von)} · ${dDE(von)} – ${dDE(bis)}`,
      teile: TAG.map((t, i) => { const d = plusU(von, i); return { art: 'tag', von: d, bis: d, kurz: t + ' ' + ddmm(d), lang: t + ', ' + dDE(d) }; }) };
  }
  function verschieben(p, n) {
    if (p.art === 'jahr') return (+p.ref.slice(0, 4) + n) + p.ref.slice(4, 8) + '01';
    if (p.art === 'monat') { const d = U(p.ref.slice(0, 8) + '01'); d.setUTCMonth(d.getUTCMonth() + n); return isoU(d); }
    return plusU(montag(p.ref), 7 * n);
  }
  const imZeitraum = (iso, von, bis) => iso >= von && iso <= bis;
  const summeA = (von, bis) => r2(S.ausgaben.filter(a => imZeitraum(a.datum, von, bis)).reduce((s, a) => s + Number(a.betrag), 0));
  const summeZ = (von, bis) => r2(S.zahlungen.filter(z => imZeitraum(z.datum, von, bis)).reduce((a, z) => a + Number(z.betrag), 0));

  function viewStart() {
    const P = S.periode, pr = periode(P.art, P.ref), heute = today();
    const zs = S.zahlungen.filter(z => imZeitraum(z.datum, pr.von, pr.bis)).sort((a, b) => b.datum.localeCompare(a.datum));
    const eingang = r2(zs.reduce((a, z) => a + Number(z.betrag), 0));
    const fix = r2(fixFuer(pr.art, pr.von, pr.bis)), fm = fixProMonat();
    const as = S.ausgaben.filter(a => imZeitraum(a.datum, pr.von, pr.bis));
    const variabel = r2(as.reduce((s, a) => s + Number(a.betrag), 0)), kosten = r2(fix + variabel);
    const ergebnis = r2(eingang - kosten), deckung = kosten ? Math.round(eingang / kosten * 100) : 0;
    const rs = S.rechnungen.filter(r => imZeitraum(r.datum, pr.von, pr.bis));
    const umsatz = r2(rs.reduce((a, r) => a + Number(r.brutto), 0));
    const offen = S.rechnungen.filter(r => r.typ === 'rechnung' && r.status === 'offen');
    const offenSum = r2(offen.reduce((a, r) => a + offenBetrag(r), 0));
    const ue = offen.filter(r => status(r) === 'ueberfaellig'), ueSum = r2(ue.reduce((a, r) => a + offenBetrag(r), 0));
    const j = heute.slice(0, 4), umsatzJ = r2(S.rechnungen.filter(r => r.datum.startsWith(j)).reduce((a, r) => a + Number(r.brutto), 0));
    const G = C.grenzeVorjahr, pct = Math.min(100, umsatzJ / G * 100), rest = G - umsatzJ, cls = pct >= 90 ? 'crit' : pct >= 70 ? 'warn' : '';
    const laeuft = imZeitraum(heute, pr.von, pr.bis);
    const fl = S.fixkosten.filter(f => f.aktiv).map(f => ({ ...f, anteil: fm ? r2(fixMonat(f) * fix / fm) : 0 })).sort((x, y) => y.anteil - x.anteil);
    const kunde = id => { const r = S.rechnungen.find(x => x.id === id); return r ? r : {}; };

    $('#main').innerHTML = `
      <div class="head"><div><h1>Übersicht</h1><p class="sub">${esc(S.firma.marke)} · Einnahmen und Kosten</p></div>
        <div class="btn-row"><button class="btn" data-aus-neu>Ausgabe erfassen</button><button class="btn primary" data-go="neu">Neue Rechnung</button></div></div>
      ${S.zOk ? '' : '<p class="note">Zahlungen und Fixkosten sind noch nicht eingerichtet. Bitte einmal <b>03_zahlungen_fixkosten.sql</b> im Supabase SQL Editor ausführen. Bis dahin zählt jede bezahlte Rechnung als eine Zahlung, Fixkosten fehlen.</p>'}
      <div class="ptool">
        <div class="seg" role="group" aria-label="Zeitraum">${['jahr', 'monat', 'woche'].map(a => `<button data-p-art="${a}" aria-pressed="${a === pr.art}">${{ jahr: 'Jahr', monat: 'Monat', woche: 'Woche' }[a]}</button>`).join('')}</div>
        <div class="pnav"><button class="btn icon" data-p-nav="-1" aria-label="Zurück">‹</button><strong>${esc(pr.titel)}</strong><button class="btn icon" data-p-nav="1" aria-label="Weiter">›</button>
          ${laeuft ? '' : '<button class="btn small" data-p-heute>Heute</button>'}</div>
      </div>
      <div class="summary">
        <div><span class="l">Eingegangen</span><span class="v">${eur(eingang)}</span><span class="s">${zs.length} ${zs.length === 1 ? 'Zahlung' : 'Zahlungen'} · ${eur(umsatz)} in Rechnung gestellt</span></div>
        <div><span class="l">Kosten gesamt</span><span class="v">${eur(kosten)}</span><span class="s">${eur(fix)} fix · ${eur(variabel)} variabel</span></div>
        <div class="${ergebnis < 0 ? 'alert' : ''}"><span class="l">${ergebnis < 0 ? 'Fehlt noch' : 'Ergebnis'}</span><span class="v ${ergebnis >= 0 ? 'ok' : ''}">${eur(Math.abs(ergebnis))}</span>
          <div class="bar ${deckung >= 100 ? '' : 'crit'}"><i style="width:${Math.min(100, deckung)}%"></i></div><span class="s">${kosten ? deckung + ' % der Kosten gedeckt' : 'Keine Kosten hinterlegt'}</span></div>
        <div class="${ue.length ? 'alert' : ''}"><span class="l">Offen</span><span class="v">${eur(offenSum)}</span><span class="s">${offen.length} Rechnungen${ue.length ? ` · ${ue.length} überfällig` : ''}</span></div>
      </div>
      <div class="panel chart-panel">
        <div class="chart-head"><h2>Eingänge und Ausgaben ${pr.art === 'jahr' ? 'pro Monat' : pr.art === 'monat' ? 'pro Woche' : 'pro Tag'}</h2>
          <span class="legend"><i class="lg-bar"></i>Eingegangen <i class="lg-bar aus"></i>Ausgaben <i class="lg-line"></i>Fixkosten${pr.art === 'woche' ? ' pro Tag' : pr.art === 'monat' ? ' pro Woche' : ' pro Monat'}</span></div>
        <div id="chart" class="chart"></div>
        ${pr.art !== 'woche' ? `<p class="hint" style="margin:8px 0 0">Balken anklicken, um ${pr.art === 'jahr' ? 'den Monat' : 'die Woche'} zu öffnen. Jahresbeiträge (z. B. Versicherung) sind auf die Monate verteilt.</p>` : ''}
      </div>
      <div class="cards3">
        <div class="panel mini">
          <div class="chart-head"><h2>Eingänge</h2><span class="muted">${eur(eingang)}</span></div>
          ${zs.length ? `<div class="mini-list">${(S.ui.zAlle ? zs : zs.slice(0, 3)).map(z => { const r = kunde(z.rechnung_id); return `<div><span class="d">${ddmm(z.datum)}</span><span class="t">${esc(kundeName(r.kunde_snapshot))}<small>${esc(r.nummer || '')}${z.notiz ? ' · ' + esc(z.notiz) : ''}</small></span><b>${eur(z.betrag)}</b></div>`; }).join('')}</div>
            ${zs.length > 3 ? `<button class="btn link small more" data-toggle="zAlle">${S.ui.zAlle ? 'Weniger anzeigen' : `Alle ${zs.length} anzeigen`}</button>` : ''}` : '<p class="empty small">Keine Zahlungseingänge in diesem Zeitraum.</p>'}
        </div>
        <div class="panel mini">
          <div class="chart-head"><h2>Fixkosten</h2><span class="muted">${eur(fix)}</span></div>
          ${fl.length ? `<div class="mini-list">${(S.ui.fAlle ? fl : fl.slice(0, 3)).map(f => `<div class="nodate"><span class="t">${esc(f.anbieter)}<small>${esc(f.kategorie)} · ${eur(f.betrag)} ${{ monatlich: 'monatlich', quartalsweise: 'pro Quartal', 'jährlich': 'jährlich' }[f.intervall] || ''}</small></span><b>${eur(f.anteil)}</b></div>`).join('')}</div>
            ${fl.length > 3 ? `<button class="btn link small more" data-toggle="fAlle">${S.ui.fAlle ? 'Weniger anzeigen' : `Alle ${fl.length} anzeigen`}</button>` : ''}` : '<p class="empty small">Keine Fixkosten hinterlegt.</p>'}
          <button class="btn small" data-go-settings style="margin-top:12px">Fixkosten bearbeiten</button>
        </div>
        <div class="panel mini">
          <div class="chart-head"><h2>Variable Ausgaben</h2><span class="muted">${eur(variabel)}</span></div>
          <div id="belegHinweis">${belegHinweis()}</div>
          ${as.length ? `<div class="mini-list">${(S.ui.aAlle ? as : as.slice(0, 3)).map(x => `<div class="click" data-aus-e="${x.id}"><span class="d">${ddmm(x.datum)}</span><span class="t">${esc(x.lieferant)}<small>${esc([x.kategorie, x.beschreibung].filter(Boolean).join(' · '))}</small></span><b>${eur(x.betrag)}</b></div>`).join('')}</div>
            ${as.length > 3 ? `<button class="btn link small more" data-toggle="aAlle">${S.ui.aAlle ? 'Weniger anzeigen' : `Alle ${as.length} anzeigen`}</button>` : ''}` : '<p class="empty small">Keine Ausgaben in diesem Zeitraum.</p>'}
          <button class="btn small" data-aus-neu style="margin-top:12px">+ Ausgabe</button>
        </div>
      </div>
      <div class="panel grenze"><div><span class="l">Kleinunternehmergrenze ${j}</span><b>${Math.round(pct)} %</b></div><div class="bar ${cls}"><i style="width:${pct}%"></i></div>
        <span class="s">Umsatz ${eur(umsatzJ)} · ${rest > 0 ? `noch ${eur(rest)} bis ${eur(G)}` : `${eur(G)} überschritten`}</span></div>
      ${pct >= 70 ? `<p class="note">Liegt der Umsatz ${j} über ${eur(G)}, gilt ab 1. Januar ${+j + 1} die Kleinunternehmerregelung nicht mehr. Über ${eur(C.grenzeLaufend)} im laufenden Jahr endet sie sofort. Rechtzeitig steuerlich klären und den Wechsel zu lexoffice planen.</p>` : ''}
      <h2 class="section">Offene Rechnungen</h2>
      ${offen.length ? rechnungTabelle([...offen].sort((a, b) => faellig(a).localeCompare(faellig(b)))) : '<div class="table-wrap"><p class="empty">Keine offenen Rechnungen.</p></div>'}`;
    bindTabelle();
    const tab = $('#main').onclick;
    $('#main').onclick = e => {
      const a = e.target.closest('[data-p-art]'), n = e.target.closest('[data-p-nav]'), h = e.target.closest('[data-p-heute]'), bar = e.target.closest('[data-drill]');
      if (a) { P.art = a.dataset.pArt; if (!imZeitraum(P.ref, pr.von, pr.bis)) P.ref = pr.von; if (imZeitraum(heute, pr.von, pr.bis)) P.ref = heute; return viewStart(); }
      if (n) { P.ref = verschieben({ art: pr.art, ref: P.ref }, +n.dataset.pNav); return viewStart(); }
      if (h) { P.ref = heute; return viewStart(); }
      const tg = e.target.closest('[data-toggle]'); if (tg) { S.ui[tg.dataset.toggle] = !S.ui[tg.dataset.toggle]; return viewStart(); }
      if (e.target.closest('[data-aus-neu]')) return ausgabeDlg(null, viewStart);
      const ae = e.target.closest('[data-aus-e]'); if (ae) return ausgabeDlg(S.ausgaben.find(x => x.id === ae.dataset.ausE), viewStart);
      if (bar) { const t = pr.teile[+bar.dataset.drill]; P.art = t.art; P.ref = t.ref || t.von; return viewStart(); }
      tab(e);
    };
    $('[data-go=neu]').addEventListener('click', () => go('neu'));
    zeichneChart(pr);
  }

  /* Balken: Eingänge je Teilzeitraum, gestrichelte Linie: Fixkosten je Teilzeitraum */
  function zeichneChart(pr) {
    const box = $('#chart'); if (!box) return;
    const W = Math.max(300, box.clientWidth), H = 240, L = 58, R = 12, T = 14, B = 30, heute = today();
    const daten = pr.teile.map(t => ({ ...t, ein: summeZ(t.von, t.bis), aus: summeA(t.von, t.bis), fix: r2(fixFuer(t.art, t.von, t.bis)), zukunft: t.von > heute, jetzt: imZeitraum(heute, t.von, t.bis) }));
    const ref = pr.art === 'monat' ? fixFuer('woche', '2000-01-03', '2000-01-09') : pr.art === 'woche' ? fixFuer('tag', '2000-01-03', '2000-01-03') : fixFuer('monat');
    const max = Math.max(ref * 1.15, ...daten.map(d => Math.max(d.ein, d.aus)), 10);
    const schritt = [10, 20, 25, 50, 100, 200, 250, 500, 1000, 2000, 2500, 5000, 10000].find(s => max / s <= 4) || 20000;
    const top = Math.ceil(max * 1.08 / schritt) * schritt, y = v => T + (H - T - B) * (1 - v / top);
    const bw = (W - L - R) / daten.length, bar = Math.min(26, (bw * 0.7 - 2) / 2);
    const kurzEur = v => v >= 1000 ? (v / 1000).toLocaleString('de-DE', { maximumFractionDigits: 1 }) + ' T€' : Math.round(v) + ' €';
    let g = '';
    for (let v = 0; v <= top + 0.01; v += schritt) g += `<line x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}" class="grid"/><text x="${L - 8}" y="${y(v) + 4}" class="ax" text-anchor="end">${kurzEur(v)}</text>`;
    const bars = daten.map((d, i) => {
      const x0 = L + i * bw + (bw - 2 * bar - 2) / 2;
      const saeule = (x, v, cls) => { const h = Math.max(0, y(0) - y(v)), rr = Math.min(4, h, bar / 2); return h > 0 ? `<path class="${cls}" d="M${x},${y(0)} v${-(h - rr)} q0,${-rr} ${rr},${-rr} h${bar - 2 * rr} q${rr},0 ${rr},${rr} v${h - rr} z"/>` : ''; };
      const path = saeule(x0, d.ein, 'b') + saeule(x0 + bar + 2, d.aus, 'b aus');
      return `<g class="col${d.zukunft ? ' fut' : ''}${d.jetzt ? ' now' : ''}" data-i="${i}" ${pr.art !== 'woche' ? `data-drill="${i}"` : ''}>
        <rect class="hit" x="${L + i * bw}" y="${T}" width="${bw}" height="${H - T - B + 24}"/>${path}
        <text x="${L + i * bw + bw / 2}" y="${H - 10}" class="ax${d.jetzt ? ' cur' : ''}" text-anchor="middle">${esc(bw >= 64 ? d.kurz : pr.art === 'jahr' ? (bw >= 30 ? d.kurz.slice(0, 3) : d.kurz[0]) : pr.art === 'monat' ? d.kurz.replace('KW ', '') : d.kurz.slice(0, 2))}</text></g>`;
    }).join('');
    const ly = y(ref);
    box.innerHTML = `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="Eingänge ${esc(pr.titel)}">${g}${bars}
      ${ref > 0 ? `<line x1="${L}" x2="${W - R}" y1="${ly}" y2="${ly}" class="ref"/><text x="${W - R}" y="${ly - 6}" class="ax ref-t" text-anchor="end">${eur(ref)}</text>` : ''}</svg><div class="tip" hidden></div>`;
    const tip = box.querySelector('.tip');
    box.querySelectorAll('.col').forEach(c => {
      const d = daten[+c.dataset.i];
      c.addEventListener('mouseenter', () => {
        const diff = r2(d.ein - d.fix - d.aus);
        tip.innerHTML = `<strong>${esc(d.lang)}</strong><div><span>Eingegangen</span><b>${eur(d.ein)}</b></div><div><span>Fixkosten</span><b>${eur(d.fix)}</b></div><div><span>Ausgaben</span><b>${eur(d.aus)}</b></div><div class="sum"><span>${diff < 0 ? 'Fehlt' : 'Ergebnis'}</span><b>${eur(Math.abs(diff))}</b></div>`;
        tip.hidden = false;
        const x = L + (+c.dataset.i + 0.5) * bw; tip.style.left = Math.min(W - tip.offsetWidth - 4, Math.max(4, x - tip.offsetWidth / 2)) + 'px';
        tip.style.top = Math.max(0, y(Math.max(d.ein, d.aus, ref)) - tip.offsetHeight - 10) + 'px';
      });
      c.addEventListener('mouseleave', () => { tip.hidden = true; });
    });
  }
  window.addEventListener('resize', () => { if (S.view === 'start' && S.firma) { clearTimeout(window._rz); window._rz = setTimeout(() => zeichneChart(periode(S.periode.art, S.periode.ref)), 150); } });

  /* ---------- Rechnungen ---------- */
  function viewRechnungen() {
    const jahre = [...new Set(S.rechnungen.map(r => r.datum.slice(0, 4)))].sort().reverse();
    const f = S.filter;
    let list = S.rechnungen;
    if (f.jahr !== 'alle') list = list.filter(r => r.datum.startsWith(f.jahr));
    if (f.status !== 'alle') list = list.filter(r => status(r) === f.status || (f.status === 'offen' && status(r) === 'ueberfaellig'));
    const opt = (v, l, cur) => `<option value="${v}" ${v === cur ? 'selected' : ''}>${l}</option>`;
    $('#main').innerHTML = `
      <div class="head"><div><h1>Rechnungen</h1><p class="sub">Nach dem Erstellen festgeschrieben. Korrekturen nur per Storno.</p></div>
        <div class="btn-row"><button class="btn" id="csv">CSV für EÜR</button><button class="btn primary" data-go="neu">Neue Rechnung</button></div></div>
      <div class="toolbar">
        <select id="fJahr">${opt('alle', 'Alle Jahre', f.jahr)}${jahre.map(j => opt(j, j, f.jahr)).join('')}</select>
        <select id="fStatus">${opt('alle', 'Alle Status', f.status)}${opt('offen', 'Offen', f.status)}${opt('ueberfaellig', 'Überfällig', f.status)}${opt('bezahlt', 'Bezahlt', f.status)}${opt('storniert', 'Storniert', f.status)}${opt('storno', 'Stornorechnungen', f.status)}</select>
      </div>
      ${list.length ? rechnungTabelle(list) : '<div class="table-wrap"><p class="empty">Keine Rechnungen gefunden.</p></div>'}`;
    $('#fJahr').onchange = e => { f.jahr = e.target.value; viewRechnungen(); };
    $('#fStatus').onchange = e => { f.status = e.target.value; viewRechnungen(); };
    $('[data-go=neu]').onclick = () => go('neu');
    $('#csv').onclick = () => csvExport(list);
    bindTabelle();
  }
  function csvExport(list) {
    const rows = [['Nummer', 'Typ', 'Datum', 'Leistungsdatum', 'Kunde', 'Land', 'Netto', 'MwSt', 'Brutto', 'Gezahlt', 'Status', 'Bezahlt am']];
    [...list].sort((a, b) => a.nummer.localeCompare(b.nummer)).forEach(r => rows.push([r.nummer, r.typ === 'storno' ? 'Storno' : 'Rechnung', dDE(r.datum), dDE(r.leistungsdatum),
      kundeName(r.kunde_snapshot), (r.kunde_snapshot || {}).land || '', numIn(r.netto), numIn(r.mwst), numIn(r.brutto), r.typ === 'rechnung' ? numIn(gezahlt(r)) : '', STATUS_TXT[status(r)], dDE(r.bezahlt_am)]));
    const csv = '﻿' + rows.map(z => z.map(v => '"' + String(v ?? '').replace(/"/g, '""') + '"').join(';')).join('\r\n');
    download('Mediawo_Rechnungen_' + today() + '.csv', new Blob([csv], { type: 'text/csv;charset=utf-8' }));
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
      <div class="head"><div><h1>Neue Rechnung</h1><p class="sub">Die Nummer wird beim Erstellen vergeben. Danach ist die Rechnung festgeschrieben.</p></div></div>
      <div class="compose">
        <div class="stack">
          <div class="panel"><h2>Kunde & Daten</h2>
            <div class="grid2">
              <label class="f span2">Kunde<div class="inline"><select id="dKunde"><option value="">Bitte wählen …</option>
                ${S.kunden.filter(k => k.status !== 'inaktiv' || k.id === d.kunde_id).map(k => `<option value="${k.id}" ${k.id === d.kunde_id ? 'selected' : ''}>${esc(kundeName(k))}</option>`).join('')}</select>
                <button type="button" class="btn" id="dNeuKunde">Neu</button></div></label>
              <label class="f">Rechnungsdatum<input type="date" id="dDatum" value="${d.datum}"></label>
              <label class="f">${d.zeitraum ? 'Leistung von' : 'Leistungsdatum'}<input type="date" id="dLeist" value="${d.leistungsdatum}"></label>
              <label class="check"><input type="checkbox" id="dZeitraum" ${d.zeitraum ? 'checked' : ''}> Leistungszeitraum statt Datum</label>
              <label class="f" ${d.zeitraum ? '' : 'hidden'}>Leistung bis<input type="date" id="dBis" value="${d.leistungszeitraum_bis}"></label>
            </div>
          </div>
          <div class="panel"><h2>Positionen</h2>
            <div class="pos-list" id="posList"></div>
            ${S.leistungen.some(l => l.aktiv) ? '' : '<p class="note" style="margin-top:12px">Noch keine Leistungen angelegt. Bitte zuerst unter „Leistungen“ den Katalog füllen.</p>'}
            <div class="btn-row" style="margin-top:12px"><button type="button" class="btn" id="posAdd">+ Position hinzufügen</button></div>
            <div class="totals" id="dTotals"></div>
          </div>
          <div class="panel"><h2>Texte</h2>
            <div class="stack" style="gap:12px">
              <label class="f">Text über der Tabelle<textarea id="dEin">${esc(d.einleitung)}</textarea></label>
              <label class="f">Text unter der Tabelle<textarea id="dSchluss">${esc(d.schluss)}</textarea></label>
            </div>
          </div>
          <div class="btn-row end">
            <button class="btn link" id="dReset">Verwerfen</button>
            <button class="btn primary" id="dCreate">Rechnung erstellen</button>
          </div>
        </div>
        <aside class="desk"><p class="cap"><span>Vorschau</span><button class="btn link small" id="dPdf">Als PDF öffnen</button></p><div class="paper" id="dPaper"></div></aside>
      </div>`;
    renderPos();
    const sync = () => { d.kunde_id = $('#dKunde').value; d.datum = $('#dDatum').value; d.leistungsdatum = $('#dLeist').value; d.leistungszeitraum_bis = $('#dBis').value; d.einleitung = $('#dEin').value; d.schluss = $('#dSchluss').value; vorschau(); };
    ['#dKunde', '#dDatum', '#dLeist', '#dBis', '#dEin', '#dSchluss'].forEach(s => $(s).addEventListener('input', sync));
    $('#dKunde').addEventListener('change', sync);
    $('#dZeitraum').onchange = e => { sync(); d.zeitraum = e.target.checked; if (!d.zeitraum) d.leistungszeitraum_bis = ''; viewNeu(); };
    $('#dNeuKunde').onclick = () => kundeDlg(null, k => { sync(); d.kunde_id = k.id; viewNeu(); });
    $('#posAdd').onclick = () => { d.positionen.push({ bezeichnung: '', beschreibung: '', menge: 1, einheit: 'Stück', einzelpreis: 0 }); renderPos(); };
    $('#dReset').onclick = async () => { if (await confirmDlg('Entwurf verwerfen?', 'Alle Eingaben dieser Rechnung gehen verloren.', 'Verwerfen', true)) { S.draft = null; viewNeu(); } };
    $('#dPdf').onclick = async () => { const r = entwurfAlsRechnung(true); if (!r) return; await guard(async () => { const doc = await MWPDF.zeichnen(MWDOC.modellRechnung(r)); window.open(doc.output('bloburl'), '_blank'); }); };
    $('#dCreate').onclick = async () => {
      const r = entwurfAlsRechnung(); if (!r) return;
      const ok = await confirmDlg('Rechnung erstellen?', `Rechnung an <b>${esc(kundeName(r.kunde_snapshot))}</b> über <b>${eur(r.brutto)}</b>.<br><br>Sie bekommt die nächste fortlaufende Nummer und ist danach <b>nicht mehr änderbar</b>. Korrekturen gehen nur per Storno.`, 'Jetzt erstellen');
      if (!ok) return;
      $('#dCreate').disabled = true;
      await guard(async () => {
        const id = await DB.createRechnung({
          kunde_id: d.kunde_id, datum: d.datum, leistungsdatum: d.leistungsdatum, leistungszeitraum_bis: d.zeitraum ? d.leistungszeitraum_bis : null,
          positionen: r.rechnung_positionen.map(p => ({ bezeichnung: p.bezeichnung, beschreibung: p.beschreibung || null, menge: p.menge, einheit: p.einheit, einzelpreis: p.einzelpreis })),
          einleitung: d.einleitung, schluss: d.schluss
        });
        S.draft = null; await laden(); go('rechnungen');
        const neu = S.rechnungen.find(x => x.id === id);
        if (neu) { toast('Rechnung ' + neu.nummer + ' erstellt'); await belegErstellt(MWDOC.modellRechnung(neu), 'Rechnung ' + neu.nummer, MWPDF.datei('rechnung', neu)); }
      });
      const b = $('#dCreate'); if (b) b.disabled = false;
    };
    vorschau();
  }
  let vTimer = null;
  function vorschau() {
    clearTimeout(vTimer);
    vTimer = setTimeout(() => { const el = $('#dPaper'); if (!el) return; const r = entwurfAlsRechnung(true); MWDOC.mount(el, MWDOC.modellRechnung(r)); }, 120);
  }
  function renderPos() {
    const d = S.draft;
    $('#posList').innerHTML = d.positionen.map((p, i) => `<div class="pos" data-i="${i}">
      <label class="f full">Leistung<select data-k="leistung"><option value="">Leistung wählen …</option>
        ${S.leistungen.filter(l => l.aktiv || l.name === p.bezeichnung).map(l => `<option value="${l.id}" ${l.name === p.bezeichnung ? 'selected' : ''}>${esc(l.name)} · ${eur(l.preis)}${l.einheit && l.einheit !== 'Stück' ? ' / ' + esc(l.einheit) : ''}</option>`).join('')}
        ${p.bezeichnung && !S.leistungen.some(l => l.name === p.bezeichnung) ? `<option selected>${esc(p.bezeichnung)}</option>` : ''}</select></label>
      <label class="f full">Beschreibung (optional)<input data-k="beschreibung" value="${esc(p.beschreibung)}" placeholder="erscheint klein darunter"></label>
      <label class="f">Menge<input data-k="menge" inputmode="decimal" value="${esc(String(p.menge).replace('.', ','))}"></label>
      <label class="f">Einzelpreis in €<input data-k="einzelpreis" inputmode="decimal" value="${numIn(p.einzelpreis)}"></label>
      <div class="f"><span>Gesamt</span><output data-sum>${eur(num(p.menge) * num(p.einzelpreis))}</output></div>
      <button type="button" class="x" data-del title="Position entfernen" aria-label="Position entfernen" ${d.positionen.length < 2 ? 'disabled' : ''}>✕</button></div>`).join('');
    $('#posList').oninput = e => {
      const box = e.target.closest('.pos'), k = e.target.dataset.k; if (!box || !k) return;
      const p = d.positionen[+box.dataset.i];
      if (k === 'leistung') {
        const l = S.leistungen.find(x => x.id === e.target.value);
        if (l) { p.bezeichnung = l.name; p.einheit = l.einheit || 'Stück'; p.einzelpreis = Number(l.preis); if (!p.beschreibung && l.beschreibung) p.beschreibung = l.beschreibung; }
        else { p.bezeichnung = ''; }
        return renderPos();
      }
      p[k] = e.target.value;
      box.querySelector('[data-sum]').textContent = eur(num(p.menge) * num(p.einzelpreis));
      totals(); vorschau();
    };
    $('#posList').onchange = $('#posList').oninput;
    $('#posList').onclick = e => { if (e.target.closest('[data-del]')) { d.positionen.splice(+e.target.closest('.pos').dataset.i, 1); renderPos(); } };
    totals(); vorschau();
  }
  function totals() {
    const f = S.firma, netto = r2(S.draft.positionen.reduce((a, p) => a + r2(num(p.menge) * num(p.einzelpreis)), 0));
    const satz = f.kleinunternehmer ? 0 : Number(f.mwst_satz), mwst = r2(netto * satz / 100);
    $('#dTotals').innerHTML = (satz ? `<span class="muted">Netto</span><span class="num">${eur(netto)}</span><span class="muted">MwSt. ${satz} %</span><span class="num">${eur(mwst)}</span>` : '')
      + `<span class="g">Gesamt</span><span class="g num">${eur(netto + mwst)}</span>`;
  }
  /* entwurf=true: für die Vorschau, ohne Prüfungen */
  function entwurfAlsRechnung(fuerVorschau) {
    const d = S.draft, f = S.firma;
    const k = S.kunden.find(x => x.id === d.kunde_id);
    const pos = d.positionen.filter(p => fuerVorschau || p.bezeichnung.trim() || num(p.einzelpreis));
    if (!fuerVorschau) {
      if (!k) { toast('Bitte einen Kunden wählen.', true); return null; }
      if (!d.datum || !d.leistungsdatum) { toast('Bitte Rechnungs- und Leistungsdatum angeben.', true); return null; }
      if (d.zeitraum && (!d.leistungszeitraum_bis || d.leistungszeitraum_bis < d.leistungsdatum)) { toast('Bitte ein gültiges Ende des Leistungszeitraums angeben.', true); return null; }
      if (!pos.length) { toast('Bitte mindestens eine Position eintragen.', true); return null; }
      if (pos.some(p => !p.bezeichnung.trim())) { toast('Bitte bei jeder Position eine Leistung wählen.', true); return null; }
      if (pos.some(p => num(p.menge) <= 0)) { toast('Mengen müssen größer als 0 sein.', true); return null; }
    }
    const rp = pos.map((p, i) => ({ pos: i + 1, bezeichnung: p.bezeichnung.trim(), beschreibung: (p.beschreibung || '').trim(), menge: num(p.menge), einheit: p.einheit || 'Stück', einzelpreis: r2(num(p.einzelpreis)), gesamt: r2(num(p.menge) * num(p.einzelpreis)) }));
    const netto = r2(rp.reduce((a, p) => a + p.gesamt, 0)), satz = f.kleinunternehmer ? 0 : Number(f.mwst_satz), mwst = r2(netto * satz / 100);
    return { entwurf: true, typ: 'rechnung', kunde_snapshot: k || {}, firma_snapshot: f, datum: d.datum, leistungsdatum: d.leistungsdatum,
      leistungszeitraum_bis: d.zeitraum ? d.leistungszeitraum_bis : null, einleitung: d.einleitung, schluss: d.schluss,
      mwst_satz: satz, netto, mwst, brutto: r2(netto + mwst), rechnung_positionen: rp };
  }

  /* ---------- Kunden ---------- */
  function viewKunden() {
    const stat = k => { const rs = S.rechnungen.filter(r => r.kunde_id === k.id); return { n: rs.filter(r => r.typ === 'rechnung').length, sum: r2(rs.reduce((a, r) => a + Number(r.brutto), 0)) }; };
    $('#main').innerHTML = `
      <div class="head"><div><h1>Kunden</h1><p class="sub">${S.kunden.length} Kunden</p></div><button class="btn primary" id="kNeu">Neuer Kunde</button></div>
      ${S.kunden.length ? `<div class="table-wrap"><table class="list"><thead><tr><th>Kunde</th><th>Ort</th><th>Status</th><th class="num">Rechnungen</th><th class="num">Umsatz gesamt</th><th></th></tr></thead><tbody>
        ${S.kunden.map(k => { const s = stat(k); return `<tr><td>${esc(kundeName(k))}${k.email ? `<br><span class="muted">${esc(k.email)}</span>` : ''}</td>
          <td>${esc([k.plz, k.ort].filter(Boolean).join(' '))}${k.land && k.land !== 'Deutschland' ? `<br><span class="muted">${esc(k.land)}</span>` : ''}</td>
          <td>${{ aktiv: 'Aktiv', inaktiv: 'Inaktiv', in_aussicht: 'In Aussicht' }[k.status] || ''}</td>
          <td class="num">${s.n}</td><td class="num">${eur(s.sum)}</td>
          <td><div class="btn-row end"><button class="btn small" data-r="${k.id}">Rechnung schreiben</button><button class="btn small" data-e="${k.id}">Bearbeiten</button></div></td></tr>`; }).join('')}
        </tbody></table></div>` : '<div class="table-wrap"><p class="empty">Noch keine Kunden angelegt.</p></div>'}`;
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
    openDlg(`<form id="kf" class="dlg"><h2>${k.id ? 'Kunde bearbeiten' : 'Neuer Kunde'}</h2><p class="sub">Änderungen wirken nur auf neue Rechnungen.</p>
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
      closeDlg(); S.kunden = await DB.listKunden(); ablageSyncSpaeter(); done && done(saved);
    };
  }

  /* ---------- Leistungen ---------- */
  function viewLeistungen() {
    $('#main').innerHTML = `
      <div class="head"><div><h1>Leistungen</h1><p class="sub">Vorlagen für Rechnungspositionen. Preise lassen sich in jeder Rechnung anpassen.</p></div><button class="btn primary" id="lNeu">Neue Leistung</button></div>
      ${S.leistungen.length ? `<div class="table-wrap"><table class="list"><thead><tr><th>Leistung</th><th>Einheit</th><th class="num">Preis</th><th>Aktiv</th><th></th></tr></thead><tbody>
        ${S.leistungen.map(l => `<tr><td>${esc(l.name)}${l.beschreibung ? `<br><span class="muted">${esc(l.beschreibung)}</span>` : ''}</td><td>${esc(l.einheit)}</td><td class="num">${eur(l.preis)}</td><td>${l.aktiv ? 'Ja' : 'Nein'}</td>
          <td><div class="btn-row end"><button class="btn small" data-e="${l.id}">Bearbeiten</button><button class="btn small danger" data-d="${l.id}">Löschen</button></div></td></tr>`).join('')}
        </tbody></table></div>` : '<div class="table-wrap"><p class="empty">Noch keine Leistungen angelegt.</p></div>'}`;
    $('#lNeu').onclick = () => leistungDlg(null);
    $('#main').onclick = async e => {
      const ed = e.target.closest('[data-e]'), del = e.target.closest('[data-d]');
      if (ed) leistungDlg(S.leistungen.find(l => l.id === ed.dataset.e));
      if (del) {
        const l = S.leistungen.find(x => x.id === del.dataset.d);
        if (!await confirmDlg('Leistung löschen?', `„${esc(l.name)}“ wird aus dem Katalog entfernt. Bestehende Rechnungen bleiben unverändert.`, 'Löschen', true)) return;
        await guard(async () => { await DB.deleteLeistung(l.id); S.leistungen = await DB.listLeistungen(); viewLeistungen(); }, 'Leistung gelöscht');
      }
    };
  }
  function leistungDlg(l) {
    l = l || { einheit: 'Stück', preis: 0, aktiv: true };
    openDlg(`<form id="lf" class="dlg"><h2>${l.id ? 'Leistung bearbeiten' : 'Neue Leistung'}</h2>
      <div class="grid2" style="margin-top:16px">
        <label class="f span2">Bezeichnung<input name="name" value="${esc(l.name)}" required></label>
        <label class="f span2">Beschreibung (erscheint klein unter der Bezeichnung)<textarea name="beschreibung">${esc(l.beschreibung)}</textarea></label>
        <label class="f">Preis in €<input name="preis" inputmode="decimal" value="${numIn(l.preis)}"></label>
        <label class="f">Einheit<input name="einheit" value="${esc(l.einheit)}" placeholder="Stück, Stunde, Pauschal"></label>
        <label class="check span2"><input type="checkbox" name="aktiv" ${l.aktiv ? 'checked' : ''}> Aktiv (im Rechnungsformular auswählbar)</label>
      </div>
      <div class="actions"><button type="button" class="btn" data-x>Abbrechen</button><button class="btn primary">Speichern</button></div></form>`);
    dlg.querySelector('[data-x]').onclick = closeDlg;
    $('#lf').onsubmit = async e => {
      e.preventDefault(); const fd = new FormData(e.target);
      const o = { name: fd.get('name').trim(), beschreibung: fd.get('beschreibung').trim() || null, preis: r2(num(fd.get('preis'))), einheit: fd.get('einheit').trim() || 'Stück', aktiv: fd.has('aktiv') };
      if (l.id) o.id = l.id;
      const ok = await guard(() => DB.saveLeistung(o), 'Leistung gespeichert'); if (!ok) return;
      closeDlg(); S.leistungen = await DB.listLeistungen(); ablageSyncSpaeter(); viewLeistungen();
    };
  }

  /* ---------- Firmendaten ---------- */
  function viewFirma() {
    const f = S.firma;
    const i = (n, l, cls = '', t = 'text') => `<label class="f ${cls}">${l}<input name="${n}" type="${t}" value="${esc(f[n])}"></label>`;
    $('#main').innerHTML = `
      <div class="head"><div><h1>Einstellungen</h1><p class="sub">Firmendaten erscheinen auf neuen Rechnungen. Bestehende Rechnungen bleiben unverändert.</p></div></div>
      <div class="stack">
        <div class="stack" id="ablagePanels">${ablagePanels()}</div>
        <div class="panel"><h2>Darstellung</h2><div class="btn-row">${themeButtons()}</div></div>
        <div class="panel" id="fixPanel">${fixPanel()}</div>
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
          <div class="btn-row end"><button class="btn primary">Firmendaten speichern</button></div>
        </form>
      </div>`;
    $('#csvAll').onclick = () => csvExport(S.rechnungen);
    $('#main').onclick = async e => {
      if (e.target.closest('#fxNeu')) return fixDlg(null);
      const ed = e.target.closest('[data-fx-e]'), del = e.target.closest('[data-fx-d]');
      if (ed) fixDlg(S.fixkosten.find(f => f.id === ed.dataset.fxE));
      if (del) {
        const f = S.fixkosten.find(x => x.id === del.dataset.fxD);
        if (!await confirmDlg('Posten löschen?', `„${esc(f.anbieter)}“ wird aus den Fixkosten entfernt. Wenn der Vertrag nur pausiert, besser „aktiv“ ausschalten.`, 'Löschen', true)) return;
        await guard(async () => { await DB.deleteFixkosten(f.id); S.fixkosten = await DB.listFixkosten(); $('#fixPanel').innerHTML = fixPanel(); ablageSyncSpaeter(); }, 'Posten gelöscht');
      }
    };
    $('#ff').onsubmit = async e => {
      e.preventDefault(); const fd = new FormData(e.target), o = {};
      for (const [k, v] of fd.entries()) o[k] = String(v).trim();
      o.kleinunternehmer = fd.has('kleinunternehmer');
      ['mwst_satz', 'zahlungsziel_tage', 'mahnfrist_tage'].forEach(k => o[k] = num(o[k]));
      if (!o.kleinunternehmer && S.firma.kleinunternehmer && !(await confirmDlg('Kleinunternehmerregelung ausschalten?', 'Neue Rechnungen enthalten dann ' + o.mwst_satz + ' % Umsatzsteuer. Nur ausschalten, wenn ihr umsatzsteuerpflichtig seid.', 'Ausschalten', true))) return;
      await guard(async () => { await DB.saveFirma(o); S.firma = await DB.getFirma(); ablageSyncSpaeter(); }, 'Firmendaten gespeichert');
    };
  }

  /* ---------- Ausgaben (variable Kosten) ---------- */
  const AUS_KATS = ['Bewirtung', 'Technik', 'Material', 'Software', 'Fahrtkosten', 'Werbung', 'Büro', 'Fortbildung', 'Sonstiges'];
  function viewAusgaben() {
    const jahre = [...new Set([today().slice(0, 4), ...S.ausgaben.map(a => a.datum.slice(0, 4))])].sort().reverse();
    if (!S.filter.ausJahr) S.filter.ausJahr = today().slice(0, 4);
    const fj = S.filter.ausJahr, fk = S.filter.ausKat || 'alle';
    let list = S.ausgaben.filter(a => fj === 'alle' || a.datum.startsWith(fj));
    const proKat = {}; list.forEach(a => proKat[a.kategorie] = r2((proKat[a.kategorie] || 0) + Number(a.betrag)));
    if (fk !== 'alle') list = list.filter(a => a.kategorie === fk);
    const sum = r2(list.reduce((s, a) => s + Number(a.betrag), 0));
    const opt = (v, l, cur) => `<option value="${esc(v)}" ${v === cur ? 'selected' : ''}>${esc(l)}</option>`;
    $('#main').innerHTML = `
      <div class="head"><div><h1>Ausgaben</h1><p class="sub">Alles, was nicht regelmäßig anfällt: Einkäufe, Essen, Fahrten, Werbung. Fixkosten stehen unter Einstellungen.</p></div>
        <div class="btn-row"><button class="btn" id="aCsv">CSV für EÜR</button><button class="btn primary" data-aus-neu>Neue Ausgabe</button></div></div>
      ${belegHinweis()}
      ${AB.supported && AB.belege.state !== 'on' ? `<p class="hint">Tipp: Unter <a href="#" data-go-settings>Einstellungen</a> den Belege-Ordner in Drive verbinden. Dann erkennt die App neue Belege automatisch.</p>` : ''}
      <div class="toolbar"><select id="aJahr">${opt('alle', 'Alle Jahre', fj)}${jahre.map(j => opt(j, j, fj)).join('')}</select></div>
      ${Object.keys(proKat).length ? `<div class="chips"><button class="chip" data-kat="alle" aria-pressed="${fk === 'alle'}">Alle · ${eur(Object.values(proKat).reduce((a, b) => a + b, 0))}</button>${Object.entries(proKat).sort((a, b) => b[1] - a[1]).map(([k, v]) => `<button class="chip" data-kat="${esc(k)}" aria-pressed="${k === fk}">${esc(k)} · ${eur(v)}</button>`).join('')}</div>` : ''}
      ${list.length ? `<div class="table-wrap"><table class="list"><thead><tr><th>Datum</th><th>Wofür</th><th>Kategorie</th><th>Beleg</th><th class="num">Betrag</th><th></th></tr></thead><tbody>
        ${list.map(a => `<tr><td class="nowrap">${dDE(a.datum)}</td><td>${esc(a.lieferant)}${a.beschreibung ? `<br><span class="muted">${esc(a.beschreibung)}</span>` : ''}</td><td>${esc(a.kategorie)}</td>
          <td>${a.beleg_pfad ? `<button class="btn link small" data-beleg-open="${esc(a.beleg_pfad)}" title="${esc(a.beleg_pfad)}">Öffnen</button>` : '<span class="muted">–</span>'}</td><td class="num">${eur(a.betrag)}</td>
          <td><div class="btn-row end"><button class="btn small" data-aus-e="${a.id}">Bearbeiten</button><button class="btn small danger" data-aus-d="${a.id}">Löschen</button></div></td></tr>`).join('')}
        </tbody><tfoot><tr><td colspan="4"><b>Summe</b></td><td class="num"><b>${eur(sum)}</b></td><td></td></tr></tfoot></table></div>` : '<div class="table-wrap"><p class="empty">Keine Ausgaben in diesem Zeitraum.</p></div>'}`;
    $('#aJahr').onchange = e => { S.filter.ausJahr = e.target.value; S.filter.ausKat = 'alle'; viewAusgaben(); };
    $('#aCsv').onclick = () => {
      const rows = [['Datum', 'Lieferant', 'Beschreibung', 'Kategorie', 'Betrag', 'Beleg']].concat([...list].reverse().map(a => [dDE(a.datum), a.lieferant, a.beschreibung || '', a.kategorie, numIn(a.betrag), a.beleg_pfad || '']));
      const csv = '﻿' + rows.map(z => z.map(v => '"' + String(v ?? '').replace(/"/g, '""') + '"').join(';')).join('\r\n');
      download('Mediawo_Ausgaben_' + today() + '.csv', new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    };
    $('#main').onclick = async e => {
      if (e.target.closest('[data-go-settings]')) { e.preventDefault(); return; }
      const k = e.target.closest('[data-kat]'); if (k) { S.filter.ausKat = k.dataset.kat; return viewAusgaben(); }
      if (e.target.closest('[data-aus-neu]')) return ausgabeDlg(null, viewAusgaben);
      const ed = e.target.closest('[data-aus-e]'); if (ed) return ausgabeDlg(S.ausgaben.find(x => x.id === ed.dataset.ausE), viewAusgaben);
      const del = e.target.closest('[data-aus-d]');
      if (del) {
        const a = S.ausgaben.find(x => x.id === del.dataset.ausD);
        if (!await confirmDlg('Ausgabe löschen?', `${esc(a.lieferant)} vom ${dDE(a.datum)} über ${eur(a.betrag)} wird endgültig gelöscht.${a.beleg_pfad ? ' Die Belegdatei im Ordner bleibt erhalten und taucht danach wieder als neuer Beleg auf.' : ''}`, 'Löschen', true)) return;
        await guard(async () => { await DB.deleteAusgabe(a.id); S.ausgaben = await DB.listAusgaben(); viewAusgaben(); belegeScannen(); ablageSyncSpaeter(); }, 'Ausgabe gelöscht');
      }
    };
  }
  document.addEventListener('click', e => { const b = e.target.closest('[data-beleg-open]'); if (b) { e.preventDefault(); belegOeffnen(b.dataset.belegOpen); } });
  async function belegOeffnen(pfad) {
    if (AB.belege.state === 'needs-permission') await AB.belege.freigeben();
    if (AB.belege.state !== 'on') return toast('Belege-Ordner ist nicht verbunden (Einstellungen).', true);
    try { const f = await AB.belege.lese(pfad); window.open(URL.createObjectURL(f), '_blank'); }
    catch (e) { toast('Beleg nicht gefunden: ' + pfad + '. Wurde die Datei verschoben?', true); }
  }

  /* Formularfelder, gemeinsam für „Ausgabe erfassen“ und „Beleg prüfen“ */
  function ausgabeFelder(a) {
    const kats = [...new Set([...AUS_KATS, ...S.ausgaben.map(x => x.kategorie)])];
    return `<div class="grid2">
        <label class="f">Betrag in €<input name="betrag" inputmode="decimal" value="${a.betrag === '' || a.betrag == null ? '' : numIn(a.betrag)}" required placeholder="0,00"></label>
        <label class="f">Datum<input type="date" name="datum" value="${a.datum || today()}" required></label>
        <label class="f span2">Wo / bei wem<input name="lieferant" value="${esc(a.lieferant)}" required placeholder="z. B. Amazon, Restaurant, Deutsche Bahn"></label>
        <label class="f span2">Wofür (optional)<input name="beschreibung" value="${esc(a.beschreibung)}" placeholder="z. B. SD-Karten, Essen mit Kunde"></label>
        <div class="f span2"><span>Kategorie</span><div class="chips">${kats.map(k => `<label class="chip"><input type="radio" name="kategorie" value="${esc(k)}" ${k === (a.kategorie || 'Sonstiges') ? 'checked' : ''}>${esc(k)}</label>`).join('')}</div></div>
      </div>`;
  }
  function ausForm(form) {
    const fd = new FormData(form);
    return { datum: fd.get('datum'), lieferant: fd.get('lieferant').trim(), beschreibung: fd.get('beschreibung').trim() || null, kategorie: fd.get('kategorie') || 'Sonstiges', betrag: r2(num(fd.get('betrag'))) };
  }
  /* Ausgelesene Werte nur in leere Felder schreiben */
  function vorschlagEintragen(form, v) {
    const setz = (n, w) => { const el = form.querySelector(`[name=${n}]`); if (el && w && !el.value.trim()) el.value = w; };
    if (v.betrag) setz('betrag', numIn(v.betrag));
    if (v.datum) { const el = form.querySelector('[name=datum]'); if (el && (!el.dataset.angefasst)) el.value = v.datum; }
    setz('lieferant', v.lieferant);
    if (v.kategorie && !form.dataset.katAngefasst) { const r = form.querySelector(`[name=kategorie][value="${CSS.escape(v.kategorie)}"]`); if (r) r.checked = true; }
  }
  function lesestatus(v) {
    if (v.art === 'keins') return 'Dieses Format (HEIC) kann der Browser nicht lesen. Bitte Werte selbst eintragen. Tipp: in der Drive-App „Scannen“ nutzen, das ergibt ein PDF.';
    if (v.art === 'fehler') return 'Auslesen hat nicht geklappt. Bitte Werte selbst eintragen.';
    const gef = [v.betrag ? eur(v.betrag) : null, v.datum ? dDE(v.datum) : null, v.lieferant || null].filter(Boolean);
    return gef.length ? `Erkannt: ${esc(gef.join(' · '))}. Bitte kurz prüfen.` : 'Nichts Eindeutiges erkannt. Bitte Werte selbst eintragen.';
  }
  const dateiSicher = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ß/g, 'ss').replace(/[^A-Za-z0-9 -]/g, '').trim().replace(/\s+/g, '_').slice(0, 30) || 'Beleg';
  async function belegAblegen(file, o) {
    const ext = (file.name.match(/\.[A-Za-z0-9]+$/) || ['.pdf'])[0].toLowerCase(), jahr = o.datum.slice(0, 4);
    const basis = `${o.datum}_${dateiSicher(o.lieferant)}_${numIn(o.betrag).replace(',', '-')}`;
    let name = basis + ext, n = 2;
    while (await AB.belege.existiert([jahr], name)) name = `${basis}_${n++}${ext}`;
    const res = await AB.belege.datei([jahr], name, file);
    return res ? jahr + '/' + name : null;
  }

  function ausgabeDlg(a, done) {
    a = a || { datum: today(), kategorie: 'Sonstiges', betrag: '' };
    const ordner = AB.belege.state === 'on' || AB.belege.state === 'needs-permission';
    openDlg(`<form id="af" class="dlg"><h2>${a.id ? 'Ausgabe bearbeiten' : 'Ausgabe erfassen'}</h2>
      <div style="margin-top:16px">${ausgabeFelder(a)}</div>
      <div class="belegfeld">
        ${a.beleg_pfad ? `<div class="btn-row"><span class="muted">Beleg: <b>${esc(a.beleg_pfad.split('/').pop())}</b></span><button type="button" class="btn small" data-beleg-open="${esc(a.beleg_pfad)}">Öffnen</button><button type="button" class="btn small" id="bLoesen">Verknüpfung lösen</button></div>`
          : ordner ? `<label class="f">Beleg anhängen (optional, PDF oder Foto)<input type="file" name="datei" accept="application/pdf,image/*"></label><p class="hint" id="bStatus" style="margin:6px 0 0">Wird im Belege-Ordner abgelegt und automatisch ausgelesen.</p>`
          : `<p class="hint" style="margin:0">Ohne Beleg ist okay. Zum Anhängen erst unter Einstellungen den Belege-Ordner verbinden${AB.supported ? '' : ' (nur Chrome/Edge)'}.</p>`}
      </div>
      <div class="actions"><button type="button" class="btn" data-x>Abbrechen</button><button class="btn primary">Speichern</button></div></form>`);
    const form = $('#af');
    dlg.querySelector('[data-x]').onclick = closeDlg;
    form.querySelector('[name=datum]').addEventListener('input', e => e.target.dataset.angefasst = '1');
    form.addEventListener('change', e => { if (e.target.name === 'kategorie') form.dataset.katAngefasst = '1'; });
    let loesen = false;
    const lb = $('#bLoesen'); if (lb) lb.onclick = () => { loesen = true; lb.closest('.btn-row').innerHTML = '<span class="muted">Verknüpfung wird beim Speichern gelöst. Die Datei bleibt im Ordner.</span>'; };
    const fi = form.querySelector('[name=datei]');
    if (fi) fi.onchange = async () => {
      const f = fi.files[0]; if (!f) return;
      $('#bStatus').textContent = 'Wird ausgelesen …';
      const v = await MWBELEG.lesen(f, f.name); vorschlagEintragen(form, v); $('#bStatus').innerHTML = lesestatus(v);
    };
    form.onsubmit = async e => {
      e.preventDefault();
      const o = ausForm(form);
      if (o.betrag <= 0) { toast('Bitte einen Betrag größer als 0 eingeben.', true); return; }
      if (!o.lieferant) { toast('Bitte angeben, wo bzw. bei wem.', true); return; }
      if (a.id) o.id = a.id;
      if (loesen) o.beleg_pfad = null;
      const f = fi && fi.files[0];
      if (f) {
        if (AB.belege.state === 'needs-permission') await AB.belege.freigeben();
        const pfad = AB.belege.state === 'on' ? await belegAblegen(f, o) : null;
        if (pfad) o.beleg_pfad = pfad; else toast('Beleg konnte nicht im Ordner abgelegt werden. Ausgabe wird ohne Beleg gespeichert.', true);
      }
      const ok = await guard(() => DB.saveAusgabe(o), 'Ausgabe gespeichert'); if (!ok) return;
      closeDlg(); S.ausgaben = await DB.listAusgaben(); ablageSyncSpaeter(); belegeScannen(); done && done();
    };
  }

  /* Neue Belege aus dem Ordner nacheinander prüfen */
  async function belegePruefen(start) {
    if (AB.belege.state === 'needs-permission') await AB.belege.freigeben();
    const liste = [...S.belegNeu]; if (!liste.length) return;
    let i = start || 0, gespeichert = 0, url = null;
    const ende = async () => {
      if (url) URL.revokeObjectURL(url); closeDlg();
      if (gespeichert) { S.ausgaben = await DB.listAusgaben(); ablageSyncSpaeter(); toast(gespeichert === 1 ? '1 Ausgabe übernommen' : gespeichert + ' Ausgaben übernommen'); }
      await belegeScannen(); go(S.view);
    };
    const zeige = async () => {
      if (i >= liste.length) return ende();
      const b = liste[i];
      openDlg(`<form id="bf" class="dlg"><h2>Beleg prüfen <span class="muted" style="font-weight:400">${i + 1} von ${liste.length}</span></h2>
        <p class="sub">${esc(b.pfad)}</p>
        <div class="beleg-grid"><div class="beleg-vorschau" id="bv"><p class="muted">Wird geladen …</p></div>
          <div><p class="hint" id="bStatus">Wird ausgelesen …</p>${ausgabeFelder({ datum: '', betrag: '', kategorie: 'Sonstiges' })}</div></div>
        <div class="actions"><button type="button" class="btn link" data-b="ign" title="Taucht nicht mehr als neu auf">Kein Ausgabenbeleg</button><button type="button" class="btn" data-b="skip">Später</button><button type="button" class="btn" data-b="close">Schließen</button><button class="btn primary">Als Ausgabe speichern</button></div></form>`, true);
      const form = $('#bf');
      form.querySelector('[name=datum]').addEventListener('input', e => e.target.dataset.angefasst = '1');
      form.addEventListener('change', e => { if (e.target.name === 'kategorie') form.dataset.katAngefasst = '1'; });
      form.querySelector('[data-b=close]').onclick = ende;
      form.querySelector('[data-b=skip]').onclick = () => { i++; zeige(); };
      form.querySelector('[data-b=ign]').onclick = async () => {
        const ign = await belegIgnoriert(); ign.add(b.pfad); try { await AB.kv('set', 'belegIgnoriert', [...ign]); } catch (e) { }
        liste.splice(i, 1); zeige();
      };
      form.onsubmit = async e => {
        e.preventDefault();
        const o = ausForm(form);
        if (o.betrag <= 0) { toast('Bitte einen Betrag größer als 0 eingeben.', true); return; }
        if (!o.lieferant) { toast('Bitte angeben, wo bzw. bei wem.', true); return; }
        o.beleg_pfad = b.pfad;
        const ok = await guard(() => DB.saveAusgabe(o)); if (!ok) return;
        gespeichert++; liste.splice(i, 1); zeige();
      };
      let file;
      try { file = await AB.belege.lese(b.pfad); } catch (err) { $('#bv').innerHTML = '<p class="muted">Datei nicht lesbar. Vielleicht verschoben oder noch nicht synchronisiert.</p>'; $('#bStatus').textContent = ''; return; }
      if (url) URL.revokeObjectURL(url); url = URL.createObjectURL(file);
      if (!$('#bv')) return;
      $('#bv').innerHTML = MWBELEG.istPdf(b.name) ? `<iframe src="${url}#view=FitH&toolbar=0" title="Beleg"></iframe>`
        : MWBELEG.istBild(b.name) ? `<img src="${url}" alt="Beleg">` : '<p class="muted">Keine Vorschau für dieses Format (HEIC). Datei in Drive öffnen oder als PDF scannen.</p>';
      const v = await MWBELEG.lesen(file, b.name);
      if ($('#bf') === form) {
        vorschlagEintragen(form, v);
        const dup = v.betrag && S.ausgaben.find(x => Math.abs(Number(x.betrag) - v.betrag) < 0.005 && (!v.datum || x.datum === v.datum));
        $('#bStatus').innerHTML = lesestatus(v) + (dup ? `<br><b>Achtung:</b> ${esc(dup.lieferant)} vom ${dDE(dup.datum)} über ${eur(dup.betrag)} ist schon erfasst${dup.beleg_pfad ? '' : ' (ohne Beleg)'}. Dann lieber „Kein Ausgabenbeleg“ wählen oder die vorhandene Ausgabe bearbeiten.` : '');
      }
    };
    zeige();
  }

  /* ---------- Fixkosten & Abos ---------- */
  const INTERVALLE = [['monatlich', 'Monatlich'], ['quartalsweise', 'Vierteljährlich'], ['jährlich', 'Jährlich']];
  function fixPanel() {
    if (!S.zOk) return `<h2>Fixkosten & Abos</h2><p class="note" style="margin:0">Noch nicht eingerichtet. Bitte einmal <b>03_zahlungen_fixkosten.sql</b> im Supabase SQL Editor ausführen und die App neu laden.</p>`;
    const fm = fixProMonat(), ivTxt = v => (INTERVALLE.find(x => x[0] === v) || [, v])[1];
    return `<div class="chart-head"><div><h2 style="margin:0">Fixkosten & Abos</h2><p class="hint" style="margin:4px 0 0">Laufende Kosten, die jeden Monat gedeckt sein müssen. Grundlage für die Übersicht. Auch Entnahmen oder ein Monatsziel lassen sich hier als Posten anlegen.</p></div>
        <button class="btn" id="fxNeu">+ Posten</button></div>
      ${S.fixkosten.length ? `<div class="table-wrap" style="margin-top:14px"><table class="list"><thead><tr><th>Anbieter</th><th>Kategorie</th><th>Intervall</th><th class="num">Betrag</th><th class="num">pro Monat</th><th></th></tr></thead><tbody>
        ${S.fixkosten.map(f => `<tr class="${f.aktiv ? '' : 'inaktiv'}"><td>${esc(f.anbieter)}${f.zweck || f.notiz ? `<br><span class="muted">${esc([f.zweck, f.notiz].filter(Boolean).join(' · '))}</span>` : ''}</td><td>${esc(f.kategorie)}</td>
          <td>${ivTxt(f.intervall)}${f.aktiv ? '' : ' · pausiert'}</td><td class="num">${eur(f.betrag)}</td><td class="num">${f.aktiv ? eur(fixMonat(f)) : '–'}</td>
          <td><div class="btn-row end"><button class="btn small" data-fx-e="${f.id}">Bearbeiten</button><button class="btn small danger" data-fx-d="${f.id}">Löschen</button></div></td></tr>`).join('')}
        </tbody><tfoot><tr><td colspan="4"><b>Summe aktiv</b></td><td class="num"><b>${eur(fm)}</b></td><td class="muted">${eur(fm * 12)} pro Jahr</td></tr></tfoot></table></div>` : '<p class="empty">Noch keine Fixkosten hinterlegt.</p>'}`;
  }
  function fixDlg(f) {
    f = f || { kategorie: 'Software', intervall: 'monatlich', betrag: 0, aktiv: true };
    const kats = [...new Set(['Software', 'Versicherung', 'Bank', 'Miete', 'Telefon', 'Entnahme', ...S.fixkosten.map(x => x.kategorie)])];
    openDlg(`<form id="fxf" class="dlg"><h2>${f.id ? 'Posten bearbeiten' : 'Neuer Posten'}</h2>
      <div class="grid2" style="margin-top:16px">
        <label class="f span2">Anbieter<input name="anbieter" value="${esc(f.anbieter)}" required placeholder="z. B. Adobe"></label>
        <label class="f span2">Wofür<input name="zweck" value="${esc(f.zweck)}" placeholder="z. B. Creative Cloud, 1 Lizenz"></label>
        <label class="f">Betrag in €<input name="betrag" inputmode="decimal" value="${numIn(f.betrag)}"></label>
        <label class="f">Intervall<select name="intervall">${INTERVALLE.map(([v, l]) => `<option value="${v}" ${v === f.intervall ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
        <label class="f">Kategorie<input name="kategorie" list="fxKats" value="${esc(f.kategorie)}"><datalist id="fxKats">${kats.map(k => `<option value="${esc(k)}">`).join('')}</datalist></label>
        <label class="f">Notiz<input name="notiz" value="${esc(f.notiz)}" placeholder="z. B. fällig 13.07."></label>
        <label class="check span2"><input type="checkbox" name="aktiv" ${f.aktiv ? 'checked' : ''}> Aktiv (zählt in der Übersicht)</label>
      </div>
      <div class="actions"><button type="button" class="btn" data-x>Abbrechen</button><button class="btn primary">Speichern</button></div></form>`);
    dlg.querySelector('[data-x]').onclick = closeDlg;
    $('#fxf').onsubmit = async e => {
      e.preventDefault(); const fd = new FormData(e.target);
      const o = { anbieter: fd.get('anbieter').trim(), zweck: fd.get('zweck').trim() || null, betrag: r2(num(fd.get('betrag'))), intervall: fd.get('intervall'),
        kategorie: fd.get('kategorie').trim() || 'Sonstiges', notiz: fd.get('notiz').trim() || null, aktiv: fd.has('aktiv') };
      if (!o.anbieter) { toast('Bitte einen Anbieter angeben.', true); return; }
      if (f.id) o.id = f.id;
      const ok = await guard(() => DB.saveFixkosten(o), 'Fixkosten gespeichert'); if (!ok) return;
      closeDlg(); S.fixkosten = await DB.listFixkosten(); const p = $('#fixPanel'); if (p) p.innerHTML = fixPanel(); ablageSyncSpaeter();
    };
  }

  /* ---------- Darstellung (dunkel / hell) ---------- */
  function themeGet() { try { return localStorage.getItem('mw-theme') || 'dark'; } catch (e) { return 'dark'; } }
  function themeSet(t) { document.documentElement.dataset.theme = t; try { localStorage.setItem('mw-theme', t); } catch (e) { } $$('[data-theme-set]').forEach(b => b.setAttribute('aria-pressed', b.dataset.themeSet === t)); }
  function themeButtons() { const t = themeGet(); return `<div class="seg"><button data-theme-set="dark" aria-pressed="${t === 'dark'}">Dunkel</button><button data-theme-set="light" aria-pressed="${t === 'light'}">Hell</button></div>`; }
  document.addEventListener('click', e => { const b = e.target.closest('[data-theme-set]'); if (b) themeSet(b.dataset.themeSet); });
  $('#themeToggle').onclick = () => themeSet(themeGet() === 'dark' ? 'light' : 'dark');
  themeSet(themeGet());

  /* ---------- Start ---------- */
  DB.onAuth(s => zeigeApp(s));
  DB.session().then(zeigeApp).catch(() => zeigeApp(null));
})();
