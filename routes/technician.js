// routes/technician.js
// All technician-facing routes

const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const { getDB } = require('../db/database');
const { requireTechnician } = require('../middleware/auth');

router.use(requireTechnician);

// ─── DASHBOARD ────────────────────────────────────────────────────────────────
router.get('/dashboard', (req, res) => {
  const db = getDB();
  const techId = req.session.userId;

  // All open/unassigned complaints
  const openComplaints = db.prepare(`
    SELECT c.*, u.full_name as student_name, u.email as student_email
    FROM complaints c
    JOIN users u ON c.submitted_by = u.id
    WHERE c.status = 'open'
    ORDER BY 
      CASE c.priority WHEN 'urgent' THEN 1 WHEN 'high' THEN 2 WHEN 'medium' THEN 3 ELSE 4 END,
      c.created_at ASC
  `).all();

  // My assigned complaints
  const myComplaints = db.prepare(`
    SELECT c.*, u.full_name as student_name
    FROM complaints c
    JOIN users u ON c.submitted_by = u.id
    WHERE c.assigned_to = ? AND c.status IN ('assigned','in_progress')
    ORDER BY c.estimated_fix_time ASC
  `).all(techId);

  // My stats
  const stats = db.prepare(`
    SELECT
      SUM(CASE WHEN status IN ('assigned','in_progress') THEN 1 ELSE 0 END) as active,
      SUM(CASE WHEN status IN ('resolved','closed') AND assigned_to = ? THEN 1 ELSE 0 END) as resolved_total
    FROM complaints
  `).get(techId);

  const resolvedByMe = db.prepare(`SELECT COUNT(*) as cnt FROM complaints WHERE assigned_to = ? AND status IN ('resolved','closed')`).get(techId);

  res.render('technician/dashboard', {
    title: 'Technician Dashboard',
    openComplaints,
    myComplaints,
    stats: { ...stats, resolved_by_me: resolvedByMe.cnt },
    user: req.session
  });
});

// ─── TAKE A COMPLAINT ────────────────────────────────────────────────────────
router.post('/take/:id', (req, res) => {
  const db = getDB();
  const complaint = db.prepare('SELECT * FROM complaints WHERE id = ? AND status = ?').get(req.params.id, 'open');
  if (!complaint) return res.redirect('/technician/dashboard');

  db.prepare(`UPDATE complaints SET assigned_to = ?, status = 'assigned', updated_at = CURRENT_TIMESTAMP WHERE id = ?`).run(req.session.userId, req.params.id);
  db.prepare('INSERT INTO activity_log (user_id, complaint_id, action, details) VALUES (?, ?, ?, ?)').run(
    req.session.userId, req.params.id, 'COMPLAINT_ASSIGNED', `Taken by technician: ${req.session.fullName}`
  );

  res.redirect(`/technician/complaint/${req.params.id}`);
});

// ─── VIEW COMPLAINT DETAIL ────────────────────────────────────────────────────
router.get('/complaint/:id', (req, res) => {
  const db = getDB();
  const complaint = db.prepare(`
    SELECT c.*, u.full_name as student_name, u.email as student_email, u.department
    FROM complaints c
    JOIN users u ON c.submitted_by = u.id
    WHERE c.id = ?
  `).get(req.params.id);

  if (!complaint) return res.redirect('/technician/dashboard');

  const logs = db.prepare(`
    SELECT al.*, u.full_name FROM activity_log al
    LEFT JOIN users u ON al.user_id = u.id
    WHERE al.complaint_id = ? ORDER BY al.created_at ASC
  `).all(req.params.id);

  res.render('technician/complaint-detail', {
    title: 'Complaint Details',
    complaint,
    logs,
    error: req.query.error || null,
    success: req.query.success || null,
    user: req.session
  });
});

// ─── UPDATE COMPLAINT STATUS + ESTIMATED TIME ─────────────────────────────────
router.post('/update/:id', [
  body('status').isIn(['assigned','in_progress','resolved','closed']),
  body('estimated_fix_time').optional({ checkFalsy: true }).isISO8601(),
  body('admin_notes').optional().trim()
], (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.redirect(`/technician/complaint/${req.params.id}?error=${encodeURIComponent(errors.array()[0].msg)}`);
  }

  const db = getDB();
  const { status, estimated_fix_time, admin_notes } = req.body;
  const complaintId = req.params.id;

  // Only the assigned technician OR status is open can update
  const complaint = db.prepare('SELECT * FROM complaints WHERE id = ?').get(complaintId);
  if (!complaint) return res.redirect('/technician/dashboard');

  const actualFixTime = status === 'resolved' ? new Date().toISOString() : null;

  db.prepare(`
    UPDATE complaints 
    SET status = ?, estimated_fix_time = ?, admin_notes = ?,
        actual_fix_time = COALESCE(?, actual_fix_time),
        assigned_to = COALESCE(assigned_to, ?),
        updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(status, estimated_fix_time || null, admin_notes || null, actualFixTime, req.session.userId, complaintId);

  db.prepare('INSERT INTO activity_log (user_id, complaint_id, action, details) VALUES (?, ?, ?, ?)').run(
    req.session.userId, complaintId, 'STATUS_UPDATE', `Status changed to: ${status}. Notes: ${admin_notes || 'none'}`
  );

  res.redirect(`/technician/complaint/${complaintId}?success=Updated+successfully!`);
});

// ─── MY RESOLVED COMPLAINTS ───────────────────────────────────────────────────
router.get('/resolved', (req, res) => {
  const db = getDB();
  const resolved = db.prepare(`
    SELECT c.*, u.full_name as student_name, f.rating, f.comment
    FROM complaints c
    JOIN users u ON c.submitted_by = u.id
    LEFT JOIN feedback f ON c.id = f.complaint_id
    WHERE c.assigned_to = ? AND c.status IN ('resolved','closed')
    ORDER BY c.actual_fix_time DESC
  `).all(req.session.userId);

  res.render('technician/resolved', {
    title: 'Resolved Complaints',
    resolved,
    user: req.session
  });
});

module.exports = router;
