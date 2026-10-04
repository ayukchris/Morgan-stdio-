// Morgan.stdio — comic website server
const express = require('express');
const multer = require('multer');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const db = require('./db');
const { PLANS, METHODS, MODE, startCheckout } = require('./payments');

const PORT = process.env.PORT || 3000;
const ADMIN_EMAIL = (process.env.ADMIN_EMAIL || 'ayukchris8@gmail.com').toLowerCase();
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD; // set this on your hosting (never write it in the code)

const UP = path.join(db.DATA_DIR, 'uploads');
const DIRS = { covers: path.join(UP, 'covers'), pdfs: path.join(UP, 'pdfs'), banners: path.join(UP, 'banners') };
Object.values(DIRS).forEach(d => fs.mkdirSync(d, { recursive: true }));

db.load();
const D = () => db.data;

// ── Create the admin account on first start ──
if (!D().users.some(u => u.role === 'admin') && !ADMIN_PASSWORD) {
  console.warn('⚠️  No admin account yet. Set the ADMIN_PASSWORD environment variable and restart.');
} else if (!D().users.some(u => u.role === 'admin')) {
  D().users.push({
    id: db.id('usr'), name: 'Admin', email: ADMIN_EMAIL,
    passwordHash: bcrypt.hashSync(ADMIN_PASSWORD, 10),
    role: 'admin', subscription: null, createdAt: new Date().toISOString(),
  });
  db.save();
  console.log('Admin account created for', ADMIN_EMAIL);
}

const app = express();
app.set('trust proxy', 1);
app.use(express.json({ limit: '1mb' }));

// ── Helpers ──
const now = () => Date.now();
const isSubscribed = u => !!u && (u.role === 'admin' || (u.subscription && new Date(u.subscription.expiresAt).getTime() > now()));
const publicUser = u => u && ({
  id: u.id, name: u.name, email: u.email, role: u.role,
  subscribed: isSubscribed(u),
  subscription: u.subscription || null,
  createdAt: u.createdAt,
});
const coverUrl = c => c && c.cover ? '/uploads/covers/' + c.cover : null;
const bannerUrl = (ch, c) => ch.banner ? '/uploads/banners/' + ch.banner : coverUrl(c);
const canRead = (u, ch) => ch.isFree || isSubscribed(u);
const bool = v => v === true || v === 'true' || v === 'on' || v === '1';

function newSession(user) {
  const token = crypto.randomBytes(32).toString('hex');
  D().sessions.push({ token, userId: user.id, createdAt: new Date().toISOString() });
  db.save();
  return token;
}

// Attach logged-in user (token in "Authorization: Bearer ..." header)
app.use((req, res, next) => {
  const h = req.headers.authorization || '';
  const token = h.startsWith('Bearer ') ? h.slice(7) : null;
  if (token) {
    const s = D().sessions.find(s => s.token === token);
    if (s) { req.user = D().users.find(u => u.id === s.userId); req.token = token; }
  }
  next();
});
const requireUser = (req, res, next) => req.user ? next() : res.status(401).json({ error: 'Please log in first.' });
const requireAdmin = (req, res, next) => req.user && req.user.role === 'admin' ? next() : res.status(403).json({ error: 'Admin only.' });

// ── File uploads ──
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, file.fieldname === 'pdf' ? DIRS.pdfs : file.fieldname === 'banner' ? DIRS.banners : DIRS.covers),
  filename: (req, file, cb) => cb(null, crypto.randomBytes(12).toString('hex') + path.extname(file.originalname).toLowerCase()),
});
const upload = multer({
  storage,
  limits: { fileSize: 300 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.fieldname === 'pdf') {
      return file.mimetype === 'application/pdf' || /\.pdf$/i.test(file.originalname) ? cb(null, true) : cb(new Error('Only PDF files are allowed for chapters.'));
    }
    return /^image\//.test(file.mimetype) ? cb(null, true) : cb(new Error('Only image files are allowed for covers.'));
  },
});
const rm = (dir, f) => { if (f) fs.rm(path.join(dir, f), { force: true }, () => {}); };

// ══════════════ AUTH ══════════════
app.post('/api/register', (req, res) => {
  const name = String(req.body.name || '').trim();
  const email = String(req.body.email || '').trim().toLowerCase();
  const password = String(req.body.password || '');
  if (!name || !/^\S+@\S+\.\S+$/.test(email)) return res.status(400).json({ error: 'Please enter your name and a valid email.' });
  if (password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters.' });
  if (D().users.some(u => u.email === email)) return res.status(400).json({ error: 'An account with this email already exists. Please log in.' });
  const user = { id: db.id('usr'), name, email, passwordHash: bcrypt.hashSync(password, 10), role: 'reader', subscription: null, createdAt: new Date().toISOString() };
  D().users.push(user);
  const token = newSession(user);
  res.json({ token, user: publicUser(user) });
});

app.post('/api/login', (req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase();
  const user = D().users.find(u => u.email === email);
  const pw = String(req.body.password || '');
  // Phone keyboards sometimes add a space before/after — accept that too
  const ok = user && (bcrypt.compareSync(pw, user.passwordHash) || (pw.trim() !== pw && bcrypt.compareSync(pw.trim(), user.passwordHash)));
  if (!ok) {
    return res.status(401).json({ error: 'Wrong email or password.' });
  }
  res.json({ token: newSession(user), user: publicUser(user) });
});

app.post('/api/logout', (req, res) => {
  if (req.token) { D().sessions = D().sessions.filter(s => s.token !== req.token); db.save(); }
  res.json({ ok: true });
});

app.get('/api/me', (req, res) => res.json({ user: publicUser(req.user) || null }));

app.post('/api/me/password', requireUser, (req, res) => {
  const { current, newPassword } = req.body;
  if (!bcrypt.compareSync(String(current || ''), req.user.passwordHash)) return res.status(400).json({ error: 'Current password is wrong.' });
  if (String(newPassword || '').length < 6) return res.status(400).json({ error: 'New password must be at least 6 characters.' });
  req.user.passwordHash = bcrypt.hashSync(String(newPassword), 10);
  D().sessions = D().sessions.filter(s => s.userId !== req.user.id || s.token === req.token);
  db.save();
  res.json({ ok: true });
});

app.get('/api/me/payments', requireUser, (req, res) => {
  res.json(D().payments.filter(p => p.userId === req.user.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
});

// ══════════════ COMICS (public) ══════════════
function comicSummary(c) {
  const chs = D().chapters.filter(ch => ch.comicId === c.id);
  const latest = chs.sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
  return { id: c.id, title: c.title, description: c.description, genre: c.genre, cover: coverUrl(c), chapterCount: chs.length, latestAt: latest ? latest.createdAt : c.createdAt, createdAt: c.createdAt };
}
function chapterInfo(ch, user) {
  const c = D().comics.find(x => x.id === ch.comicId);
  return {
    id: ch.id, comicId: ch.comicId, comicTitle: c ? c.title : '', number: ch.number, title: ch.title,
    isFree: !!ch.isFree, featured: !!ch.featured, createdAt: ch.createdAt,
    cover: coverUrl(c), banner: bannerUrl(ch, c), locked: !canRead(user, ch),
    blurb: ch.blurb || (c ? c.description : ''),
  };
}

app.get('/api/comics', (req, res) => {
  res.json(D().comics.map(comicSummary).sort((a, b) => b.latestAt.localeCompare(a.latestAt)));
});

app.get('/api/comics/:id', (req, res) => {
  const c = D().comics.find(x => x.id === req.params.id);
  if (!c) return res.status(404).json({ error: 'Comic not found.' });
  const chapters = D().chapters.filter(ch => ch.comicId === c.id).sort((a, b) => a.number - b.number).map(ch => chapterInfo(ch, req.user));
  res.json({ ...comicSummary(c), chapters });
});

// Newest featured chapters → homepage "advert" banner
app.get('/api/featured', (req, res) => {
  const list = D().chapters.filter(ch => ch.featured).sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 6);
  res.json(list.map(ch => chapterInfo(ch, req.user)));
});

app.get('/api/latest', (req, res) => {
  res.json(D().chapters.slice().sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 12).map(ch => chapterInfo(ch, req.user)));
});

app.get('/api/chapters/:id', (req, res) => {
  const ch = D().chapters.find(x => x.id === req.params.id);
  if (!ch) return res.status(404).json({ error: 'Chapter not found.' });
  const siblings = D().chapters.filter(x => x.comicId === ch.comicId).sort((a, b) => a.number - b.number);
  const i = siblings.findIndex(x => x.id === ch.id);
  res.json({ ...chapterInfo(ch, req.user), prev: siblings[i - 1] ? siblings[i - 1].id : null, next: siblings[i + 1] ? siblings[i + 1].id : null });
});

// The PDF itself — only for admin, subscribers, or free chapters
app.get('/api/chapters/:id/pdf', (req, res) => {
  const ch = D().chapters.find(x => x.id === req.params.id);
  if (!ch) return res.status(404).json({ error: 'Chapter not found.' });
  if (!canRead(req.user, ch)) return res.status(402).json({ error: 'Subscription required.' });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', 'inline');
  res.setHeader('Cache-Control', 'private, no-store');
  res.sendFile(path.join(DIRS.pdfs, ch.pdf));
});

// ══════════════ PAYMENTS ══════════════
app.get('/api/plans', (req, res) => res.json({ mode: MODE, plans: Object.values(PLANS), methods: METHODS }));

function activate(user, plan) {
  const current = user.subscription && new Date(user.subscription.expiresAt).getTime() > now() ? new Date(user.subscription.expiresAt).getTime() : now();
  user.subscription = { plan: plan.id, planName: plan.name, startedAt: user.subscription && current > now() ? user.subscription.startedAt : new Date().toISOString(), expiresAt: new Date(current + plan.days * 86400000).toISOString() };
}

app.post('/api/checkout', requireUser, async (req, res) => {
  const plan = PLANS[req.body.plan];
  const method = METHODS[req.body.method];
  if (!plan) return res.status(400).json({ error: 'Please choose a plan.' });
  if (!method || !plan.methods.includes(method.id)) return res.status(400).json({ error: 'Please choose a payment method for this plan.' });
  const phone = String(req.body.phone || '').replace(/[^\d+]/g, '');
  if (method.needsPhone && phone.length < 8) return res.status(400).json({ error: 'Please enter your Mobile Money number.' });
  const payment = {
    id: db.id('pay'), reference: 'MS-' + crypto.randomBytes(5).toString('hex').toUpperCase(),
    userId: req.user.id, userEmail: req.user.email, plan: plan.id, planName: plan.name, method: method.id, methodName: method.name,
    phone: phone || null, amount: plan.price, currency: plan.currency, status: 'pending', mode: MODE, createdAt: new Date().toISOString(),
  };
  D().payments.push(payment); db.save();
  try { res.json(await startCheckout(payment)); }
  catch (e) { payment.status = 'failed'; db.save(); res.status(500).json({ error: e.message }); }
});

app.post('/api/checkout/:ref/demo-confirm', requireUser, (req, res) => {
  if (MODE !== 'demo') return res.status(400).json({ error: 'Demo payments are turned off.' });
  const p = D().payments.find(x => x.reference === req.params.ref && x.userId === req.user.id);
  if (!p) return res.status(404).json({ error: 'Payment not found.' });
  if (p.status !== 'pending') return res.status(400).json({ error: 'This payment was already processed.' });
  p.status = 'success'; p.paidAt = new Date().toISOString();
  activate(req.user, PLANS[p.plan]);
  db.save();
  res.json({ ok: true, user: publicUser(req.user) });
});

// ══════════════ ADMIN ══════════════
app.post('/api/admin/comics', requireAdmin, upload.single('cover'), (req, res) => {
  const title = String(req.body.title || '').trim();
  if (!title) return res.status(400).json({ error: 'Comic title is required.' });
  const c = { id: db.id('cmc'), title, description: String(req.body.description || '').trim(), genre: String(req.body.genre || '').trim(), cover: req.file ? req.file.filename : null, createdAt: new Date().toISOString() };
  D().comics.push(c); db.save();
  res.json(comicSummary(c));
});

app.put('/api/admin/comics/:id', requireAdmin, upload.single('cover'), (req, res) => {
  const c = D().comics.find(x => x.id === req.params.id);
  if (!c) return res.status(404).json({ error: 'Comic not found.' });
  if (req.body.title !== undefined) c.title = String(req.body.title).trim() || c.title;
  if (req.body.description !== undefined) c.description = String(req.body.description).trim();
  if (req.body.genre !== undefined) c.genre = String(req.body.genre).trim();
  if (req.file) { rm(DIRS.covers, c.cover); c.cover = req.file.filename; }
  db.save();
  res.json(comicSummary(c));
});

app.delete('/api/admin/comics/:id', requireAdmin, (req, res) => {
  const c = D().comics.find(x => x.id === req.params.id);
  if (!c) return res.status(404).json({ error: 'Comic not found.' });
  D().chapters.filter(ch => ch.comicId === c.id).forEach(ch => { rm(DIRS.pdfs, ch.pdf); rm(DIRS.banners, ch.banner); });
  D().chapters = D().chapters.filter(ch => ch.comicId !== c.id);
  rm(DIRS.covers, c.cover);
  D().comics = D().comics.filter(x => x.id !== c.id);
  db.save();
  res.json({ ok: true });
});

app.post('/api/admin/chapters', requireAdmin, upload.fields([{ name: 'pdf', maxCount: 1 }, { name: 'banner', maxCount: 1 }]), (req, res) => {
  const pdf = req.files && req.files.pdf && req.files.pdf[0];
  const banner = req.files && req.files.banner && req.files.banner[0];
  const c = D().comics.find(x => x.id === req.body.comicId);
  if (!c) { if (pdf) rm(DIRS.pdfs, pdf.filename); if (banner) rm(DIRS.banners, banner.filename); return res.status(400).json({ error: 'Please choose a comic.' }); }
  if (!pdf) return res.status(400).json({ error: 'Please choose a PDF file.' });
  const existing = D().chapters.filter(ch => ch.comicId === c.id);
  const number = Number(req.body.number) || (existing.length ? Math.max(...existing.map(e => e.number)) + 1 : 1);
  const ch = {
    id: db.id('chp'), comicId: c.id, number, title: String(req.body.title || '').trim() || `Chapter ${number}`,
    blurb: String(req.body.blurb || '').trim(), pdf: pdf.filename, banner: banner ? banner.filename : null,
    isFree: bool(req.body.isFree), featured: req.body.featured === undefined ? true : bool(req.body.featured),
    originalName: pdf.originalname, size: pdf.size, createdAt: new Date().toISOString(),
  };
  D().chapters.push(ch); db.save();
  res.json(chapterInfo(ch, req.user));
});

app.patch('/api/admin/chapters/:id', requireAdmin, (req, res) => {
  const ch = D().chapters.find(x => x.id === req.params.id);
  if (!ch) return res.status(404).json({ error: 'Chapter not found.' });
  if (req.body.isFree !== undefined) ch.isFree = bool(req.body.isFree);
  if (req.body.featured !== undefined) ch.featured = bool(req.body.featured);
  if (req.body.title !== undefined) ch.title = String(req.body.title).trim() || ch.title;
  if (req.body.number !== undefined && Number(req.body.number)) ch.number = Number(req.body.number);
  db.save();
  res.json(chapterInfo(ch, req.user));
});

app.delete('/api/admin/chapters/:id', requireAdmin, (req, res) => {
  const ch = D().chapters.find(x => x.id === req.params.id);
  if (!ch) return res.status(404).json({ error: 'Chapter not found.' });
  rm(DIRS.pdfs, ch.pdf); rm(DIRS.banners, ch.banner);
  D().chapters = D().chapters.filter(x => x.id !== ch.id);
  db.save();
  res.json({ ok: true });
});

app.get('/api/admin/chapters', requireAdmin, (req, res) => {
  res.json(D().chapters.slice().sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map(ch => ({ ...chapterInfo(ch, req.user), size: ch.size, originalName: ch.originalName })));
});

app.get('/api/admin/stats', requireAdmin, (req, res) => {
  const ok = D().payments.filter(p => p.status === 'success');
  const revenue = {};
  ok.forEach(p => { revenue[p.currency] = (revenue[p.currency] || 0) + p.amount; });
  res.json({
    mode: MODE,
    comics: D().comics.length, chapters: D().chapters.length,
    readers: D().users.filter(u => u.role === 'reader').length,
    activeSubscribers: D().users.filter(u => u.role === 'reader' && isSubscribed(u)).length,
    payments: ok.length, revenue,
  });
});

app.get('/api/admin/users', requireAdmin, (req, res) => {
  res.json(D().users.filter(u => u.role === 'reader').map(publicUser).sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
});

app.get('/api/admin/payments', requireAdmin, (req, res) => {
  res.json(D().payments.slice().sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
});

// Manually give/extend a subscription (e.g. a reader paid you directly by MoMo)
app.post('/api/admin/users/:id/grant', requireAdmin, (req, res) => {
  const u = D().users.find(x => x.id === req.params.id);
  if (!u) return res.status(404).json({ error: 'User not found.' });
  const days = Math.max(1, Math.min(3650, Number(req.body.days) || 30));
  activate(u, { id: 'manual', name: `Manual (${days} days)`, days });
  db.save();
  res.json(publicUser(u));
});

app.post('/api/admin/users/:id/revoke', requireAdmin, (req, res) => {
  const u = D().users.find(x => x.id === req.params.id);
  if (!u) return res.status(404).json({ error: 'User not found.' });
  u.subscription = null; db.save();
  res.json(publicUser(u));
});

// ══════════════ STATIC FILES ══════════════
app.use('/uploads/covers', express.static(DIRS.covers, { maxAge: '7d' }));
app.use('/uploads/banners', express.static(DIRS.banners, { maxAge: '7d' }));
app.use('/vendor/pdfjs', express.static(path.join(__dirname, 'node_modules', 'pdfjs-dist', 'build'), { maxAge: '30d' }));
app.use(express.static(path.join(__dirname, 'public'), { extensions: ['html'] }));

// Upload / other errors → friendly JSON
app.use((err, req, res, next) => {
  console.error(err.message);
  res.status(400).json({ error: err.code === 'LIMIT_FILE_SIZE' ? 'File is too large (max 300 MB).' : err.message });
});

app.listen(PORT, '0.0.0.0', () => console.log(`Morgan.stdio running on http://0.0.0.0:${PORT}  (payments: ${MODE} mode)`));
