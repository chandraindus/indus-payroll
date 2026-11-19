// ============================================================
// app.js — Main Application Controller
// ============================================================

const APP = {
  currentSection: 'dashboard',

  async init() {
    // Show loading overlay while syncing from server
    const overlay = document.getElementById('loadingOverlay');
    if (overlay) overlay.style.display = 'flex';
    try {
      await DB.syncAll();
    } catch(e) {
      console.error('Server sync failed:', e);
    }
    if (overlay) overlay.style.display = 'none';

    this.nav('dashboard');
    this.renderDashboard();
    // Set current year/month defaults for payroll
    const now = new Date();
    const moEl = document.getElementById('payMonth'); if (moEl) moEl.value = now.getMonth()+1;
    const yrEl = document.getElementById('payYear'); if (yrEl) yrEl.value = now.getFullYear();
    const leYr = document.getElementById('leaveYearFilter'); if (leYr) leYr.value = now.getFullYear();
    const balYr = document.getElementById('balRegYear'); if (balYr) balYr.value = now.getFullYear();
    const encYr = document.getElementById('encashYear'); if (encYr) encYr.value = now.getFullYear();
    const bonYr = document.getElementById('bonusYear'); if (bonYr) bonYr.value = now.getFullYear();
    const ltaYr = document.getElementById('ltaYear'); if (ltaYr) ltaYr.value = now.getFullYear();
    // Settings
    const cn = document.getElementById('setting_companyName'); if (cn) cn.value = DB.getSetting('companyName','Indus Projects Pvt. Ltd.');
    const ca = document.getElementById('setting_companyAddress'); if (ca) ca.value = DB.getSetting('companyAddress','');
    // Populate employee filters
    this.populateEmpFilters();
    // Set daily date
    const dd = document.getElementById('dailyAttDate'); if (dd) dd.value = today();
  },

  nav(section) {
    document.querySelectorAll('.section-pane').forEach(el => el.classList.remove('active'));
    document.querySelectorAll('#sidebar .nav-link').forEach(el => el.classList.remove('active'));
    const pane = document.getElementById('sec_' + section);
    if (pane) pane.classList.add('active');
    const link = document.querySelector(`[data-section="${section}"]`);
    if (link) link.classList.add('active');
    this.currentSection = section;
    // Update page title
    const titles = {
      dashboard:'Dashboard', employees:'Employee Register', attendance:'Attendance',
      assets:'Asset Register', leaves:'Leave Management', payroll:'Payroll Processing',
      registers:'Registers', advances:'Advance Requisitions', approvals:'Approvals',
      settings:'Settings'
    };
    const titleEl = document.getElementById('pageTitle');
    if (titleEl) titleEl.textContent = titles[section] || section;
    // Lazy render
    if (section==='employees') EMP.render();
    else if (section==='attendance') ATT.render();
    else if (section==='assets') ASSETS.render();
    else if (section==='leaves') { LEAVES.render(); LEAVES.renderBalanceRegister(); }
    else if (section==='payroll') PAY.renderProcessing();
    else if (section==='registers') { PAY.renderSalaryRegister(); PAY.renderBonusRegister(); PAY.renderLTARegister(); LEAVES.renderEncashmentRegister(); LEAVES.renderEncashmentRegister2(); }
    else if (section==='advances') { APPROVALS.renderAdvanceRegister(); }
    else if (section==='approvals') { APPROVALS.renderPending(); APPROVALS.renderApprovalLevels(); }
    else if (section==='dashboard') this.renderDashboard();
  },

  renderDashboard() {
    const emps = DB.getEmployees();
    const active = emps.filter(e=>e.status==='active');
    const dt = today();
    const mo = new Date().getMonth()+1, yr = new Date().getFullYear();
    // Today's attendance
    const todayAtt = DB.getAttendance().filter(a=>a.date===dt);
    const present = todayAtt.filter(a=>a.status==='present').length;
    const pendingLeaves = DB.getPendingLeaves().length;
    const pendingAdv = DB.getPendingAdvances().length;
    const assets = DB.getAssets();

    if (document.getElementById('dash_totalEmp')) document.getElementById('dash_totalEmp').textContent = active.length;
    if (document.getElementById('dash_presentToday')) document.getElementById('dash_presentToday').textContent = present;
    if (document.getElementById('dash_pendingApprovals')) document.getElementById('dash_pendingApprovals').textContent = pendingLeaves+pendingAdv;
    if (document.getElementById('dash_totalAssets')) document.getElementById('dash_totalAssets').textContent = assets.length;

    // Recent leaves
    const recentLeaves = DB.getLeaves().slice(-5).reverse();
    const rlEl = document.getElementById('dash_recentLeaves');
    if (rlEl) {
      rlEl.innerHTML = recentLeaves.length ? recentLeaves.map(l => {
        const emp = DB.getEmployee(l.empId);
        return `<div class="d-flex justify-content-between align-items-center py-2 border-bottom">
          <div><div class="fw-500 fs-13">${emp?`${emp.firstName} ${emp.lastName}`:'-'}</div>
          <div class="text-muted fs-12">${l.leaveType} · ${l.days} day(s)</div></div>
          <span class="badge bg-${l.status==='approved'?'success':l.status==='rejected'?'danger':'warning'}">${l.status}</span>
        </div>`;
      }).join('') : '<div class="text-muted text-center py-3">No recent leave requests</div>';
    }

    // Birthday today
    const bdays = emps.filter(e => e.dob && e.dob.slice(5)===dt.slice(5) && e.status==='active');
    const bdEl = document.getElementById('dash_birthdays');
    if (bdEl) {
      bdEl.innerHTML = bdays.length ? bdays.map(e=>`<div class="d-flex gap-2 align-items-center py-1"><i class="fas fa-birthday-cake text-warning"></i><span>${e.firstName} ${e.lastName} — ${e.designation}</span></div>`).join('')
        : '<div class="text-muted fs-12 text-center py-2">No birthdays today</div>';
    }

    // Payroll summary for current month
    const payrolls = DB.getPayrolls().filter(p=>p.month===mo&&p.year===yr);
    const totalNet = payrolls.reduce((s,p)=>s+p.netPay,0);
    if (document.getElementById('dash_monthPayroll')) document.getElementById('dash_monthPayroll').textContent = currFmt(totalNet);
  },

  populateEmpFilters() {
    const emps = DB.getEmployees().filter(e=>e.status==='active');
    const selectors = ['empAssetFilter','la_empId','adv_empId'];
    selectors.forEach(id => {
      const el = document.getElementById(id);
      if (el) el.innerHTML = `<option value="">Select Employee</option>` +
        emps.map(e=>`<option value="${e.id}">${e.empCode} - ${e.firstName} ${e.lastName}</option>`).join('');
    });
  },

  showToast(msg, type = 'success') {
    const container = document.getElementById('toastContainer');
    if (!container) return;
    const id = 'toast_' + Date.now();
    const icon = type==='success'?'check-circle':type==='danger'?'exclamation-circle':'info-circle';
    container.insertAdjacentHTML('beforeend', `
      <div id="${id}" class="toast align-items-center text-bg-${type} border-0" role="alert" style="min-width:260px">
        <div class="d-flex">
          <div class="toast-body"><i class="fas fa-${icon} me-2"></i>${msg}</div>
          <button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast"></button>
        </div>
      </div>`);
    const el = document.getElementById(id);
    const toast = new bootstrap.Toast(el, { delay: 3000 });
    toast.show();
    el.addEventListener('hidden.bs.toast', () => el.remove());
  },

  saveSettings() {
    const g = id => document.getElementById(id)?.value?.trim()||'';
    DB.setSetting('companyName', g('setting_companyName'));
    DB.setSetting('companyAddress', g('setting_companyAddress'));
    this.showToast('Settings saved', 'success');
  },

  exportAllData() {
    const data = {
      employees: DB.getEmployees(),
      attendance: DB.getAttendance(),
      assets: DB.getAssets(),
      assetAssignments: DB.getAssetAssignments(),
      leaves: DB.getLeaves(),
      leaveBalances: DB.getLeaveBalances(),
      payrolls: DB.getPayrolls(),
      advances: DB.getAdvances(),
      bonusRecords: DB.getBonusRecords(),
      ltaRecords: DB.getLTARecords(),
      leaveEncashments: DB.getLeaveEncashments(),
      settings: DB.getSettings(),
      exportDate: new Date().toISOString()
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], {type:'application/json'});
    const a = document.createElement('a'); a.href=URL.createObjectURL(blob);
    a.download=`PayrollBackup_${today()}.json`; a.click();
    this.showToast('Data exported successfully', 'success');
  },

  importData(file) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = e => {
      try {
        const data = JSON.parse(e.target.result);
        if (data.employees) DB.saveEmployees(data.employees);
        if (data.attendance) DB.saveAttendance(data.attendance);
        if (data.assets) DB.saveAssets(data.assets);
        if (data.assetAssignments) DB.saveAssetAssignments(data.assetAssignments);
        if (data.leaves) DB.saveLeaves(data.leaves);
        if (data.leaveBalances) DB.saveLeaveBalances(data.leaveBalances);
        if (data.payrolls) DB.savePayrolls(data.payrolls);
        if (data.advances) DB.saveAdvances(data.advances);
        if (data.bonusRecords) DB.saveBonusRecords(data.bonusRecords);
        if (data.ltaRecords) DB.saveLTARecords(data.ltaRecords);
        if (data.leaveEncashments) DB.saveLeaveEncashments(data.leaveEncashments);
        if (data.settings) DB.saveSettings(data.settings);
        this.nav(this.currentSection);
        this.showToast('Data imported successfully', 'success');
      } catch(err) { alert('Invalid backup file: ' + err.message); }
    };
    reader.readAsText(file);
  },

  addHoliday() {
    const dt = document.getElementById('newHolidayDate')?.value;
    const nm = document.getElementById('newHolidayName')?.value?.trim();
    if (!dt || !nm) { alert('Please enter date and holiday name.'); return; }
    const holidays = DB.getHolidays();
    if (!holidays.find(h=>h.date===dt)) { holidays.push({date:dt, name:nm}); DB.saveHolidays(holidays); }
    this.renderHolidays();
    document.getElementById('newHolidayDate').value='';
    document.getElementById('newHolidayName').value='';
  },

  renderHolidays() {
    const holidays = DB.getHolidays().sort((a,b)=>a.date>b.date?1:-1);
    const tbody = document.getElementById('holidayTableBody');
    if (!tbody) return;
    tbody.innerHTML = holidays.length ? holidays.map(h=>`<tr>
      <td>${fmtDate(h.date)}</td><td>${h.name}</td>
      <td><button class="btn btn-sm btn-outline-danger" onclick="APP.removeHoliday('${h.date}')"><i class="fas fa-trash"></i></button></td>
    </tr>`).join('') : '<tr><td colspan="3" class="text-center text-muted py-3">No holidays defined</td></tr>';
  },

  removeHoliday(date) {
    DB.saveHolidays(DB.getHolidays().filter(h=>h.date!==date));
    this.renderHolidays();
  },

  async refreshData() {
    this.showToast('Refreshing data from server...', 'info');
    await DB.syncAll();
    this.nav(this.currentSection);
    this.showToast('Data refreshed', 'success');
  }
};

window.addEventListener('DOMContentLoaded', () => APP.init());
