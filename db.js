// Simple JSON-file database (no extra software needed).
// All data is stored in data/db.json
const fs = require('fs');
const path = require('path');

// DATA_DIR can point to a permanent disk on your hosting (e.g. /var/data on Render)
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');

const empty = { users: [], sessions: [], comics: [], chapters: [], payments: [], settings: {} };

let data;

function load() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (fs.existsSync(DB_FILE)) {
    data = { ...empty, ...JSON.parse(fs.readFileSync(DB_FILE, 'utf8')) };
  } else {
    data = JSON.parse(JSON.stringify(empty));
    save();
  }
  return data;
}

function save() {
  const tmp = DB_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
  fs.renameSync(tmp, DB_FILE);
}

function id(prefix) {
  return prefix + '_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

module.exports = { load, save, id, get data() { return data; }, DATA_DIR };
