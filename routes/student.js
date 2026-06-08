// routes/student.js
// All student-facing routes

const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const { getDB } = require('../db/database');
const { requireStudent } = require('../middleware/auth');

// Apply student auth to all routes in this file
router.use(requireStudent);

// ─── DASHBOARD ────────────────────────────────────────────────────────────────
router.get('/dashboard', (req, res) => {
  const db = getDB();
  const userId = req.session.userId;

  const complaints = db.prepare(`
    SELECT c.*, u.full_name as technician_name
    FROM complaints c
    LEFT JOIN users u ON c.assigned_to = u.id
    WHERE c.submitted_by = ?
    ORDER BY c.created_at DESC
    LIMIT 10
  `).all(userId);

  const stats = db.prepare(`
    SELECT
      COUNT(*) as total,
      SUM(CASE WHEN status = 'open' THEN 1 ELSE 0 END) as open_count,
      SUM(CASE WHEN status IN ('assigned','in_progress') THEN 1 ELSE 0 END) as in_progress_count,
      SUM(CASE WHEN status IN ('resolved','closed') THEN 1 ELSE 0 END) as resolved_count
    FROM complaints WHERE submitted_by = ?
  `).get(userId);

  res.render('student/dashboard', {
    title: 'My Dashboard',
    complaints,
    stats,
    user: req.session
  });
});

// ─── SUBMIT COMPLAINT ─────────────────────────────────────────────────────────
router.get('/submit', (req, res) => {
  res.render('student/submit', { title: 'Submit Complaint', error: null, success: null, user: req.session });
});

router.post('/submit', [
  body('title').trim().notEmpty().withMessage('Complaint title is required').isLength({ max: 100 }),
  body('category').isIn(['electricity','plumbing','internet','hvac','furniture','security','other']).withMessage('Select a valid category'),
  body('location').trim().notEmpty().withMessage('Location is required'),
  body('description').trim().isLength({ min: 10 }).withMessage('Please provide more detail (at least 10 characters)'),
  body('priority').isIn(['low','medium','high','urgent']).withMessage('Select a valid priority'),
], (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.render('student/submit', {
      title: 'Submit Complaint',
      error: errors.array()[0].msg,
      success: null,
      user: req.session,
      formData: req.body
    });
  }

  const { title, category, location, description, priority } = req.body;
  const db = getDB();

  try {
    const result = db.prepare(`
      INSERT INTO complaints (title, description, category, location, priority, submitted_by)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(title, description, category, location, priority, req.session.userId);

    db.prepare('INSERT INTO activity_log (user_id, complaint_id, action, details) VALUES (?, ?, ?, ?)').run(
      req.session.userId, result.lastInsertRowid, 'COMPLAINT_SUBMITTED', `Complaint submitted: ${title}`
    );

    res.redirect('/student/my-complaints?success=Complaint+submitted+successfully!');
  } catch (err) {
    console.error(err);
    res.render('student/submit', { title: 'Submit Complaint', error: 'Server error. Try again.', success: null, user: req.session });
  }
});

// ─── MY COMPLAINTS ────────────────────────────────────────────────────────────
router.get('/my-complaints', (req, res) => {
  const db = getDB();
  const complaints = db.prepare(`
    SELECT c.*, u.full_name as technician_name
    FROM complaints c
    LEFT JOIN users u ON c.assigned_to = u.id
    WHERE c.submitted_by = ?
    ORDER BY c.created_at DESC
  `).all(req.session.userId);

  res.render('student/my-complaints', {
    title: 'My Complaints',
    complaints,
    success: req.query.success || null,
    user: req.session
  });
});

// ─── VIEW SINGLE COMPLAINT ────────────────────────────────────────────────────
router.get('/complaint/:id', (req, res) => {
  const db = getDB();
  const complaint = db.prepare(`
    SELECT c.*, u.full_name as technician_name, u.email as technician_email
    FROM complaints c
    LEFT JOIN users u ON c.assigned_to = u.id
    WHERE c.id = ? AND c.submitted_by = ?
  `).get(req.params.id, req.session.userId);

  if (!complaint) return res.redirect('/student/my-complaints');

  const existingFeedback = db.prepare('SELECT * FROM feedback WHERE complaint_id = ?').get(complaint.id);

  res.render('student/complaint-detail', {
    title: 'Complaint Details',
    complaint,
    existingFeedback,
    user: req.session
  });
});

// ─── SUBMIT FEEDBACK ─────────────────────────────────────────────────────────
router.post('/feedback/:complaintId', [
  body('rating').isInt({ min: 1, max: 5 }).withMessage('Rating must be 1-5'),
], (req, res) => {
  const db = getDB();
  const complaintId = req.params.complaintId;

  // Verify complaint belongs to this user and is resolved
  const complaint = db.prepare(`
    SELECT * FROM complaints WHERE id = ? AND submitted_by = ? AND status IN ('resolved','closed')
  `).get(complaintId, req.session.userId);

  if (!complaint) return res.redirect('/student/my-complaints');

  try {
    db.prepare('INSERT OR REPLACE INTO feedback (complaint_id, rating, comment) VALUES (?, ?, ?)').run(
      complaintId, req.body.rating, req.body.comment || null
    );
    res.redirect(`/student/complaint/${complaintId}?success=Feedback+submitted!`);
  } catch (err) {
    res.redirect(`/student/complaint/${complaintId}`);
  }
});

module.exports = router;
