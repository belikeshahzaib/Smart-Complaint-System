// middleware/auth.js
function requireLogin(req, res, next) {
  if (req.session && req.session.userId) return next();
  req.session.returnTo = req.originalUrl;
  res.redirect('/login?error=Please+log+in+to+continue');
}

function requireStudent(req, res, next) {
  if (req.session && req.session.role === 'student') return next();
  res.redirect('/login?error=Access+denied');
}

function requireTechnician(req, res, next) {
  if (req.session && req.session.role === 'technician') return next();
  res.redirect('/login?error=Access+denied');
}

function requireAdmin(req, res, next) {
  if (req.session && req.session.role === 'admin') return next();
  res.redirect('/login?error=Admin+access+required');
}

function redirectIfLoggedIn(req, res, next) {
  if (req.session && req.session.userId) {
    const role = req.session.role;
    if (role === 'student') return res.redirect('/student/dashboard');
    if (role === 'technician') return res.redirect('/technician/dashboard');
    if (role === 'admin') return res.redirect('/admin/dashboard');
  }
  next();
}

module.exports = { requireLogin, requireStudent, requireTechnician, requireAdmin, redirectIfLoggedIn };