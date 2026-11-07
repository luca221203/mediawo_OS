/* Datenzugriff. Zwei Varianten mit derselben Schnittstelle:
   - Supabase (echte Daten)
   - Demo (?demo in der Adresse): Beispieldaten nur im Browser, zum Ausprobieren */
(function () {
  const isDemo = new URLSearchParams(location.search).has('demo');

  function fail(error) {
    if (!error) return;
    const msg = error.message || String(error);
    throw new Error(msg);
  }

  /* ---------------- Supabase ---------------- */
  function supabaseDb() {
    const C = window.MW_CONFIG;
    // Art des Links merken, bevor Supabase die Adresse aufräumt (Einladung / Passwort zurücksetzen)
    const hash = new URLSearchParams(location.hash.slice(1));
    let linkTyp = hash.get('type');
    const sb = window.supabase.createClient(C.supabaseUrl, C.supabaseKey, { auth: { flowType: 'implicit' } });
    return {
      demo: false,
      linkTyp() { const t = linkTyp; linkTyp = null; return t; },
      async session() { const { data } = await sb.auth.getSession(); return data.session; },
      onAuth(cb) { sb.auth.onAuthStateChange((e, s) => { if (e === 'PASSWORD_RECOVERY') linkTyp = 'recovery'; cb(s); }); },
      async passwortSetzen(pw) { const { error } = await sb.auth.updateUser({ password: pw }); fail(error); },
      async passwortVergessen(email) {
        const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: location.origin + location.pathname }); fail(error);
      },
      async login(email, password) { const { error } = await sb.auth.signInWithPassword({ email, password }); fail(error); },
      async logout() { await sb.auth.signOut(); },

      async getFirma() { const { data, error } = await sb.from('firma').select('*').eq('id', 1).single(); fail(error); return data; },
      async saveFirma(f) { const { error } = await sb.from('firma').update({ ...f, updated_at: new Date().toISOString() }).eq('id', 1); fail(error); },

      async listKunden() { const { data, error } = await sb.from('kunden').select('*').order('created_at'); fail(error); return data; },
      async saveKunde(k) {
        const q = k.id ? sb.from('kunden').update(k).eq('id', k.id) : sb.from('kunden').insert(k);
        const { data, error } = await q.select().single(); fail(error); return data;
      },

      async listLeistungen() { const { data, error } = await sb.from('leistungen').select('*').order('name'); fail(error); return data; },
      async saveLeistung(l) {
        const q = l.id ? sb.from('leistungen').update(l).eq('id', l.id) : sb.from('leistungen').insert(l);
        const { data, error } = await q.select().single(); fail(error); return data;
      },
      async deleteLeistung(id) { const { error } = await sb.from('leistungen').delete().eq('id', id); fail(error); },

      async listRechnungen() {
        const { data, error } = await sb.from('rechnungen').select('*, rechnung_positionen(*)')
          .order('datum', { ascending: false }).order('nummer', { ascending: false });
        fail(error);
        data.forEach(r => r.rechnung_positionen.sort((a, b) => a.pos - b.pos));
        return data;
      },
      async createRechnung(p) {
        const { data, error } = await sb.rpc('rechnung_erstellen', {
          p_kunde_id: p.kunde_id, p_datum: p.datum, p_leistungsdatum: p.leistungsdatum || null,
          p_leistungszeitraum_bis: p.leistungszeitraum_bis || null, p_positionen: p.positionen,
          p_einleitung: p.einleitung || null, p_schluss: p.schluss || null, p_angebot_id: null
        });
        fail(error); return data;
      },
      async stornieren(id) { const { data, error } = await sb.rpc('rechnung_stornieren', { p_rechnung_id: id }); fail(error); return data; },
      async setBezahlt(id, datum) {
        const { error } = await sb.from('rechnungen').update({ status: datum ? 'bezahlt' : 'offen', bezahlt_am: datum || null }).eq('id', id);
        fail(error);
      }
    };
  }

  /* ---------------- Demo ---------------- */
  function demoDb() {
    const uid = () => crypto.randomUUID();
    const today = new Date().toISOString().slice(0, 10);
    const addDays = (iso, n) => { const d = new Date(iso + 'T12:00:00'); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };
    const firma = {
      id: 1, name: 'Olbrich & Wunderlich GbR', marke: 'Mediawo', inhaber: 'Kai Olbrich und Luca Wunderlich',
      strasse: 'Martin-Schunck-Straße 19', plz: '54296', ort: 'Trier', email: 'info@media-wo.de', telefon: '+49 179 41 61 850',
      web: 'www.media-wo.de', steuernummer: '42/125/35047', ust_id: 'DE369145078', kleinunternehmer: true,
      hinweis_kleinunternehmer: 'Kein Mehrwertsteuerausweis, da Kleinunternehmer nach § 19 (1) UStG.', mwst_satz: 19,
      bank: 'Sparkasse Trier', kontoinhaber: 'Olbrich & Wunderlich GbR', iban: 'DE93 5855 0130 0001 1688 14', bic: 'TRISDE55XXX',
      zahlungsziel_tage: 14, mahnfrist_tage: 7, angebot_gueltig_tage: 30
    };
    const kunden = [
      { id: uid(), kuerzel: 'DF', firma: 'DeFORIS Unternehmensberatung', anrede: 'Herr', vorname: 'Sebastian', nachname: 'Tsoleridis', strasse: 'Vitalisstraße 67', plz: '50827', ort: 'Köln', land: 'Deutschland', email: '', telefon: '', ust_id: '', status: 'aktiv', notiz: '', created_at: '2026-01-01' },
      { id: uid(), kuerzel: 'AD', firma: 'Atelier dentaire Arnoldy S.à r.l.', anrede: '', vorname: '', nachname: '', strasse: '15, route de Luxembourg', plz: 'L-6633', ort: 'Wasserbillig', land: 'Luxemburg', email: '', telefon: '', ust_id: '', status: 'aktiv', notiz: '', created_at: '2026-01-02' }
    ];
    const leistungen = [
      { id: uid(), name: 'Social-Media-Reel', beschreibung: 'Konzept, Dreh und Schnitt', preis: 130, einheit: 'Stück', aktiv: true },
      { id: uid(), name: 'Carousel-Slider', beschreibung: '', preis: 200, einheit: 'Stück', aktiv: true },
      { id: uid(), name: 'Imagefilm', beschreibung: 'Planung, Dreh und Schnitt', preis: 600, einheit: 'Stück', aktiv: true }
    ];
    const rechnungen = [];
    let counter = 8;
    let session = null; const cbs = [];

    function make(kunde, datum, pos, extra = {}) {
      const netto = Math.round(pos.reduce((a, p) => a + p.menge * p.einzelpreis, 0) * 100) / 100;
      const satz = firma.kleinunternehmer ? 0 : firma.mwst_satz;
      const mwst = Math.round(netto * satz) / 100;
      const r = {
        id: uid(), nummer: datum.slice(0, 4) + '-' + String(++counter).padStart(3, '0'), typ: 'rechnung',
        kunde_id: kunde.id, kunde_snapshot: { ...kunde }, firma_snapshot: { ...firma }, datum, leistungsdatum: datum,
        leistungszeitraum_bis: null, faellig_am: addDays(datum, firma.zahlungsziel_tage), einleitung: null, schluss: null,
        mwst_satz: satz, netto, mwst, brutto: netto + mwst, storno_von: null, status: 'offen', bezahlt_am: null, storniert_durch: null,
        rechnung_positionen: pos.map((p, i) => ({ id: uid(), pos: i + 1, bezeichnung: p.bezeichnung, beschreibung: p.beschreibung || null, menge: p.menge, einheit: p.einheit || 'Stück', einzelpreis: p.einzelpreis, gesamt: Math.round(p.menge * p.einzelpreis * 100) / 100 })),
        ...extra
      };
      rechnungen.unshift(r); return r;
    }
    const r1 = make(kunden[1], addDays(today, -40), [{ bezeichnung: 'Imagefilm', menge: 1, einzelpreis: 600 }]);
    r1.status = 'bezahlt'; r1.bezahlt_am = addDays(today, -30);
    make(kunden[0], addDays(today, -20), [{ bezeichnung: 'Social-Media-Reels', menge: 5, einzelpreis: 130 }, { bezeichnung: 'Carousel-Slider', menge: 2, einzelpreis: 200 }]);
    make(kunden[0], addDays(today, -3), [{ bezeichnung: 'Long-Form-Video', menge: 1, einzelpreis: 250 }]);

    const wait = v => new Promise(res => setTimeout(() => res(structuredClone(v)), 60));
    return {
      demo: true,
      linkTyp() { const t = new URLSearchParams(location.search).get('typ'); return t; },
      async passwortSetzen() { return wait(null); },
      async passwortVergessen() { return wait(null); },
      async session() { return session || (new URLSearchParams(location.search).get('typ') ? (session = { user: { email: 'kai@media-wo.de' } }) : null); },
      onAuth(cb) { cbs.push(cb); },
      async login(email) { session = { user: { email: email || 'demo@media-wo.de' } }; cbs.forEach(c => c(session)); },
      async logout() { session = null; cbs.forEach(c => c(null)); },
      async getFirma() { return wait(firma); },
      async saveFirma(f) { Object.assign(firma, f); return wait(null); },
      async listKunden() { return wait(kunden); },
      async saveKunde(k) {
        if (k.id) { Object.assign(kunden.find(x => x.id === k.id), k); return wait(kunden.find(x => x.id === k.id)); }
        const n = { land: 'Deutschland', status: 'aktiv', ...k, id: uid(), created_at: new Date().toISOString() }; kunden.push(n); return wait(n);
      },
      async listLeistungen() { return wait([...leistungen].sort((a, b) => a.name.localeCompare(b.name))); },
      async saveLeistung(l) {
        if (l.id) { Object.assign(leistungen.find(x => x.id === l.id), l); return wait(l); }
        const n = { aktiv: true, ...l, id: uid() }; leistungen.push(n); return wait(n);
      },
      async deleteLeistung(id) { leistungen.splice(leistungen.findIndex(x => x.id === id), 1); return wait(null); },
      async listRechnungen() { return wait(rechnungen); },
      async createRechnung(p) {
        const k = kunden.find(x => x.id === p.kunde_id); if (!k) throw new Error('Kunde nicht gefunden.');
        const r = make(k, p.datum, p.positionen.map(x => ({ ...x, menge: +x.menge, einzelpreis: +x.einzelpreis })),
          { leistungsdatum: p.leistungsdatum || p.datum, leistungszeitraum_bis: p.leistungszeitraum_bis || null, einleitung: p.einleitung || null, schluss: p.schluss || null });
        return wait(r.id);
      },
      async stornieren(id) {
        const o = rechnungen.find(x => x.id === id);
        if (o.typ === 'storno') throw new Error('Eine Stornorechnung kann nicht storniert werden.');
        if (o.status === 'storniert') throw new Error('Rechnung ' + o.nummer + ' ist bereits storniert.');
        const s = make(o.kunde_snapshot, today, o.rechnung_positionen.map(p => ({ ...p, menge: -p.menge })), {
          typ: 'storno', storno_von: o.id, status: 'bezahlt', faellig_am: today, leistungsdatum: o.leistungsdatum,
          firma_snapshot: o.firma_snapshot, mwst_satz: o.mwst_satz,
          einleitung: 'Diese Rechnung storniert die Rechnung Nr. ' + o.nummer + ' vom ' + o.datum.split('-').reverse().join('.') + ' vollständig.'
        });
        o.status = 'storniert'; o.storniert_durch = s.id; return wait(s.id);
      },
      async setBezahlt(id, datum) {
        const r = rechnungen.find(x => x.id === id);
        if (r.status === 'storniert') throw new Error('Eine stornierte Rechnung kann nicht wieder geöffnet werden.');
        r.status = datum ? 'bezahlt' : 'offen'; r.bezahlt_am = datum || null; return wait(null);
      }
    };
  }

  window.DB = isDemo ? demoDb() : supabaseDb();
})();
