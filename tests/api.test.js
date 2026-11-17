process.env.DB_FILE = ':memory:';
process.env.ADMIN_KEY = 'testkey';

const test = require('node:test');
const assert = require('node:assert');
const request = require('supertest');
const app = require('../app');
const db = require('../db');

const key = { 'x-admin-key': 'testkey' };
const daysAgo = (d) => new Date(Date.now() - d * 864e5).toISOString().slice(0, 10);

const donor = (o = {}) => ({
  name: 'Rahul Verma', phone: '9876500001', email: 'rahul@mail.com', age: 25,
  gender: 'Male', blood_group: 'O-', city: 'Pune', area: 'Kothrud', ...o
});
const bloodReq = (o = {}) => ({
  patient_name: 'Sunita Rao', blood_group: 'A+', units: 2, hospital: 'Ruby Hall Clinic',
  city: 'Pune', contact: '9123456780', urgency: 'Critical', ...o
});

test('TC01 register a valid donor', async () => {
  const r = await request(app).post('/api/donors').send(donor());
  assert.strictEqual(r.status, 201);
  assert.ok(r.body.id);
});

test('TC02 compatible donors are returned (O- can give to A+)', async () => {
  await request(app).post('/api/donors').send(donor({ phone: '9876500002', blood_group: 'A+' }));
  const r = await request(app).get('/api/donors/search?blood_group=A%2B&city=Pune');
  assert.strictEqual(r.status, 200);
  assert.strictEqual(r.body.count, 2);
  assert.strictEqual(r.body.donors[0].blood_group, 'A+', 'exact match comes first');
});

test('TC03 incompatible donors are not returned (A+ cannot give to O-)', async () => {
  const r = await request(app).get('/api/donors/search?blood_group=O-&city=Pune');
  assert.ok(r.body.donors.every((d) => d.blood_group === 'O-'));
});

test('TC04 phone is masked in search and revealed on request', async () => {
  const r = await request(app).get('/api/donors/search?blood_group=O-&city=Pune');
  assert.match(r.body.donors[0].phone, /X{6}/);
  const c = await request(app).get(`/api/donors/${r.body.donors[0].id}/contact`);
  assert.strictEqual(c.body.phone, '9876500001');
});

test('TC05 post blood request returns number of matching donors', async () => {
  const r = await request(app).post('/api/requests').send(bloodReq());
  assert.strictEqual(r.status, 201);
  assert.strictEqual(r.body.matchingDonors, 2);
});

test('TC06 open requests list shows the new request', async () => {
  const r = await request(app).get('/api/requests');
  assert.strictEqual(r.body.length, 1);
  assert.strictEqual(r.body[0].status, 'Open');
});

test('TC07 admin marks request fulfilled', async () => {
  const r = await request(app).patch('/api/admin/requests/1').set(key).send({ status: 'Fulfilled' });
  assert.strictEqual(r.status, 200);
  assert.ok(r.body.closed_at);
  assert.strictEqual((await request(app).get('/api/requests')).body.length, 0);
});

test('TC08 unavailable donor is hidden from search', async () => {
  await request(app).patch('/api/admin/donors/2').set(key).send({ available: false });
  const r = await request(app).get('/api/donors/search?blood_group=A%2B&city=Pune');
  assert.strictEqual(r.body.count, 1);
  assert.strictEqual((await request(app).get('/api/donors/2/contact')).status, 403);
  await request(app).patch('/api/admin/donors/2').set(key).send({ available: true });
});

test('TC09 stats and CSV export work', async () => {
  const s = await request(app).get('/api/stats');
  assert.strictEqual(s.body.donors, 2);
  assert.strictEqual(s.body.fulfilled, 1);
  const csv = await request(app).get('/api/export/donors.csv');
  assert.match(csv.headers['content-type'], /text\/csv/);
  assert.match(csv.text.split('\n')[0], /latitude,longitude/);
});

test('TC10 empty form is rejected with all errors', async () => {
  const r = await request(app).post('/api/donors').send({});
  assert.strictEqual(r.status, 400);
  assert.ok(r.body.errors.length >= 5);
});

test('TC11 invalid phone numbers rejected', async () => {
  for (const phone of ['12345', '5876543210', '98765432101', 'abcdefghij']) {
    const r = await request(app).post('/api/donors').send(donor({ phone }));
    assert.strictEqual(r.status, 400, phone);
  }
});

test('TC12 invalid blood group and city rejected', async () => {
  assert.strictEqual((await request(app).post('/api/donors').send(donor({ phone: '9000000001', blood_group: 'C+' }))).status, 400);
  assert.strictEqual((await request(app).post('/api/donors').send(donor({ phone: '9000000001', city: 'London' }))).status, 400);
  assert.strictEqual((await request(app).get('/api/donors/search?blood_group=X&city=Pune')).status, 400);
});

test('TC13 duplicate phone number rejected', async () => {
  const r = await request(app).post('/api/donors').send(donor());
  assert.strictEqual(r.status, 409);
});

test('TC14 future donation date rejected', async () => {
  const future = new Date(Date.now() + 5 * 864e5).toISOString().slice(0, 10);
  const r = await request(app).post('/api/donors').send(donor({ phone: '9000000002', last_donation: future }));
  assert.strictEqual(r.status, 400);
});

test('TC15 admin routes need the key', async () => {
  assert.strictEqual((await request(app).get('/api/admin/donors')).status, 401);
  assert.strictEqual((await request(app).get('/api/admin/donors').set('x-admin-key', 'wrong')).status, 401);
});

test('TC16 malformed JSON and SQL injection are handled safely', async () => {
  const bad = await request(app).post('/api/donors').set('Content-Type', 'application/json').send('{oops');
  assert.strictEqual(bad.status, 400);
  const inj = await request(app).get("/api/donors/search?blood_group=O-&city=Pune' OR '1'='1");
  assert.strictEqual(inj.status, 400);
  const name = await request(app).post('/api/donors').send(donor({ phone: '9000000003', name: "x'); DROP TABLE donors;--" }));
  assert.strictEqual(name.status, 201);
  assert.ok(db.prepare('SELECT COUNT(*) AS n FROM donors').get().n >= 3);
});

test('TC17 age boundaries 17/18/65/66', async () => {
  const cases = [[17, 400], [18, 201], [65, 201], [66, 400]];
  for (const [age, code] of cases) {
    const r = await request(app).post('/api/donors').send(donor({ phone: `91000000${age}`, age }));
    assert.strictEqual(r.status, code, `age ${age}`);
  }
});

test('TC18 donation gap boundary 89 days hidden, 90 days shown', async () => {
  await request(app).post('/api/donors').send(donor({ phone: '9200000089', blood_group: 'AB-', city: 'Bhopal', last_donation: daysAgo(89) }));
  await request(app).post('/api/donors').send(donor({ phone: '9200000090', blood_group: 'AB-', city: 'Bhopal', last_donation: daysAgo(90) }));
  const r = await request(app).get('/api/donors/search?blood_group=AB-&city=Bhopal');
  assert.strictEqual(r.body.count, 1);
});

test('TC19 units boundaries 0/1/10/11', async () => {
  const cases = [[0, 400], [1, 201], [10, 201], [11, 400]];
  for (const [units, code] of cases) {
    assert.strictEqual((await request(app).post('/api/requests').send(bloodReq({ units }))).status, code, `units ${units}`);
  }
});

test('TC20 city with no donors returns empty list, not error', async () => {
  const r = await request(app).get('/api/donors/search?blood_group=B%2B&city=Chandigarh');
  assert.strictEqual(r.status, 200);
  assert.strictEqual(r.body.count, 0);
});

test('TC21 invalid and missing ids', async () => {
  assert.strictEqual((await request(app).get('/api/donors/0/contact')).status, 400);
  assert.strictEqual((await request(app).get('/api/donors/9999/contact')).status, 404);
  assert.strictEqual((await request(app).delete('/api/admin/donors/9999').set(key)).status, 404);
  assert.strictEqual((await request(app).get('/api/unknown')).status, 404);
});
