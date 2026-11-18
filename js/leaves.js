// ============================================================
// leaves.js — Leave Management, Letters & Registers
// ============================================================

const LEAVES = {

  render() {
    const q = (document.getElementById('leaveSearch')||{}).value||'';
    const stat = (document.getElementById('leaveStatFilter')||{}).value||'';
    const yr = document.getElementById('leaveYearFilter')?.value || new Date().getFullYear();
    let list = DB.getLeaves().filter(l => {
      if (stat && l.status !== stat) return false;
      if (yr && !l.appliedDate?.startsWith(yr)) return false;
      if (q) {
        const emp = DB.getEmployee(l.empId);
        if (!(`${emp?.empCode} ${emp?.firstName} ${emp?.lastName} ${l.leaveType}`).toLowerCase().includes(q.toLowerCase())) return false;
      }
      return true;
    });
    list.sort((a,b) => b.appliedDate > a.appliedDate ? 1 : -1);

    const tbody = document.getElementById('leaveTableBody');
    if (!tbody) return;
    tbody.innerHTML = list.length ? list.map(l => {
      const emp = DB.getEmployee(l.empId);
      return `<tr>
        <td>${emp?`<div class="fw-500">${emp.empCode}</div><div class="text-muted fs-12">${emp.firstName} ${emp.lastName}</div>`:'-'}</td>
        <td><span class="badge bg-secondary">${l.leaveType}</span></td>
        <td>${fmtDate(l.fromDate)}</td>
        <td>${fmtDate(l.toDate)}</td>
        <td class="fw-600">${l.days}</td>
        <td>${fmtDate(l.appliedDate)}</td>
        <td>${l.reason?.slice(0,40)||'-'}</td>
        <td><span class="badge bg-${l.status==='approved'?'success':l.status==='rejected'?'danger':l.status==='cancelled'?'secondary':'warning'}">${l.status}</span></td>
        <td>
          <div class="d-flex gap-1">
            ${l.status==='pending'?`
              <button class="btn btn-sm btn-success" onclick="APPROVALS.approveLeave('${l.id}','approved')" title="Approve"><i class="fas fa-check"></i></button>
              <button class="btn btn-sm btn-danger" onclick="APPROVALS.approveLeave('${l.id}','rejected')" title="Reject"><i class="fas fa-times"></i></button>
            `:''}
            <button class="btn btn-sm btn-outline-secondary" onclick="LEAVES.printLetter('${l.id}')" title="Print Letter"><i class="fas fa-print"></i></button>
          </div>
        </td>
      </tr>`;
    }).join('') : '<tr><td colspan="9" class="text-center text-muted py-4">No leave records</td></tr>';
  },

  openApplication(empId = null) {
    const f = document.getElementById('leaveAppForm'); if (!f) return;
    f.reset();
    document.getElementById('la_id').value = '';
    document.getElementById('la_appliedDate').value = today();
    // Employee dropdown
    const emps = DB.getEmployees().filter(e => e.status==='active');
    const sel = document.getElementById('la_empId');
    sel.innerHTML = `<option value="">Select Employee</option>` + emps.map(e => `<option value="${e.id}" ${e.id===empId?'selected':''}>${e.empCode} - ${e.firstName} ${e.lastName}</option>`).join('');
    if (empId) this.updateLeaveBalance(empId);
    new bootstrap.Modal(document.getElementById('leaveAppModal')).show();
  },

  updateLeaveBalance(empId) {
    if (!empId) { document.getElementById('leaveBalanceDisplay').innerHTML = ''; return; }
    const yr = new Date().getFullYear();
    const bal = DB.getLeaveBalance(empId, yr);
    if (!bal) { document.getElementById('leaveBalanceDisplay').innerHTML = '<span class="text-muted">No balance data</span>'; return; }
    document.getElementById('leaveBalanceDisplay').innerHTML = `
      <span class="badge bg-info me-1">Casual: ${bal.casual?.balance||0}</span>
      <span class="badge bg-warning me-1">Sick: ${bal.sick?.balance||0}</span>
      <span class="badge bg-success me-1">Earned: ${bal.earned?.balance||0}</span>`;
  },

  calcLeaveDays() {
    const from = document.getElementById('la_fromDate')?.value;
    const to = document.getElementById('la_toDate')?.value;
    if (from && to) {
      const days = calcDays(from, to);
      const el = document.getElementById('la_days'); if (el) el.value = days;
    }
  },

  saveApplication() {
    const g = id => document.getElementById(id)?.value?.trim()||'';
    const lv = {
      id: g('la_id') || uuid(),
      empId: g('la_empId'),
      leaveType: g('la_leaveType'),
      fromDate: g('la_fromDate'),
      toDate: g('la_toDate'),
      days: Number(g('la_days'))||1,
      reason: g('la_reason'),
      appliedDate: g('la_appliedDate') || today(),
      status: 'pending',
      approvalHistory: []
    };
    if (!lv.empId || !lv.leaveType || !lv.fromDate || !lv.toDate) { alert('Please fill all required fields.'); return; }
    DB.upsertLeave(lv);
    bootstrap.Modal.getInstance(document.getElementById('leaveAppModal')).hide();
    this.render();
    APP.showToast('Leave application submitted', 'success');
  },

  printLetter(leaveId) {
    const lv = DB.getLeave(leaveId); if (!lv) return;
    const emp = DB.getEmployee(lv.empId); if (!emp) return;
    const co = 'Indus Projects Pvt. Ltd.';
    const w = window.open('','_blank','width=800,height=900');
    w.document.write(`<html><head><title>Leave Letter</title>
      <style>body{font-family:Arial;font-size:13px;padding:30px;max-width:700px;margin:auto}
      h2{color:#1a3c5e;text-align:center}hr{border-color:#1a3c5e}
      .header{text-align:center;margin-bottom:20px}
      .field{margin-bottom:8px}.label{font-weight:700}
      .footer{margin-top:40px;display:flex;justify-content:space-between}
      .status-approved{color:green;font-weight:700}.status-rejected{color:red;font-weight:700}
      .status-pending{color:orange;font-weight:700}
      </style></head><body>
      <div class="header"><h2>${co}</h2><hr><h3>Leave Application</h3></div>
      <div class="field"><span class="label">Employee Code:</span> ${emp.empCode}</div>
      <div class="field"><span class="label">Name:</span> ${emp.firstName} ${emp.lastName}</div>
      <div class="field"><span class="label">Designation:</span> ${emp.designation||'-'} | <span class="label">Department:</span> ${emp.department||'-'}</div>
      <div class="field"><span class="label">Leave Type:</span> ${lv.leaveType}</div>
      <div class="field"><span class="label">From:</span> ${fmtDate(lv.fromDate)} &nbsp;&nbsp; <span class="label">To:</span> ${fmtDate(lv.toDate)} &nbsp;&nbsp; <span class="label">Days:</span> ${lv.days}</div>
      <div class="field"><span class="label">Reason:</span> ${lv.reason}</div>
      <div class="field"><span class="label">Applied Date:</span> ${fmtDate(lv.appliedDate)}</div>
      <div class="field"><span class="label">Status:</span> <span class="status-${lv.status}">${lv.status?.toUpperCase()}</span></div>
      ${lv.approvalHistory?.length ? `<div class="field"><span class="label">Approval History:</span><ul>${lv.approvalHistory.map(h=>`<li>${h.action?.toUpperCase()} by ${h.approver} on ${fmtDate(h.date)}${h.remarks?` — ${h.remarks}`:''}</li>`).join('')}</ul></div>` : ''}
      <div class="footer">
        <div>__________________<br>Employee Signature<br>${emp.firstName} ${emp.lastName}</div>
        <div>__________________<br>Approved By<br>Authorized Signatory</div>
      </div>
      <p style="font-size:10px;color:#999;margin-top:30px;text-align:center">Printed: ${new Date().toLocaleString()} | ${co}</p>
      </body></html>`);
    w.document.close(); w.print();
  },

  renderBalanceRegister() {
    const yr = Number(document.getElementById('balRegYear')?.value || new Date().getFullYear());
    const emps = DB.getEmployees().filter(e => e.status==='active');
    const tbody = document.getElementById('leaveBalRegBody');
    if (!tbody) return;
    tbody.innerHTML = emps.map(emp => {
      const bal = DB.getLeaveBalance(emp.id, yr) || DB.initLeaveBalance(emp, yr);
      return `<tr>
        <td>${emp.empCode}</td><td>${emp.firstName} ${emp.lastName}</td>
        <td>${emp.designation||'-'}</td>
        <td>${bal.casual?.entitled||0}</td><td>${bal.casual?.used||0}</td><td class="fw-600">${bal.casual?.balance||0}</td>
        <td>${bal.sick?.entitled||0}</td><td>${bal.sick?.used||0}</td><td class="fw-600">${bal.sick?.balance||0}</td>
        <td>${bal.earned?.entitled||0}</td><td>${bal.earned?.used||0}</td><td class="fw-600">${bal.earned?.balance||0}</td>
        <td class="fw-600 text-primary">${(bal.casual?.balance||0)+(bal.sick?.balance||0)+(bal.earned?.balance||0)}</td>
      </tr>`;
    }).join('') || '<tr><td colspan="13" class="text-center text-muted py-4">No employees</td></tr>';
  },

  renderEncashmentRegister() {
    const records = DB.getLeaveEncashments();
    const yr = document.getElementById('encashYear')?.value || new Date().getFullYear();
    const list = records.filter(r => r.year == yr);
    const tbody = document.getElementById('encashRegBody');
    if (!tbody) return;
    tbody.innerHTML = list.length ? list.map(r => {
      const emp = DB.getEmployee(r.empId);
      return `<tr>
        <td>${emp?.empCode||'-'}</td><td>${emp?`${emp.firstName} ${emp.lastName}`:'-'}</td>
        <td>${r.encashDate?fmtDate(r.encashDate):'-'}</td>
        <td>${r.leaveType||'-'}</td><td>${r.days}</td>
        <td>${currFmt(r.perDayValue)}</td><td class="fw-600">${currFmt(r.amount)}</td>
        <td><span class="badge bg-${r.status==='paid'?'success':'warning'}">${r.status}</span></td>
      </tr>`;
    }).join('') : '<tr><td colspan="8" class="text-center text-muted py-4">No encashment records</td></tr>';
  },

  openEncashmentForm() {
    const f = document.getElementById('encashForm'); if (!f) return;
    f.reset();
    const emps = DB.getEmployees().filter(e=>e.status==='active');
    document.getElementById('enc_empId').innerHTML = `<option value="">Select Employee</option>` +
      emps.map(e=>`<option value="${e.id}">${e.empCode} - ${e.firstName} ${e.lastName}</option>`).join('');
    document.getElementById('enc_date').value = today();
    new bootstrap.Modal(document.getElementById('encashModal')).show();
  },

  updateEncashCalc() {
    const empId = document.getElementById('enc_empId')?.value;
    const days = Number(document.getElementById('enc_days')?.value||0);
    const emp = empId ? DB.getEmployee(empId) : null;
    if (!emp || !days) return;
    const perDay = Number(emp.basic||0) / 26;
    const amt = perDay * days;
    if (document.getElementById('enc_perDay')) document.getElementById('enc_perDay').value = perDay.toFixed(2);
    if (document.getElementById('enc_amount')) document.getElementById('enc_amount').value = amt.toFixed(2);
  },

  saveEncashment() {
    const g = id => document.getElementById(id)?.value?.trim()||'';
    const rec = {
      id: uuid(),
      empId: g('enc_empId'),
      year: new Date().getFullYear(),
      encashDate: g('enc_date'),
      leaveType: g('enc_leaveType'),
      days: Number(g('enc_days')),
      perDayValue: Number(g('enc_perDay')),
      amount: Number(g('enc_amount')),
      remarks: g('enc_remarks'),
      status: 'paid'
    };
    if (!rec.empId || !rec.days) { alert('Please fill required fields.'); return; }
    DB.upsertLeaveEncashment(rec);
    bootstrap.Modal.getInstance(document.getElementById('encashModal')).hide();
    this.renderEncashmentRegister();
    APP.showToast('Leave encashment recorded', 'success');
  }
};
