const http = require('http');
const fs   = require('fs');
const path = require('path');
const url  = require('url');

const PORT   = 3000;
const PUBLIC = path.join(__dirname, 'public');
const G_FILE = path.join(__dirname, 'geraete.json');
const P_FILE = path.join(__dirname, 'pruefungen.json');

// ── JSON storage ──────────────────────────────────────────────────────────────
function readDB(file) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch { return []; }
}
function writeDB(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf8');
}
function nextId(arr) {
  return arr.length ? Math.max(...arr.map(x => x.id || 0)) + 1 : 1;
}

if (!fs.existsSync(G_FILE)) writeDB(G_FILE, []);
if (!fs.existsSync(P_FILE)) writeDB(P_FILE, []);

// ── MIME types ────────────────────────────────────────────────────────────────
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css':  'text/css; charset=utf-8',
  '.js':   'application/javascript; charset=utf-8',
  '.json': 'application/json',
  '.png':  'image/png',
  '.ico':  'image/x-icon',
};

// ── Helpers ───────────────────────────────────────────────────────────────────
function send(res, status, data) {
  const body = typeof data === 'string' ? data : JSON.stringify(data);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
  });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try { resolve(JSON.parse(body || '{}')); }
      catch { reject(new Error('Invalid JSON')); }
    });
    req.on('error', reject);
  });
}

function serveStatic(res, filePath) {
  fs.readFile(filePath, (err, data) => {
    if (err) { res.writeHead(404); res.end('Not found'); return; }
    const ext  = path.extname(filePath);
    const mime = MIME[ext] || 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': mime });
    res.end(data);
  });
}

// ── Router ────────────────────────────────────────────────────────────────────
const server = http.createServer(async (req, res) => {
  const parsed   = url.parse(req.url, true);
  const pathname = parsed.pathname;
  const query    = parsed.query;
  const method   = req.method;

  // Static files
  if (!pathname.startsWith('/api/')) {
    const file = pathname === '/' ? 'index.html' : pathname.slice(1);
    return serveStatic(res, path.join(PUBLIC, file));
  }

  try {
    // ── GET /api/geraete ──────────────────────────────────────────────────
    if (pathname === '/api/geraete' && method === 'GET') {
      let data = readDB(G_FILE);
      const q  = (query.q || '').toLowerCase();
      if (q) data = data.filter(x =>
        (x.inventarNr || '').toLowerCase().includes(q) ||
        (x.typ        || '').toLowerCase().includes(q) ||
        (x.standort   || '').toLowerCase().includes(q) ||
        (x.besitzer   || '').toLowerCase().includes(q)
      );
      data.sort((a, b) => (a.typ || '').localeCompare(b.typ || ''));
      return send(res, 200, data);
    }

    // ── POST /api/geraete ─────────────────────────────────────────────────
    if (pathname === '/api/geraete' && method === 'POST') {
      const body = await readBody(req);
      const { inventarNr, typ, hersteller, seriennummer, schutzklasse,
              spannung, strom, leistung, standort, abteilung, besitzer } = body;

      if (!inventarNr || !typ)
        return send(res, 400, { error: 'inventarNr und typ sind Pflichtfelder' });

      const data = readDB(G_FILE);
      if (data.find(x => x.inventarNr === inventarNr))
        return send(res, 409, { error: 'Inventar-Nr. bereits vorhanden' });

      const neu = {
        id: nextId(data), inventarNr, typ,
        hersteller: hersteller || '', seriennummer: seriennummer || '',
        schutzklasse: schutzklasse || '', spannung: spannung || '',
        strom: strom || '', leistung: leistung || '',
        standort: standort || '', abteilung: abteilung || '',
        besitzer: besitzer || '', created_at: new Date().toISOString(),
      };
      data.push(neu);
      writeDB(G_FILE, data);
      return send(res, 201, neu);
    }

    // ── GET /api/pruefungen ───────────────────────────────────────────────
    if (pathname === '/api/pruefungen' && method === 'GET') {
      let data = readDB(P_FILE);
      if (query.inventarNr)
        data = data.filter(p => p.geraetInventarNr === query.inventarNr);
      data.sort((a, b) => (b.datum || '').localeCompare(a.datum || ''));
      return send(res, 200, data);
    }

    // ── POST /api/pruefungen ──────────────────────────────────────────────
    if (pathname === '/api/pruefungen' && method === 'POST') {
      const body = await readBody(req);
      if (!body.geraetInventarNr)
        return send(res, 400, { error: 'geraetInventarNr ist Pflicht' });

      const data = readDB(P_FILE);
      const neu  = {
        id: nextId(data),
        geraetInventarNr:   body.geraetInventarNr,
        geraetLabel:        body.geraetLabel        || '',
        datum:              body.datum              || '',
        pruefer:            body.pruefer            || '',
        gesamtergebnis:     body.gesamtergebnis     || 'ok',
        sichtJSON:          body.sichtJSON          || '{}',
        messJSON:           body.messJSON           || '{}',
        ergebnisJSON:       body.ergebnisJSON       || '{}',
        bemerkungen:        body.bemerkungen        || '',
        unterschrift:       body.unterschrift       || '',
        messgeraetTyp:      body.messgeraetTyp      || '',
        messgeraetFabrikat: body.messgeraetFabrikat || '',
        naechstePruefung:   body.naechstePruefung   || '',
        created_at:         new Date().toISOString(),
      };
      data.push(neu);
      writeDB(P_FILE, data);
      return send(res, 201, { id: neu.id });
    }

    send(res, 404, { error: 'Not found' });

  } catch (e) {
    send(res, 500, { error: e.message });
  }
});

server.listen(PORT, () => {
  console.log(`DGUV V3 Prüfprotokoll läuft auf http://localhost:${PORT}`);
});
