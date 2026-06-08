
# 🚀 Smart Complaint System — Setup Guide
**FAST NUCES | Areeba Imran (24K-0005) & Shahzaib Zaheer (24K-0040)**

---

## 📦 What is Node.js?

**Node.js** is a JavaScript runtime — it lets you run JavaScript *outside* the browser, on your computer/server.
Think of it like Python but for JavaScript. You write `.js` files and run them with `node filename.js`.

**Express.js** is a web framework for Node.js (like Flask is for Python).

You write NO `.py` files here. Everything is `.js` (backend) and `.ejs` (HTML templates).

---

## ⚙️ STEP 1 — Install Node.js

1. Go to: https://nodejs.org
2. Download the **LTS version** (e.g. 20.x)
3. Install it (just click Next → Next → Finish)
4. Verify by opening **Command Prompt** (Windows) or **Terminal** (Mac/Linux) and typing:

```
node --version
npm --version
```

Both should print version numbers like `v20.x.x` and `10.x.x`

---

## 📁 STEP 2 — Set Up the Project

1. Copy the entire `complaint-system` folder to somewhere on your computer  
   (e.g. `C:\Users\YourName\Desktop\complaint-system`)

2. Open **Command Prompt** and navigate to the folder:

```
cd C:\Users\YourName\Desktop\complaint-system
```

---

## 📥 STEP 3 — Install Dependencies

This installs all required packages (Express, SQLite, bcrypt, etc.):

```
npm install
```

This reads `package.json` and installs everything into a `node_modules` folder.  
Wait for it to finish (may take 30-60 seconds).

---

## ▶️ STEP 4 — Run the App

```
node server.js
```

You should see:
```
╔══════════════════════════════════════════════════════╗
║   Smart Complaint & Service Management System        ║
║   FAST NUCES - Areeba Imran & Shahzaib Zaheer        ║
╠══════════════════════════════════════════════════════╣
║   Server running at: http://localhost:3000           ║
╚══════════════════════════════════════════════════════╝
```

---

## 🌐 STEP 5 — Open in Browser

Open any browser and go to:  
**http://localhost:3000**

You'll see the home page! 🎉

---

## 🔄 STEP 6 — Stop the Server

Press `Ctrl + C` in the terminal to stop it.

---

## 🛠️ Development Mode (Auto-restart)

Instead of stopping and restarting every time you make changes, use:

```
npm run dev
```

This uses **nodemon** which watches for file changes and auto-restarts the server.

---

## 📂 File Structure Explained

```
complaint-system/
│
├── server.js              ← ENTRY POINT. Run this file. Sets up the app.
│
├── package.json           ← Lists all dependencies (like requirements.txt in Python)
│
├── db/
│   └── database.js        ← Database setup. Creates all SQLite tables automatically.
│
├── middleware/
│   └── auth.js            ← Login-check functions (protects pages)
│
├── routes/
│   ├── auth.js            ← /login, /signup, /logout pages
│   ├── student.js         ← /student/dashboard, /student/submit, etc.
│   └── technician.js      ← /technician/dashboard, /technician/complaint/:id, etc.
│
├── views/                 ← HTML templates (EJS = HTML + JavaScript)
│   ├── partials/
│   │   ├── header.ejs     ← Navigation bar (included in every page)
│   │   └── footer.ejs     ← Footer (included in every page)
│   ├── home.ejs           ← Landing page
│   ├── about.ejs          ← About page
│   ├── 404.ejs            ← 404 error page
│   ├── auth/
│   │   ├── login.ejs      ← Login form
│   │   └── signup.ejs     ← Signup form
│   ├── student/
│   │   ├── dashboard.ejs      ← Student home after login
│   │   ├── submit.ejs         ← Submit complaint form
│   │   ├── my-complaints.ejs  ← List of student's complaints
│   │   └── complaint-detail.ejs ← Single complaint + feedback
│   └── technician/
│       ├── dashboard.ejs      ← Technician home, sees all open complaints
│       ├── complaint-detail.ejs ← Update status + estimated time
│       └── resolved.ejs       ← All resolved complaints
│
└── public/
    └── css/
        └── style.css      ← All styling for the website
```

---

## 🗄️ Database

- SQLite database file is created at `db/complaints.db` automatically on first run
- You don't need to install or configure anything for the database
- Tables created automatically: `users`, `complaints`, `feedback`, `activity_log`

To view the database, you can install **DB Browser for SQLite**: https://sqlitebrowser.org/

---

## 🔑 How to Test

1. Go to http://localhost:3000
2. Click **Sign Up** → create a **Student** account
3. Log in as student → submit a complaint
4. Sign up again → create a **Technician** account  
5. Log in as technician → see the complaint in dashboard → click "Take It"
6. Set an estimated fix time → update status to "In Progress" → then "Resolved"
7. Log back in as student → view complaint → rate the service ⭐

---

## ❓ Common Issues

**"node is not recognized"** → Node.js not installed properly. Re-install from nodejs.org

**"Cannot find module 'express'"** → Run `npm install` first

**Port 3000 already in use** → Change PORT in server.js: `const PORT = 3001`

**Cannot connect to database** → Make sure the `db/` folder exists

---

## 📝 Notes for Submission

- **Language**: JavaScript (Node.js)
- **Framework**: Express.js
- **Database**: SQLite3 (via better-sqlite3)
- **Template Engine**: EJS
- **Authentication**: Session-based with bcrypt password hashing
- **No external APIs** required
- Runs 100% locally — no internet needed after `npm install`
=======
# Smart-Complaint-System
>>>>>>> 3d644fced0dd16cbc5f1257bf176be2203f6cacb
