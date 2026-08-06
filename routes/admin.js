// routes/admin.js
// Full admin panel: view all complaints, assign technicians, manage users, stats

const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const { getDB, CATEGORY_TO_SPECIALIZATION } = require('../db/database');
const { requireAdmin } = require('../middleware/auth');

router.use(requireAdmin);

// Helper to send a notification
function notify(db, userId, complaintId, message) {
    db.prepare('INSERT INTO notifications (user_id, complaint_id, message) VALUES (?, ?, ?)').run(userId, complaintId, message);
}

// ─── DASHBOARD ────────────────────────────────────────────────────────────────
router.get('/dashboard', (req, res) => {
    const db = getDB();

    const stats = db.prepare(`
    SELECT
      COUNT(*) as total,
      SUM(CASE WHEN status = 'open' THEN 1 ELSE 0 END) as open_count,
      SUM(CASE WHEN status = 'assigned' THEN 1 ELSE 0 END) as assigned_count,
      SUM(CASE WHEN status = 'in_progress' THEN 1 ELSE 0 END) as in_progress_count,
      SUM(CASE WHEN status IN ('resolved','closed') THEN 1 ELSE 0 END) as resolved_count,
      SUM(CASE WHEN status = 'cancelled' THEN 1 ELSE 0 END) as cancelled_count,
      SUM(CASE WHEN priority = 'urgent' AND status NOT IN ('resolved','closed','cancelled') THEN 1 ELSE 0 END) as urgent_open
    FROM complaints
  `).get();

    const recentComplaints = db.prepare(`
    SELECT c.*, u.full_name as student_name, t.full_name as tech_name
    FROM complaints c
    JOIN users u ON c.submitted_by = u.id
    LEFT JOIN users t ON c.assigned_to = t.id
    ORDER BY c.created_at DESC LIMIT 8
  `).all();

    const techStats = db.prepare(`
    SELECT u.full_name, u.technician_type, u.is_available,
      COUNT(c.id) as active_complaints
    FROM users u
    LEFT JOIN complaints c ON c.assigned_to = u.id AND c.status IN ('assigned','in_progress')
    WHERE u.role = 'technician'
    GROUP BY u.id
    ORDER BY active_complaints DESC
    LIMIT 6
  `).all();

    const categoryBreakdown = db.prepare(`
    SELECT category, COUNT(*) as cnt FROM complaints
    WHERE status NOT IN ('resolved','closed','cancelled')
    GROUP BY category ORDER BY cnt DESC
  `).all();

    res.render('admin/dashboard', {
        title: 'Admin Dashboard',
        stats,
        recentComplaints,
        techStats,
        categoryBreakdown,
        user: req.session
    });
});

// ─── ALL COMPLAINTS ────────────────────────────────────────────────────────────
router.get('/complaints', (req, res) => {
    const db = getDB();
    const { status, category, priority, search } = req.query;

    let query = `
    SELECT c.*, u.full_name as student_name, t.full_name as tech_name, t.technician_type
    FROM complaints c
    JOIN users u ON c.submitted_by = u.id
    LEFT JOIN users t ON c.assigned_to = t.id
    WHERE 1=1
  `;
    const params = [];

    if (status) { query += ' AND c.status = ?'; params.push(status); }
    if (category) { query += ' AND c.category = ?'; params.push(category); }
    if (priority) { query += ' AND c.priority = ?'; params.push(priority); }
    if (search) { query += ' AND (c.title LIKE ? OR u.full_name LIKE ? OR c.location LIKE ?)'; params.push(`%${search}%`, `%${search}%`, `%${search}%`); }

    // FIXED: Changed double quotes to single quotes for SQL string literals ('urgent', etc.)
    query += " ORDER BY CASE c.priority WHEN 'urgent' THEN 1 WHEN 'high' THEN 2 WHEN 'medium' THEN 3 ELSE 4 END, c.created_at DESC";

    const complaints = db.prepare(query).all(...params);

    res.render('admin/complaints', {
        title: 'All Complaints',
        complaints,
        filters: { status, category, priority, search },
        user: req.session,
        success: req.query.success || null,
        error: req.query.error || null
    });
});

// ─── ASSIGN COMPLAINT PAGE ─────────────────────────────────────────────────────
router.get('/assign/:id', (req, res) => {
    const db = getDB();
    const complaint = db.prepare(`
    SELECT c.*, u.full_name as student_name, u.email as student_email
    FROM complaints c JOIN users u ON c.submitted_by = u.id
    WHERE c.id = ?
  `).get(req.params.id);

    if (!complaint) return res.redirect('/admin/complaints?error=Complaint+not+found');

    const requiredType = CATEGORY_TO_SPECIALIZATION[complaint.category] || 'general';
    const technicians = db.prepare(`
    SELECT u.*, COUNT(c.id) as active_count
    FROM users u
    LEFT JOIN complaints c ON c.assigned_to = u.id AND c.status IN ('assigned','in_progress')
    WHERE u.role = 'technician' AND u.technician_type = ?
    GROUP BY u.id
    ORDER BY u.is_available DESC, active_count ASC
  `).all(requiredType);

    const generalTechs = db.prepare(`
    SELECT u.*, COUNT(c.id) as active_count
    FROM users u
    LEFT JOIN complaints c ON c.assigned_to = u.id AND c.status IN ('assigned','in_progress')
    WHERE u.role = 'technician' AND u.technician_type = 'general' AND u.technician_type != ?
    GROUP BY u.id
    ORDER BY u.is_available DESC, active_count ASC
  `).all(requiredType);

    res.render('admin/assign', {
        title: 'Assign Complaint',
        complaint,
        technicians,
        generalTechs,
        requiredType,
        user: req.session,
        error: req.query.error || null
    });
});

// ─── DO ASSIGN ─────────────────────────────────────────────────────────────────
router.post('/assign/:id', [
    body('technician_id').notEmpty().withMessage('Please select a technician'),
    body('deadline').optional({ checkFalsy: true }).isISO8601(),
    body('admin_notes').optional().trim()
], (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.redirect(`/admin/assign/${req.params.id}?error=${encodeURIComponent(errors.array()[0].msg)}`);
    }

    const db = getDB();
    const { technician_id, deadline, admin_notes } = req.body;
    const complaintId = req.params.id;

    const complaint = db.prepare('SELECT * FROM complaints WHERE id = ?').get(complaintId);
    const tech = db.prepare('SELECT * FROM users WHERE id = ? AND role = ?').get(technician_id, 'technician');

    if (!complaint || !tech) return res.redirect('/admin/complaints?error=Invalid+assignment');

    db.prepare(`
    UPDATE complaints SET
      assigned_to = ?, assigned_by = ?, status = 'assigned',
      deadline = ?, admin_notes = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(technician_id, req.session.userId, deadline || null, admin_notes || null, complaintId);

    db.prepare('INSERT INTO activity_log (user_id, complaint_id, action, details) VALUES (?, ?, ?, ?)').run(
        req.session.userId, complaintId, 'ADMIN_ASSIGNED',
        `Assigned to ${tech.full_name} (${tech.technician_type}). Deadline: ${deadline || 'none'}`
    );

    notify(db, technician_id, complaintId,
        `You have been assigned complaint #${complaintId}: "${complaint.title}" at ${complaint.location}.`);

    notify(db, complaint.submitted_by, complaintId,
        `Your complaint #${complaintId} has been assigned to ${tech.full_name}. Status: Assigned.`);

    res.redirect(`/admin/complaints?success=Complaint+#${complaintId}+assigned+to+${encodeURIComponent(tech.full_name)}`);
});

// ─── UPDATE PRIORITY / STATUS ─────────────────────────────────────────────────
router.post('/update/:id', (req, res) => {
    const db = getDB();
    const { priority, status, admin_notes } = req.body;
    const complaintId = req.params.id;

    const complaint = db.prepare('SELECT * FROM complaints WHERE id = ?').get(complaintId);
    if (!complaint) return res.redirect('/admin/complaints');

    const updates = [];
    const params = [];
    if (priority) { updates.push('priority = ?'); params.push(priority); }
    if (status) { updates.push('status = ?'); params.push(status); }
    if (admin_notes !== undefined) { updates.push('admin_notes = ?'); params.push(admin_notes); }
    updates.push('updated_at = CURRENT_TIMESTAMP');
    params.push(complaintId);

    db.prepare(`UPDATE complaints SET ${updates.join(', ')} WHERE id = ?`).run(...params);

    db.prepare('INSERT INTO activity_log (user_id, complaint_id, action, details) VALUES (?, ?, ?, ?)').run(
        req.session.userId, complaintId, 'ADMIN_UPDATE',
        `Admin updated: priority=${priority || '—'} status=${status || '—'}`
    );

    if (complaint.submitted_by) {
        notify(db, complaint.submitted_by, complaintId,
            `Your complaint #${complaintId} has been updated by admin. Priority: ${priority || complaint.priority}, Status: ${status || complaint.status}.`);
    }

    res.redirect(`/admin/complaints?success=Complaint+#${complaintId}+updated`);
});

// ─── CANCEL COMPLAINT ─────────────────────────────────────────────────────────
router.post('/cancel/:id', (req, res) => {
    const db = getDB();
    const complaintId = req.params.id;
    const complaint = db.prepare('SELECT * FROM complaints WHERE id = ?').get(complaintId);
    if (!complaint) return res.redirect('/admin/complaints');

    db.prepare(`UPDATE complaints SET status = 'cancelled', updated_at = CURRENT_TIMESTAMP WHERE id = ?`).run(complaintId);
    db.prepare('INSERT INTO activity_log (user_id, complaint_id, action, details) VALUES (?, ?, ?, ?)').run(
        req.session.userId, complaintId, 'ADMIN_CANCELLED', `Complaint cancelled by admin. Reason: ${req.body.reason || 'none'}`
    );

    notify(db, complaint.submitted_by, complaintId,
        `Your complaint #${complaintId} "${complaint.title}" has been cancelled by admin.`);

    res.redirect('/admin/complaints?success=Complaint+cancelled');
});

// ─── USER MANAGEMENT ─────────────────────────────────────────────────────────
router.get('/users', (req, res) => {
    const db = getDB();
    const { role, search } = req.query;

    let query = 'SELECT u.*, COUNT(c.id) as complaint_count FROM users u LEFT JOIN complaints c ON c.submitted_by = u.id OR c.assigned_to = u.id WHERE 1=1';
    const params = [];
    if (role) { query += ' AND u.role = ?'; params.push(role); }
    if (search) { query += ' AND (u.full_name LIKE ? OR u.email LIKE ?)'; params.push(`%${search}%`, `%${search}%`); }
    query += ' GROUP BY u.id ORDER BY u.created_at DESC';

    const users = db.prepare(query).all(...params);

    res.render('admin/users', {
        title: 'Manage Users',
        users,
        filters: { role, search },
        user: req.session,
        success: req.query.success || null
    });
});

router.post('/users/:id/toggle-availability', (req, res) => {
    const db = getDB();
    const user = db.prepare('SELECT * FROM users WHERE id = ? AND role = ?').get(req.params.id, 'technician');
    if (!user) return res.redirect('/admin/users');
    db.prepare('UPDATE users SET is_available = ? WHERE id = ?').run(user.is_available ? 0 : 1, user.id);
    res.redirect('/admin/users?success=Availability+updated');
});

// ─── REPORTS / STATS ──────────────────────────────────────────────────────────
router.get('/reports', (req, res) => {
    const db = getDB();

    const byCategory = db.prepare(`SELECT category, COUNT(*) as total,
    SUM(CASE WHEN status IN ('resolved','closed') THEN 1 ELSE 0 END) as resolved
    FROM complaints GROUP BY category`).all();

    const byPriority = db.prepare(`SELECT priority, COUNT(*) as total FROM complaints GROUP BY priority`).all();

    const byStatus = db.prepare(`SELECT status, COUNT(*) as total FROM complaints GROUP BY status`).all();

    const topTechs = db.prepare(`
    SELECT u.full_name, u.technician_type,
      COUNT(c.id) as total_handled,
      SUM(CASE WHEN c.status IN ('resolved','closed') THEN 1 ELSE 0 END) as resolved,
      ROUND(AVG(f.rating), 1) as avg_rating
    FROM users u
    LEFT JOIN complaints c ON c.assigned_to = u.id
    LEFT JOIN feedback f ON f.complaint_id = c.id
    WHERE u.role = 'technician'
    GROUP BY u.id ORDER BY total_handled DESC LIMIT 10
  `).all();

    const monthlyTrend = db.prepare(`
    SELECT strftime('%Y-%m', created_at) as month, COUNT(*) as total
    FROM complaints GROUP BY month ORDER BY month DESC LIMIT 6
  `).all();

    res.render('admin/reports', {
        title: 'Reports & Statistics',
        byCategory, byPriority, byStatus, topTechs, monthlyTrend,
        user: req.session
    });
});

// ─── NOTIFICATIONS PAGE ────────────────────────────────────────────────────────
router.get('/notifications', (req, res) => {
    const db = getDB();
    db.prepare('UPDATE notifications SET is_read = 1 WHERE user_id = ?').run(req.session.userId);
    const notifs = db.prepare(`
    SELECT n.*, c.title as complaint_title FROM notifications n
    LEFT JOIN complaints c ON n.complaint_id = c.id
    WHERE n.user_id = ? ORDER BY n.created_at DESC LIMIT 50
  `).all(req.session.userId);
    res.render('admin/notifications', { title: 'Notifications', notifs, user: req.session });
});

module.exports = router;