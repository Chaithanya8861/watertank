// ============================================================
// db.js — SQLite Database using sql.js
// sql.js runs SQLite entirely inside the browser
// Data is saved to localStorage as a binary file
// ============================================================

const DB_KEY = 'watertank_db';

let db = null;

// ── Load sql.js and initialize database ──────────────────────
async function initDB() {
  // sql.js loads SQLite compiled to WebAssembly
  const SQL = await initSqlJs({
    locateFile: file => `https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.10.2/${file}`
  });

  // Try to load existing database from localStorage
  const saved = localStorage.getItem(DB_KEY);
  if (saved) {
    const buf = Uint8Array.from(atob(saved), c => c.charCodeAt(0));
    db = new SQL.Database(buf);
  } else {
    db = new SQL.Database();
    createTables();
    seedTankers();
    saveDB();
  }
}

// ── Save database back to localStorage ───────────────────────
function saveDB() {
  const data   = db.export();
  const base64 = btoa(String.fromCharCode(...data));
  localStorage.setItem(DB_KEY, base64);
}

// ── Create all tables ─────────────────────────────────────────
function createTables() {
  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id        INTEGER PRIMARY KEY AUTOINCREMENT,
      name      TEXT NOT NULL,
      email     TEXT UNIQUE NOT NULL,
      phone     TEXT,
      city      TEXT,
      password  TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS tankers (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      driver_name     TEXT NOT NULL,
      vehicle_number  TEXT,
      capacity_liters INTEGER,
      price_per_liter REAL,
      city            TEXT,
      phone           TEXT,
      rating          REAL DEFAULT 4.0,
      available       INTEGER DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS bookings (
      id               INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id          INTEGER,
      tanker_id        INTEGER,
      liters           INTEGER,
      total_amount     REAL,
      delivery_address TEXT,
      time_slot        TEXT,
      payment_method   TEXT,
      status           TEXT DEFAULT 'pending',
      booked_at        TEXT DEFAULT (datetime('now'))
    );
  `);
}

// ── Seed sample tanker data ───────────────────────────────────
function seedTankers() {
  db.run(`
    INSERT INTO tankers (driver_name, vehicle_number, capacity_liters, price_per_liter, city, phone, rating) VALUES
    ('Rajan Shetty',     'KA-19-TW-1101', 10000, 0.50, 'Mangalore', '9845001101', 4.9),
    ('Divakar Rao',      'KA-19-TW-2205', 8000,  0.45, 'Mangalore', '9742002205', 4.7),
    ('Suresh Prabhu',    'KA-19-TW-3308', 12000, 0.55, 'Mangalore', '9916003308', 4.8),
    ('Kiran D Souza',    'KA-19-TW-4412', 6000,  0.42, 'Mangalore', '9480004412', 4.5),
    ('Mohan Bangera',    'KA-19-TW-5516', 10000, 0.48, 'Mangalore', '9632005516', 4.6),
    ('Anthony Pinto',    'KA-19-TW-6620', 8000,  0.46, 'Mangalore', '9731006620', 4.4),
    ('Prakash Nayak',    'KA-19-TW-7724', 12000, 0.52, 'Mangalore', '9900007724', 4.8),
    ('Ganesh Poojary',   'KA-19-TW-8828', 6000,  0.40, 'Mangalore', '9845008828', 4.3);
  `);
}

// ── USER: Register ────────────────────────────────────────────
function registerUser(name, email, phone, city, password) {
  // Check if email exists
  const exists = db.exec(`SELECT id FROM users WHERE email = '${email}'`);
  if (exists.length > 0 && exists[0].values.length > 0) {
    return { success: false, error: 'Email already registered. Please login.' };
  }
  try {
    db.run(
      `INSERT INTO users (name, email, phone, city, password) VALUES (?, ?, ?, ?, ?)`,
      [name, email, phone, city, password]
    );
    saveDB();
    return { success: true };
  } catch (e) {
    return { success: false, error: 'Registration failed. Try again.' };
  }
}

// ── USER: Login ───────────────────────────────────────────────
function loginUser(email, password) {
  const res = db.exec(
    `SELECT id, name, email FROM users WHERE email = '${email}' AND password = '${password}'`
  );
  if (res.length > 0 && res[0].values.length > 0) {
    const [id, name, em] = res[0].values[0];
    return { success: true, user: { id, name, email: em } };
  }
  return { success: false, error: 'Invalid email or password.' };
}

// ── TANKERS: Get all available ────────────────────────────────
function getTankers() {
  const res = db.exec(`SELECT * FROM tankers WHERE available = 1 ORDER BY rating DESC`);
  if (!res.length) return [];
  const cols = res[0].columns;
  return res[0].values.map(row => {
    const obj = {};
    cols.forEach((c, i) => obj[c] = row[i]);
    return obj;
  });
}

// ── TANKERS: Get single tanker by ID ──────────────────────────
function getTanker(id) {
  const res = db.exec(`SELECT * FROM tankers WHERE id = ${id}`);
  if (!res.length || !res[0].values.length) return null;
  const cols = res[0].columns;
  const obj  = {};
  cols.forEach((c, i) => obj[c] = res[0].values[0][i]);
  return obj;
}

// ── BOOKINGS: Save booking ────────────────────────────────────
function saveBooking(userId, tankerId, liters, total, address, timeSlot, payMethod) {
  const status = payMethod === 'Cash on Delivery' ? 'pending' : 'confirmed';
  db.run(
    `INSERT INTO bookings
       (user_id, tanker_id, liters, total_amount, delivery_address, time_slot, payment_method, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [userId, tankerId, liters, total, address, timeSlot, payMethod, status]
  );
  saveDB();
  // Return the last inserted row id
  const res = db.exec(`SELECT last_insert_rowid()`);
  return res[0].values[0][0];
}

// ── BOOKINGS: Get booking by ID ───────────────────────────────
function getBooking(id) {
  const res = db.exec(`
    SELECT b.*, t.driver_name, t.vehicle_number
    FROM bookings b
    JOIN tankers t ON b.tanker_id = t.id
    WHERE b.id = ${id}
  `);
  if (!res.length || !res[0].values.length) return null;
  const cols = res[0].columns;
  const obj  = {};
  cols.forEach((c, i) => obj[c] = res[0].values[0][i]);
  return obj;
}

// ── BOOKINGS: Get all bookings for a user ─────────────────────
function getUserBookings(userId) {
  const res = db.exec(`
    SELECT b.id, b.liters, b.total_amount, b.delivery_address,
           b.time_slot, b.payment_method, b.status, b.booked_at,
           t.driver_name, t.vehicle_number, t.phone AS driver_phone,
           t.capacity_liters, t.price_per_liter
    FROM bookings b
    JOIN tankers t ON b.tanker_id = t.id
    WHERE b.user_id = ${userId}
    ORDER BY b.id DESC
  `);
  if (!res.length) return [];
  const cols = res[0].columns;
  return res[0].values.map(row => {
    const obj = {};
    cols.forEach((c, i) => obj[c] = row[i]);
    return obj;
  });
}

// ── SESSION helpers (uses sessionStorage) ────────────────────
function setSession(user) {
  sessionStorage.setItem('wt_user', JSON.stringify(user));
}
function getSession() {
  const u = sessionStorage.getItem('wt_user');
  return u ? JSON.parse(u) : null;
}
function clearSession() {
  sessionStorage.removeItem('wt_user');
}
function requireLogin() {
  if (!getSession()) { window.location.href = 'index.html'; }
}

// ── MANGALORE SERVICE AREA CHECK ─────────────────────────────
// All recognised localities/areas within Mangalore city limits
const MANGALORE_AREAS = [
  // Core city
  'mangalore','mangaluru',
  // North Mangalore
  'bejai','bondel','bunder','kodialbail','pumpwell','kadri','hampankatta',
  'attavar','dongerkery','falnir','kankanady','morgan gate','lalbagh',
  'ballalbagh','maryhill','brighton','nanthoor','urwa','kulur',
  // South Mangalore
  'ullal','someshwar','thannirbhavi','panambur','surathkal',
  'bajpe','kavoor','derebail','jeppinamogaru','kottara',
  // East Mangalore
  'bikarnakatte','boloor','kudroli','panjimogaru','paldane',
  'kannadikatte','yeyyadi','pacchanady','adyar','vamanjoor',
  'talapady','shaktinagar','kulshekar','balmatta','mallikatte',
  // West / Coastal
  'thokkottu','bengre','hoige bazar','lighthouse hill','hampanakatta',
  'mangaladevi','urwa store','state bank','ladyhill','ashok nagar',
  // Major landmarks / pincode areas
  'mannagudda','pandeshwar','old port','new port','port area',
  'car street','big bazar','bunts hostel','jyothi circle',
  'valencia','bishop house','court road','bunts colony',
  'mukka','mulki','bantwal','puttur','uppinangady','moodbidri',
  // Pincodes (DK district)
  '575001','575002','575003','575004','575005','575006',
  '575007','575008','575009','575010','575011','575012',
  '575013','575014','575015','575016','575017','575018',
  '575019','575020','575021','575022','575023','575024',
  '575025','575026','575027','575028','575029','575030',
  '574143','574142','574141','574199','574198'
];

/**
 * Returns true if the given address string is within Mangalore service area.
 * Checks for known locality names and Mangalore pincodes.
 */
function isInMangalore(address) {
  if (!address) return false;
  const addr = address.toLowerCase().trim();
  return MANGALORE_AREAS.some(area => addr.includes(area));
}
