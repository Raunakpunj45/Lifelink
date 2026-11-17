const $ = (id) => document.getElementById(id);
const toast = new bootstrap.Toast($('toast'));
const confirmModal = new bootstrap.Modal($('confirmModal'));
let key = sessionStorage.getItem('adminKey') || '';
let deleteId = null;

const adminApi = (url, opts = {}) => api(url, { ...opts, headers: { 'x-admin-key': key } });

function notify(text) {
  $('toastText').textContent = text;
  toast.show();
}

async function loadRequests() {
  const list = await adminApi('/api/admin/requests');
  $('reqRows').innerHTML = list.map((r) => `
    <tr>
      <td>${r.id}</td>
      <td>${esc(r.patient_name)}<br><small class="text-muted">${esc(r.contact)}</small></td>
      <td><span class="group-pill">${esc(r.blood_group)}</span></td>
      <td>${r.units}</td>
      <td>${esc(r.hospital)}<br><small class="text-muted">${esc(r.city)}</small></td>
      <td>${esc(r.urgency)}</td>
      <td><small>${esc(r.created_at)}</small></td>
      <td>
        <select class="form-select form-select-sm" data-req="${r.id}">
          ${['Open', 'Fulfilled', 'Cancelled'].map((s) => `<option ${s === r.status ? 'selected' : ''}>${s}</option>`).join('')}
        </select>
      </td>
    </tr>`).join('') || '<tr><td colspan="8" class="text-center text-muted">No requests yet</td></tr>';
}

async function loadDonors() {
  const q = new URLSearchParams();
  if ($('fGroup').value) q.set('blood_group', $('fGroup').value);
  if ($('fCity').value) q.set('city', $('fCity').value);
  const list = await adminApi('/api/admin/donors?' + q);
  $('donorRows').innerHTML = list.map((d) => `
    <tr>
      <td>${d.id}</td>
      <td>${esc(d.name)}<br><small class="text-muted">${d.age} yrs, ${esc(d.gender)}</small></td>
      <td><span class="group-pill">${esc(d.blood_group)}</span></td>
      <td>${esc(d.city)}</td>
      <td>${esc(d.phone)}</td>
      <td><input type="date" class="form-control form-control-sm" value="${d.last_donation || ''}" data-date="${d.id}"></td>
      <td>${d.eligible ? '<span class="badge text-bg-success">Yes</span>' : '<span class="badge text-bg-secondary">No</span>'}</td>
      <td><div class="form-check form-switch"><input class="form-check-input" type="checkbox" data-avail="${d.id}" ${d.available ? 'checked' : ''}></div></td>
      <td><button class="btn btn-sm btn-outline-danger" data-del="${d.id}" data-name="${esc(d.name)}"><i class="bi bi-trash"></i></button></td>
    </tr>`).join('') || '<tr><td colspan="9" class="text-center text-muted">No donors found</td></tr>';
}

async function openPanel() {
  try {
    await Promise.all([loadRequests(), loadDonors()]);
    $('login').classList.add('d-none');
    $('panel').classList.remove('d-none');
  } catch (err) {
    sessionStorage.removeItem('adminKey');
    $('loginMsg').innerHTML = alertBox('danger', esc(err.message));
  }
}

function showError(err) {
  $('panelMsg').innerHTML = alertBox('danger', esc(err.message));
}

$('loginForm').addEventListener('submit', (e) => {
  e.preventDefault();
  key = $('key').value;
  sessionStorage.setItem('adminKey', key);
  openPanel();
});

$('logout').addEventListener('click', () => {
  sessionStorage.removeItem('adminKey');
  location.reload();
});

$('fGroup').addEventListener('change', () => loadDonors().catch(showError));
$('fCity').addEventListener('change', () => loadDonors().catch(showError));

$('reqRows').addEventListener('change', async (e) => {
  const id = e.target.dataset.req;
  if (!id) return;
  try {
    await adminApi(`/api/admin/requests/${id}`, { method: 'PATCH', body: JSON.stringify({ status: e.target.value }) });
    notify(`Request #${id} marked ${e.target.value}`);
  } catch (err) {
    showError(err);
  }
});

$('donorRows').addEventListener('change', async (e) => {
  const { avail, date } = e.target.dataset;
  const id = avail || date;
  if (!id) return;
  const body = avail ? { available: e.target.checked } : { last_donation: e.target.value };
  try {
    await adminApi(`/api/admin/donors/${id}`, { method: 'PATCH', body: JSON.stringify(body) });
    notify(`Donor #${id} updated`);
    loadDonors();
  } catch (err) {
    showError(err);
    loadDonors();
  }
});

$('donorRows').addEventListener('click', (e) => {
  const btn = e.target.closest('[data-del]');
  if (!btn) return;
  deleteId = btn.dataset.del;
  $('delName').textContent = btn.dataset.name;
  confirmModal.show();
});

$('confirmDelete').addEventListener('click', async () => {
  try {
    await adminApi(`/api/admin/donors/${deleteId}`, { method: 'DELETE' });
    confirmModal.hide();
    notify(`Donor #${deleteId} deleted`);
    loadDonors();
  } catch (err) {
    confirmModal.hide();
    showError(err);
  }
});

fillSelects().then(() => {
  if (key) openPanel();
});
