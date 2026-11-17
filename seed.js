const db = require('./db');

const first = ['Aarav', 'Vivaan', 'Aditya', 'Rohan', 'Karan', 'Arjun', 'Rahul', 'Ishaan', 'Priya', 'Ananya', 'Sneha', 'Kavya', 'Neha', 'Pooja', 'Riya', 'Meera', 'Sahil', 'Nikhil', 'Divya', 'Tanvi'];
const last = ['Sharma', 'Verma', 'Gupta', 'Singh', 'Patel', 'Reddy', 'Nair', 'Iyer', 'Das', 'Mehta', 'Joshi', 'Khan', 'Rao', 'Kapoor'];
const areas = ['Sector 12', 'MG Road', 'Civil Lines', 'Station Road', 'Model Town', 'Old City', 'University Area', 'Lake View'];
const groupShare = [['O+', 37], ['B+', 32], ['A+', 22], ['AB+', 6], ['O-', 1], ['B-', 1], ['A-', 0.6], ['AB-', 0.4]];
const cityShare = [['Delhi', 16], ['Mumbai', 14], ['Bengaluru', 12], ['Hyderabad', 10], ['Chennai', 9], ['Pune', 9], ['Kolkata', 8], ['Jaipur', 6], ['Lucknow', 5], ['Ahmedabad', 5], ['Chandigarh', 3], ['Bhopal', 3]];

const rand = (n) => Math.floor(Math.random() * n);
const pick = (arr) => arr[rand(arr.length)];
function weighted(list) {
  let r = Math.random() * list.reduce((s, x) => s + x[1], 0);
  for (const [v, w] of list) if ((r -= w) < 0) return v;
  return list[0][0];
}
const daysAgo = (d) => new Date(Date.now() - d * 864e5).toISOString().slice(0, 10);
const stamp = (t) => new Date(t).toISOString().slice(0, 19).replace('T', ' ');

db.exec('DELETE FROM donors; DELETE FROM requests; DELETE FROM sqlite_sequence;');

const addDonor = db.prepare(`INSERT INTO donors (name, phone, email, age, gender, blood_group, city, area, last_donation, available, created_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
const addReq = db.prepare(`INSERT INTO requests (patient_name, blood_group, units, hospital, city, contact, urgency, status, created_at, closed_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);

db.transaction(() => {
  for (let i = 0; i < 300; i++) {
    const fi = rand(first.length);
    const name = `${first[fi]} ${pick(last)}`;
    const gender = (fi >= 8 && fi < 16) || fi >= 18 ? 'Female' : 'Male';
    const phone = String(6 + rand(4)) + String(100000000 + i * 3001).slice(0, 9);
    const last_donation = Math.random() < 0.3 ? null : daysAgo(rand(400));
    addDonor.run(name, phone, `${name.split(' ')[0].toLowerCase()}${i}@mail.com`, 18 + rand(40), gender,
      weighted(groupShare), weighted(cityShare), pick(areas), last_donation, Math.random() < 0.85 ? 1 : 0,
      stamp(Date.now() - rand(180) * 864e5));
  }

  const hospitals = ['City Hospital', 'AIIMS', 'Apollo Hospital', 'Fortis Hospital', 'District Hospital', 'Max Hospital'];
  for (let i = 0; i < 60; i++) {
    const created = Date.now() - Math.random() * 60 * 864e5;
    const r = Math.random();
    const status = r < 0.65 ? 'Fulfilled' : r < 0.75 ? 'Cancelled' : 'Open';
    const closed = status === 'Open' ? null : stamp(Math.min(Date.now(), created + (1 + Math.random() * 40) * 36e5));
    addReq.run(`${pick(first)} ${pick(last)}`, weighted(groupShare), 1 + rand(4), pick(hospitals), weighted(cityShare),
      '98' + String(10000000 + rand(89999999)), pick(['Normal', 'Normal', 'Urgent', 'Critical']), status, stamp(created), closed);
  }
})();

console.log('Sample data loaded: 300 donors, 60 requests');
