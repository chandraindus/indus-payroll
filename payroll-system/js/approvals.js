// ============================================================
// approvals.js — Approval Workflows (Leave, Advances, Payroll)
// ============================================================

const APPROVALS = {

  renderPending() {
    const pendingLeaves = DB.getPendingLeaves();
    const pendingAdvances = DB.getPendingAdvances();

    const leaveTbody = document.getElementById('pendingLeavesBody');
    if (leaveTbody) {
      leaveTbody.innerHTML = pendingLeaves.length ? pendingLeaves.map(l => {
        const emp = DB.getEmployee(l.empId);
        const bal = DB.getLeaveBalance(l.empId, new Date().getFullYear());
        const avail = l.leaveType==='casual' ? bal?.casual?.balance : l.leaveType==='sick' ? bal?.sick?.balance : bal?.earned?.balance;
        return `<tr>
          <td>${fmtDate(l.appliedDate)}</td>
          <td>${emp?`<div class="fw-500">${emp.empCode}</div><div class="text-muted fs-12">${emp.firstName} ${emp.lastName}</div>`:'-'}</td>
          <td><span class="badge bg-secondary">${l.leaveType}</span></td>
          <td>${fmtDate(l.fromDate)} to ${fmtDate(l.toDate)}</td>
          <td class="fw-600">${l.days}</td>
          <td>${avail!==undefined?`<span class="badge bg-${avail>=l.days?'success':'danger'}">${avail} avail.</span>`:'-'}</td>
          <td>${l.reason?.slice(0,50)||'-'}</td>
          <td>
            <div class="d-flex gap-1">
              <button class="btn btn-sm btn-success" onclick="APPROVALS.approveLeave('${l.id}','approved')"><i class="fas fa-check me-1"></i>Approve</button>
              <button class="btn btn-sm btn-danger" onclick="APPROVALS.approveLeave('${l.id}','rejected')"><i class="fas fa-times me-1"></i>Reject</button>
            </div>
          </td>
        </tr>`;
      }).join('') : '<tr><td colspan="8" class="text-center text-muted py-4"><i class="fas fa-check-circle text-success me-2"></i>No pending leave requests</td></tr>';
    }

    const advTbody = document.getElementById('pendingAdvancesBody');
    if (advTbody) {
      advTbody.innerHTML = pendingAdvances.length ? pendingAdvances.map(a => {
        const emp = DB.getEmployee(a.empId);
        return `<tr>
          <td>${fmtDate(a.requestDate)}</td>
          <td>${emp?`<div class="fw-500">${emp.empCode}</div><div class="text-muted fs-12">${emp.firstName} ${emp.lastName}</div>`:'-'}</td>
          <td class="fw-600">${currFmt(a.amount)}</td>
          <td>${a.purpose}</td>
          <td>${a.repaymentMonths} months</td>
          <td>
            <div class="d-flex gap-1">
              <button class="btn btn-sm btn-success" onclick="APPROVALS.approveAdvance('${a.id}','approved')"><i class="fas fa-check me-1"></i>Approve</button>
              <button class="btn btn-sm btn-danger" onclick="APPROVALS.approveAdvance('${a.id}','rejected')"><i class="fas fa-times me-1"></i>Reject</button>
            </div>
          </td>
        </tr>`;
      }).join('') : '<tr><td colspan="6" class="text-center text-muted py-4"><i class="fas fa-check-circle text-success me-2"></i>No pending advance requests</td></tr>';
    }

    // Badge counts
    const total = pendingLeaves.length + pendingAdvances.length;
    document.querySelectorAll('.pending-badge').forEach(el => {
      el.textContent = total; el.style.display = total > 0 ? '' : 'none';
    });
  },

  approveLeave(leaveId, action) {
    const remarks = action === 'rejected' ? (prompt('Reason for rejection (optional):') || '') : '';
    const lv = DB.getLeave(leaveId); if (!lv) return;
    lv.status = action;
    lv.approvalHistory = lv.approvalHistory || [];
    lv.approvalHistory.push({ level: 1, approver: 'HR/Manager', action, date: today(), remarks });

    if (action === 'approved') {
      const yr = new Date(lv.fromDate).getFullYear();
      const bal = DB.getLeaveBalance(lv.empId, yr);
      if (bal) {
        const type = lv.leaveType === 'casual' ? 'casual' : lv.leaveType === 'sick' ? 'sick' : 'earned';
        if (bal[type]) {
          bal[type].used = (bal[type].used || 0) + lv.days;
          bal[type].balance = bal[type].entitled - bal[type].used;
          DB.upsertLeaveBalance(bal);
        }
      }
      // Update attendance records for the leave period
      const from = new Date(lv.fromDate), to = new Date(lv.toDate);
      for (let d = new Date(from); d <= to; d.setDate(d.getDate()+1)) {
        const dt = d.toISOString().slice(0,10);
        const existing = DB.getAttByEmpDate(lv.empId, dt) || { id: uuid(), empId: lv.empId, date: dt, punchIn:{}, punchOut:{} };
        existing.status = 'on-leave';
        existing.remarks = `Leave: ${lv.leaveType}`;
        DB.upsertAttendance(existing);
      }
    }
    DB.upsertLeave(lv);
    this.renderPending();
    LEAVES.render();
    APP.showToast(`Leave ${action}`, action==='approved'?'success':'danger');
  },

  approveAdvance(advId, action) {
    const remarks = action === 'rejected' ? (prompt('Reason for rejection (optional):') || '') : '';
    const adv = DB.getAdvance(advId); if (!adv) return;
    adv.status = action;
    adv.approvalHistory = adv.approvalHistory || [];
    adv.approvalHistory.push({ approver: 'Manager', action, date: today(), remarks });
    DB.upsertAdvance(adv);
    this.renderPending();
    APP.showToast(`Advance ${action}`, action==='approved'?'success':'danger');
  },

  // Advance Requisition
  openAdvanceForm(empId = null) {
    const f = document.getElementById('advanceForm'); if (!f) return;
    f.reset();
    document.getElementById('adv_requestDate').value = today();
    const emps = DB.getEmployees().filter(e=>e.status==='active');
    document.getElementById('adv_empId').innerHTML = `<option value="">Select Employee</option>` +
      emps.map(e=>`<option value="${e.id}" ${e.id===empId?'selected':''}>${e.empCode} - ${e.firstName} ${e.lastName}</option>`).join('');
    new bootstrap.Modal(document.getElementById('advanceModal')).show();
  },

  saveAdvance() {
    const g = id => document.getElementById(id)?.value?.trim()||'';
    const adv = {
      id: uuid(),
      empId: g('adv_empId'),
      amount: Number(g('adv_amount')),
      purpose: g('adv_purpose'),
      requestDate: g('adv_requestDate') || today(),
      requiredDate: g('adv_requiredDate'),
      repaymentMonths: Number(g('adv_repaymentMonths'))||1,
      remarks: g('adv_remarks'),
      status: 'pending',
      approvalHistory: [],
      repayments: []
    };
    if (!adv.empId || !adv.amount || !adv.purpose) { alert('Please fill all required fields.'); return; }
    DB.upsertAdvance(adv);
    bootstrap.Modal.getInstance(document.getElementById('advanceModal')).hide();
    this.renderPending();
    this.renderAdvanceRegister();
    APP.showToast('Advance request submitted', 'success');
  },

  renderAdvanceRegister() {
    const advances = DB.getAdvances();
    const tbody = document.getElementById('advanceRegBody');
    if (!tbody) return;
    tbody.innerHTML = advances.length ? advances.sort((a,b)=>b.requestDate>a.requestDate?1:-1).map(a => {
      const emp = DB.getEmployee(a.empId);
      const paid = (a.repayments||[]).reduce((s,r)=>s+r.amount,0);
      const balance = Number(a.amount) - paid;
      return `<tr>
        <td>${fmtDate(a.requestDate)}</td>
        <td>${emp?`<div class="fw-500">${emp.empCode}</div><div class="fs-12 text-muted">${emp.firstName} ${emp.lastName}</div>`:'-'}</td>
        <td class="fw-600">${currFmt(a.amount)}</td>
        <td>${a.purpose}</td>
        <td>${a.repaymentMonths} mo</td>
        <td>${currFmt(paid)}</td>
        <td class="${balance>0?'text-danger':'text-success'} fw-600">${currFmt(balance)}</td>
        <td><span class="badge bg-${a.status==='approved'?'success':a.status==='rejected'?'danger':a.status==='cleared'?'info':'warning'}">${a.status}</span></td>
        <td>
          ${a.status==='pending'?`
            <button class="btn btn-xs btn-success py-0 px-1" onclick="APPROVALS.approveAdvance('${a.id}','approved')"><i class="fas fa-check"></i></button>
            <button class="btn btn-xs btn-danger py-0 px-1" onclick="APPROVALS.approveAdvance('${a.id}','rejected')"><i class="fas fa-times"></i></button>
          `:a.status==='approved'&&balance>0?`<button class="btn btn-xs btn-outline-primary py-0 px-1" onclick="APPROVALS.printAdvanceLetter('${a.id}')"><i class="fas fa-print"></i></button>`:''}
        </td>
      </tr>`;
    }).join('') : '<tr><td colspan="9" class="text-center text-muted py-4">No advance records</td></tr>';
  },

  printAdvanceLetter(advId) {
    const adv = DB.getAdvance(advId); if (!adv) return;
    const emp = DB.getEmployee(adv.empId); if (!emp) return;
    const co = DB.getSetting('companyName','Indus Projects Pvt. Ltd.');
    const w = window.open('','_blank','width=800,height=900');
    w.document.write(`<html><head><title>Advance Sanction Letter</title>
      <style>body{font-family:Arial;font-size:13px;padding:30px;max-width:700px;margin:auto}h2{color:#1a3c5e;text-align:center}
      .field{margin:8px 0}.label{font-weight:700}hr{border-color:#1a3c5e}
      .footer{margin-top:40px;display:flex;justify-content:space-between}</style></head><body>
      <h2>${co}</h2><hr><h3 style="text-align:center">Advance Sanction Letter</h3>
      <p>Date: ${fmtDate(today())}</p>
      <p>To,<br><strong>${emp.firstName} ${emp.lastName}</strong><br>${emp.designation||''}, ${emp.department||''}</p>
      <p>Dear ${emp.firstName},</p>
      <p>This is to inform you that your advance request of <strong>${currFmt(adv.amount)}</strong> has been approved. The details are as follows:</p>
      <div class="field"><span class="label">Amount Sanctioned:</span> ${currFmt(adv.amount)}</div>
      <div class="field"><span class="label">Purpose:</span> ${adv.purpose}</div>
      <div class="field"><span class="label">Repayment Period:</span> ${adv.repaymentMonths} months (${currFmt(adv.amount/adv.repaymentMonths)} per month)</div>
      <p>The repayment will be deducted from your monthly salary over the specified period.</p>
      <div class="footer">
        <div>__________________<br>Employee Signature</div>
        <div>__________________<br>Authorized Signatory<br>${co}</div>
      </div>
      </body></html>`);
    w.document.close(); w.print();
  },

  // Approval Level Settings
  renderApprovalLevels() {
    const modules = ['leave','advance','payroll'];
    modules.forEach(mod => {
      const cfg = DB.getApprovalLevel(mod);
      const container = document.getElementById(`approvalLevel_${mod}`);
      if (!container) return;
      const emps = DB.getEmployees().filter(e=>e.status==='active');
      container.innerHTML = (cfg.levels||[]).map((l,i) => `
        <div class="d-flex align-items-center gap-2 mb-2">
          <span class="badge bg-primary">Level ${l.level}</span>
          <span>${l.role}</span>
          <span class="text-muted">→</span>
          <select class="form-select form-select-sm w-auto" onchange="APPROVALS.updateLevel('${mod}',${i},'empId',this.value)">
            <option value="">Select Approver</option>
            ${emps.map(e=>`<option value="${e.id}" ${e.id===l.approverEmpId?'selected':''}>${e.empCode} - ${e.firstName} ${e.lastName}</option>`).join('')}
          </select>
          <button class="btn btn-sm btn-outline-danger" onclick="APPROVALS.removeLevel('${mod}',${i})"><i class="fas fa-minus"></i></button>
        </div>`).join('') || '<div class="text-muted fs-12">No levels configured</div>';
    });
  },

  addLevel(mod) {
    const cfg = DB.getApprovalLevel(mod);
    cfg.levels = cfg.levels || [];
    const role = prompt('Role name (e.g. Manager, HR, Director):');
    if (!role) return;
    cfg.levels.push({ level: cfg.levels.length+1, role, approverEmpId: '' });
    const all = DB.getApprovalLevels().filter(a=>a.module!==mod);
    all.push(cfg);
    DB.saveApprovalLevels(all);
    this.renderApprovalLevels();
  },

  removeLevel(mod, idx) {
    const cfg = DB.getApprovalLevel(mod);
    cfg.levels.splice(idx,1);
    cfg.levels.forEach((l,i)=>l.level=i+1);
    const all = DB.getApprovalLevels().filter(a=>a.module!==mod);
    all.push(cfg);
    DB.saveApprovalLevels(all);
    this.renderApprovalLevels();
  },

  updateLevel(mod, idx, field, val) {
    const cfg = DB.getApprovalLevel(mod);
    cfg.levels[idx][field] = val;
    const all = DB.getApprovalLevels().filter(a=>a.module!==mod);
    all.push(cfg);
    DB.saveApprovalLevels(all);
  }
};
