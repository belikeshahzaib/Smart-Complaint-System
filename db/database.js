// db/database.js
// This file sets up the SQLite database and creates all tables

const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');
const path = require('path');

const DB_PATH = path.join(__dirname, 'complaints.db');

// Maps complaint category → technician specialization
const CATEGORY_TO_SPECIALIZATION = {
  electricity: 'electrician',
  plumbing: 'plumber',
  internet: 'it_technician',
  hvac: 'hvac_technician',
  furniture: 'carpenter',
  security: 'security_technician',
  other: 'general'
};

function initializeDatabase() {
  const db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');

  // USERS TABLE — students, technicians, admins
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT NOT NULL UNIQUE,
      password TEXT NOT NULL,
      full_name TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('student', 'technician', 'admin')),
      department TEXT,
      technician_type TEXT CHECK(technician_type IN (
        'electrician','plumber','it_technician','hvac_technician',
        'carpenter','security_technician','general', NULL
      )),
      is_available INTEGER NOT NULL DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // COMPLAINTS TABLE
  db.exec(`
    CREATE TABLE IF NOT EXISTS complaints (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      category TEXT NOT NULL CHECK(category IN ('electricity','plumbing','internet','hvac','furniture','security','other')),
      location TEXT NOT NULL,
      priority TEXT NOT NULL DEFAULT 'medium' CHECK(priority IN ('low','medium','high','urgent')),
      status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open','assigned','in_progress','resolved','closed','cancelled')),
      submitted_by INTEGER NOT NULL,
      assigned_to INTEGER,
      assigned_by INTEGER,
      deadline DATETIME,
      estimated_fix_time DATETIME,
      actual_fix_time DATETIME,
      resolution_notes TEXT,
      admin_notes TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (submitted_by) REFERENCES users(id),
      FOREIGN KEY (assigned_to) REFERENCES users(id),
      FOREIGN KEY (assigned_by) REFERENCES users(id)
    )
  `);

  // FEEDBACK TABLE
  db.exec(`
    CREATE TABLE IF NOT EXISTS feedback (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      complaint_id INTEGER NOT NULL UNIQUE,
      rating INTEGER NOT NULL CHECK(rating BETWEEN 1 AND 5),
      comment TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (complaint_id) REFERENCES complaints(id)
    )
  `);

  // NOTIFICATIONS TABLE
  db.exec(`
    CREATE TABLE IF NOT EXISTS notifications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      complaint_id INTEGER,
      message TEXT NOT NULL,
      is_read INTEGER NOT NULL DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id),
      FOREIGN KEY (complaint_id) REFERENCES complaints(id)
    )
  `);

  // ACTIVITY LOG TABLE
  db.exec(`
    CREATE TABLE IF NOT EXISTS activity_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      complaint_id INTEGER,
      action TEXT NOT NULL,
      details TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id),
      FOREIGN KEY (complaint_id) REFERENCES complaints(id)
    )
  `);

  // Seed default admin account if not exists
  const adminExists = db.prepare("SELECT id FROM users WHERE email = 'admin@nuces.edu.pk'").get();
  if (!adminExists) {
    const hashed = bcrypt.hashSync('admin123', 10);
    db.prepare(`
      INSERT INTO users (email, password, full_name, role, department)
      VALUES (?, ?, ?, 'admin', 'Administration')
    `).run('admin@nuces.edu.pk', hashed, 'System Administrator');
    console.log('✅ Default admin created: admin@nuces.edu.pk / admin123');
  }

  console.log('✅ Database initialized at:', DB_PATH);
  return db;
}

let dbInstance = null;
function getDB() {
  if (!dbInstance) dbInstance = initializeDatabase();
  return dbInstance;
}

module.exports = { getDB, CATEGORY_TO_SPECIALIZATION };