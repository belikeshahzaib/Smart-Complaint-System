// server.js
// Main entry point for the Smart Complaint & Service Management System
// Run this file with: node server.js

const express = require('express');
const session = require('express-session');
const path = require('path');
const { getDB } = require('./db/database');

const app = express();
const PORT = process.env.PORT || 3000;

// ─── VIEW ENGINE ──────────────────────────────────────────────────────────────
// EJS lets us write HTML templates with dynamic data
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// ─── MIDDLEWARE ───────────────────────────────────────────────────────────────
app.use(express.urlencoded({ extended: true }));   // Parse form data
app.use(express.json());                            // Parse JSON
app.use(express.static(path.join(__dirname, 'public'))); // Serve CSS/JS files

// Session configuration - keeps users logged in
app.use(session({
  secret: 'fast-nuces-complaint-system-2024-secret-key',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: false,       // Set to true if using HTTPS
    maxAge: 24 * 60 * 60 * 1000  // 24 hours
  }
}));

// Make session data available in all EJS templates
app.use((req, res, next) => {
  res.locals.session = req.session;
  next();
});

// ─── INITIALIZE DATABASE ──────────────────────────────────────────────────────
getDB(); // Creates tables if they don't exist

// ─── ROUTES ───────────────────────────────────────────────────────────────────
const authRoutes = require('./routes/auth');
const studentRoutes = require('./routes/student');
const technicianRoutes = require('./routes/technician');

app.use('/', authRoutes);
app.use('/student', studentRoutes);
app.use('/technician', technicianRoutes);

// Home page (public)
app.get('/', (req, res) => {
  if (req.session && req.session.userId) {
    return res.redirect(req.session.role === 'student' ? '/student/dashboard' : '/technician/dashboard');
  }
  res.render('home', { title: 'Smart Complaint System - FAST NUCES' });
});

// About page (public)
app.get('/about', (req, res) => {
  res.render('about', { title: 'About Us' });
});

// 404 handler
app.use((req, res) => {
  res.status(404).render('404', { title: 'Page Not Found' });
});

// ─── START SERVER ─────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log('');
  console.log('╔══════════════════════════════════════════════════════╗');
  console.log('║   Smart Complaint & Service Management System        ║');
  console.log('║   FAST NUCES - Areeba Imran & Shahzaib Zaheer        ║');
  console.log('╠══════════════════════════════════════════════════════╣');
  console.log(`║   Server running at: http://localhost:${PORT}           ║`);
  console.log('╚══════════════════════════════════════════════════════╝');
  console.log('');
});

module.exports = app;
