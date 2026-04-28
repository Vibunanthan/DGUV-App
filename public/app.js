// ── Stammdaten ───────────────────────────────────────────────────────────────
const SICHT_ITEMS = [
  'Isolierungen',
  'Auswahl und Anwendung von Leitungen und Steckern',
  'Netzstecker, Anschlussklemmen und -adern',
  'Biegeschutz',
  'Zugentlastung der Anschlussleitung',
  'Befestigungen und Leitungshalterungen',
  'Gehäuse und Schutzabdeckungen',
  'Luftfilter',
  'Dichtigkeit von Behältern (Wasser/Luft/Medien)',
  'Bedienbarkeit von Schaltern und Steuereinrichtungen',
  'Lesbarkeit aller Sicherheitsaufschriften und Symbole',
  'Überlastung oder unsachgemäße Anwendung erkennbar',
  'Unzulässige Eingriffe oder Veränderungen erkennbar',
  'Sicherheitsbeeinträchtigende Verschmutzung/Korrosion/Alterung',
  'Verschmutzung oder Verstopfung der Kühlungsöffnungen',
];

const MESS_ITEMS = [
  { label: 'Fehlerstrom-Schutzeinrichtung — Auslösestrom', unit: 'mA' },
  { label: 'Fehlerstrom-Schutzeinrichtung — Auslösezeit',  unit: 'ms' },
  { label: 'Schutzleiterwiderstand',                       unit: 'Ω'  },
  { label: 'Isolationswiderstand',                         unit: 'MΩ' },
  { label: 'Schutzleiterstrom',                            unit: 'mA' },
  { label: 'Berührungsstrom',                              unit: 'mA' },
];

// ── API helpers ───────────────────────────────────────────────────────────────
async function apiGet(path) {
  const r = await fetch(path);
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

async function apiPost(path, body) {
  const r = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

// ── Nav ───────────────────────────────────────────────────────────────────────
function showTab(name) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  document.getElementById('page-' + name).classList.add('active');
  document.getElementById('tab-' + name).classList.add('active');
  if (name === 'geraete') renderGeraete();
  if (name === 'archiv')  renderArchiv();
}

// ── Prüfen ────────────────────────────────────────────────────────────────────
let activeGeraet = null;
let sichtState   = {};
let messState    = {};
let geraeteCache = null;

async function loadGeraete() {
  if (geraeteCache) return geraeteCache;
  geraeteCache = await apiGet('/api/geraete');
  return geraeteCache;
}

async function searchGeraet(q) {
  const sug  = document.getElementById('geraet-suggestions');
  const hint = document.getElementById('pruef-hint');
  if (!q.trim()) { sug.innerHTML = ''; hint.style.display = ''; return; }
  hint.style.display = 'none';

  const all  = await loadGeraete();
  const ql   = q.toLowerCase();
  const hits = all.filter(g =>
    (g.inventarNr || '').toLowerCase().includes(ql) ||
    (g.typ        || '').toLowerCase().includes(ql)
  ).slice(0, 5);

  if (!hits.length) {
    sug.innerHTML = `<div class="empty" style="padding:1rem">
      Kein Gerät gefunden —
      <a href="#" onclick="openNeuGeraet();return false">Neu anlegen</a>
    </div>`;
    return;
  }

  sug.innerHTML = hits.map(g => `
    <div class="list-item" onclick="startPruefung('${esc(g.inventarNr)}')">
      <div class="list-icon">🔧</div>
      <div class="list-main">
        <div class="name">${esc(g.typ)}${g.hersteller ? ' — ' + esc(g.hersteller) : ''}</div>
        <div class="sub">Inv. ${esc(g.inventarNr) || '—'} · ${esc(g.standort) || 'kein Standort'}</div>
      </div>
      <span style="font-size:12px;color:var(--text3)">→</span>
    </div>`).join('');
}

function startPruefung(invNr) {
  const g = (geraeteCache || []).find(x => x.inventarNr === invNr);
  if (!g) return;
  activeGeraet = g;

  document.getElementById('pruef-step1').style.display = 'none';
  document.getElementById('pruef-step2').style.display = 'block';
  document.getElementById('geraet-kopf').innerHTML = `
    <div class="gk-name">${esc(g.typ)}${g.hersteller ? ' — ' + esc(g.hersteller) : ''}</div>
    <div class="gk-sub">
      <span>📌 Inv. ${esc(g.inventarNr) || '—'}</span>
      ${g.seriennummer ? `<span>SN ${esc(g.seriennummer)}</span>` : ''}
      ${g.schutzklasse ? `<span>SK ${esc(g.schutzklasse)}</span>` : ''}
      ${g.spannung     ? `<span>${esc(g.spannung)}</span>`        : ''}
      ${g.leistung     ? `<span>${esc(g.leistung)}</span>`        : ''}
      ${g.standort     ? `<span>📍 ${esc(g.standort)}</span>`     : ''}
      ${g.besitzer     ? `<span>👤 ${esc(g.besitzer)}</span>`     : ''}
    </div>`;
  document.getElementById('pruefdatum').value = today();
  buildChecks();
}

function resetPruefung() {
  activeGeraet = null; sichtState = {}; messState = {};
  document.getElementById('pruef-step1').style.display = '';
  document.getElementById('pruef-step2').style.display = 'none';
  document.getElementById('inv-input').value = '';
  document.getElementById('geraet-suggestions').innerHTML = '';
  document.getElementById('pruef-hint').style.display = '';
  document.getElementById('save-status').innerHTML = '';
  ['r1','r2','r3','r4'].forEach(id => document.getElementById(id).checked = false);
  ['pruefer','mess-typ','mess-fab','naechste','bemerkungen']
    .forEach(id => document.getElementById(id).value = '');
  clearSig();
}

function buildChecks() {
  sichtState = {}; messState = {};

  const sc = document.getElementById('sicht-checks');
  sc.innerHTML = '';
  SICHT_ITEMS.forEach((item, i) => {
    sichtState[i] = null;
    const row = document.createElement('div');
    row.className = 'check-row';
    row.innerHTML = `
      <span class="check-label">${item}</span>
      <div class="check-btns">
        <button class="cb" id="s${i}ok"  onclick="setCheck('s',${i},'ok')">i.O.</button>
        <button class="cb" id="s${i}nok" onclick="setCheck('s',${i},'nok')">n.i.O.</button>
      </div>`;
    sc.appendChild(row);
  });

  const mc = document.getElementById('mess-checks');
  mc.innerHTML = '';
  MESS_ITEMS.forEach((item, i) => {
    messState[i] = { val: '', result: null };
    const row = document.createElement('div');
    row.className = 'mess-row';
    row.innerHTML = `
      <span style="font-size:13px;line-height:1.4">${item.label}</span>
      <input placeholder="${item.unit}" id="mv${i}"
             oninput="messState[${i}].val=this.value;updateSteps()"/>
      <button class="cb" id="m${i}ok"  onclick="setCheck('m',${i},'ok')">i.O.</button>
      <button class="cb" id="m${i}nok" onclick="setCheck('m',${i},'nok')">n.i.O.</button>`;
    mc.appendChild(row);
  });
  updateSteps();
}

function setCheck(type, i, val) {
  if (type === 's') {
    sichtState[i] = sichtState[i] === val ? null : val;
    document.getElementById(`s${i}ok`).className  = 'cb' + (sichtState[i] === 'ok'  ? ' ok'  : '');
    document.getElementById(`s${i}nok`).className = 'cb' + (sichtState[i] === 'nok' ? ' nok' : '');
  } else {
    messState[i].result = messState[i].result === val ? null : val;
    document.getElementById(`m${i}ok`).className  = 'cb' + (messState[i].result === 'ok'  ? ' ok'  : '');
    document.getElementById(`m${i}nok`).className = 'cb' + (messState[i].result === 'nok' ? ' nok' : '');
  }
  updateSteps();
}

function toggleR(id) {
  const el = document.getElementById(id);
  el.checked = !el.checked;
}

function updateSteps() {
  const sd = Object.values(sichtState).filter(v => v !== null).length;
  const md = Object.values(messState).filter(v => v.result !== null).length;
  ['sd1','sd2','sd3','sd4'].forEach(id => document.getElementById(id).className = 'step-dot');
  if (sd > 0)                       document.getElementById('sd1').className = 'step-dot done';
  if (sd === SICHT_ITEMS.length)    document.getElementById('sd2').className = 'step-dot done';
  if (md > 0)                       document.getElementById('sd3').className = 'step-dot done';
  if (md === MESS_ITEMS.length)     document.getElementById('sd4').className = 'step-dot done';
}

async function savePruefung() {
  const pruefer = document.getElementById('pruefer').value.trim();
  if (!pruefer) { toast('Bitte Prüfer eintragen!'); return; }
  if (!activeGeraet) return;

  const btn = document.getElementById('btn-save');
  btn.disabled = true; btn.textContent = 'Wird gespeichert…';
  document.getElementById('save-status').innerHTML =
    '<div class="loading"><div class="spinner"></div>Speichere…</div>';

  const hasMangel =
    Object.values(sichtState).some(v => v === 'nok') ||
    Object.values(messState).some(v => v.result === 'nok');

  try {
    await apiPost('/api/pruefungen', {
      geraetInventarNr:   activeGeraet.inventarNr,
      geraetLabel:        `${activeGeraet.typ} — Inv. ${activeGeraet.inventarNr || '?'}`,
      datum:              document.getElementById('pruefdatum').value,
      pruefer,
      gesamtergebnis:     hasMangel ? 'nok' : 'ok',
      sichtJSON:          JSON.stringify(sichtState),
      messJSON:           JSON.stringify(messState),
      ergebnisJSON:       JSON.stringify({
                            r1: document.getElementById('r1').checked,
                            r2: document.getElementById('r2').checked,
                            r3: document.getElementById('r3').checked,
                            r4: document.getElementById('r4').checked,
                          }),
      bemerkungen:        document.getElementById('bemerkungen').value,
      unterschrift:       document.getElementById('sig-canvas').toDataURL(),
      messgeraetTyp:      document.getElementById('mess-typ').value,
      messgeraetFabrikat: document.getElementById('mess-fab').value,
      naechstePruefung:   document.getElementById('naechste').value,
    });
    document.getElementById('save-status').innerHTML = '';
    toast('Prüfung gespeichert ✓');
    setTimeout(resetPruefung, 900);
  } catch (e) {
    document.getElementById('save-status').innerHTML =
      `<div class="info-box err">Fehler beim Speichern: ${e.message}</div>`;
  }

  btn.disabled = false; btn.textContent = 'Speichern →';
}

// ── Geräte ────────────────────────────────────────────────────────────────────
async function renderGeraete() {
  const q    = (document.getElementById('geraete-search').value || '').toLowerCase();
  const list = document.getElementById('geraete-list');
  list.innerHTML = '<div class="loading"><div class="spinner"></div>Lade Geräte…</div>';

  geraeteCache = await apiGet('/api/geraete');
  const pruefungen = await apiGet('/api/pruefungen');

  let g = geraeteCache;
  if (q) g = g.filter(x =>
    (x.inventarNr || '').toLowerCase().includes(q) ||
    (x.typ        || '').toLowerCase().includes(q) ||
    (x.standort   || '').toLowerCase().includes(q) ||
    (x.besitzer   || '').toLowerCase().includes(q)
  );

  if (!g.length) {
    list.innerHTML = '<div class="empty"><div class="icon">🔧</div>Noch keine Geräte.<br>Klicke "+ Neu"</div>';
    return;
  }

  list.innerHTML = g.map(x => {
    const gp   = pruefungen.filter(p => p.geraetInventarNr === x.inventarNr);
    const last = gp[0];
    let badge  = '<span class="badge neutral">Noch nicht geprüft</span>';
    if (last) badge = `<span class="badge ${last.gesamtergebnis}">${last.gesamtergebnis === 'ok' ? 'Bestanden' : 'Mängel'}</span>`;

    let faellig = '';
    if (last && last.naechstePruefung) {
      const d = new Date(last.naechstePruefung);
      faellig = d < new Date()
        ? `<div style="font-size:11px;color:var(--nok);margin-top:2px">⚠️ Überfällig seit ${d.toLocaleDateString('de-DE')}</div>`
        : `<div style="font-size:11px;color:var(--text3);margin-top:2px">Nächste Prüfung ${d.toLocaleDateString('de-DE')}</div>`;
    }

    return `<div class="list-item" onclick="openGeraetDetail('${esc(x.inventarNr)}')">
      <div class="list-icon">🔧</div>
      <div class="list-main">
        <div class="name">${esc(x.typ)}${x.hersteller ? ' — ' + esc(x.hersteller) : ''}</div>
        <div class="sub">Inv. ${esc(x.inventarNr) || '—'} · ${esc(x.standort) || 'kein Standort'}${x.besitzer ? ' · 👤 ' + esc(x.besitzer) : ''}</div>
        ${faellig}
      </div>${badge}</div>`;
  }).join('');
}

async function openGeraetDetail(invNr) {
  const g = (geraeteCache || []).find(x => x.inventarNr === invNr);
  if (!g) return;
  document.getElementById('modal-geraet-title').textContent = `${g.typ} — Inv. ${g.inventarNr || '?'}`;
  document.getElementById('modal-geraet-body').innerHTML =
    '<div class="loading"><div class="spinner"></div>Lade Prüfhistorie…</div>';
  document.getElementById('geraet-modal').classList.add('open');

  const pruefungen = await apiGet(`/api/pruefungen?inventarNr=${encodeURIComponent(invNr)}`);

  const stamm = `<div class="card" style="margin-bottom:.75rem">
    <div class="card-title">Stammdaten</div>
    <div class="fg">
      ${frow('Inventar-Nr.', g.inventarNr)}${frow('Typ', g.typ)}
      ${frow('Hersteller',   g.hersteller)}${frow('Seriennummer', g.seriennummer)}
      ${frow('Schutzklasse', g.schutzklasse)}${frow('Spannung', g.spannung)}
      ${frow('Strom',        g.strom)}${frow('Leistung', g.leistung)}
      ${frow('Standort',     g.standort)}${frow('Abteilung', g.abteilung)}
      ${frow('Besitzer',     g.besitzer)}
    </div>
    <div class="btn-row" style="margin-top:.75rem">
      <button class="btn sm primary"
        onclick="showTab('pruefen');document.getElementById('inv-input').value='${esc(g.inventarNr)}';searchGeraet('${esc(g.inventarNr)}');closeModal('geraet-modal')">
        Jetzt prüfen →
      </button>
    </div>
  </div>`;

  const histHtml = pruefungen.length
    ? pruefungen.map(p => `
        <div class="hist-year" onclick="this.nextElementSibling.classList.toggle('open')">
          <div>
            <span style="font-weight:500">${p.datum ? new Date(p.datum).toLocaleDateString('de-DE', {year:'numeric',month:'long',day:'numeric'}) : p.id}</span>
            <span style="font-size:12px;color:var(--text2);margin-left:8px">${esc(p.pruefer)}</span>
          </div>
          <span class="badge ${p.gesamtergebnis}">${p.gesamtergebnis === 'ok' ? 'Bestanden' : 'Mängel'}</span>
        </div>
        <div class="hist-detail">${renderPruefDetail(p)}</div>`).join('')
    : '<div class="empty" style="padding:1.5rem">Noch keine Prüfungen</div>';

  document.getElementById('modal-geraet-body').innerHTML =
    stamm +
    `<div style="font-size:11px;font-weight:600;color:var(--text3);text-transform:uppercase;letter-spacing:.06em;margin-bottom:8px">
      Prüfhistorie (${pruefungen.length})
    </div>` +
    histHtml;
}

function frow(label, val) {
  if (!val) return '';
  return `<div class="f"><label>${label}</label><input readonly value="${esc(val)}"/></div>`;
}

function renderPruefDetail(p) {
  const sicht = tryParse(p.sichtJSON, {});
  const mess  = tryParse(p.messJSON,  {});
  const erg   = tryParse(p.ergebnisJSON, {});

  const sOk  = Object.values(sicht).filter(v => v === 'ok').length;
  const sNok = Object.values(sicht).filter(v => v === 'nok').length;

  const sRows = SICHT_ITEMS.map((item, i) => {
    const v = sicht[i];
    const b = v === 'ok'  ? '<span class="badge ok"  style="font-size:10px;padding:2px 7px">i.O.</span>'
            : v === 'nok' ? '<span class="badge nok" style="font-size:10px;padding:2px 7px">n.i.O.</span>'
            : '<span style="font-size:11px;color:var(--text3)">—</span>';
    return `<div style="display:flex;justify-content:space-between;align-items:center;padding:5px 0;border-bottom:1px solid var(--border);font-size:12px">
      <span>${item}</span>${b}</div>`;
  }).join('');

  const mRows = MESS_ITEMS.map((item, i) => {
    const m = mess[i] || {};
    const b = m.result === 'ok'  ? '<span class="badge ok"  style="font-size:10px;padding:2px 7px">i.O.</span>'
            : m.result === 'nok' ? '<span class="badge nok" style="font-size:10px;padding:2px 7px">n.i.O.</span>'
            : '<span style="font-size:11px;color:var(--text3)">—</span>';
    return `<div style="display:flex;justify-content:space-between;align-items:center;padding:5px 0;border-bottom:1px solid var(--border);font-size:12px">
      <span style="flex:1">${item.label}</span>
      <span style="font-family:monospace;color:var(--text2);margin:0 8px">${m.val ? m.val + ' ' + item.unit : ''}</span>
      ${b}</div>`;
  }).join('');

  const ergTxt = [
    erg.r1 ? 'Keine Mängel' : '',
    erg.r2 ? 'Mängel repariert' : '',
    erg.r3 ? 'Hinweise erteilt' : '',
    erg.r4 ? '⚠️ Nicht weiterverwendbar' : '',
  ].filter(Boolean).join(' · ') || '—';

  return `
    <div style="margin-bottom:10px">
      <div style="font-size:10px;font-weight:600;color:var(--text3);margin-bottom:6px">
        SICHTPRÜFUNG — ${sOk} i.O. / ${sNok} n.i.O.
      </div>${sRows}
    </div>
    <div style="margin-bottom:10px">
      <div style="font-size:10px;font-weight:600;color:var(--text3);margin-bottom:6px">MESSUNG</div>
      ${mRows}
    </div>
    <div style="margin-bottom:8px;font-size:13px"><strong>Ergebnis:</strong> ${ergTxt}</div>
    ${p.bemerkungen ? `<div style="margin-bottom:8px;font-size:13px"><strong>Bemerkungen:</strong> ${esc(p.bemerkungen)}</div>` : ''}
    <div style="font-size:11px;color:var(--text3);margin-bottom:10px">
      Prüfer: ${esc(p.pruefer) || '—'} · Messgerät: ${esc(p.messgeraetTyp) || '—'} ${esc(p.messgeraetFabrikat) || ''}
    </div>
    ${p.unterschrift ? `<div>
      <div style="font-size:10px;color:var(--text3);margin-bottom:4px;font-weight:600">UNTERSCHRIFT</div>
      <img src="${p.unterschrift}" style="max-width:260px;border:1px solid var(--border);border-radius:var(--r);background:#fff"/>
    </div>` : ''}`;
}

// ── Neues Gerät ───────────────────────────────────────────────────────────────
function openNeuGeraet() {
  document.getElementById('neu-geraet-modal').classList.add('open');
}

async function saveNeuesGeraet() {
  const inv = document.getElementById('ng-inv').value.trim();
  const typ = document.getElementById('ng-typ').value.trim();
  if (!inv || !typ) { toast('Inventar-Nr. und Typ sind Pflichtfelder!'); return; }

  const btn = document.getElementById('btn-ng');
  btn.disabled = true; btn.textContent = 'Wird gespeichert…';

  try {
    await apiPost('/api/geraete', {
      inventarNr:   inv, typ,
      hersteller:   document.getElementById('ng-hersteller').value,
      seriennummer: document.getElementById('ng-sn').value,
      schutzklasse: document.getElementById('ng-sk').value,
      spannung:     document.getElementById('ng-spannung').value,
      strom:        document.getElementById('ng-strom').value,
      leistung:     document.getElementById('ng-leistung').value,
      standort:     document.getElementById('ng-standort').value,
      abteilung:    document.getElementById('ng-abt').value,
      besitzer:     document.getElementById('ng-besitzer').value,
    });
    geraeteCache = null;
    toast('Gerät gespeichert ✓');
    closeModal('neu-geraet-modal');
    ['ng-inv','ng-typ','ng-hersteller','ng-sn','ng-spannung',
     'ng-strom','ng-leistung','ng-standort','ng-abt','ng-besitzer']
      .forEach(id => document.getElementById(id).value = '');
    document.getElementById('ng-sk').value = '';
    document.getElementById('ng-status').innerHTML = '';
    renderGeraete();
  } catch (e) {
    const msg = e.message.includes('bereits vorhanden')
      ? 'Diese Inventar-Nr. existiert bereits.'
      : 'Fehler beim Speichern: ' + e.message;
    document.getElementById('ng-status').innerHTML =
      `<span style="color:var(--nok)">${msg}</span>`;
  }

  btn.disabled = false; btn.textContent = 'Gerät anlegen';
}

// ── Archiv ────────────────────────────────────────────────────────────────────
async function renderArchiv() {
  document.getElementById('archiv-list').innerHTML =
    '<div class="loading"><div class="spinner"></div>Lade…</div>';

  const pruef = await apiGet('/api/pruefungen');
  document.getElementById('s-total').textContent = pruef.length;
  document.getElementById('s-ok').textContent    = pruef.filter(p => p.gesamtergebnis === 'ok').length;
  document.getElementById('s-nok').textContent   = pruef.filter(p => p.gesamtergebnis === 'nok').length;

  const list = document.getElementById('archiv-list');
  if (!pruef.length) {
    list.innerHTML = '<div class="empty"><div class="icon">📋</div>Noch keine Prüfungen</div>';
    return;
  }

  list.innerHTML = pruef.map(p => `
    <div class="list-item">
      <div class="list-icon">📋</div>
      <div class="list-main">
        <div class="name">${esc(p.geraetLabel || p.geraetInventarNr)}</div>
        <div class="sub">${p.datum ? new Date(p.datum).toLocaleDateString('de-DE') : ''} · ${esc(p.pruefer)}</div>
      </div>
      <span class="badge ${p.gesamtergebnis}">${p.gesamtergebnis === 'ok' ? 'Bestanden' : 'Mängel'}</span>
    </div>`).join('');
}

// ── Unterschrift ──────────────────────────────────────────────────────────────
const sigC = document.getElementById('sig-canvas');
const sigX = sigC.getContext('2d');
let sigDrawing = false;
let sigLast    = [0, 0];

function resizeSig() {
  const dpr = window.devicePixelRatio || 1;
  const w   = sigC.offsetWidth;
  sigC.width  = w * dpr;
  sigC.height = 130 * dpr;
  sigX.scale(dpr, dpr);
}
window.addEventListener('resize', resizeSig);
setTimeout(resizeSig, 100);

function getSigPoint(e) {
  const r = sigC.getBoundingClientRect();
  const s = e.touches ? e.touches[0] : e;
  return [s.clientX - r.left, s.clientY - r.top];
}
function sigDraw(from, to) {
  sigX.beginPath();
  sigX.moveTo(from[0], from[1]);
  sigX.lineTo(to[0], to[1]);
  sigX.strokeStyle = '#1a1917';
  sigX.lineWidth   = 2;
  sigX.lineCap     = 'round';
  sigX.stroke();
}

sigC.addEventListener('mousedown',  e => { sigDrawing = true; sigLast = getSigPoint(e); });
sigC.addEventListener('mousemove',  e => { if (!sigDrawing) return; const p = getSigPoint(e); sigDraw(sigLast, p); sigLast = p; });
sigC.addEventListener('mouseup',    () => sigDrawing = false);
sigC.addEventListener('touchstart', e => { e.preventDefault(); sigDrawing = true; sigLast = getSigPoint(e); }, { passive: false });
sigC.addEventListener('touchmove',  e => { e.preventDefault(); if (!sigDrawing) return; const p = getSigPoint(e); sigDraw(sigLast, p); sigLast = p; }, { passive: false });
sigC.addEventListener('touchend',   () => sigDrawing = false);

function clearSig() { sigX.clearRect(0, 0, sigC.width, sigC.height); }

// ── QR Scanner ────────────────────────────────────────────────────────────────
let qrStream = null;
let qrAnim   = null;

function openQR() {
  document.getElementById('qr-overlay').classList.add('open');
  navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } })
    .then(stream => {
      qrStream = stream;
      const v = document.getElementById('qr-video');
      v.srcObject = stream; v.play();
      scanQR();
    })
    .catch(() => { toast('Kamerazugriff nicht möglich'); closeQR(); });
}

function scanQR() {
  const v = document.getElementById('qr-video');
  const c = document.getElementById('qr-canvas');
  const x = c.getContext('2d');
  function tick() {
    if (v.readyState === v.HAVE_ENOUGH_DATA) {
      c.width = v.videoWidth; c.height = v.videoHeight;
      x.drawImage(v, 0, 0);
      const img  = x.getImageData(0, 0, c.width, c.height);
      const code = jsQR(img.data, img.width, img.height);
      if (code) {
        closeQR();
        document.getElementById('inv-input').value = code.data;
        searchGeraet(code.data);
        return;
      }
    }
    qrAnim = requestAnimationFrame(tick);
  }
  qrAnim = requestAnimationFrame(tick);
}

function closeQR() {
  document.getElementById('qr-overlay').classList.remove('open');
  if (qrAnim) cancelAnimationFrame(qrAnim);
  if (qrStream) { qrStream.getTracks().forEach(t => t.stop()); qrStream = null; }
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function closeModal(id) { document.getElementById(id).classList.remove('open'); }

function toast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 2800);
}

function today() { return new Date().toISOString().split('T')[0]; }

function tryParse(s, def) { try { return JSON.parse(s || '{}'); } catch { return def; } }

function esc(s) {
  return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ── Init ──────────────────────────────────────────────────────────────────────
document.getElementById('pruefdatum').value = today();
loadGeraete();
