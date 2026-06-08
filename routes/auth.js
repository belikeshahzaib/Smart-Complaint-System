// routes/auth.js
const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const { body, validationResult } = require('express-validator');
const { getDB } = require('../db/database');
const { redirectIfLoggedIn } = require('../middleware/auth');

// ─── LOGIN ─────────────────────────────────────────────────────────────────
router.get('/login', redirectIfLoggedIn, (req, res) => {
  res.render('auth/login', { error: req.query.error || null, success: req.query.success || null, title: 'Login' });
});

router.post('/login', [
  body('email').isEmail().normalizeEmail().withMessage('Please enter a valid email address'),
  body('password').notEmpty().withMessage('Password is required')
], (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.render('auth/login', { error: errors.array()[0].msg, success: null, title: 'Login' });
  }

  const { email, password } = req.body;
  const db = getDB();

  try {
    const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
    if (!user) {
      return res.render('auth/login', { error: 'No account found with this email address.', success: null, title: 'Login' });
    }

    if (!bcrypt.compareSync(password, user.password)) {
      return res.render('auth/login', { error: 'Incorrect password. Please try again.', success: null, title: 'Login' });
    }

    req.session.userId = user.id;
    req.session.email = user.email;
    req.session.fullName = user.full_name;
    req.session.role = user.role;
    req.session.technicianType = user.technician_type || null;

    db.prepare('INSERT INTO activity_log (user_id, action, details) VALUES (?, ?, ?)').run(
      user.id, 'LOGIN', `User logged in: ${user.email}`
    );

    let redirectTo = '/student/dashboard';
    if (user.role === 'technician') redirectTo = '/technician/dashboard';
    if (user.role === 'admin') redirectTo = '/admin/dashboard';
    const returnTo = req.session.returnTo || redirectTo;
    delete req.session.returnTo;
    res.redirect(returnTo);

  } catch (err) {
    console.error('Login error:', err);
    res.render('auth/login', { error: 'Server error. Please try again.', success: null, title: 'Login' });
  }
});

// ─── SIGNUP ────────────────────────────────────────────────────────────────
router.get('/signup', redirectIfLoggedIn, (req, res) => {
  res.render('auth/signup', { error: null, success: null, title: 'Sign Up', formData: {} });
});

router.post('/signup', [
  body('full_name').trim().notEmpty().withMessage('Full name is required').isLength({ min: 2 }),
  body('email').isEmail().normalizeEmail().withMessage('Please enter a valid email address'),
  body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
  body('confirm_password').custom((value, { req }) => {
    if (value !== req.body.password) throw new Error('Passwords do not match');
    return true;
  }),
  body('role').isIn(['student', 'technician']).withMessage('Please select a valid role'),
], (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.render('auth/signup', { error: errors.array()[0].msg, success: null, title: 'Sign Up', formData: req.body });
  }

  const { full_name, email, password, role, department, technician_type } = req.body;
  const db = getDB();

  // Validate technician_type if role is technician
  const validTypes = ['electrician','plumber','it_technician','hvac_technician','carpenter','security_technician','general'];
  if (role === 'technician' && !validTypes.includes(technician_type)) {
    return res.render('auth/signup', { error: 'Please select your specialization.', success: null, title: 'Sign Up', formData: req.body });
  }

  try {
    const existingUser = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
    if (existingUser) {
      return res.render('auth/signup', { error: 'An account with this email already exists.', success: null, title: 'Sign Up', formData: req.body });
    }

    const hashedPassword = bcrypt.hashSync(password, 10);
    const result = db.prepare(
      'INSERT INTO users (email, password, full_name, role, department, technician_type) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(email, hashedPassword, full_name, role, department || null, role === 'technician' ? technician_type : null);

    db.prepare('INSERT INTO activity_log (user_id, action, details) VALUES (?, ?, ?)').run(
      result.lastInsertRowid, 'SIGNUP', `New ${role} registered: ${email}`
    );

    res.redirect('/login?success=Account+created+successfully!+Please+log+in.');
  } catch (err) {
    console.error('Signup error:', err);
    res.render('auth/signup', { error: 'Server error. Please try again.', success: null, title: 'Sign Up', formData: req.body });
  }
});

// ─── LOGOUT ────────────────────────────────────────────────────────────────
router.get('/logout', (req, res) => {
  req.session.destroy(() => res.redirect('/login?success=You+have+been+logged+out.'));
});

module.exports = router;