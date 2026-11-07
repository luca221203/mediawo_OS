/* Zwei Ordner auf dem Rechner, wie bei IntegraSoma (nur Chrome/Edge, File System Access API):
   PDF-Ablage:     <Ordner>/<Jahr>/Rechnung_… | Stornorechnung_… | Zahlungserinnerung_….pdf
   Datensicherung: <Ordner>/Mediawo-Sicherung-JJJJ-MM-TT.json und Mediawo-Sicherung-aktuell.json */
(function () {
  const SUPPORTED = typeof window.showDirectoryPicker === 'function';

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
  async function schreiben(dir, name, inhalt) {
    const fh = await dir.getFileHandle(name, { create: true });
    const w = await fh.createWritable(); await w.write(inhalt); await w.close();
    const check = await (await dir.getFileHandle(name)).getFile();
    if (!check.size) throw new Error('leere Datei');
    return check.size;
  }

  function ordnerSpeicher(key, pickerId) {
    let handle = null, state = SUPPORTED ? 'off' : 'unsupported', fehlerTxt = '';
    function fehler(e, nurDatei) {
      fehlerTxt = (e && (e.name || e.message)) || 'unbekannt';
      if (e && (e.name === 'NotAllowedError' || e.name === 'SecurityError')) state = 'needs-permission';
      else if (!nurDatei) state = 'error';
    }
    async function unter(...teile) { let d = handle; for (const t of teile) d = await d.getDirectoryHandle(t, { create: true }); return d; }
    return {
      get state() { return state; }, get name() { return handle ? handle.name : ''; }, get fehler() { return fehlerTxt; },
      async init() {
        if (!SUPPORTED) return;
        try { handle = await kv('get', key); } catch (e) { handle = null; }
        if (!handle) { state = 'off'; return; }
        try { state = (await handle.queryPermission({ mode: 'readwrite' })) === 'granted' ? 'on' : 'needs-permission'; }
        catch (e) { state = 'needs-permission'; }
      },
      async waehlen() {
        try {
          const h = await window.showDirectoryPicker({ id: pickerId, mode: 'readwrite', startIn: 'documents' });
          handle = h; await kv('set', key, h); state = 'on'; return true;
        } catch (e) { if (e.name !== 'AbortError') fehler(e); return false; }
      },
      async freigeben() {
        if (!handle) return false;
        try { state = (await handle.requestPermission({ mode: 'readwrite' })) === 'granted' ? 'on' : 'needs-permission'; }
        catch (e) { state = 'needs-permission'; }
        return state === 'on';
      },
      async aus() { handle = null; state = SUPPORTED ? 'off' : 'unsupported'; try { await kv('del', key); } catch (e) { } },
      async existiert(teile, name) {
        if (state !== 'on') return false;
        try { const d = await unter(...teile); await d.getFileHandle(name); return true; }
        catch (e) { if (e.name === 'NotFoundError' || e.name === 'TypeMismatchError') return false; fehler(e, true); return false; }
      },
      async datei(teile, name, inhalt) {
        if (state !== 'on') return null;
        try { const d = await unter(...teile); const size = await schreiben(d, name, inhalt); return { path: [handle.name, ...teile].join('/'), name, size }; }
        catch (e) { console.warn('Ablage', name, e); fehler(e, true); return null; }
      }
    };
  }

  const pdf = ordnerSpeicher('pdfDir', 'mediawo-pdf');
  const backup = ordnerSpeicher('backupDir', 'mediawo-sicherung');
  let letzteSicherung = null;

  window.ABLAGE = {
    supported: SUPPORTED, pdf, backup,
    get letzteSicherung() { return letzteSicherung; },
    async init() {
      await Promise.all([pdf.init(), backup.init()]);
      try { letzteSicherung = await kv('get', 'letzteSicherung') || null; } catch (e) { }
    },
    existiertPdf(info) { return pdf.existiert([info.jahr], info.name); },
    speicherePdf(info, blob) { return pdf.datei([info.jahr], info.name, blob); },
    async sicherung(daten) {
      if (backup.state !== 'on') return false;
      const now = new Date();
      const json = JSON.stringify({ app: 'Mediawo OS', erstellt: now.toISOString(), ...daten }, null, 2);
      const a = await backup.datei([], `Mediawo-Sicherung-${now.toISOString().slice(0, 10)}.json`, json);
      const b = a && await backup.datei([], 'Mediawo-Sicherung-aktuell.json', json);
      if (!b) return false;
      letzteSicherung = now.toISOString(); try { await kv('set', 'letzteSicherung', letzteSicherung); } catch (e) { }
      return true;
    }
  };
})();
