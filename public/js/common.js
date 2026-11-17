function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function alertBox(type, msg) {
  return `<div class="alert alert-${type} mb-0">${msg}</div>`;
}

async function api(url, opts = {}) {
  const res = await fetch(url, { ...opts, headers: { 'Content-Type': 'application/json', ...(opts.headers || {}) } });
  if (res.status === 204) return null;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.errors ? data.errors.join(', ') : data.error || 'Request failed');
  return data;
}

async function fillSelects() {
  const meta = await api('/api/meta');
  document.querySelectorAll('select[data-fill]').forEach((sel) => {
    const list = sel.dataset.fill === 'groups' ? meta.bloodGroups : meta.cities;
    sel.insertAdjacentHTML('beforeend', list.map((v) => `<option>${v}</option>`).join(''));
  });
  return meta;
}

function timeAgo(dateStr) {
  const mins = Math.floor((Date.now() - new Date(dateStr.replace(' ', 'T') + 'Z')) / 60000);
  if (mins < 60) return `${Math.max(mins, 1)} min ago`;
  if (mins < 1440) return `${Math.floor(mins / 60)} hr ago`;
  return `${Math.floor(mins / 1440)} days ago`;
}
