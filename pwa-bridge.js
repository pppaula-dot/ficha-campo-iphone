(() => {
  'use strict';

  const DB_NAME = 'ficha_campo_iphone_media_v01';
  const DB_VERSION = 1;
  const STORE = 'media';
  const cache = new Map();
  let dbPromise = null;
  let audioSession = null;

  function openDb() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE)) {
          const s = db.createObjectStore(STORE, { keyPath: 'path' });
          s.createIndex('visitId', 'visitId', { unique: false });
          s.createIndex('process', 'process', { unique: false });
          s.createIndex('kind', 'kind', { unique: false });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error || new Error('Não foi possível abrir o armazenamento de mídias.'));
    });
    return dbPromise;
  }

  function reqPromise(req) {
    return new Promise((resolve, reject) => {
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error || new Error('Falha no armazenamento.'));
    });
  }

  async function putMedia(rec) {
    const db = await openDb();
    const tx = db.transaction(STORE, 'readwrite');
    await reqPromise(tx.objectStore(STORE).put(rec));
    cache.set(rec.path, rec);
    return rec;
  }

  async function getAllMedia() {
    const db = await openDb();
    const tx = db.transaction(STORE, 'readonly');
    return (await reqPromise(tx.objectStore(STORE).getAll())) || [];
  }

  async function loadCache() {
    try {
      const rows = await getAllMedia();
      rows.forEach(r => cache.set(r.path, r));
      if (typeof window.render === 'function') window.render();
    } catch (e) {
      console.warn('Mídias não carregadas:', e);
    }
  }

  const safe = s => {
    s = String(s || 'sem-id').trim();
    return (s || 'sem-id').replace(/[^A-Za-z0-9._-]/g, '-');
  };
  const folderSafe = s => {
    s = String(s || 'Empreendimento sem nome').trim();
    return (s || 'Empreendimento sem nome').replace(/[\\/:*?"<>|]/g, '-').replace(/\s+/g, ' ');
  };
  const pad2 = v => {
    const n = parseInt(v, 10);
    return Number.isFinite(n) ? String(n).padStart(2, '0') : safe(v);
  };
  const condFolder = c => String(c) === 'GERAL' ? 'GERAL' : `Item_${pad2(c)}`;
  const pointFolder = p => String(p) === 'GERAL' ? 'GERAL' : (String(p).startsWith('PONTO_') ? `Ponto_${String(p).slice(6)}` : `Ponto_${pad2(p)}`);

  function callback(name, payload) {
    try {
      const fn = window[name];
      if (typeof fn === 'function') fn(payload);
    } catch (e) {
      console.error(name, e);
    }
  }

  function fileInput({ accept = '*/*', multiple = false, capture = null } = {}) {
    return new Promise(resolve => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = accept;
      input.multiple = multiple;
      if (capture) input.setAttribute('capture', capture);
      input.style.position = 'fixed';
      input.style.left = '-9999px';
      document.body.appendChild(input);
      let finished = false;
      const done = files => {
        if (finished) return;
        finished = true;
        setTimeout(() => input.remove(), 50);
        resolve(Array.from(files || []));
      };
      input.addEventListener('change', () => done(input.files), { once: true });
      input.addEventListener('cancel', () => done([]), { once: true });
      input.click();
      setTimeout(() => { if (!finished && !document.body.contains(input)) done([]); }, 120000);
    });
  }

  function loadImage(file) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Não foi possível ler esta imagem.')); };
      img.src = url;
    });
  }

  async function loadImageOriented(file) {
    // Mantém retrato/paisagem conforme a orientação real gravada pela câmera.
    if ('createImageBitmap' in window) {
      try { return await createImageBitmap(file, { imageOrientation: 'from-image' }); } catch (_) {}
    }
    return loadImage(file);
  }

  function canvasBlob(canvas, type, quality) {
    return new Promise((resolve, reject) => {
      canvas.toBlob(b => b ? resolve(b) : reject(new Error('Não foi possível converter a foto.')), type, quality);
    });
  }

  async function processPhoto(file) {
    const img = await loadImageOriented(file);
    const makeCanvas = maxDim => {
      const scale = Math.min(1, maxDim / Math.max(img.naturalWidth || img.width, img.naturalHeight || img.height));
      const w = Math.max(1, Math.round((img.naturalWidth || img.width) * scale));
      const h = Math.max(1, Math.round((img.naturalHeight || img.height) * scale));
      const c = document.createElement('canvas');
      c.width = w; c.height = h;
      const ctx = c.getContext('2d', { alpha: false });
      ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, h);
      ctx.drawImage(img, 0, 0, w, h);
      return c;
    };
    const archiveCanvas = makeCanvas(2560);
    const previewCanvas = makeCanvas(1200);
    const blob = await canvasBlob(archiveCanvas, 'image/jpeg', 0.90);
    const previewDataUrl = previewCanvas.toDataURL('image/jpeg', 0.78);
    return { blob, previewDataUrl };
  }

  function mediaSeq(kind, visitId, cond, point) {
    let n = 0;
    for (const r of cache.values()) if (r.kind === kind && r.visitId === visitId && String(r.cond) === String(cond) && String(r.point) === String(point)) n++;
    return n + 1;
  }

  function evidenceName(process, cond, point, date, kind, seq, ext) {
    let name = safe(process);
    if (String(cond) === 'GERAL') name += '_GERAL';
    else name += `_Item_${pad2(cond)}_${pointFolder(point)}`;
    name += `_${safe(date)}_${kind}_${String(seq).padStart(2, '0')}${ext}`;
    return name;
  }

  async function takePhoto(process, enterprise, visitId, cond, point, date) {
    try {
      // Botão "Adicionar foto": solicita a câmera traseira diretamente em navegadores compatíveis.
      const files = await fileInput({ accept: 'image/*', multiple: false, capture: 'environment' });
      if (!files.length) return callback('nativePhotoError', 'Seleção de foto cancelada.');
      const { blob, previewDataUrl } = await processPhoto(files[0]);
      const seq = mediaSeq('photo', visitId, cond, point);
      const name = evidenceName(process, cond, point, date, 'Foto', seq, '.jpg');
      const path = `pwa-media://${crypto.randomUUID ? crypto.randomUUID() : (Date.now() + '-' + Math.random())}`;
      const zipPath = `Fotos/${condFolder(cond)}/${pointFolder(point)}/${name}`;
      const archivePath = `Arquivos/Ficha_Campo_Orientacao_Lavra/${folderSafe(enterprise)}/Fotos/${safe(process)}/${safe(date)}/${condFolder(cond)}/${pointFolder(point)}/${name}`;
      const rec = { path, kind: 'photo', process, enterprise, visitId, cond, point, date, name, mime: 'image/jpeg', size: blob.size, blob, previewDataUrl, zipPath, archivePath, createdAt: new Date().toISOString() };
      await putMedia(rec);
      callback('nativePhotoSaved', JSON.stringify({ name, path, cond, point, size: blob.size, publicUri: '', archiveSaved: true, archivePath }));
    } catch (e) {
      callback('nativePhotoError', 'Não foi possível registrar a foto: ' + (e?.message || e));
    }
  }

  function chooseAudioMime() {
    const candidates = ['audio/mp4', 'audio/webm;codecs=opus', 'audio/webm'];
    if (!window.MediaRecorder) return '';
    return candidates.find(m => MediaRecorder.isTypeSupported?.(m)) || '';
  }

  async function startAudio(process, enterprise, visitId, cond, point, date) {
    if (audioSession) return;
    try {
      if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) throw new Error('Gravação de áudio não está disponível neste navegador.');
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mime = chooseAudioMime();
      const recorder = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream);
      const chunks = [];
      recorder.ondataavailable = e => { if (e.data?.size) chunks.push(e.data); };
      recorder.onerror = e => callback('nativeAudioError', 'Erro na gravação: ' + (e.error?.message || 'falha no gravador'));
      recorder.onstop = async () => {
        const session = audioSession;
        audioSession = null;
        try {
          const actualMime = recorder.mimeType || mime || 'audio/mp4';
          const blob = new Blob(chunks, { type: actualMime });
          if (!blob.size) throw new Error('O áudio ficou vazio.');
          const ext = actualMime.includes('webm') ? '.webm' : '.m4a';
          const seq = mediaSeq('audio', visitId, cond, point);
          const name = evidenceName(process, cond, point, date, 'Audio', seq, ext);
          const path = `pwa-media://${crypto.randomUUID ? crypto.randomUUID() : (Date.now() + '-' + Math.random())}`;
          const zipPath = `Audios/${condFolder(cond)}/${pointFolder(point)}/${name}`;
          const archivePath = `Arquivos/Ficha_Campo_Orientacao_Lavra/${folderSafe(enterprise)}/Audios/${safe(process)}/${safe(date)}/${condFolder(cond)}/${pointFolder(point)}/${name}`;
          await putMedia({ path, kind: 'audio', process, enterprise, visitId, cond, point, date, name, mime: actualMime, size: blob.size, blob, previewDataUrl: '', zipPath, archivePath, createdAt: new Date().toISOString() });
          callback('nativeAudioSaved', JSON.stringify({ name, path, cond, point, size: blob.size, publicUri: '', archiveSaved: true, archivePath }));
        } catch (e) {
          callback('nativeAudioError', 'Não foi possível salvar o áudio: ' + (e?.message || e));
        } finally {
          try { session?.stream?.getTracks().forEach(t => t.stop()); } catch (_) {}
        }
      };
      audioSession = { recorder, stream };
      recorder.start(500);
    } catch (e) {
      audioSession = null;
      callback('nativeAudioError', 'Não foi possível iniciar o microfone: ' + (e?.message || e));
    }
  }

  function stopAudio() {
    try {
      if (!audioSession?.recorder) return;
      if (audioSession.recorder.state !== 'inactive') audioSession.recorder.stop();
    } catch (e) {
      callback('nativeAudioError', 'Não foi possível encerrar o áudio: ' + (e?.message || e));
    }
  }

  function dictate(target) {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) {
      callback('nativeSpeechError', 'O ditado por botão não está disponível neste iPhone. Use o microfone do próprio teclado neste campo.');
      return;
    }
    try {
      const r = new SR();
      r.lang = 'pt-BR'; r.interimResults = false; r.maxAlternatives = 1;
      r.onresult = ev => callback('nativeSpeech', JSON.stringify({ target, text: ev.results?.[0]?.[0]?.transcript || '' }));
      r.onerror = ev => callback('nativeSpeechError', 'Não foi possível usar o ditado: ' + (ev.error || 'erro'));
      r.start();
    } catch (e) {
      callback('nativeSpeechError', 'Não foi possível iniciar o ditado. Use o microfone do teclado.');
    }
  }

  function captureLocation(target) {
    if (!navigator.geolocation) return callback('nativeLocationError', 'GPS não disponível neste aparelho.');
    navigator.geolocation.getCurrentPosition(
      pos => callback('nativeLocation', JSON.stringify({ lat: pos.coords.latitude, lon: pos.coords.longitude, accuracy: pos.coords.accuracy ?? -1, target })),
      err => callback('nativeLocationError', 'Não foi possível capturar o GPS: ' + (err.message || 'verifique a permissão de localização.')),
      { enableHighAccuracy: true, timeout: 60000, maximumAge: 0 }
    );
  }

  function imageDataUrl(path) {
    return cache.get(path)?.previewDataUrl || '';
  }

  function networkType() {
    if (navigator.onLine === false) return 'none';
    const c = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
    if (!c) return 'unknown';
    const t = String(c.type || '').toLowerCase();
    if (t.includes('wifi')) return 'wifi';
    if (t.includes('cell')) return 'cellular';
    if (t.includes('ethernet')) return 'ethernet';
    return 'other';
  }

  function le16(a,o){ return a[o] | (a[o+1]<<8); }
  function le32(a,o){ return (a[o] | (a[o+1]<<8) | (a[o+2]<<16) | (a[o+3]<<24)) >>> 0; }
  async function inflateRaw(bytes) {
    if (typeof DecompressionStream === 'undefined') throw new Error('Este iPhone não oferece descompactação ZIP automática.');
    const ds = new DecompressionStream('deflate-raw');
    const ab = await new Response(new Blob([bytes]).stream().pipeThrough(ds)).arrayBuffer();
    return new Uint8Array(ab);
  }
  async function fichaTextsFromZip(file) {
    const a = new Uint8Array(await file.arrayBuffer());
    let eocd = -1;
    for (let i = a.length - 22, min = Math.max(0, a.length - 65557); i >= min; i--) {
      if (le32(a,i) === 0x06054b50) { eocd = i; break; }
    }
    if (eocd < 0) throw new Error('ZIP inválido ou incompleto.');
    const total = le16(a, eocd + 10);
    let off = le32(a, eocd + 16);
    const out = [];
    const dec = new TextDecoder('utf-8');
    for (let i = 0; i < total; i++) {
      if (le32(a,off) !== 0x02014b50) throw new Error('Estrutura ZIP não reconhecida.');
      const method = le16(a, off + 10);
      const compSize = le32(a, off + 20);
      const nameLen = le16(a, off + 28), extraLen = le16(a, off + 30), commentLen = le16(a, off + 32);
      const localOff = le32(a, off + 42);
      const name = dec.decode(a.slice(off + 46, off + 46 + nameLen));
      if (name.toLowerCase().endsWith('.ficha') && !name.endsWith('/')) {
        if (le32(a, localOff) !== 0x04034b50) throw new Error('Entrada ZIP corrompida: ' + name);
        const ln = le16(a, localOff + 26), lx = le16(a, localOff + 28);
        const start = localOff + 30 + ln + lx;
        const comp = a.slice(start, start + compSize);
        const raw = method === 0 ? comp : method === 8 ? await inflateRaw(comp) : (()=>{ throw new Error('Método de compactação não suportado no ZIP: ' + method); })();
        out.push({ name, text: dec.decode(raw) });
      }
      off += 46 + nameLen + extraLen + commentLen;
    }
    if (!out.length) throw new Error('O ZIP não contém arquivos .ficha.');
    return out;
  }
  async function chooseFichaFile() {
    try {
      const files = await fileInput({ accept: '.ficha,.zip,application/zip,application/json,text/plain', multiple: true });
      if (!files.length) return;
      let ok = 0;
      for (const f of files) {
        try {
          const candidates = f.name.toLowerCase().endsWith('.zip') ? await fichaTextsFromZip(f) : [{ name: f.name, text: await f.text() }];
          for (const c of candidates) {
            try {
              const obj = JSON.parse(c.text);
              if (obj?.file_type !== 'ficha_campo_importavel') throw new Error('arquivo não reconhecido como ficha de campo');
              callback('nativeFichaImported', c.text);
              ok++;
            } catch (e) {
              callback('nativeFichaImportError', `Não foi possível importar ${c.name}: ${e?.message || e}`);
            }
          }
        } catch (e) {
          callback('nativeFichaImportError', `Não foi possível importar ${f.name}: ${e?.message || e}`);
        }
      }
      callback('nativeFichaImportBatchFinished', String(ok));
    } catch (e) {
      callback('nativeFichaImportError', 'Não foi possível abrir as fichas: ' + (e?.message || e));
    }
  }

  async function chooseLicenseFile() {
    callback('nativeLicenseImportError', 'Este app usa arquivos .ficha.');
  }

  function strBytes(s) { return new TextEncoder().encode(String(s ?? '')); }
  let crcTable = null;
  function getCrcTable() {
    if (crcTable) return crcTable;
    crcTable = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
      crcTable[n] = c >>> 0;
    }
    return crcTable;
  }
  function crc32(bytes) {
    const table = getCrcTable();
    let c = 0xFFFFFFFF;
    for (let i = 0; i < bytes.length; i++) c = table[(c ^ bytes[i]) & 0xFF] ^ (c >>> 8);
    return (c ^ 0xFFFFFFFF) >>> 0;
  }
  function u16(v) { return Uint8Array.of(v & 255, (v >>> 8) & 255); }
  function u32(v) { return Uint8Array.of(v & 255, (v >>> 8) & 255, (v >>> 16) & 255, (v >>> 24) & 255); }
  function dosDateTime(d = new Date()) {
    const year = Math.max(1980, d.getFullYear());
    const date = ((year - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
    const time = (d.getHours() << 11) | (d.getMinutes() << 5) | Math.floor(d.getSeconds() / 2);
    return { date, time };
  }
  function concatSmall(...parts) {
    const len = parts.reduce((n, p) => n + p.length, 0);
    const out = new Uint8Array(len); let o = 0;
    for (const p of parts) { out.set(p, o); o += p.length; }
    return out;
  }
  async function makeZip(entries) {
    const chunks = [], central = [];
    let offset = 0;
    const dt = dosDateTime();
    for (const e of entries) {
      const name = strBytes(e.name.replace(/^\/+/, ''));
      let data;
      if (e.data instanceof Uint8Array) data = e.data;
      else if (e.data instanceof ArrayBuffer) data = new Uint8Array(e.data);
      else if (e.data instanceof Blob) data = new Uint8Array(await e.data.arrayBuffer());
      else data = strBytes(e.data);
      const crc = crc32(data), size = data.length, flags = 0x0800;
      const local = concatSmall(
        u32(0x04034b50), u16(20), u16(flags), u16(0), u16(dt.time), u16(dt.date),
        u32(crc), u32(size), u32(size), u16(name.length), u16(0), name
      );
      chunks.push(local, data);
      const cen = concatSmall(
        u32(0x02014b50), u16(20), u16(20), u16(flags), u16(0), u16(dt.time), u16(dt.date),
        u32(crc), u32(size), u32(size), u16(name.length), u16(0), u16(0), u16(0), u16(0), u32(0), u32(offset), name
      );
      central.push(cen);
      offset += local.length + data.length;
    }
    const centralSize = central.reduce((n, x) => n + x.length, 0);
    const end = concatSmall(u32(0x06054b50), u16(0), u16(0), u16(entries.length), u16(entries.length), u32(centralSize), u32(offset), u16(0));
    return new Blob([...chunks, ...central, end], { type: 'application/zip' });
  }

  async function shareBlob(blob, filename, title) {
    const file = new File([blob], filename, { type: blob.type || 'application/octet-stream' });
    try {
      if (navigator.share && (!navigator.canShare || navigator.canShare({ files: [file] }))) {
        await navigator.share({ files: [file], title });
        return true;
      }
    } catch (e) {
      if (e?.name === 'AbortError') return false;
      console.warn('Compartilhamento direto indisponível; usando download.', e);
    }
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename; a.style.display = 'none';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
    return true;
  }

  async function mediaForVisit(visitId) {
    const all = await getAllMedia();
    return all.filter(r => r.visitId === visitId);
  }

  async function shareReport(filename, html) {
    try {
      await shareBlob(new Blob([html], { type: 'text/html;charset=utf-8' }), safe(filename), 'Relatório de vistoria');
      callback('nativeShareStarted', 'report');
    } catch (e) {
      callback('nativeShareError', 'Não foi possível gerar/compartilhar o relatório: ' + (e?.message || e));
    }
  }

  async function shareArchive(process, visitId, date) {
    try {
      const media = await mediaForVisit(visitId);
      if (!media.length) return callback('nativeShareError', 'Ainda não há fotos ou áudios nesta vistoria.');
      const entries = media.map(r => ({ name: r.zipPath || `${r.kind === 'photo' ? 'Fotos' : 'Audios'}/${r.name}`, data: r.blob }));
      entries.push({ name: 'LEIA-ME.txt', data: 'Acervo original da ficha de campo. A estrutura preserva Item > Ponto.\n' });
      const zip = await makeZip(entries);
      const name = `${safe(process)}_Acervo_${safe(date)}_${safe(visitId)}.zip`;
      await shareBlob(zip, name, 'Acervo da ficha de campo');
      callback('nativeShareStarted', 'archive');
    } catch (e) {
      callback('nativeShareError', 'Não foi possível montar o acervo: ' + (e?.message || e));
    }
  }

  async function shareCompleteVisit(process, visitId, date, dataJson, reportInternalHtml, reportClientNoPhotosHtml, reportClientSelectedPhotosHtml) {
    try {
      const media = await mediaForVisit(visitId);
      const entries = [
        { name: 'Dados/Dados_Ficha_Campo.json', data: dataJson },
        { name: 'Relatorios/01_Relatorio_INTERNO_Todas_as_Fotos.html', data: reportInternalHtml },
        { name: 'Relatorios/02_Relatorio_CLIENTE_Sem_Fotos.html', data: reportClientNoPhotosHtml },
        { name: 'Relatorios/03_Relatorio_CLIENTE_Fotos_Selecionadas.html', data: reportClientSelectedPhotosHtml },
        { name: 'LEIA-ME.txt', data: 'Pacote completo da ficha de campo.\nInclui: dados JSON, relatório interno, relatório do cliente sem fotos, relatório do cliente com fotos selecionadas, todas as fotos e todos os áudios existentes.\nSe nenhuma foto tiver sido selecionada para o cliente, o respectivo relatório será incluído sem fotos.\nFotos e áudios permanecem também como arquivos individuais.\nEstrutura das mídias: Item > Ponto, permitindo relacionar cada evidência à coordenada correspondente.\n' }
      ];
      for (const r of media) entries.push({ name: r.zipPath || `${r.kind === 'photo' ? 'Fotos' : 'Audios'}/${r.name}`, data: r.blob });
      const zip = await makeZip(entries);
      const name = `${safe(process)}_Ficha_Campo_Completa_${safe(date)}_${safe(visitId)}.zip`;
      await shareBlob(zip, name, 'Ficha de campo completa');
      callback('nativeShareStarted', 'complete');
    } catch (e) {
      callback('nativeShareError', 'Não foi possível montar a ficha completa: ' + (e?.message || e));
    }
  }

  async function deleteLicenseFiles(process, enterprise) {
    try {
      const db = await openDb();
      const all = await getAllMedia();
      const targets = all.filter(r => String(r.process) === String(process) && (!enterprise || String(r.enterprise) === String(enterprise)));
      if (!targets.length) return;
      const tx = db.transaction(STORE, 'readwrite');
      for (const r of targets) { tx.objectStore(STORE).delete(r.path); cache.delete(r.path); }
    } catch (_) {}
  }

  window.Android = {
    backupState: () => {},
    loadStateBackup: () => '',
    chooseLicenseFile,
    chooseFichaFile,
    takePhoto,
    startAudio,
    stopAudio,
    dictate,
    captureLocation,
    imageDataUrl,
    networkType,
    shareReport,
    shareArchive,
    shareCompleteVisit,
    deleteLicenseFiles
  };

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(e => console.warn('Service worker:', e)));
  }
  try { navigator.storage?.persist?.(); } catch (_) {}
  loadCache();
})();
