const msg = document.getElementById('msg');
const donorForm = document.getElementById('donorForm');
const requestForm = document.getElementById('requestForm');

fillSelects();

function setup(form, url, onSuccess) {
  if (!form) return;
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    form.classList.add('was-validated');
    if (!form.checkValidity()) return;
    const body = Object.fromEntries(new FormData(form));
    const btn = form.querySelector('button');
    btn.disabled = true;
    try {
      const data = await api(url, { method: 'POST', body: JSON.stringify(body) });
      msg.innerHTML = alertBox('success', onSuccess(data, body));
      form.reset();
      form.classList.remove('was-validated');
    } catch (err) {
      msg.innerHTML = alertBox('danger', esc(err.message));
    } finally {
      btn.disabled = false;
    }
  });
}

setup(donorForm, '/api/donors', () =>
  '<b>Thank you for registering!</b> You will now appear in donor search when you are eligible.');

setup(requestForm, '/api/requests', (data, body) => {
  const link = `/?blood_group=${encodeURIComponent(body.blood_group)}&city=${encodeURIComponent(body.city)}`;
  return `<b>Request #${data.id} posted.</b> ${data.matchingDonors} compatible donor(s) are available in ${esc(body.city)}.
    <a href="${link}" class="alert-link">View donors</a>`;
});
