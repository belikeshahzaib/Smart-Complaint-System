// routes/technician.js
// Technicians see ONLY complaints assigned to them by admin. They update status/notes.

const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const { getDB } = require('../db/database');
const { requireTechnician } = require('../middleware/auth');

router.use(requireTechnician);

function notify(db, userId, complaintId, message) {
  db.prepare('INSERT INTO notifications (user_id, complaint_id, message) VALUES (?, ?, ?)').run(userId, complaintId, message);
}

// ─── DASHBOARD ────────────────────────────────────────────────────────────────
router.get('/dashboard', (req, res) => {
  const db = getDB();
  const techId = req.session.userId;

  // Mark notifications read
  db.prepare('UPDATE notifications SET is_read = 1 WHERE user_id = ?').run(techId);

  const activeComplaints = db.prepare(`
    SELECT c.*, u.full_name as student_name, u.email as student_email
    FROM complaints c
    JOIN users u ON c.submitted_by = u.id
    WHERE c.assigned_to = ? AND c.status IN ('assigned','in_progress')
    ORDER BY
      CASE c.priority WHEN 'urgent' THEN 1 WHEN 'high' THEN 2 WHEN 'medium' THEN 3 ELSE 4 END,
      c.deadline ASC NULLS LAST, c.created_at ASC
  `).all(techId);

  const recentResolved = db.prepare(`
    SELECT c.*, u.full_name as student_name, f.rating
    FROM complaints c
    JOIN users u ON c.submitted_by = u.id
    LEFT JOIN feedback f ON f.complaint_id = c.id
    WHERE c.assigned_to = ? AND c.status IN ('resolved','closed')
    ORDER BY c.actual_fix_time DESC LIMIT 5
  `).all(techId);

  const stats = db.prepare(`
    SELECT
      SUM(CASE WHEN status IN ('assigned','in_progress') THEN 1 ELSE 0 END) as active,
      SUM(CASE WHEN status IN ('resolved','closed') THEN 1 ELSE 0 END) as resolved_total,
      SUM(CASE WHEN priority = 'urgent' AND status IN ('assigned','in_progress') THEN 1 ELSE 0 END) as urgent_active
    FROM complaints WHERE assigned_to = ?
  `).get(techId);

  const avgRating = db.prepare(`
    SELECT ROUND(AVG(f.rating), 1) as avg_rating FROM feedback f
    JOIN complaints c ON f.complaint_id = c.id WHERE c.assigned_to = ?
  `).get(techId);

  const unreadNotifs = db.prepare('SELECT COUNT(*) as cnt FROM notifications WHERE user_id = ? AND is_read = 0').get(techId);

  const techInfo = db.prepare('SELECT * FROM users WHERE id = ?').get(techId);

  res.render('technician/dashboard', {
    title: 'Technician Dashboard',
    activeComplaints,
    recentResolved,
    stats: { ...stats, avg_rating: avgRating.avg_rating },
    unreadCount: unreadNotifs.cnt,
    techInfo,
    user: req.session
  });
});

// ─── VIEW COMPLAINT DETAIL ────────────────────────────────────────────────────
router.get('/complaint/:id', (req, res) => {
  const db = getDB();
  const techId = req.session.userId;

  const complaint = db.prepare(`
    SELECT c.*, u.full_name as student_name, u.email as student_email, u.department,
      admin.full_name as assigned_by_name
    FROM complaints c
    JOIN users u ON c.submitted_by = u.id
    LEFT JOIN users admin ON c.assigned_by = admin.id
    WHERE c.id = ? AND c.assigned_to = ?
  `).get(req.params.id, techId);

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

// ─── UPDATE STATUS + RESOLUTION NOTES ─────────────────────────────────────────
router.post('/update/:id', [
  body('status').isIn(['in_progress','resolved']),
  body('estimated_fix_time').optional({ checkFalsy: true }).isISO8601(),
  body('resolution_notes').optional().trim()
], (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.redirect(`/technician/complaint/${req.params.id}?error=${encodeURIComponent(errors.array()[0].msg)}`);
  }

  const db = getDB();
  const { status, estimated_fix_time, resolution_notes } = req.body;
  const complaintId = req.params.id;
  const techId = req.session.userId;

  const complaint = db.prepare('SELECT * FROM complaints WHERE id = ? AND assigned_to = ?').get(complaintId, techId);
  if (!complaint) return res.redirect('/technician/dashboard');

  const actualFixTime = status === 'resolved' ? new Date().toISOString() : null;

  db.prepare(`
    UPDATE complaints SET
      status = ?,
      estimated_fix_time = COALESCE(?, estimated_fix_time),
      resolution_notes = ?,
      actual_fix_time = COALESCE(?, actual_fix_time),
      updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(status, estimated_fix_time || null, resolution_notes || null, actualFixTime, complaintId);

  db.prepare('INSERT INTO activity_log (user_id, complaint_id, action, details) VALUES (?, ?, ?, ?)').run(
    techId, complaintId, 'TECH_STATUS_UPDATE',
    `Status → ${status}. Notes: ${resolution_notes || 'none'}`
  );

  // Notify the student
  const msg = status === 'resolved'
    ? `Your complaint #${complaintId} "${complaint.title}" has been resolved! Please leave feedback.`
    : `Technician is now working on your complaint #${complaintId} "${complaint.title}".`;
  notify(db, complaint.submitted_by, complaintId, msg);

  // Notify ALL admins about the technician status update
  const techInfo = db.prepare('SELECT full_name FROM users WHERE id = ?').get(techId);
  const adminMsg = status === 'resolved'
    ? `Complaint #${complaintId} "${complaint.title}" has been RESOLVED by technician ${techInfo ? techInfo.full_name : 'Unknown'}.`
    : `Complaint #${complaintId} "${complaint.title}" is now IN PROGRESS by technician ${techInfo ? techInfo.full_name : 'Unknown'}.`;
  const admins = db.prepare("SELECT id FROM users WHERE role = 'admin'").all();
  for (const admin of admins) {
    notify(db, admin.id, complaintId, adminMsg);
  }

  res.redirect(`/technician/complaint/${complaintId}?success=Updated+successfully!`);
});

// ─── MY TASK HISTORY ──────────────────────────────────────────────────────────
router.get('/history', (req, res) => {
  const db = getDB();
  const resolved = db.prepare(`
    SELECT c.*, u.full_name as student_name, f.rating, f.comment
    FROM complaints c
    JOIN users u ON c.submitted_by = u.id
    LEFT JOIN feedback f ON c.id = f.complaint_id
    WHERE c.assigned_to = ? AND c.status IN ('resolved','closed')
    ORDER BY c.actual_fix_time DESC
  `).all(req.session.userId);

  res.render('technician/history', { title: 'Task History', resolved, user: req.session });
});

// ─── NOTIFICATIONS ─────────────────────────────────────────────────────────────
router.get('/notifications', (req, res) => {
  const db = getDB();
  db.prepare('UPDATE notifications SET is_read = 1 WHERE user_id = ?').run(req.session.userId);
  const notifs = db.prepare(`
    SELECT n.*, c.title as complaint_title FROM notifications n
    LEFT JOIN complaints c ON n.complaint_id = c.id
    WHERE n.user_id = ? ORDER BY n.created_at DESC LIMIT 50
  `).all(req.session.userId);
  res.render('technician/notifications', { title: 'Notifications', notifs, user: req.session });
});

module.exports = router;

