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

  const S = { firma: null, kunden: [], leistungen: [], rechnungen: [], mahnungen: [], view: 'start', draft: null, filter: { jahr: 'alle', status: 'alle' } };

  /* ---------- Hilfen ---------- */
  function toast(msg, err) { const t = $('#toast'); t.textContent = msg; t.className = err ? 'show err' : 'show'; clearTimeout(t._t); t._t = setTimeout(() => t.className = '', err ? 6000 : 2600); }
  function kundeName(k) { if (!k) return '–'; const p = [k.vorname, k.nachname].filter(Boolean).join(' '); return k.firma ? (k.firma + (p ? ' (' + p + ')' : '')) : (p || 'Ohne Namen'); }
  const mahnungenZu = r => S.mahnungen.filter(m => m.rechnung_id === r.id).sort((a, b) => a.stufe - b.stufe);
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
    ablageSyncSpaeter();
  }

  /* ---------- Ablage & Sicherung ---------- */
  let syncLaeuft = false, syncNochmal = false, syncTimer = null, fehlend = 0;
  function ablageSyncSpaeter() { clearTimeout(syncTimer); syncTimer = setTimeout(ablageSync, 800); }
  async function ablageSync() {
    if (AB.state !== 'on' || !S.firma) { renderSide(); return; }
    if (syncLaeuft) { syncNochmal = true; return; }
    syncLaeuft = true;
    try {
      await AB.sicherung({ firma: S.firma, kunden: S.kunden, leistungen: S.leistungen, rechnungen: S.rechnungen, mahnungen: S.mahnungen });
      const jobs = [];
      S.rechnungen.forEach(r => jobs.push({ info: MWPDF.datei(artVon(r), r), md: () => MWDOC.modellRechnung(r) }));
      S.mahnungen.forEach(m => { const r = S.rechnungen.find(x => x.id === m.rechnung_id); if (r) jobs.push({ info: MWPDF.datei('mahnung', r, m), md: () => MWDOC.modellMahnung(r, m) }); });
      fehlend = 0;
      for (const j of jobs) {
        if (AB.state !== 'on') break;
        if (!(await AB.existiert(j.info))) { const ok = await AB.pdf(j.info, await MWPDF.blob(j.md())); if (!ok) fehlend++; }
      }
    } catch (e) { console.warn('Ablage', e); }
    syncLaeuft = false; renderSide();
    if (syncNochmal) { syncNochmal = false; ablageSync(); }
  }
  function renderSide() {
    const box = $('#ablageBox'); if (!box) return;
    const st = AB.state;
    let html = '', cls = '';
    if (st === 'unsupported') { cls = 'warn'; html = `<strong>Automatische Ablage aus</strong><br>Funktioniert nur in Google Chrome oder Microsoft Edge.`; }
    else if (st === 'off') { cls = 'warn'; html = `<strong>Keine Ablage eingerichtet</strong><br><button class="btn small" data-ab="waehlen">Ordner wählen</button>`; }
    else if (st === 'needs-permission') { cls = 'warn'; html = `<strong>Ablage pausiert</strong><br>Der Browser braucht eine Bestätigung.<br><button class="btn small primary" data-ab="freigeben">Ablage freigeben</button>`; }
    else if (st === 'error') { cls = 'warn'; html = `<strong>Ordner nicht erreichbar</strong><br><button class="btn small" data-ab="waehlen">Ordner neu wählen</button>`; }
    else html = `<strong>Ablage aktiv</strong> · ${esc(AB.name)}<br>${syncLaeuft ? 'wird gesichert …' : AB.letzteSicherung ? 'gesichert ' + whenTxt(AB.letzteSicherung) : ''}${fehlend ? `<br><b>${fehlend} Belege nicht gespeichert</b>` : ''}`;
    box.className = 'ablage ' + cls; box.innerHTML = html;
  }
  async function ablageAktion(a) {
    if (a === 'waehlen') { if (await AB.waehlen()) toast('Ablage eingerichtet: ' + AB.name); }
    if (a === 'freigeben') { if (await AB.freigeben()) toast('Ablage wieder freigegeben'); }
    if (a === 'aus') { await AB.aus(); toast('Automatische Ablage ausgeschaltet'); }
    if (a === 'jetzt') toast('Sicherung läuft …');
    renderSide(); if (S.view === 'einstellungen') viewFirma();
    ablageSync();
  }
  document.addEventListener('click', e => { const b = e.target.closest('[data-ab]'); if (b) ablageAktion(b.dataset.ab); });
  function ablagePanel() {
    const st = AB.state, n = esc(AB.name);
    const intro = `<p class="hint">Alle Rechnungen, Stornorechnungen und Zahlungserinnerungen werden automatisch als PDF in einem Ordner abgelegt, sortiert nach Jahr und Belegart. Dazu kommt bei jeder Änderung eine vollständige Datensicherung. Am besten einen Ordner in Google Drive wählen (z. B. „MW_Buchhaltung/Mediawo OS“), dann ist alles automatisch in der Cloud. Die Einstellung gilt pro Rechner und Browser.</p>`;
    if (st === 'unsupported') return intro + `<p class="note">Dieser Browser unterstützt die automatische Ablage nicht. Bitte Mediawo OS in <b>Google Chrome</b> oder <b>Microsoft Edge</b> öffnen.</p>`;
    if (st === 'on') return intro + `<p>Aktiv im Ordner <b>${n}</b>${AB.letzteSicherung ? ', zuletzt gesichert ' + whenTxt(AB.letzteSicherung) : ''}.<br><span class="hint">Beispiel: ${n}/${today().slice(0, 4)}/Rechnungen/Rechnung_${today().slice(0, 4)}-009_Kunde.pdf</span></p>
      <div class="btn-row"><button class="btn primary" data-ab="jetzt">Jetzt sichern</button><button class="btn" data-ab="waehlen">Anderen Ordner wählen</button><button class="btn danger" data-ab="aus">Ausschalten</button></div>`;
    if (st === 'needs-permission') return intro + `<p class="note">Die Ablage in <b>${n}</b> ist pausiert. Der Browser fragt aus Sicherheitsgründen gelegentlich erneut nach.</p><div class="btn-row"><button class="btn primary" data-ab="freigeben">Ablage freigeben</button><button class="btn" data-ab="waehlen">Anderen Ordner wählen</button></div>`;
    if (st === 'error') return intro + `<p class="note">Der Ordner <b>${n}</b> ist nicht erreichbar (${esc(AB.fehler)}).</p><div class="btn-row"><button class="btn primary" data-ab="waehlen">Ordner neu wählen</button></div>`;
    return intro + `<div class="btn-row"><button class="btn primary" data-ab="waehlen">Ordner wählen und automatisch ablegen</button></div>`;
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
    ({ start: viewStart, rechnungen: viewRechnungen, neu: viewNeu, kunden: viewKunden, leistungen: viewLeistungen, einstellungen: viewFirma })[v]();
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
    const items = [['show', 'Ansehen'], ['pdf', 'PDF herunterladen']];
    if (offen) items.push(['paid', 'Als bezahlt markieren', 'ok'], ['remind', (n ? (n + 1) + '. ' : '') + 'Zahlungserinnerung erstellen']);
    if (s === 'bezahlt' && r.typ === 'rechnung') items.push(['unpaid', 'Zahlung zurücknehmen']);
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
    if (a === 'show') return zeigeBeleg(MWDOC.modellRechnung(r), (r.typ === 'storno' ? 'Stornorechnung ' : 'Rechnung ') + r.nummer, MWPDF.datei(artVon(r), r));
    if (a === 'pdf') return guard(async () => { const info = MWPDF.datei(artVon(r), r); download(info.name, await MWPDF.blob(MWDOC.modellRechnung(r))); });
    if (a === 'paid') return bezahltDlg(r);
    if (a === 'mahnungen') return mahnungenDlg(r);
    if (a === 'unpaid') {
      if (!await confirmDlg('Zahlung zurücknehmen?', `Rechnung ${esc(r.nummer)} wird wieder als offen geführt.`, 'Zurücknehmen')) return;
      return guard(async () => { await DB.setBezahlt(r.id, null); await laden(); go(S.view); }, 'Zahlung zurückgenommen');
    }
    if (a === 'remind') {
      const stufe = mahnungenZu(r).length + 1, d = today(), frist = addDays(d, S.firma.mahnfrist_tage || 7);
      if (!await confirmDlg((stufe > 1 ? stufe + '. ' : '') + 'Zahlungserinnerung erstellen?', `Für Rechnung <b>${esc(r.nummer)}</b> über ${eur(r.brutto)} wird eine Zahlungserinnerung mit heutigem Datum erstellt. Neue Zahlungsfrist: <b>${dDE(frist)}</b>.`, 'Erinnerung erstellen')) return;
      return guard(async () => {
        const m = await DB.createMahnung({ rechnung_id: r.id, stufe, datum: d, frist_bis: frist });
        await laden(); go(S.view);
        await belegErstellt(MWDOC.modellMahnung(r, m), (stufe > 1 ? stufe + '. ' : '') + 'Zahlungserinnerung zu ' + r.nummer, MWPDF.datei('mahnung', r, m));
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
    else if (gespeichert === null) box('err', 'Automatische Ablage hat nicht geklappt', AB.state === 'needs-permission' ? 'Bitte links „Ablage freigeben“ klicken. Die Datei wird dann nachgeholt.' : 'Bitte PDF herunterladen und von Hand ablegen.');
    else if (AB.state === 'on') box('ok', 'Liegt in der Ablage', `${AB.name}/${info.jahr}/${info.ordner}/${info.name}`);
    else box('info', 'Keine automatische Ablage eingerichtet', 'Unter Firmendaten einen Ordner wählen, dann wird jeder Beleg automatisch gespeichert.');
  }
  async function belegErstellt(md, titel, info) {
    let res;
    if (AB.state === 'on') res = await AB.pdf(info, await MWPDF.blob(md));
    else if (AB.state === 'needs-permission') res = null;
    zeigeBeleg(md, titel, info, res);
    renderSide();
  }
  function mahnungenDlg(r) {
    const ms = mahnungenZu(r);
    openDlg(`<div class="dlg"><h2>Zahlungserinnerungen zu ${esc(r.nummer)}</h2><div class="list-simple">${ms.map(m => `<div><span>${m.stufe}. Erinnerung vom ${dDE(m.datum)} · Frist ${dDE(m.frist_bis)}</span><button class="btn small" data-m="${m.id}">Ansehen</button></div>`).join('')}</div>
      <div class="actions"><button class="btn" data-x>Schließen</button></div></div>`);
    dlg.querySelector('[data-x]').onclick = closeDlg;
    dlg.querySelectorAll('[data-m]').forEach(b => b.onclick = () => { const m = ms.find(x => x.id === b.dataset.m); zeigeBeleg(MWDOC.modellMahnung(r, m), m.stufe + '. Zahlungserinnerung zu ' + r.nummer, MWPDF.datei('mahnung', r, m)); });
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
        return `<tr><td class="nowrap">${esc(r.nummer)}</td><td class="nowrap">${dDE(r.datum)}</td><td>${esc(kundeName(r.kunde_snapshot))}</td>
          <td class="num">${eur(r.brutto)}</td><td>${badge(s)}</td><td><div class="due ${s === 'ueberfaellig' ? 'late' : ''}">${info}</div></td>
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

  /* ---------- Übersicht ---------- */
  function viewStart() {
    const j = String(new Date().getFullYear());
    const imJahr = S.rechnungen.filter(r => r.datum.startsWith(j));
    const umsatz = r2(imJahr.reduce((a, r) => a + Number(r.brutto), 0));
    const eingang = r2(S.rechnungen.filter(r => r.typ === 'rechnung' && r.status === 'bezahlt' && (r.bezahlt_am || '').startsWith(j)).reduce((a, r) => a + Number(r.brutto), 0));
    const offen = S.rechnungen.filter(r => r.typ === 'rechnung' && r.status === 'offen');
    const offenSum = r2(offen.reduce((a, r) => a + Number(r.brutto), 0));
    const ue = offen.filter(r => status(r) === 'ueberfaellig');
    const ueSum = r2(ue.reduce((a, r) => a + Number(r.brutto), 0));
    const G = C.grenzeVorjahr, pct = Math.min(100, umsatz / G * 100), rest = G - umsatz;
    const cls = pct >= 90 ? 'crit' : pct >= 70 ? 'warn' : '';
    $('#main').innerHTML = `
      <div class="head"><div><h1>Übersicht</h1><p class="sub">${esc(S.firma.marke)} · Geschäftsjahr ${j}</p></div>
        <button class="btn primary" data-go="neu">Neue Rechnung</button></div>
      <div class="summary">
        <div><span class="l">Rechnungsumsatz ${j}</span><span class="v">${eur(umsatz)}</span><span class="s">${imJahr.filter(r => r.typ === 'rechnung').length} Rechnungen</span></div>
        <div><span class="l">Bezahlt eingegangen ${j}</span><span class="v ok">${eur(eingang)}</span><span class="s">${umsatz ? Math.round(eingang / umsatz * 100) : 0} % vom Umsatz</span></div>
        <div class="${ue.length ? 'alert' : ''}"><span class="l">Offen</span><span class="v">${eur(offenSum)}</span><span class="s">${offen.length} Rechnungen${ue.length ? ` · ${ue.length} überfällig (${eur(ueSum)})` : ''}</span></div>
        <div><span class="l">Kleinunternehmergrenze</span><span class="v">${Math.round(pct)} %</span><div class="bar ${cls}"><i style="width:${pct}%"></i></div>
          <span class="s">${rest > 0 ? `noch ${eur(rest)} bis ${eur(G)}` : `${eur(G)} überschritten`}</span></div>
      </div>
      ${pct >= 70 ? `<p class="note">Liegt der Umsatz ${j} über ${eur(G)}, gilt ab 1. Januar ${+j + 1} die Kleinunternehmerregelung nicht mehr. Über ${eur(C.grenzeLaufend)} im laufenden Jahr endet sie sofort. Rechtzeitig steuerlich klären und den Wechsel zu lexoffice planen.</p>` : ''}
      <h2 class="section">Offene Rechnungen</h2>
      ${offen.length ? rechnungTabelle([...offen].sort((a, b) => faellig(a).localeCompare(faellig(b)))) : '<div class="table-wrap"><p class="empty">Keine offenen Rechnungen.</p></div>'}`;
    bindTabelle();
    $('[data-go=neu]').addEventListener('click', () => go('neu'));
  }

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
    const rows = [['Nummer', 'Typ', 'Datum', 'Leistungsdatum', 'Kunde', 'Land', 'Netto', 'MwSt', 'Brutto', 'Status', 'Bezahlt am']];
    [...list].sort((a, b) => a.nummer.localeCompare(b.nummer)).forEach(r => rows.push([r.nummer, r.typ === 'storno' ? 'Storno' : 'Rechnung', dDE(r.datum), dDE(r.leistungsdatum),
      kundeName(r.kunde_snapshot), (r.kunde_snapshot || {}).land || '', numIn(r.netto), numIn(r.mwst), numIn(r.brutto), STATUS_TXT[status(r)], dDE(r.bezahlt_am)]));
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
            <div class="btn-row" style="margin-top:12px">
              <button type="button" class="btn" id="posAdd">+ Freie Position</button>
              <select id="posKatalog" class="grow"><option value="">+ Aus Leistungskatalog …</option>${S.leistungen.filter(l => l.aktiv).map(l => `<option value="${l.id}">${esc(l.name)} · ${eur(l.preis)}</option>`).join('')}</select>
            </div>
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
    $('#posKatalog').onchange = e => {
      const l = S.leistungen.find(x => x.id === e.target.value); e.target.value = ''; if (!l) return;
      const leer = d.positionen.length === 1 && !d.positionen[0].bezeichnung && !num(d.positionen[0].einzelpreis);
      const p = { bezeichnung: l.name, beschreibung: l.beschreibung || '', menge: 1, einheit: l.einheit || 'Stück', einzelpreis: Number(l.preis) };
      if (leer) d.positionen[0] = p; else d.positionen.push(p);
      renderPos();
    };
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
      <label class="f full">Bezeichnung<input data-k="bezeichnung" value="${esc(p.bezeichnung)}" placeholder="z. B. Imagefilm"></label>
      <label class="f full">Beschreibung (optional)<input data-k="beschreibung" value="${esc(p.beschreibung)}" placeholder="erscheint klein darunter"></label>
      <label class="f">Menge<input data-k="menge" inputmode="decimal" value="${esc(String(p.menge).replace('.', ','))}"></label>
      <label class="f">Einzelpreis in €<input data-k="einzelpreis" inputmode="decimal" value="${numIn(p.einzelpreis)}"></label>
      <div class="f"><span>Gesamt</span><output data-sum>${eur(num(p.menge) * num(p.einzelpreis))}</output></div>
      <button type="button" class="x" data-del title="Position entfernen" aria-label="Position entfernen" ${d.positionen.length < 2 ? 'disabled' : ''}>✕</button></div>`).join('');
    $('#posList').oninput = e => {
      const box = e.target.closest('.pos'), k = e.target.dataset.k; if (!box || !k) return;
      const p = d.positionen[+box.dataset.i]; p[k] = e.target.value;
      box.querySelector('[data-sum]').textContent = eur(num(p.menge) * num(p.einzelpreis));
      totals(); vorschau();
    };
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
      if (pos.some(p => !p.bezeichnung.trim())) { toast('Jede Position braucht eine Bezeichnung.', true); return null; }
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
      <div class="head"><div><h1>Firmendaten</h1><p class="sub">Erscheinen auf neuen Rechnungen. Bestehende Rechnungen bleiben unverändert.</p></div></div>
      <div class="stack">
        <div class="panel"><h2>Ablage & Sicherung</h2>${ablagePanel()}</div>
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
          <div class="btn-row end"><button class="btn primary">Speichern</button></div>
        </form>
      </div>`;
    $('#ff').onsubmit = async e => {
      e.preventDefault(); const fd = new FormData(e.target), o = {};
      for (const [k, v] of fd.entries()) o[k] = String(v).trim();
      o.kleinunternehmer = fd.has('kleinunternehmer');
      ['mwst_satz', 'zahlungsziel_tage', 'mahnfrist_tage'].forEach(k => o[k] = num(o[k]));
      if (!o.kleinunternehmer && S.firma.kleinunternehmer && !(await confirmDlg('Kleinunternehmerregelung ausschalten?', 'Neue Rechnungen enthalten dann ' + o.mwst_satz + ' % Umsatzsteuer. Nur ausschalten, wenn ihr umsatzsteuerpflichtig seid.', 'Ausschalten', true))) return;
      await guard(async () => { await DB.saveFirma(o); S.firma = await DB.getFirma(); ablageSyncSpaeter(); }, 'Firmendaten gespeichert');
    };
  }

  /* ---------- Start ---------- */
  DB.onAuth(s => zeigeApp(s));
  DB.session().then(zeigeApp).catch(() => zeigeApp(null));
})();
