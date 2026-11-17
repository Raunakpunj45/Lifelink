const contactModal = new bootstrap.Modal(document.getElementById('contactModal'));
const results = document.getElementById('results');
const summary = document.getElementById('summary');

const searchForm = document.getElementById('searchForm');

fillSelects().then(() => {
  const q = new URLSearchParams(location.search);
  if (q.get('blood_group') && q.get('city')) {
    searchForm.blood_group.value = q.get('blood_group');
    searchForm.city.value = q.get('city');
    searchForm.requestSubmit();
  }
});
loadRequests();

document.getElementById('searchForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const params = new URLSearchParams(new FormData(e.target));
  results.innerHTML = '';
  summary.innerHTML = '<div class="text-muted">Searching...</div>';
  try {
    const data = await api('/api/donors/search?' + params);
    const groups = data.compatibleGroups.map((g) => `<span class="group-pill me-1">${g}</span>`).join('');
    summary.innerHTML = `
      <div class="d-flex flex-wrap align-items-center gap-2">
        <strong>${data.count} donor${data.count === 1 ? '' : 's'} found</strong>
        <span class="text-muted small ms-2">Compatible groups:</span> ${groups}
      </div>`;
    if (!data.count) {
      results.innerHTML = `<div class="col-12">${alertBox('warning',
        'No eligible donor found in this city. <a href="/request.html">Post an emergency request</a> so donors can reach you.')}</div>`;
      return;
    }
    results.innerHTML = data.donors.map((d) => `
      <div class="col-md-6">
        <div class="card donor-card shadow-sm h-100">
          <div class="card-body d-flex align-items-center gap-3">
            <span class="group-pill fs-5">${esc(d.blood_group)}</span>
            <div class="flex-grow-1">
              <div class="fw-semibold">${esc(d.name)} ${d.exact ? '<span class="badge text-bg-success">Exact match</span>' : ''}</div>
              <div class="small text-muted"><i class="bi bi-geo-alt"></i> ${esc(d.area || 'Area not given')}</div>
              <div class="small text-muted">Last donated: ${d.last_donation ? esc(d.last_donation) : 'Never'}</div>
            </div>
            <button class="btn btn-outline-success btn-sm" data-id="${d.id}"><i class="bi bi-telephone"></i> ${esc(d.phone)}</button>
          </div>
        </div>
      </div>`).join('');
  } catch (err) {
    summary.innerHTML = alertBox('danger', esc(err.message));
  }
});

results.addEventListener('click', async (e) => {
  const btn = e.target.closest('button[data-id]');
  if (!btn) return;
  try {
    const c = await api(`/api/donors/${btn.dataset.id}/contact`);
    document.getElementById('cName').textContent = c.name;
    const link = document.getElementById('cPhone');
    link.textContent = c.phone;
    link.href = 'tel:' + c.phone;
    contactModal.show();
  } catch (err) {
    summary.innerHTML = alertBox('danger', esc(err.message));
  }
});

async function loadRequests() {
  const box = document.getElementById('requests');
  try {
    const list = await api('/api/requests');
    if (!list.length) {
      box.innerHTML = '<div class="list-group-item text-muted">No open requests right now.</div>';
      return;
    }
    box.innerHTML = list.map((r) => `
      <div class="list-group-item urgency-${r.urgency}">
        <div class="d-flex justify-content-between">
          <span class="group-pill">${esc(r.blood_group)}</span>
          <span class="badge ${r.urgency === 'Critical' ? 'text-bg-danger' : r.urgency === 'Urgent' ? 'text-bg-warning' : 'text-bg-secondary'}">${r.urgency}</span>
        </div>
        <div class="mt-1 small"><b>${r.units} unit(s)</b> for ${esc(r.patient_name)}</div>
        <div class="small text-muted">${esc(r.hospital)}, ${esc(r.city)} &middot; ${timeAgo(r.created_at)}</div>
        <a class="small" href="tel:${esc(r.contact)}"><i class="bi bi-telephone"></i> ${esc(r.contact)}</a>
      </div>`).join('');
  } catch (err) {
    box.innerHTML = `<div class="list-group-item">${alertBox('danger', esc(err.message))}</div>`;
  }
}
