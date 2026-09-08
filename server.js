const express = require("express");
const session = require("express-session");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const app = express();
const PORT = Number(process.env.PORT || 3000);
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, "data");
const DB_FILE = path.join(DATA_DIR, "db.json");
const TIME_ZONE = process.env.APP_TIMEZONE || "America/Argentina/Buenos_Aires";
const OWNER_EMAIL = (process.env.OWNER_EMAIL || "").trim().toLowerCase();
const SESSION_SECRET = process.env.SESSION_SECRET || crypto.randomBytes(32).toString("hex");
const BASE_URL = (process.env.BASE_URL || "").replace(/\/+$/, "");

fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(DB_FILE)) fs.writeFileSync(DB_FILE, JSON.stringify({users:[], hours:{}, logs:[]}, null, 2));

function readDb() {
  try {
    const db = JSON.parse(fs.readFileSync(DB_FILE, "utf8"));
    db.users ||= []; db.hours ||= {}; db.logs ||= [];
    return db;
  } catch {
    return { users: [], hours: {}, logs: [] };
  }
}
let db = readDb();

function saveDb() {
  const tmp = `${DB_FILE}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(db, null, 2));
  fs.renameSync(tmp, DB_FILE);
}

function cleanEmail(v) {
  return String(v || "").trim().toLowerCase();
}
function uid() {
  return crypto.randomUUID();
}
function nowIso() {
  return new Date().toISOString();
}
function log(action, actorEmail, details = {}) {
  db.logs.unshift({ id: uid(), action, actorEmail, details, at: nowIso() });
  db.logs = db.logs.slice(0, 500);
}
function currentUser(req) {
  return req.session.user || null;
}
function allowedEmail(email) {
  const e = cleanEmail(email);
  return e === OWNER_EMAIL || db.users.some(u => u.email === e);
}
function accessRole(email) {
  const e = cleanEmail(email);
  if (e === OWNER_EMAIL) return "OWNER";
  return db.users.find(u => u.email === e)?.accessRole || null;
}
function requireAuth(req, res, next) {
  if (!currentUser(req)) return res.status(401).json({error:"AUTH_REQUIRED"});
  next();
}
function requireRole(...roles) {
  return (req, res, next) => {
    if (!currentUser(req)) return res.status(401).json({error:"AUTH_REQUIRED"});
    const role = accessRole(req.session.user.email);
    if (!roles.includes(role)) return res.status(403).json({error:"FORBIDDEN"});
    next();
  };
}

function zonedParts(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: TIME_ZONE, year:"numeric", month:"2-digit", day:"2-digit",
    hour:"2-digit", minute:"2-digit", second:"2-digit", hour12:false
  }).formatToParts(date);
  const o = {};
  for (const p of parts) if (p.type !== "literal") o[p.type] = p.value;
  return o;
}
function isoLocalDate(date = new Date()) {
  const p = zonedParts(date);
  return `${p.year}-${p.month}-${p.day}`;
}
function dateObjFromIso(s) {
  const [y,m,d] = s.split("-").map(Number);
  return new Date(Date.UTC(y,m-1,d,12));
}
function weekDates(baseDate = new Date()) {
  const localIso = isoLocalDate(baseDate);
  const d = dateObjFromIso(localIso);
  const day = d.getUTCDay(); // Sun=0 ... Sat=6
  const sinceSat = (day + 1) % 7;
  d.setUTCDate(d.getUTCDate() - sinceSat);
  return Array.from({length:7}, (_,i) => {
    const x = new Date(d); x.setUTCDate(d.getUTCDate()+i);
    return x.toISOString().slice(0,10);
  });
}
function parseDuration(text) {
  const m = String(text || "").trim().match(/^(\d+):(\d{1,2})$/);
  if (!m) return null;
  const h = Number(m[1]), min = Number(m[2]);
  if (!Number.isSafeInteger(h) || !Number.isSafeInteger(min) || h < 0 || min < 0 || h > 9999 || min > 99) return null;
  return h * 60 + min; // intentionally permits 1:67
}
function formatDuration(minutes) {
  minutes = Math.max(0, Math.round(Number(minutes) || 0));
  return `${Math.floor(minutes/60)}:${String(minutes%60).padStart(2,"0")}`;
}
function rateFor(rank) {
  if (["SDP","SP","SE"].includes(rank)) return 1000000;
  if (["MOD","MOD+","MOD++"].includes(rank)) return 1500000;
  if (["ADM","ADM+","ADM++"].includes(rank)) return 2000000;
  return 0;
}
const STAFF_RANKS = {
  HIGH: ["ADM","ADM+","ADM++"],
  MID: ["MOD","MOD+","MOD++"],
  LOW: ["SDP","SP","SE"]
};
const RANK_CATEGORY = Object.fromEntries(
  Object.entries(STAFF_RANKS).flatMap(([cat, ranks]) => ranks.map(r => [r, cat]))
);

function sanitizeUser(u) {
  return {
    id:u.id, email:u.email, name:u.name || u.email.split("@")[0],
    accessRole:u.accessRole || "VIEWER",
    staffRank:u.staffRank || "SDP",
    notes:u.notes || "",
    createdAt:u.createdAt, updatedAt:u.updatedAt
  };
}

app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false
}));
app.use(express.json({limit:"100kb"}));
app.use(express.urlencoded({extended:false}));
app.use(session({
  name:"imperio.sid",
  secret:SESSION_SECRET,
  resave:false,
  saveUninitialized:false,
  cookie:{httpOnly:true, sameSite:"lax", secure:process.env.NODE_ENV==="production", maxAge:1000*60*60*24*7}
}));
app.use("/api", rateLimit({windowMs:60_000, limit:180, standardHeaders:true, legacyHeaders:false}));

app.get("/auth/google", (req,res) => {
  if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
    return res.status(500).send("Falta configurar GOOGLE_CLIENT_ID y GOOGLE_CLIENT_SECRET en Railway.");
  }
  const redirectUri = `${BASE_URL || `${req.protocol}://${req.get("host")}`}/auth/google/callback`;
  const params = new URLSearchParams({
    client_id:process.env.GOOGLE_CLIENT_ID,
    redirect_uri:redirectUri,
    response_type:"code",
    scope:"openid email profile",
    access_type:"online",
    prompt:"select_account"
  });
  res.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params}`);
});

app.get("/auth/google/callback", async (req,res) => {
  try {
    const code = String(req.query.code || "");
    if (!code) return res.redirect("/?error=oauth");
    const redirectUri = `${BASE_URL || `${req.protocol}://${req.get("host")}`}/auth/google/callback`;
    const tokenResp = await fetch("https://oauth2.googleapis.com/token", {
      method:"POST",
      headers:{"content-type":"application/x-www-form-urlencoded"},
      body:new URLSearchParams({
        code, client_id:process.env.GOOGLE_CLIENT_ID, client_secret:process.env.GOOGLE_CLIENT_SECRET,
        redirect_uri:redirectUri, grant_type:"authorization_code"
      })
    });
    const tokens = await tokenResp.json();
    if (!tokens.access_token) return res.redirect("/?error=oauth");
    const infoResp = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
      headers:{Authorization:`Bearer ${tokens.access_token}`}
    });
    const info = await infoResp.json();
    const email = cleanEmail(info.email);
    if (!email || info.verified_email !== true || !allowedEmail(email)) {
      req.session.destroy(() => res.redirect("/?denied=1"));
      return;
    }
    req.session.user = {email, name:info.name || email.split("@")[0], picture:info.picture || ""};
    res.redirect("/");
  } catch (e) {
    console.error(e);
    res.redirect("/?error=oauth");
  }
});

app.post("/auth/logout", requireAuth, (req,res) => {
  req.session.destroy(() => res.json({ok:true}));
});

app.get("/api/me", (req,res) => {
  const u = currentUser(req);
  if (!u) return res.status(401).json({authenticated:false});
  res.json({authenticated:true, user:u, accessRole:accessRole(u.email)});
});

app.get("/api/bootstrap", requireAuth, (req,res) => {
  const role = accessRole(req.session.user.email);
  const safeUsers = db.users.map(sanitizeUser);
  const current = weekDates();
  const hours = {};
  for (const u of db.users) {
    hours[u.id] = {};
    for (const day of current) hours[u.id][day] = db.hours[u.id]?.[day] || {minutes:0,status:"normal"};
  }
  res.json({
    me:req.session.user, accessRole:role, users:safeUsers, hours, dates:current,
    rates:{HIGH:2000000,MID:1500000,LOW:1000000},
    ranks:STAFF_RANKS,
    timeZone:TIME_ZONE
  });
});

app.post("/api/users", requireRole("OWNER"), (req,res) => {
  const email = cleanEmail(req.body.email);
  const name = String(req.body.name || email.split("@")[0]).trim().slice(0,80);
  const access = ["OWNER","EDITOR","VIEWER"].includes(req.body.accessRole) ? req.body.accessRole : "VIEWER";
  const staffRank = STAFF_RANKS.HIGH.includes(req.body.staffRank) || STAFF_RANKS.MID.includes(req.body.staffRank) || STAFF_RANKS.LOW.includes(req.body.staffRank)
    ? req.body.staffRank : "SDP";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({error:"EMAIL_INVALID"});
  if (email === OWNER_EMAIL) return res.status(409).json({error:"OWNER_ENV"});
  if (db.users.some(u=>u.email===email)) return res.status(409).json({error:"ALREADY_EXISTS"});
  const u = {id:uid(),email,name,accessRole:access,staffRank,notes:"",createdAt:nowIso(),updatedAt:nowIso()};
  db.users.push(u); log("USER_ADDED",req.session.user.email,{email,accessRole:access,staffRank}); saveDb();
  res.json({user:sanitizeUser(u)});
});

app.delete("/api/users/:id", requireRole("OWNER"), (req,res) => {
  const i = db.users.findIndex(u=>u.id===req.params.id);
  if (i<0) return res.status(404).json({error:"NOT_FOUND"});
  const [u] = db.users.splice(i,1);
  delete db.hours[u.id];
  log("USER_REMOVED",req.session.user.email,{email:u.email}); saveDb();
  res.json({ok:true});
});

app.patch("/api/users/:id", requireRole("OWNER"), (req,res) => {
  const u = db.users.find(x=>x.id===req.params.id);
  if (!u) return res.status(404).json({error:"NOT_FOUND"});
  if (req.body.name !== undefined) u.name = String(req.body.name).trim().slice(0,80) || u.name;
  if (req.body.notes !== undefined) u.notes = String(req.body.notes).slice(0,500);
  if (req.body.accessRole !== undefined) {
    if (!["EDITOR","VIEWER"].includes(req.body.accessRole)) return res.status(400).json({error:"ACCESS_ROLE_INVALID"});
    u.accessRole = req.body.accessRole;
  }
  if (req.body.staffRank !== undefined) {
    const r=String(req.body.staffRank);
    if (!RANK_CATEGORY[r]) return res.status(400).json({error:"STAFF_RANK_INVALID"});
    u.staffRank=r;
  }
  u.updatedAt=nowIso();
  log("USER_UPDATED",req.session.user.email,{email:u.email,changes:req.body}); saveDb();
  res.json({user:sanitizeUser(u)});
});

app.patch("/api/hours/:userId/:date", requireRole("OWNER","EDITOR"), (req,res) => {
  const u = db.users.find(x=>x.id===req.params.userId);
  if (!u) return res.status(404).json({error:"USER_NOT_FOUND"});
  const date = req.params.date;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return res.status(400).json({error:"DATE_INVALID"});
  const minutes = parseDuration(req.body.time);
  if (minutes === null) return res.status(400).json({error:"TIME_INVALID",message:"Usá H:MM; se permite 1:67."});
  const status = ["normal","inactive","justified","annulled"].includes(req.body.status) ? req.body.status : "normal";
  db.hours[u.id] ||= {};
  db.hours[u.id][date] = {minutes,status,updatedAt:nowIso(),updatedBy:req.session.user.email};
  log("HOURS_UPDATED",req.session.user.email,{userId:u.id,date,time:formatDuration(minutes),status}); saveDb();
  res.json({ok:true, entry:db.hours[u.id][date]});
});

app.get("/api/logs", requireRole("OWNER"), (req,res) => res.json({logs:db.logs.slice(0,100)}));

app.get("/api/export", requireRole("OWNER"), (req,res) => {
  res.setHeader("content-type","application/json");
  res.setHeader("content-disposition",'attachment; filename="imperio-staff-backup.json"');
  res.send(JSON.stringify(db,null,2));
});

app.use((req,res) => res.sendFile(path.join(__dirname,"public","index.html")));

app.listen(PORT, () => console.log(`Imperio RP Staff Horas running on ${PORT}`));
