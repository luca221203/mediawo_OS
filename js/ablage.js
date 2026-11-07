/* Automatische Ablage in einem Ordner auf dem Rechner (z. B. ein Google-Drive-Ordner).
   Funktioniert in Google Chrome und Microsoft Edge (File System Access API).
   Struktur: <Ordner>/<Jahr>/Rechnungen|Stornorechnungen|Zahlungserinnerungen/*.pdf
             <Ordner>/Sicherungen/Mediawo-Sicherung-JJJJ-MM-TT.json und Mediawo-Sicherung-aktuell.json */
(function () {
  const SUPPORTED = typeof window.showDirectoryPicker === 'function';
  let handle = null, state = SUPPORTED ? 'off' : 'unsupported', letzteSicherung = null, letzterFehler = '';

  function idb() {
    return new Promise((res, rej) => {
      const r = indexedDB.open('mediawo-os', 1);
      r.onupgradeneeded = () => r.result.createObjectStore('kv');
      r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
    });
  }
  async function kv(mode, k, v) {
    const db = await idb();
    return new Promise((res, rej) => {
      const tx = db.transaction('kv', mode === 'get' ? 'readonly' : 'readwrite'), st = tx.objectStore('kv');
      const rq = mode === 'get' ? st.get(k) : mode === 'set' ? st.put(v, k) : st.delete(k);
      tx.oncomplete = () => res(rq.result); tx.onerror = () => rej(tx.error);
    });
  }
  /* Rechte- oder Ordnerfehler schalten die Ablage auf Pause, Fehler bei einer einzelnen Datei nicht */
  function fehler(e, nurDatei) {
    letzterFehler = (e && (e.name || e.message)) || 'unbekannt';
    if (e && (e.name === 'NotAllowedError' || e.name === 'SecurityError')) state = 'needs-permission';
    else if (!nurDatei) state = 'error';
  }

  async function ordner(...teile) {
    let d = handle;
    for (const t of teile) d = await d.getDirectoryHandle(t, { create: true });
    return d;
  }
  async function schreiben(dir, name, inhalt) {
    const fh = await dir.getFileHandle(name, { create: true });
    const w = await fh.createWritable(); await w.write(inhalt); await w.close();
    const check = await (await dir.getFileHandle(name)).getFile();
    if (!check.size) throw new Error('leere Datei');
    return check.size;
  }

  window.ABLAGE = {
    get state() { return state; },
    get name() { return handle ? handle.name : ''; },
    get letzteSicherung() { return letzteSicherung; },
    get fehler() { return letzterFehler; },
    async init() {
      if (!SUPPORTED) return;
      try { handle = await kv('get', 'ablageDir'); letzteSicherung = await kv('get', 'letzteSicherung') || null; } catch (e) { handle = null; }
      if (!handle) { state = 'off'; return; }
      try { state = (await handle.queryPermission({ mode: 'readwrite' })) === 'granted' ? 'on' : 'needs-permission'; }
      catch (e) { state = 'needs-permission'; }
    },
    async waehlen() {
      try {
        const h = await window.showDirectoryPicker({ id: 'mediawo-ablage', mode: 'readwrite', startIn: 'documents' });
        handle = h; await kv('set', 'ablageDir', h); state = 'on'; return true;
      } catch (e) { if (e.name !== 'AbortError') fehler(e); return false; }
    },
    async freigeben() {
      if (!handle) return false;
      try { state = (await handle.requestPermission({ mode: 'readwrite' })) === 'granted' ? 'on' : 'needs-permission'; }
      catch (e) { state = 'needs-permission'; }
      return state === 'on';
    },
    async aus() { handle = null; state = SUPPORTED ? 'off' : 'unsupported'; try { await kv('del', 'ablageDir'); } catch (e) { } },
    async existiert(info) {
      if (state !== 'on') return false;
      try { const d = await ordner(info.jahr, info.ordner); await d.getFileHandle(info.name); return true; }
      catch (e) { if (e.name === 'NotFoundError' || e.name === 'TypeMismatchError') return false; fehler(e, true); return false; }
    },
    async pdf(info, blob) {
      if (state !== 'on') return null;
      try { const d = await ordner(info.jahr, info.ordner); const size = await schreiben(d, info.name, blob); return { path: `${handle.name}/${info.jahr}/${info.ordner}`, name: info.name, size }; }
      catch (e) { console.warn('Ablage', info.name, e); fehler(e, true); return null; }
    },
    async sicherung(daten) {
      if (state !== 'on') return false;
      try {
        const d = await ordner('Sicherungen');
        const now = new Date(), tag = now.toISOString().slice(0, 10);
        const json = JSON.stringify({ app: 'Mediawo OS', erstellt: now.toISOString(), ...daten }, null, 2);
        await schreiben(d, `Mediawo-Sicherung-${tag}.json`, json);
        await schreiben(d, 'Mediawo-Sicherung-aktuell.json', json);
        letzteSicherung = now.toISOString(); try { await kv('set', 'letzteSicherung', letzteSicherung); } catch (e) { }
        return true;
      } catch (e) { fehler(e); return false; }
    }
  };
})();
