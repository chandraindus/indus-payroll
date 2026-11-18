// ============================================================
// server.js — Indus Projects Payroll System Backend
// Uses MongoDB Atlas when MONGODB_URI env var is set,
// falls back to local JSON files for development.
// ============================================================

const express = require('express');
const fs      = require('fs');
const path    = require('path');
const os      = require('os');

const app      = express();
const PORT     = process.env.PORT || 8080;
const DATA_DIR = path.join(__dirname, 'data');
const MONGO_URI = process.env.MONGODB_URI || '';

app.use(express.json({ limit: '20mb' }));
app.use((_req, res, next) => { res.setHeader('bypass-tunnel-reminder', 'true'); next(); });
app.use(express.static(__dirname));

// ── MongoDB setup ─────────────────────────────────────────────
let mongoDB = null;

async function connectMongo() {
  if (!MONGO_URI) return false;
  try {
    const { MongoClient } = require('mongodb');
    const client = new MongoClient(MONGO_URI);
    await client.connect();
    mongoDB = client.db('indus-payroll');
    console.log('  ✓ Connected to MongoDB Atlas');
    return true;
  } catch (e) {
    console.error('  ✗ MongoDB connection failed:', e.message);
    return false;
  }
}

// ── JSON file helpers (local dev fallback) ────────────────────
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const fp = name => path.join(DATA_DIR, `${name}.json`);

function jsonRead(name, def = []) {
  try { return JSON.parse(fs.readFileSync(fp(name), 'utf8')); }
  catch { return typeof def === 'function' ? def() : JSON.parse(JSON.stringify(def)); }
}
function jsonWrite(name, data) {
  fs.writeFileSync(fp(name), JSON.stringify(data, null, 2), 'utf8');
}

// ── Seed default data ─────────────────────────────────────────
const DEFAULT_DEPARTMENTS  = ['Administration','Accounts','HR','Operations','Projects','IT','Procurement','Design','Legal','Management'];
const DEFAULT_DESIGNATIONS = ['Director','GM','AGM','Manager','Asst. Manager','Sr. Engineer','Engineer','Sr. Executive','Executive','Jr. Executive','Accountant','Sr. Accountant','Supervisor','Helper','Peon','Driver'];

async function seedDefaults() {
  if (mongoDB) {
    const depts = await mongoDB.collection('departments').find({}).toArray();
    if (!depts.length) {
      await mongoDB.collection('departments').insertMany(DEFAULT_DEPARTMENTS.map((d,i)=>({id:`dept_${i}`,name:d})));
      await mongoDB.collection('designations').insertMany(DEFAULT_DESIGNATIONS.map((d,i)=>({id:`desig_${i}`,name:d})));
    }
  } else {
    if (!fs.existsSync(fp('departments')))  jsonWrite('departments', DEFAULT_DEPARTMENTS);
    if (!fs.existsSync(fp('designations'))) jsonWrite('designations', DEFAULT_DESIGNATIONS);
  }
}

// ── Unified DB helpers ────────────────────────────────────────
async function dbRead(name, def = []) {
  if (mongoDB) {
    const docs = await mongoDB.collection(name).find({}, {projection:{_id:0}}).toArray();
    return docs.length ? docs : (typeof def === 'function' ? def() : JSON.parse(JSON.stringify(def)));
  }
  return jsonRead(name, def);
}

async function dbUpsert(name, item) {
  if (mongoDB) {
    await mongoDB.collection(name).replaceOne({ id: item.id }, item, { upsert: true });
  } else {
    const all = jsonRead(name);
    const idx = all.findIndex(x => x.id === item.id);
    if (idx >= 0) all[idx] = item; else all.push(item);
    jsonWrite(name, all);
  }
}

async function dbWriteAll(name, arr) {
  if (mongoDB) {
    await mongoDB.collection(name).deleteMany({});
    if (arr.length) await mongoDB.collection(name).insertMany(arr.map(a=>({...a})));
  } else {
    jsonWrite(name, arr);
  }
}

async function dbDelete(name, id) {
  if (mongoDB) {
    await mongoDB.collection(name).deleteOne({ id });
  } else {
    jsonWrite(name, jsonRead(name).filter(x => x.id !== id));
  }
}

async function dbReadSettings() {
  if (mongoDB) {
    const doc = await mongoDB.collection('settings').findOne({ _key: 'main' }, { projection: { _id: 0, _key: 0 } });
    return doc || {};
  }
  return jsonRead('settings', {});
}

async function dbWriteSettings(obj) {
  if (mongoDB) {
    await mongoDB.collection('settings').replaceOne({ _key: 'main' }, { ...obj, _key: 'main' }, { upsert: true });
  } else {
    jsonWrite('settings', obj);
  }
}

// ── Array collections ─────────────────────────────────────────
const COLLECTIONS = [
  'employees','attendance','assets','assetAssignments',
  'leaves','leaveBalances','payrolls','advances',
  'bonusRecords','ltaRecords','leaveEncashments',
  'holidays','approvalLevels','departments','designations'
];

COLLECTIONS.forEach(col => {
  app.get(`/api/${col}`, async (_req, res) => {
    try { res.json(await dbRead(col)); }
    catch(e) { res.status(500).json({ error: e.message }); }
  });

  app.post(`/api/${col}`, async (req, res) => {
    const item = req.body;
    if (!item || !item.id) return res.status(400).json({ error: 'id required' });
    try { await dbUpsert(col, item); res.json({ ok: true }); }
    catch(e) { res.status(500).json({ error: e.message }); }
  });

  app.put(`/api/${col}`, async (req, res) => {
    try { await dbWriteAll(col, req.body); res.json({ ok: true }); }
    catch(e) { res.status(500).json({ error: e.message }); }
  });

  app.delete(`/api/${col}/:id`, async (req, res) => {
    try { await dbDelete(col, req.params.id); res.json({ ok: true }); }
    catch(e) { res.status(500).json({ error: e.message }); }
  });
});

// ── Settings ──────────────────────────────────────────────────
app.get('/api/settings',  async (_req, res) => {
  try { res.json(await dbReadSettings()); }
  catch(e) { res.status(500).json({ error: e.message }); }
});
app.post('/api/settings', async (req, res) => {
  try { await dbWriteSettings(req.body); res.json({ ok: true }); }
  catch(e) { res.status(500).json({ error: e.message }); }
});

// ── Employee self-service punch endpoint ──────────────────────
app.post('/api/punch', async (req, res) => {
  const { empId, type, lat, lng, address } = req.body;
  if (!empId || !type) return res.status(400).json({ error: 'empId and type required' });

  const now   = new Date();
  const date  = now.toISOString().slice(0, 10);
  const time  = now.toTimeString().slice(0, 5);
  const punch = { time, lat: lat||'', lng: lng||'', address: address||'', method: 'phone' };

  try {
    const all = await dbRead('attendance');
    let rec = all.find(a => a.empId === empId && a.date === date);
    if (!rec) {
      rec = { id: `att_${empId}_${date}`, empId, date, status: 'present', punchIn: {}, punchOut: {}, remarks: '' };
      all.push(rec);
    }
    if (type === 'in') rec.punchIn = punch; else rec.punchOut = punch;
    await dbUpsert('attendance', rec);
    res.json({ ok: true, time, date });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/punch/status/:empId', async (req, res) => {
  const { empId } = req.params;
  const date = new Date().toISOString().slice(0, 10);
  try {
    const all = await dbRead('attendance');
    const rec = all.find(a => a.empId === empId && a.date === date);
    res.json({ punchIn: rec?.punchIn || null, punchOut: rec?.punchOut || null });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── Health check ──────────────────────────────────────────────
app.get('/api/health', (_req, res) => res.json({ ok: true, storage: mongoDB ? 'mongodb' : 'json' }));

// ── Start ─────────────────────────────────────────────────────
function getLocalIPs() {
  const nets = os.networkInterfaces(), ips = [];
  for (const ifaces of Object.values(nets))
    for (const iface of ifaces)
      if (iface.family === 'IPv4' && !iface.internal) ips.push(iface.address);
  return ips;
}

async function start() {
  await connectMongo();
  await seedDefaults();

  app.listen(PORT, '0.0.0.0', () => {
    const ips = getLocalIPs();
    const pad = s => s.padEnd(44);
    console.log('\n╔══════════════════════════════════════════════╗');
    console.log('║   Indus Projects - Payroll System  v2.0      ║');
    console.log('╠══════════════════════════════════════════════╣');
    console.log(`║  ${pad('Storage: ' + (mongoDB ? 'MongoDB Atlas ✓' : 'Local JSON files'))}║`);
    console.log('╠══════════════════════════════════════════════╣');
    if (ips.length) {
      console.log(`║  ${pad('PC (admin):  http://localhost:' + PORT)}║`);
      ips.forEach(ip => console.log(`║  ${pad('Phone/WiFi:  http://' + ip + ':' + PORT)}║`));
    } else {
      console.log(`║  ${pad('Running on port ' + PORT)}║`);
    }
    console.log('╚══════════════════════════════════════════════╝\n');
  });
}

start();
