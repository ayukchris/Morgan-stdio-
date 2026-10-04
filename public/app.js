// Shared code for every Morgan.stdio page
const LOGO_SVG = `<svg viewBox="0 0 64 64" aria-label="Morgan.stdio logo">
  <defs><linearGradient id="mg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ff3d5a"/><stop offset="1" stop-color="#ffd23f"/></linearGradient></defs>
  <rect x="5" y="5" width="56" height="56" rx="14" fill="#000"/>
  <rect x="2" y="2" width="56" height="56" rx="14" fill="url(#mg)"/>
  <path d="M13 46V14h8l9 15 9-15h8v32h-8V28l-9 14-9-14v18z" fill="#000" transform="translate(2 2)"/>
  <path d="M13 46V14h8l9 15 9-15h8v32h-8V28l-9 14-9-14v18z" fill="#fff"/>
</svg>`;

const Auth = {
  get token() { return localStorage.getItem('ms_token'); },
  set token(v) { v ? localStorage.setItem('ms_token', v) : localStorage.removeItem('ms_token'); },
  user: null,
};

async function api(path, opts = {}) {
  const headers = opts.headers || {};
  if (Auth.token) headers.Authorization = 'Bearer ' + Auth.token;
  let body = opts.body;
  if (body && !(body instanceof FormData)) { headers['Content-Type'] = 'application/json'; body = JSON.stringify(body); }
  let res;
  try { res = await fetch(path, { method: opts.method || (body ? 'POST' : 'GET'), headers, body }); }
  catch (e) { throw new Error('Cannot reach the server. Check your internet connection and try again.'); }
  let data = null;
  try { data = await res.json(); } catch (e) {}
  if (!res.ok) {
    if (!data && res.status >= 500) throw new Error('The website server is offline right now. Please try again in a moment.');
    throw new Error((data && data.error) || 'Something went wrong. Please try again.');
  }
  return data;
}

async function loadUser() {
  if (!Auth.token) return (Auth.user = null);
  try { const r = await api('/api/me'); Auth.user = r.user; if (!r.user) Auth.token = null; }
  catch (e) { Auth.user = null; }
  return Auth.user;
}

async function logout() {
  try { await api('/api/logout', { method: 'POST' }); } catch (e) {}
  Auth.token = null; Auth.user = null; location.href = '/';
}

function esc(s) { return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
function fmtDate(d) { return new Date(d).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }); }
function ago(d) {
  const s = (Date.now() - new Date(d)) / 1000;
  if (s < 3600) return Math.max(1, Math.round(s / 60)) + ' min ago';
  if (s < 86400) return Math.round(s / 3600) + 'h ago';
  if (s < 86400 * 7) return Math.round(s / 86400) + 'd ago';
  return fmtDate(d);
}
const isNew = d => Date.now() - new Date(d) < 7 * 86400000;
function money(amount, cur) { return cur === 'XAF' ? `${Number(amount).toLocaleString()} CFA` : `$${amount}`; }
function qs(k) { return new URLSearchParams(location.search).get(k); }

// Colorful generated cover when no image was uploaded
function genCoverStyle(title) {
  let h = 0; for (const c of String(title)) h = (h * 31 + c.charCodeAt(0)) % 360;
  return `background: radial-gradient(rgba(255,255,255,.12) 1.2px, transparent 1.3px) 0 0/12px 12px, linear-gradient(135deg, hsl(${h} 85% 55%), hsl(${(h + 60) % 360} 80% 35%));`;
}
function coverDiv(cls, url, title) {
  return url
    ? `<div class="${cls}" style="background-image:url('${esc(url)}')"></div>`
    : `<div class="${cls} gen-cover" style="${genCoverStyle(title)}">${esc(title)}</div>`;
}

function toast(msg, err) {
  let t = document.getElementById('toast');
  if (!t) { t = document.createElement('div'); t.id = 'toast'; document.body.appendChild(t); }
  t.textContent = msg; t.className = err ? 'err show' : 'show';
  clearTimeout(t._h); t._h = setTimeout(() => t.className = t.className.replace('show', ''), 3200);
}

function renderNav() {
  const u = Auth.user;
  const el = document.getElementById('nav');
  if (!el) return;
  el.className = 'nav';
  el.innerHTML = `<div class="wrap">
    <a href="/" class="brand">${LOGO_SVG}<span class="txt">Morgan<b>.stdio</b></span></a>
    <div class="nav-links">
      <a href="/#comics" class="hide-sm">Comics</a>
      ${u && u.role === 'admin' ? `<a href="/admin">Dashboard <span class="pill admin">Admin</span></a>` : ''}
      ${u && u.role !== 'admin' && !u.subscribed ? `<a href="/subscribe" class="btn yellow sm">Subscribe</a>` : ''}
      ${!u ? `<a href="/subscribe" class="hide-sm">Pricing</a><a href="/login" class="btn sm">Log in</a>` : ''}
      ${u ? `<a href="/account" title="My account">${u.subscribed && u.role !== 'admin' ? '<span class="pill">Member</span> ' : ''}👤 <span class="hide-sm">${esc(u.name.split(' ')[0])}</span></a>
             <a href="#" onclick="logout();return false" class="muted hide-sm">Log out</a>` : ''}
    </div></div>`;
}

function renderFooter() {
  const el = document.getElementById('footer');
  if (!el) return;
  el.innerHTML = `<div class="wrap">
    <a href="/" class="brand" style="font-size:1rem">${LOGO_SVG.replace('<svg', '<svg style="width:30px;height:30px"')}<span>Morgan<b>.stdio</b></span></a>
    <div>© ${new Date().getFullYear()} Morgan.stdio · All comics are the property of their creators.</div>
    <div><a href="/subscribe">Pricing</a> · <a href="/login">Account</a></div></div>`;
}

async function boot() {
  await loadUser();
  renderNav();
  renderFooter();
  return Auth.user;
}
