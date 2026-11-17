const express = require('express');
const path = require('path');
const db = require('./db');
const { BLOOD_GROUPS, COMPATIBLE, CITIES, GAP_DAYS } = require('./data');

const app = express();
const ADMIN_KEY = process.env.ADMIN_KEY || 'admin123';

app.use(express.json({ limit: '10kb' }));
app.use(express.static(path.join(__dirname, 'public')));
app.use('/lib/bootstrap', express.static(path.join(__dirname, 'node_modules/bootstrap/dist')));
app.use('/lib/icons', express.static(path.join(__dirname, 'node_modules/bootstrap-icons/font')));
app.use('/lib/chart', express.static(path.join(__dirname, 'node_modules/chart.js/dist')));
app.use('/lib/leaflet', express.static(path.join(__dirname, 'node_modules/leaflet/dist')));

const str = (v) => (typeof v === 'string' ? v.trim() : '');
const PHONE = /^[6-9]\d{9}$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ELIGIBLE = `(last_donation IS NULL OR julianday('now') - julianday(last_donation) >= ${GAP_DAYS})`;

function validDate(d) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return false;
  const t = new Date(d + 'T00:00:00Z');
  return !isNaN(t) && t.toISOString().slice(0, 10) === d && t <= new Date();
}

function checkDonor(b) {
  const e = [];
  if (str(b.name).length < 2 || str(b.name).length > 60) e.push('Name must be 2-60 characters');
  if (!PHONE.test(str(b.phone))) e.push('Phone must be a valid 10 digit mobile number');
  if (str(b.email) && !EMAIL.test(str(b.email))) e.push('Invalid email');
  const age = Number(b.age);
  if (!Number.isInteger(age) || age < 18 || age > 65) e.push('Age must be between 18 and 65');
  if (!['Male', 'Female', 'Other'].includes(b.gender)) e.push('Invalid gender');
  if (!BLOOD_GROUPS.includes(b.blood_group)) e.push('Invalid blood group');
  if (!CITIES[b.city]) e.push('Invalid city');
  if (str(b.area).length > 60) e.push('Area too long');
  if (b.last_donation && !validDate(b.last_donation)) e.push('Last donation date is invalid or in the future');
  return e;
}

function checkRequest(b) {
  const e = [];
  if (str(b.patient_name).length < 2 || str(b.patient_name).length > 60) e.push('Patient name must be 2-60 characters');
  if (!BLOOD_GROUPS.includes(b.blood_group)) e.push('Invalid blood group');
  const u = Number(b.units);
  if (!Number.isInteger(u) || u < 1 || u > 10) e.push('Units must be between 1 and 10');
  if (str(b.hospital).length < 3 || str(b.hospital).length > 100) e.push('Hospital name must be 3-100 characters');
  if (!CITIES[b.city]) e.push('Invalid city');
  if (!PHONE.test(str(b.contact))) e.push('Contact must be a valid 10 digit mobile number');
  if (!['Normal', 'Urgent', 'Critical'].includes(b.urgency)) e.push('Invalid urgency');
  return e;
}

function admin(req, res, next) {
  if (req.get('x-admin-key') !== ADMIN_KEY) return res.status(401).json({ error: 'Invalid admin key' });
  next();
}

function idParam(req, res) {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id < 1) {
    res.status(400).json({ error: 'Invalid id' });
    return null;
  }
  return id;
}

const mask = (p) => p.slice(0, 2) + 'XXXXXX' + p.slice(8);

app.get('/api/health', (req, res) => res.json({ status: 'ok' }));

app.get('/api/meta', (req, res) => {
  res.json({ bloodGroups: BLOOD_GROUPS, cities: Object.keys(CITIES), gapDays: GAP_DAYS, compatible: COMPATIBLE });
});

app.post('/api/donors', (req, res) => {
  const b = req.body || {};
  const errors = checkDonor(b);
  if (errors.length) return res.status(400).json({ errors });
  if (db.prepare('SELECT 1 FROM donors WHERE phone = ?').get(str(b.phone))) {
    return res.status(409).json({ error: 'This phone number is already registered' });
  }
  const r = db.prepare(`INSERT INTO donors (name, phone, email, age, gender, blood_group, city, area, last_donation)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
    str(b.name), str(b.phone), str(b.email).toLowerCase() || null, Number(b.age), b.gender,
    b.blood_group, b.city, str(b.area) || null, b.last_donation || null);
  res.status(201).json({ id: r.lastInsertRowid, message: 'Registered successfully' });
});

app.get('/api/donors/search', (req, res) => {
  const { blood_group, city } = req.query;
  if (!BLOOD_GROUPS.includes(blood_group)) return res.status(400).json({ error: 'Select a valid blood group' });
  if (!CITIES[city]) return res.status(400).json({ error: 'Select a valid city' });

  const groups = COMPATIBLE[blood_group];
  const marks = groups.map(() => '?').join(',');
  const rows = db.prepare(`
    SELECT id, name, blood_group, area, last_donation, phone,
      CASE WHEN blood_group = ? THEN 0 ELSE 1 END AS exact_rank
    FROM donors
    WHERE city = ? AND available = 1 AND blood_group IN (${marks}) AND ${ELIGIBLE}
    ORDER BY exact_rank, last_donation`).all(blood_group, city, ...groups);

  res.json({
    compatibleGroups: groups,
    count: rows.length,
    donors: rows.map(({ phone, exact_rank, ...d }) => ({ ...d, phone: mask(phone), exact: exact_rank === 0 }))
  });
});

app.get('/api/donors/:id/contact', (req, res) => {
  const id = idParam(req, res);
  if (!id) return;
  const d = db.prepare('SELECT name, phone, available FROM donors WHERE id = ?').get(id);
  if (!d) return res.status(404).json({ error: 'Donor not found' });
  if (!d.available) return res.status(403).json({ error: 'Donor is currently unavailable' });
  res.json({ name: d.name, phone: d.phone });
});

app.post('/api/requests', (req, res) => {
  const b = req.body || {};
  const errors = checkRequest(b);
  if (errors.length) return res.status(400).json({ errors });
  const r = db.prepare(`INSERT INTO requests (patient_name, blood_group, units, hospital, city, contact, urgency)
    VALUES (?, ?, ?, ?, ?, ?, ?)`).run(
    str(b.patient_name), b.blood_group, Number(b.units), str(b.hospital), b.city, str(b.contact), b.urgency);
  const matches = db.prepare(`SELECT COUNT(*) AS n FROM donors WHERE city = ? AND available = 1
    AND blood_group IN (${COMPATIBLE[b.blood_group].map(() => '?').join(',')}) AND ${ELIGIBLE}`)
    .get(b.city, ...COMPATIBLE[b.blood_group]).n;
  res.status(201).json({ id: r.lastInsertRowid, matchingDonors: matches });
});

app.get('/api/requests', (req, res) => {
  const rows = db.prepare(`SELECT * FROM requests WHERE status = 'Open'
    ORDER BY CASE urgency WHEN 'Critical' THEN 0 WHEN 'Urgent' THEN 1 ELSE 2 END, created_at DESC`).all();
  res.json(rows);
});

app.get('/api/admin/donors', admin, (req, res) => {
  const where = [];
  const params = [];
  if (req.query.city) { where.push('city = ?'); params.push(req.query.city); }
  if (req.query.blood_group) { where.push('blood_group = ?'); params.push(req.query.blood_group); }
  const rows = db.prepare(`SELECT *, ${ELIGIBLE} AS eligible FROM donors
    ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY id DESC`).all(...params);
  res.json(rows);
});

app.patch('/api/admin/donors/:id', admin, (req, res) => {
  const id = idParam(req, res);
  if (!id) return;
  const b = req.body || {};
  const d = db.prepare('SELECT * FROM donors WHERE id = ?').get(id);
  if (!d) return res.status(404).json({ error: 'Donor not found' });
  if (b.available !== undefined && typeof b.available !== 'boolean') return res.status(400).json({ error: 'available must be true or false' });
  if (b.last_donation !== undefined && !validDate(b.last_donation)) return res.status(400).json({ error: 'Invalid donation date' });
  db.prepare('UPDATE donors SET available = ?, last_donation = ? WHERE id = ?').run(
    b.available === undefined ? d.available : Number(b.available),
    b.last_donation === undefined ? d.last_donation : b.last_donation, id);
  res.json(db.prepare(`SELECT *, ${ELIGIBLE} AS eligible FROM donors WHERE id = ?`).get(id));
});

app.delete('/api/admin/donors/:id', admin, (req, res) => {
  const id = idParam(req, res);
  if (!id) return;
  const r = db.prepare('DELETE FROM donors WHERE id = ?').run(id);
  if (!r.changes) return res.status(404).json({ error: 'Donor not found' });
  res.status(204).end();
});

app.get('/api/admin/requests', admin, (req, res) => {
  res.json(db.prepare('SELECT * FROM requests ORDER BY id DESC').all());
});

app.patch('/api/admin/requests/:id', admin, (req, res) => {
  const id = idParam(req, res);
  if (!id) return;
  const { status } = req.body || {};
  if (!['Open', 'Fulfilled', 'Cancelled'].includes(status)) return res.status(400).json({ error: 'Invalid status' });
  const closed = status === 'Open' ? null : new Date().toISOString().slice(0, 19).replace('T', ' ');
  const r = db.prepare('UPDATE requests SET status = ?, closed_at = ? WHERE id = ?').run(status, closed, id);
  if (!r.changes) return res.status(404).json({ error: 'Request not found' });
  res.json(db.prepare('SELECT * FROM requests WHERE id = ?').get(id));
});

app.get('/api/stats', (req, res) => {
  const one = (sql) => db.prepare(sql).get().n;
  const byGroup = db.prepare(`SELECT blood_group AS label, COUNT(*) AS total,
    SUM(CASE WHEN available = 1 AND ${ELIGIBLE} THEN 1 ELSE 0 END) AS eligible
    FROM donors GROUP BY blood_group`).all();
  const byCity = db.prepare(`SELECT city AS label, COUNT(*) AS total,
    SUM(CASE WHEN available = 1 AND ${ELIGIBLE} THEN 1 ELSE 0 END) AS eligible
    FROM donors GROUP BY city ORDER BY total DESC`).all();
  const reqStatus = db.prepare('SELECT status AS label, COUNT(*) AS count FROM requests GROUP BY status').all();
  const reqGroup = db.prepare('SELECT blood_group AS label, SUM(units) AS units FROM requests GROUP BY blood_group').all();
  const avgHours = db.prepare(`SELECT ROUND(AVG((julianday(closed_at) - julianday(created_at)) * 24), 1) AS h
    FROM requests WHERE status = 'Fulfilled'`).get().h;

  res.json({
    donors: one('SELECT COUNT(*) AS n FROM donors'),
    eligibleNow: one(`SELECT COUNT(*) AS n FROM donors WHERE available = 1 AND ${ELIGIBLE}`),
    openRequests: one(`SELECT COUNT(*) AS n FROM requests WHERE status = 'Open'`),
    fulfilled: one(`SELECT COUNT(*) AS n FROM requests WHERE status = 'Fulfilled'`),
    totalRequests: one('SELECT COUNT(*) AS n FROM requests'),
    avgFulfilHours: avgHours || 0,
    byGroup,
    byCity: byCity.map((c) => ({ ...c, lat: CITIES[c.label][0], lng: CITIES[c.label][1] })),
    reqStatus,
    reqGroup
  });
});

function sendCsv(res, name, header, rows) {
  const cell = (v) => (v === null || v === undefined ? '' : /[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : v);
  res.type('text/csv').attachment(name).send([header.join(','), ...rows.map((r) => header.map((h) => cell(r[h])).join(','))].join('\n'));
}

app.get('/api/export/donors.csv', (req, res) => {
  const rows = db.prepare(`SELECT id, blood_group, gender, age, city, last_donation, available,
    ${ELIGIBLE} AS eligible FROM donors ORDER BY id`).all()
    .map((r) => ({ ...r, latitude: CITIES[r.city][0], longitude: CITIES[r.city][1] }));
  sendCsv(res, 'donors.csv', ['id', 'blood_group', 'gender', 'age', 'city', 'latitude', 'longitude', 'last_donation', 'available', 'eligible'], rows);
});

app.get('/api/export/requests.csv', (req, res) => {
  const rows = db.prepare('SELECT id, blood_group, units, city, urgency, status, created_at, closed_at FROM requests ORDER BY id').all();
  sendCsv(res, 'requests.csv', ['id', 'blood_group', 'units', 'city', 'urgency', 'status', 'created_at', 'closed_at'], rows);
});

app.use('/api', (req, res) => res.status(404).json({ error: 'Not found' }));

app.use((err, req, res, next) => {
  if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Malformed JSON' });
  console.error(err);
  res.status(500).json({ error: 'Something went wrong' });
});

module.exports = app;
