const RED = '#c8102e';
const GREY = '#adb5bd';
const base = () => ({ responsive: true, maintainAspectRatio: false });

function kpi(title, value, icon, color) {
  return `
    <div class="col-6 col-lg-3">
      <div class="card shadow-sm border-start border-4 border-${color} h-100">
        <div class="card-body">
          <div class="small text-muted"><i class="bi ${icon}"></i> ${title}</div>
          <div class="kpi">${value}</div>
        </div>
      </div>
    </div>`;
}

function drawMap(cities) {
  const map = L.map('map', { scrollWheelZoom: false }).setView([22.5, 79], 4.4);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; OpenStreetMap contributors'
  }).addTo(map);
  const max = Math.max(...cities.map((c) => c.total), 1);
  cities.forEach((c) => {
    L.circleMarker([c.lat, c.lng], {
      radius: 8 + (c.total / max) * 22,
      color: RED,
      fillColor: RED,
      fillOpacity: 0.45,
      weight: 1
    }).addTo(map).bindTooltip(`<b>${c.label}</b><br>${c.total} donors<br>${c.eligible} eligible now`);
  });
}

(async () => {
  const s = await api('/api/stats');
  const rate = s.totalRequests ? Math.round((s.fulfilled / s.totalRequests) * 100) : 0;

  document.getElementById('kpis').innerHTML =
    kpi('Registered donors', s.donors, 'bi-people', 'primary') +
    kpi('Eligible right now', s.eligibleNow, 'bi-check-circle', 'success') +
    kpi('Open requests', s.openRequests, 'bi-exclamation-triangle', 'danger') +
    kpi('Fulfilment rate', `${rate}%<small class="fs-6 text-muted"> (${s.avgFulfilHours} h avg)</small>`, 'bi-heart-pulse', 'warning');

  drawMap(s.byCity);

  const groups = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];
  const find = (arr, g, key) => (arr.find((x) => x.label === g) || {})[key] || 0;

  new Chart(document.getElementById('groupChart'), {
    type: 'bar',
    options: { ...base(), scales: { x: { stacked: true }, y: { stacked: true } } },
    data: {
      labels: groups,
      datasets: [
        { label: 'Eligible', data: groups.map((g) => find(s.byGroup, g, 'eligible')), backgroundColor: RED },
        { label: 'Not eligible / unavailable', data: groups.map((g) => find(s.byGroup, g, 'total') - find(s.byGroup, g, 'eligible')), backgroundColor: GREY }
      ]
    }
  });

  new Chart(document.getElementById('gapChart'), {
    type: 'bar',
    options: base(),
    data: {
      labels: groups,
      datasets: [
        { label: 'Eligible donors', data: groups.map((g) => find(s.byGroup, g, 'eligible')), backgroundColor: '#198754' },
        { label: 'Units requested', data: groups.map((g) => find(s.reqGroup, g, 'units')), backgroundColor: RED }
      ]
    }
  });

  const statusColors = { Open: '#dc3545', Fulfilled: '#198754', Cancelled: GREY };
  new Chart(document.getElementById('statusChart'), {
    type: 'doughnut',
    options: base(),
    data: {
      labels: s.reqStatus.map((x) => x.label),
      datasets: [{ data: s.reqStatus.map((x) => x.count), backgroundColor: s.reqStatus.map((x) => statusColors[x.label]) }]
    }
  });
})().catch((err) => {
  document.getElementById('kpis').innerHTML = `<div class="col-12">${alertBox('danger', 'Could not load dashboard: ' + esc(err.message))}</div>`;
});
