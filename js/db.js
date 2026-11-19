// ============================================================
// db.js — API-backed data layer (replaces localStorage)
// Reads from server cache; writes go to server in background.
// All public methods stay SYNCHRONOUS so other modules need
// no changes — syncAll() must be awaited once at startup.
// ============================================================

const DB = {
  _c: {}, // in-memory cache

  // ── Bootstrap: load all collections from server ──────────
  async syncAll() {
    const cols = ['employees','attendance','assets','assetAssignments',
      'leaves','leaveBalances','payrolls','advances','bonusRecords',
      'ltaRecords','leaveEncashments','holidays','approvalLevels',
      'departments','designations','salaryRevisions'];
    try {
      const results = await Promise.all(cols.map(c =>
        fetch(`/api/${c}`).then(r => r.ok ? r.json() : []).catch(() => [])
      ));
      cols.forEach((c, i) => { this._c[c] = results[i]; });
      this._c.settings = await fetch('/api/settings').then(r => r.json()).catch(() => ({}));
    } catch (e) {
      console.error('DB.syncAll failed — running offline:', e);
    }
  },

  // ── Internal push helpers ─────────────────────────────────
  _push(col, item) {
    // Update cache immediately
    const all = this._c[col] || [];
    const idx = all.findIndex(x => x.id === item.id);
    if (idx >= 0) all[idx] = item; else all.push(item);
    this._c[col] = all;
    // Persist to server (fire and forget)
    fetch(`/api/${col}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(item)
    }).catch(e => console.error(`DB._push ${col}:`, e));
  },

  _pushAll(col, arr) {
    this._c[col] = arr;
    fetch(`/api/${col}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(arr)
    }).catch(e => console.error(`DB._pushAll ${col}:`, e));
  },

  _del(col, id) {
    this._c[col] = (this._c[col] || []).filter(x => x.id !== id);
    fetch(`/api/${col}/${id}`, { method: 'DELETE' })
      .catch(e => console.error(`DB._del ${col}/${id}:`, e));
  },

  // ── Employees ──────────────────────────────────────────────
  getEmployees()       { return this._c.employees || []; },
  saveEmployees(arr)   { this._pushAll('employees', arr); },
  getEmployee(id)      { return this.getEmployees().find(e => e.id === id) || null; },
  upsertEmployee(emp)  { this._push('employees', emp); },
  deleteEmployee(id)   { this._del('employees', id); },
  nextEmpCode() {
    const all  = this.getEmployees();
    if (!all.length) return 'EMP001';
    const nums = all.map(e => parseInt((e.empCode || 'EMP000').replace(/\D/g, ''), 10)).filter(Boolean);
    return 'EMP' + String(Math.max(...nums) + 1).padStart(3, '0');
  },

  // ── Attendance ─────────────────────────────────────────────
  getAttendance()          { return this._c.attendance || []; },
  saveAttendance(arr)      { this._pushAll('attendance', arr); },
  getAttByEmpDate(empId, date) {
    return this.getAttendance().find(a => a.empId === empId && a.date === date) || null;
  },
  getAttByMonth(empId, year, month) {
    const m = String(month).padStart(2, '0');
    return this.getAttendance().filter(a => a.empId === empId && a.date.startsWith(`${year}-${m}`));
  },
  upsertAttendance(rec) { this._push('attendance', rec); },

  // ── Assets ─────────────────────────────────────────────────
  getAssets()          { return this._c.assets || []; },
  saveAssets(arr)      { this._pushAll('assets', arr); },
  getAsset(id)         { return this.getAssets().find(a => a.id === id) || null; },
  upsertAsset(asset)   { this._push('assets', asset); },
  getAssetAssignments() { return this._c.assetAssignments || []; },
  saveAssetAssignments(arr) { this._pushAll('assetAssignments', arr); },
  getAssetsByEmp(empId) {
    const assignments = this.getAssetAssignments().filter(a => a.empId === empId && a.status === 'active');
    return assignments.map(a => ({ ...this.getAsset(a.assetId), assignment: a }));
  },
  upsertAssetAssignment(asgn) { this._push('assetAssignments', asgn); },
  nextAssetCode() {
    const all  = this.getAssets();
    if (!all.length) return 'AST001';
    const nums = all.map(a => parseInt((a.assetCode || 'AST000').replace(/\D/g, ''), 10)).filter(Boolean);
    return 'AST' + String(Math.max(...nums) + 1).padStart(3, '0');
  },

  // ── Leaves ────────────────────────────────────────────────
  getLeaves()          { return this._c.leaves || []; },
  saveLeaves(arr)      { this._pushAll('leaves', arr); },
  getLeave(id)         { return this.getLeaves().find(l => l.id === id) || null; },
  upsertLeave(lv)      { this._push('leaves', lv); },
  getLeavesByEmp(empId){ return this.getLeaves().filter(l => l.empId === empId); },
  getPendingLeaves()   { return this.getLeaves().filter(l => l.status === 'pending'); },

  // ── Leave Balances ────────────────────────────────────────
  getLeaveBalances()   { return this._c.leaveBalances || []; },
  saveLeaveBalances(arr) { this._pushAll('leaveBalances', arr); },
  getLeaveBalance(empId, year) {
    return this.getLeaveBalances().find(b => b.empId === empId && b.year === year) || null;
  },
  upsertLeaveBalance(bal) { this._push('leaveBalances', bal); },
  initLeaveBalance(emp, year) {
    const existing = this.getLeaveBalance(emp.id, year);
    if (existing) return existing;
    const entitlement = emp.leaveEntitlement || 30;
    const cl = Math.round(entitlement * 0.33);
    const sl = Math.round(entitlement * 0.17);
    const el = entitlement - cl - sl;
    const bal = {
      id: `lb_${emp.id}_${year}`,
      empId: emp.id, year,
      casual:  { entitled: cl, used: 0, balance: cl },
      sick:    { entitled: sl, used: 0, balance: sl },
      earned:  { entitled: el, used: 0, balance: el }
    };
    this.upsertLeaveBalance(bal);
    return bal;
  },

  // ── Payroll ───────────────────────────────────────────────
  getPayrolls()        { return this._c.payrolls || []; },
  savePayrolls(arr)    { this._pushAll('payrolls', arr); },
  getPayroll(empId, month, year) {
    return this.getPayrolls().find(p => p.empId === empId && p.month === month && p.year === year) || null;
  },
  upsertPayroll(pr)    { this._push('payrolls', pr); },

  // ── Advances ─────────────────────────────────────────────
  getAdvances()        { return this._c.advances || []; },
  saveAdvances(arr)    { this._pushAll('advances', arr); },
  getAdvance(id)       { return this.getAdvances().find(a => a.id === id) || null; },
  upsertAdvance(adv)   { this._push('advances', adv); },
  getPendingAdvances() { return this.getAdvances().filter(a => a.status === 'pending'); },
  getAdvancesByEmp(empId) { return this.getAdvances().filter(a => a.empId === empId); },

  // ── Approval Levels ──────────────────────────────────────
  getApprovalLevels()  { return this._c.approvalLevels || []; },
  saveApprovalLevels(arr) { this._pushAll('approvalLevels', arr); },
  getApprovalLevel(module) {
    return this.getApprovalLevels().find(a => a.module === module) || { module, levels: [] };
  },

  // ── Holidays ─────────────────────────────────────────────
  getHolidays()        { return this._c.holidays || []; },
  saveHolidays(arr)    { this._pushAll('holidays', arr); },
  isHoliday(date)      { return this.getHolidays().some(h => h.date === date); },

  // ── Settings ─────────────────────────────────────────────
  getSettings()        { return this._c.settings || {}; },
  saveSettings(obj)    {
    this._c.settings = obj;
    fetch('/api/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(obj)
    }).catch(e => console.error('DB.saveSettings:', e));
  },
  getSetting(key, def = '') {
    const s = this.getSettings();
    return s[key] !== undefined ? s[key] : def;
  },
  setSetting(key, val) {
    const s = this.getSettings();
    s[key] = val;
    this.saveSettings(s);
  },

  // ── Bonus Register ───────────────────────────────────────
  getBonusRecords()    { return this._c.bonusRecords || []; },
  saveBonusRecords(arr){ this._pushAll('bonusRecords', arr); },
  upsertBonusRecord(rec){ this._push('bonusRecords', rec); },

  // ── LTA Register ─────────────────────────────────────────
  getLTARecords()      { return this._c.ltaRecords || []; },
  saveLTARecords(arr)  { this._pushAll('ltaRecords', arr); },
  upsertLTARecord(rec) { this._push('ltaRecords', rec); },

  // ── Leave Encashment ─────────────────────────────────────
  getLeaveEncashments(){ return this._c.leaveEncashments || []; },
  saveLeaveEncashments(arr){ this._pushAll('leaveEncashments', arr); },
  upsertLeaveEncashment(rec){ this._push('leaveEncashments', rec); },

  // ── Salary Revisions ─────────────────────────────────────
  getSalaryRevisions()      { return this._c.salaryRevisions || []; },
  saveSalaryRevisions(arr)  { this._pushAll('salaryRevisions', arr); },
  upsertSalaryRevision(r)   { this._push('salaryRevisions', r); },
  getSalaryRevsByEmp(empId) { return this.getSalaryRevisions().filter(r => r.empId === empId).sort((a,b) => b.effectiveDate > a.effectiveDate ? 1 : -1); },

  // ── Departments & Designations ────────────────────────────
  getDepartments() {
    return (this._c.departments || []).length
      ? this._c.departments
      : ['Administration','Accounts','HR','Operations','Projects','IT','Procurement','Design','Legal','Management'];
  },
  saveDepartments(arr) { this._pushAll('departments', arr); },
  getDesignations() {
    return (this._c.designations || []).length
      ? this._c.designations
      : ['Director','GM','AGM','Manager','Asst. Manager','Sr. Engineer','Engineer','Sr. Executive','Executive','Jr. Executive','Accountant','Sr. Accountant','Supervisor','Helper','Peon','Driver'];
  },
  saveDesignations(arr){ this._pushAll('designations', arr); },
};

// ── Utility helpers (unchanged) ───────────────────────────────
function uuid() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0;
    return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
  });
}
function today()           { return new Date().toISOString().slice(0, 10); }
function fmtDate(d)        { if (!d) return ''; const p = d.split('-'); return p.length === 3 ? `${p[2]}/${p[1]}/${p[0]}` : d; }
function monthName(m)      { return ['','January','February','March','April','May','June','July','August','September','October','November','December'][+m] || ''; }
function daysInMonth(y, m) { return new Date(y, m, 0).getDate(); }
function calcDays(from, to){ if (!from || !to) return 0; const d1 = new Date(from), d2 = new Date(to); return Math.max(0, Math.round((d2 - d1) / 86400000) + 1); }
function calcAge(dob)      { if (!dob) return ''; const d = new Date(dob), n = new Date(); let a = n.getFullYear() - d.getFullYear(); if (n.getMonth() < d.getMonth() || (n.getMonth() === d.getMonth() && n.getDate() < d.getDate())) a--; return a; }
function fmt2(n)           { return String(n).padStart(2, '0'); }
function currFmt(n)        { return '₹' + Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 }); }
function numFmt(n)         { return Number(n || 0).toFixed(2); }
