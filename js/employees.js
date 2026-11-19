// ============================================================
// employees.js — Employee Management Module
// ============================================================

const EMP = {
  currentId: null,

  render() {
    const emps = DB.getEmployees();
    const q = (document.getElementById('empSearch')||{}).value||'';
    const dept = (document.getElementById('empDeptFilter')||{}).value||'';
    const stat = (document.getElementById('empStatFilter')||{}).value||'';
    let list = emps.filter(e => {
      if (q && !(`${e.empCode} ${e.firstName} ${e.lastName} ${e.designation} ${e.department}`).toLowerCase().includes(q.toLowerCase())) return false;
      if (dept && e.department !== dept) return false;
      if (stat && e.status !== stat) return false;
      return true;
    });
    const tbody = document.getElementById('empTableBody');
    if (!tbody) return;
    tbody.innerHTML = list.length ? list.map(e => `
      <tr>
        <td><span class="fw-500">${e.empCode}</span></td>
        <td>
          <div class="d-flex align-items-center gap-2">
            <div class="emp-avatar" style="width:34px;height:34px;font-size:14px;">${e.photo ? `<img src="${e.photo}" style="width:34px;height:34px;border-radius:50%;object-fit:cover;">` : (e.firstName||'?')[0].toUpperCase()}</div>
            <div>
              <div class="fw-500">${e.firstName} ${e.lastName}</div>
              <div class="text-muted fs-12">${e.designation||''}</div>
            </div>
          </div>
        </td>
        <td>${e.department||'-'}</td>
        <td>${e.phone||'-'}</td>
        <td>${fmtDate(e.joiningDate)||'-'}</td>
        <td>${currFmt(Number(e.basic||0) + Number(e.hraAmount||0) + Number(e.foodAmount||0) + Number(e.phoneBillAmount||0) + Number(e.mobilePhoneAmount||0) + Number(e.otherAllowance||0))}</td>
        <td><span class="badge bg-${e.status==='active'?'success':e.status==='resigned'?'danger':'warning'}">${e.status||'active'}</span></td>
        <td>
          <div class="d-flex gap-1">
            <button class="btn btn-sm btn-outline-primary" onclick="EMP.view('${e.id}')" title="View"><i class="fas fa-eye"></i></button>
            <button class="btn btn-sm btn-outline-secondary" onclick="EMP.edit('${e.id}')" title="Edit"><i class="fas fa-edit"></i></button>
            <button class="btn btn-sm btn-outline-success" onclick="EMP.openSalaryRevision('${e.id}')" title="Salary Revision"><i class="fas fa-chart-line"></i></button>
            <button class="btn btn-sm btn-outline-danger" onclick="EMP.confirmDelete('${e.id}')" title="Delete"><i class="fas fa-trash"></i></button>
          </div>
        </td>
      </tr>`).join('') : '<tr><td colspan="8" class="text-center text-muted py-4">No employees found</td></tr>';

    // update dept filter options
    const depts = [...new Set(emps.map(e => e.department).filter(Boolean))];
    const df = document.getElementById('empDeptFilter');
    if (df) {
      const cur = df.value;
      df.innerHTML = `<option value="">All Departments</option>` + depts.map(d => `<option value="${d}" ${d===cur?'selected':''}>${d}</option>`).join('');
    }
  },

  view(id) {
    const emp = DB.getEmployee(id);
    if (!emp) return;
    this.currentId = id;
    const assets = DB.getAssetsByEmp(id);
    const leaves = DB.getLeavesByEmp(id);
    const advances = DB.getAdvancesByEmp(id);
    const payrolls = DB.getPayrolls().filter(p => p.empId === id).slice(-6).reverse();
    const bal = DB.getLeaveBalance(id, new Date().getFullYear());

    const gross = Number(emp.basic||0) + (emp.hasHRA?Number(emp.hraAmount||0):0) +
      (emp.hasFoodAllowance?Number(emp.foodAmount||0):0) +
      (emp.hasPhoneBillAllowance?Number(emp.phoneBillAmount||0):0) +
      (emp.hasMobilePhoneAllowance?Number(emp.mobilePhoneAmount||0):0) +
      (emp.hasConveyance?Number(emp.conveyanceAmount||1600):0) +
      Number(emp.otherAllowance||0);

    document.getElementById('empViewContent').innerHTML = `
      <div class="row g-3">
        <div class="col-md-3 text-center">
          <div class="emp-avatar mx-auto mb-3" style="width:90px;height:90px;font-size:36px;">
            ${emp.photo ? `<img src="${emp.photo}" style="width:90px;height:90px;border-radius:50%;object-fit:cover;">` : (emp.firstName||'?')[0].toUpperCase()}
          </div>
          <h6 class="mb-0">${emp.firstName} ${emp.lastName}</h6>
          <div class="text-muted fs-12">${emp.empCode}</div>
          <span class="badge bg-${emp.status==='active'?'success':'danger'} mt-1">${emp.status||'active'}</span>
          <div class="mt-3 d-grid gap-2">
            <button class="btn btn-primary btn-sm" onclick="EMP.edit('${id}')"><i class="fas fa-edit me-1"></i>Edit</button>
            <button class="btn btn-outline-secondary btn-sm" onclick="EMP.printProfile('${id}')"><i class="fas fa-print me-1"></i>Print Profile</button>
          </div>
        </div>
        <div class="col-md-9">
          <ul class="nav nav-tabs mb-3" id="empViewTabs">
            <li class="nav-item"><a class="nav-link active" data-bs-toggle="tab" href="#evPersonal">Personal</a></li>
            <li class="nav-item"><a class="nav-link" data-bs-toggle="tab" href="#evSalary">Salary</a></li>
            <li class="nav-item"><a class="nav-link" data-bs-toggle="tab" href="#evAssets">Assets <span class="badge bg-info">${assets.length}</span></a></li>
            <li class="nav-item"><a class="nav-link" data-bs-toggle="tab" href="#evLeaves">Leaves</a></li>
            <li class="nav-item"><a class="nav-link" data-bs-toggle="tab" href="#evPayroll">Payroll</a></li>
            <li class="nav-item"><a class="nav-link" data-bs-toggle="tab" href="#evAdvances">Advances</a></li>
            <li class="nav-item"><a class="nav-link" data-bs-toggle="tab" href="#evSalHistory">Sal. History</a></li>
            ${emp.photo||emp.appointmentLetter||emp.certificates?.length?`<li class="nav-item"><a class="nav-link" data-bs-toggle="tab" href="#evDocs">Docs</a></li>`:''}
          </ul>
          <div class="tab-content">
            <div class="tab-pane fade show active" id="evPersonal">
              ${this._personalTab(emp)}
            </div>
            <div class="tab-pane fade" id="evSalary">
              ${this._salaryTab(emp, gross)}
            </div>
            <div class="tab-pane fade" id="evAssets">
              ${this._assetsTab(assets, id)}
            </div>
            <div class="tab-pane fade" id="evLeaves">
              ${this._leavesTab(leaves, bal)}
            </div>
            <div class="tab-pane fade" id="evPayroll">
              ${this._payrollTab(payrolls)}
            </div>
            <div class="tab-pane fade" id="evAdvances">
              ${this._advancesTab(advances)}
            </div>
            <div class="tab-pane fade" id="evSalHistory">
              ${this._salHistoryTab(id)}
            </div>
            ${emp.photo||emp.appointmentLetter||emp.certificates?.length?`<div class="tab-pane fade" id="evDocs">${this._docsTab(emp)}</div>`:''}
          </div>
        </div>
      </div>`;
    new bootstrap.Modal(document.getElementById('empViewModal')).show();
  },

  _personalTab(emp) {
    return `<div class="row g-2 fs-13">
      <div class="col-md-6"><span class="text-muted">Father/Husband:</span> <strong>${emp.fatherName||'-'}</strong></div>
      <div class="col-md-6"><span class="text-muted">Date of Birth:</span> <strong>${fmtDate(emp.dob)} ${emp.dob?`(Age: ${calcAge(emp.dob)})`:''}  </strong></div>
      <div class="col-md-6"><span class="text-muted">Gender:</span> <strong>${emp.gender||'-'}</strong></div>
      <div class="col-md-6"><span class="text-muted">Marital Status:</span> <strong>${emp.maritalStatus||'-'}</strong></div>
      <div class="col-md-6"><span class="text-muted">Phone:</span> <strong>${emp.phone||'-'}</strong></div>
      <div class="col-md-6"><span class="text-muted">Email:</span> <strong>${emp.email||'-'}</strong></div>
      <div class="col-md-6"><span class="text-muted">PAN:</span> <strong>${emp.pan||'-'}</strong></div>
      <div class="col-md-6"><span class="text-muted">Aadhar:</span> <strong>${emp.aadhar||'-'}</strong></div>
      <div class="col-md-6"><span class="text-muted">Department:</span> <strong>${emp.department||'-'}</strong></div>
      <div class="col-md-6"><span class="text-muted">Designation:</span> <strong>${emp.designation||'-'}</strong></div>
      <div class="col-md-6"><span class="text-muted">Joining Date:</span> <strong>${fmtDate(emp.joiningDate)}</strong></div>
      <div class="col-md-6"><span class="text-muted">Employment Type:</span> <strong>${emp.employmentType||'-'}</strong></div>
      <div class="col-md-6"><span class="text-muted">Reporting To:</span> <strong>${emp.reportingManager||'-'}</strong></div>
      <div class="col-md-6"><span class="text-muted">Insurance:</span> <strong>${emp.insuranceType||'-'}</strong></div>
      ${emp.projectName?`<div class="col-md-12"><span class="text-muted">Project / Site:</span> <strong>${emp.projectName}</strong></div>`:''}
      <hr>
      <div class="col-12"><span class="text-muted">Present Address:</span> <strong>${[emp.presentAddr1,emp.presentAddr2,emp.presentCity,emp.presentState,emp.presentPin].filter(Boolean).join(', ')||'-'}</strong></div>
      <div class="col-12"><span class="text-muted">Permanent Address:</span> <strong>${[emp.permAddr1,emp.permAddr2,emp.permCity,emp.permState,emp.permPin].filter(Boolean).join(', ')||'-'}</strong></div>
      <hr>
      <div class="col-md-4"><span class="text-muted">Bank:</span> <strong>${emp.bankName||'-'}</strong></div>
      <div class="col-md-4"><span class="text-muted">Account No:</span> <strong>${emp.bankAccount||'-'}</strong></div>
      <div class="col-md-4"><span class="text-muted">IFSC:</span> <strong>${emp.ifsc||'-'}</strong></div>
    </div>`;
  },

  _salaryTab(emp, gross) {
    const pf = Number(emp.basic||0) * (Number(emp.pfRate||12)/100);
    const esi = emp.insuranceType==='ESI' ? gross * 0.0075 : 0;
    return `<div class="row g-2 fs-13">
      <div class="col-6"><strong>Earnings</strong></div><div class="col-6 text-end"><strong>Amount</strong></div>
      <div class="col-6">Basic</div><div class="col-6 text-end">${currFmt(emp.basic)}</div>
      ${emp.hasHRA?`<div class="col-6">HRA</div><div class="col-6 text-end">${currFmt(emp.hraAmount)}</div>`:''}
      ${emp.hasFoodAllowance?`<div class="col-6">Food Allowance</div><div class="col-6 text-end">${currFmt(emp.foodAmount)}</div>`:''}
      ${emp.hasPhoneBillAllowance?`<div class="col-6">Phone Bill</div><div class="col-6 text-end">${currFmt(emp.phoneBillAmount)}</div>`:''}
      ${emp.hasMobilePhoneAllowance?`<div class="col-6">Mobile Phone Allowance</div><div class="col-6 text-end">${currFmt(emp.mobilePhoneAmount)}</div>`:''}
      ${emp.hasConveyance?`<div class="col-6">Conveyance</div><div class="col-6 text-end">${currFmt(emp.conveyanceAmount||1600)}</div>`:''}
      ${emp.otherAllowance?`<div class="col-6">Other Allowance</div><div class="col-6 text-end">${currFmt(emp.otherAllowance)}</div>`:''}
      <div class="col-6 fw-600 border-top pt-1">Gross</div><div class="col-6 text-end fw-600 border-top pt-1">${currFmt(gross)}</div>
      <div class="col-12 mt-2"><strong>Deductions</strong></div>
      <div class="col-6">PF (${emp.pfRate||12}% of Basic, max ₹3000)</div><div class="col-6 text-end">${currFmt(pf)}</div>
      ${emp.insuranceType==='ESI'?`<div class="col-6">ESI (0.75%)</div><div class="col-6 text-end">${currFmt(esi)}</div>`:''}
      ${emp.insuranceType==='Medical'?`<div class="col-6">Medical Insurance</div><div class="col-6 text-end">${currFmt(emp.medicalInsuranceAmount)}</div>`:''}
      ${emp.tdsAmount?`<div class="col-6">TDS / Income Tax</div><div class="col-6 text-end">${currFmt(emp.tdsAmount)}</div>`:''}
      <div class="col-12 mt-2 fs-12 text-muted">
        <span class="me-3">Bonus: ${emp.hasBonus?'Yes':'No'}</span>
        <span class="me-3">LTA: ${emp.hasLTA?'Yes':'No'}</span>
        <span class="me-3">Leave Entitlement: ${emp.leaveEntitlement||30} days/year</span>
        ${emp.projectName?`<span class="me-3">Project: ${emp.projectName}</span>`:''}
      </div>
    </div>`;
  },

  _assetsTab(assets, empId) {
    if (!assets.length) return `<div class="text-center text-muted py-4"><i class="fas fa-box-open fa-2x mb-2 d-block"></i>No assets assigned</div>`;
    return `<div class="table-responsive"><table class="table table-sm">
      <thead><tr><th>Asset Code</th><th>Name</th><th>Category</th><th>Serial No.</th><th>Assigned Date</th><th>Condition</th></tr></thead>
      <tbody>${assets.map(a => `<tr>
        <td>${a.assetCode}</td>
        <td>${a.assetName}</td>
        <td>${a.category||'-'}</td>
        <td>${a.serialNumber||'-'}</td>
        <td>${fmtDate(a.assignment?.assignedDate)}</td>
        <td><span class="badge bg-${a.assignment?.conditionOnAssign==='good'?'success':'warning'}">${a.assignment?.conditionOnAssign||'-'}</span></td>
      </tr>`).join('')}</tbody>
    </table></div>
    <button class="btn btn-sm btn-outline-primary" onclick="ASSETS.openAssignModal('${empId}')"><i class="fas fa-plus me-1"></i>Assign Asset</button>`;
  },

  _leavesTab(leaves, bal) {
    const yr = new Date().getFullYear();
    return `${bal ? `<div class="row g-2 mb-3">
      <div class="col-4"><div class="card text-center p-2"><div class="fs-13 text-muted">Casual</div><div class="fw-700">${bal.casual?.balance||0}/${bal.casual?.entitled||0}</div></div></div>
      <div class="col-4"><div class="card text-center p-2"><div class="fs-13 text-muted">Sick</div><div class="fw-700">${bal.sick?.balance||0}/${bal.sick?.entitled||0}</div></div></div>
      <div class="col-4"><div class="card text-center p-2"><div class="fs-13 text-muted">Earned</div><div class="fw-700">${bal.earned?.balance||0}/${bal.earned?.entitled||0}</div></div></div>
    </div>` : ''}
    <div class="table-responsive"><table class="table table-sm">
      <thead><tr><th>Type</th><th>From</th><th>To</th><th>Days</th><th>Status</th></tr></thead>
      <tbody>${leaves.length ? leaves.slice(-10).reverse().map(l => `<tr>
        <td>${l.leaveType}</td><td>${fmtDate(l.fromDate)}</td><td>${fmtDate(l.toDate)}</td>
        <td>${l.days}</td>
        <td><span class="badge bg-${l.status==='approved'?'success':l.status==='rejected'?'danger':'warning'}">${l.status}</span></td>
      </tr>`).join('') : '<tr><td colspan="5" class="text-center text-muted">No leave records</td></tr>'}</tbody>
    </table></div>`;
  },

  _payrollTab(payrolls) {
    if (!payrolls.length) return `<div class="text-center text-muted py-4">No payroll records</div>`;
    return `<div class="table-responsive"><table class="table table-sm">
      <thead><tr><th>Month</th><th>Gross</th><th>Deductions</th><th>Net Pay</th><th>Status</th><th></th></tr></thead>
      <tbody>${payrolls.map(p => `<tr>
        <td>${monthName(p.month)} ${p.year}</td>
        <td>${currFmt(p.earnings?.grossPay)}</td>
        <td>${currFmt(p.deductions?.totalDeductions)}</td>
        <td class="fw-600">${currFmt(p.netPay)}</td>
        <td><span class="badge bg-${p.status==='paid'?'success':p.status==='processed'?'info':'secondary'}">${p.status}</span></td>
        <td><button class="btn btn-xs btn-outline-primary py-0 px-1" onclick="PAY.printSlip('${p.id}')"><i class="fas fa-print"></i></button></td>
      </tr>`).join('')}</tbody>
    </table></div>`;
  },

  _advancesTab(advances) {
    if (!advances.length) return `<div class="text-center text-muted py-4">No advance records</div>`;
    return `<div class="table-responsive"><table class="table table-sm">
      <thead><tr><th>Date</th><th>Amount</th><th>Purpose</th><th>Status</th></tr></thead>
      <tbody>${advances.map(a => `<tr>
        <td>${fmtDate(a.requestDate)}</td><td>${currFmt(a.amount)}</td><td>${a.purpose}</td>
        <td><span class="badge bg-${a.status==='approved'?'success':a.status==='rejected'?'danger':'warning'}">${a.status}</span></td>
      </tr>`).join('')}</tbody>
    </table></div>`;
  },

  openForm(id = null) {
    this.currentId = id;
    const emp = id ? DB.getEmployee(id) : null;
    const depts = DB.getDepartments();
    const desigs = DB.getDesignations();
    const managers = DB.getEmployees().filter(e => e.id !== id && e.status === 'active');

    document.getElementById('empFormTitle').textContent = id ? 'Edit Employee' : 'New Employee — Recruiting Form';
    const f = document.getElementById('empForm');
    f.reset();

    // Populate dropdowns
    const deptEl = document.getElementById('emp_department');
    if (deptEl) deptEl.innerHTML = `<option value="">Select Department</option>` + depts.map(d => `<option value="${d}">${d}</option>`).join('');
    const desigEl = document.getElementById('emp_designation');
    if (desigEl) desigEl.innerHTML = `<option value="">Select Designation</option>` + desigs.map(d => `<option value="${d}">${d}</option>`).join('');
    const mgEl = document.getElementById('emp_reportingManager');
    if (mgEl) mgEl.innerHTML = `<option value="">Select Manager</option>` + managers.map(e => `<option value="${e.firstName+' '+e.lastName}">${e.empCode} - ${e.firstName} ${e.lastName}</option>`).join('');

    if (emp) {
      // Fill form fields
      const fields = ['empCode','firstName','lastName','fatherName','motherName','dob','gender','maritalStatus',
        'phone','alternatePhone','email','personalEmail','pan','aadhar','passportNo','drivingLicense',
        'joiningDate','confirmationDate','designation','department','reportingManager','employmentType','grade',
        'projectName',
        'presentAddr1','presentAddr2','presentCity','presentState','presentPin',
        'permAddr1','permAddr2','permCity','permState','permPin',
        'bankAccount','ifsc','bankName','bankBranch',
        'basic','hraAmount','foodAmount','phoneBillAmount','mobilePhoneAmount','conveyanceAmount','otherAllowance',
        'tdsAmount','pfRate','insuranceType','leaveEntitlement','medicalInsuranceAmount','status','remarks'];
      fields.forEach(f => {
        const el = document.getElementById('emp_'+f);
        if (el && emp[f] !== undefined) el.value = emp[f];
      });
      // Checkboxes
      ['hasHRA','hasFoodAllowance','hasPhoneBillAllowance','hasMobilePhoneAllowance','hasConveyance','hasBonus','hasLTA'].forEach(k => {
        const el = document.getElementById('emp_'+k); if (el) el.checked = !!emp[k];
      });
      // Bonus fields
      if (document.getElementById('emp_bonusType')) document.getElementById('emp_bonusType').value = emp.bonusType||'fixed';
      if (document.getElementById('emp_bonusValue')) document.getElementById('emp_bonusValue').value = emp.bonusValue||'';
      if (document.getElementById('emp_ltaAmount')) document.getElementById('emp_ltaAmount').value = emp.ltaAmount||'';
      // Documents — show existing previews
      if (emp.photo) { const p = document.getElementById('emp_photoPreview'); if(p) p.innerHTML = `<img src="${emp.photo}" style="width:80px;height:80px;border-radius:50%;object-fit:cover;border:2px solid #ddd">`; }
      if (emp.appointmentLetter) { const p = document.getElementById('emp_apptLetterPreview'); if(p) p.innerHTML = emp.appointmentLetter.startsWith('data:image')?`<img src="${emp.appointmentLetter}" style="max-height:60px;border-radius:4px">`:`<span class="badge bg-success"><i class="fas fa-file-pdf me-1"></i>Letter on file</span>`; }
      this._certCounter = 0;
      const cc = document.getElementById('emp_certsContainer'); if (cc) cc.innerHTML = '';
      if (emp.certificates?.length) { emp.certificates.forEach((c,i) => this.addCertRow(c)); }
    } else {
      const codeEl = document.getElementById('emp_empCode');
      if (codeEl) codeEl.value = DB.nextEmpCode();
      const pfEl = document.getElementById('emp_pfRate'); if (pfEl) pfEl.value = '12';
      const leEl = document.getElementById('emp_leaveEntitlement'); if (leEl) leEl.value = '30';
      const stEl = document.getElementById('emp_status'); if (stEl) stEl.value = 'active';
      const itEl = document.getElementById('emp_insuranceType'); if (itEl) itEl.value = 'ESI';
      const cvEl = document.getElementById('emp_conveyanceAmount'); if (cvEl) cvEl.value = '1600';
      const cvCk = document.getElementById('emp_hasConveyance'); if (cvCk) cvCk.checked = true;
      this._certCounter = 0;
      const cc = document.getElementById('emp_certsContainer'); if (cc) cc.innerHTML = '';
    }
    new bootstrap.Modal(document.getElementById('empFormModal')).show();
  },

  edit(id) { this.openForm(id); },

  async save() {
    const g = id => document.getElementById(id)?.value?.trim()||'';
    const gc = id => document.getElementById(id)?.checked||false;
    if (!g('emp_firstName') || !g('emp_empCode')) { alert('Employee Code and First Name are required.'); return; }

    // Read existing employee to preserve fields not in form (photo if unchanged, etc.)
    const existing = this.currentId ? DB.getEmployee(this.currentId) : {};

    const emp = {
      id: this.currentId || uuid(),
      empCode: g('emp_empCode'), firstName: g('emp_firstName'), lastName: g('emp_lastName'),
      fatherName: g('emp_fatherName'), motherName: g('emp_motherName'),
      dob: g('emp_dob'), gender: g('emp_gender'), maritalStatus: g('emp_maritalStatus'),
      phone: g('emp_phone'), alternatePhone: g('emp_alternatePhone'),
      email: g('emp_email'), personalEmail: g('emp_personalEmail'),
      pan: g('emp_pan'), aadhar: g('emp_aadhar'), passportNo: g('emp_passportNo'), drivingLicense: g('emp_drivingLicense'),
      joiningDate: g('emp_joiningDate'), confirmationDate: g('emp_confirmationDate'),
      designation: g('emp_designation'), department: g('emp_department'),
      reportingManager: g('emp_reportingManager'), projectName: g('emp_projectName'),
      employmentType: g('emp_employmentType'), grade: g('emp_grade'),
      presentAddr1: g('emp_presentAddr1'), presentAddr2: g('emp_presentAddr2'),
      presentCity: g('emp_presentCity'), presentState: g('emp_presentState'), presentPin: g('emp_presentPin'),
      permAddr1: g('emp_permAddr1'), permAddr2: g('emp_permAddr2'),
      permCity: g('emp_permCity'), permState: g('emp_permState'), permPin: g('emp_permPin'),
      bankAccount: g('emp_bankAccount'), ifsc: g('emp_ifsc'), bankName: g('emp_bankName'), bankBranch: g('emp_bankBranch'),
      basic: Number(g('emp_basic'))||0,
      hasHRA: gc('emp_hasHRA'), hraAmount: Number(g('emp_hraAmount'))||0,
      hasFoodAllowance: gc('emp_hasFoodAllowance'), foodAmount: Number(g('emp_foodAmount'))||0,
      hasPhoneBillAllowance: gc('emp_hasPhoneBillAllowance'), phoneBillAmount: Number(g('emp_phoneBillAmount'))||0,
      hasMobilePhoneAllowance: gc('emp_hasMobilePhoneAllowance'), mobilePhoneAmount: Number(g('emp_mobilePhoneAmount'))||0,
      hasConveyance: gc('emp_hasConveyance'), conveyanceAmount: Number(g('emp_conveyanceAmount'))||1600,
      otherAllowance: Number(g('emp_otherAllowance'))||0,
      tdsAmount: Number(g('emp_tdsAmount'))||0,
      hasBonus: gc('emp_hasBonus'), bonusType: g('emp_bonusType'), bonusValue: Number(g('emp_bonusValue'))||0,
      hasLTA: gc('emp_hasLTA'), ltaAmount: Number(g('emp_ltaAmount'))||0,
      pfRate: Number(g('emp_pfRate'))||12,
      insuranceType: g('emp_insuranceType'),
      leaveEntitlement: Number(g('emp_leaveEntitlement'))||30,
      medicalInsuranceAmount: Number(g('emp_medicalInsuranceAmount'))||0,
      status: g('emp_status')||'active',
      remarks: g('emp_remarks'),
    };

    // Documents — read new files; fall back to existing stored values
    const photoFile = document.getElementById('emp_photoFile');
    emp.photo = (photoFile?.files?.length) ? await this._readFile(photoFile) : (existing.photo||'');
    const apptFile = document.getElementById('emp_apptLetterFile');
    emp.appointmentLetter = (apptFile?.files?.length) ? await this._readFile(apptFile) : (existing.appointmentLetter||'');
    // Certificates
    const certNodes = document.querySelectorAll('.emp-cert-row');
    const certs = [];
    for (const row of certNodes) {
      const name = row.querySelector('.cert-name')?.value?.trim()||'';
      const inp = row.querySelector('.cert-file');
      const existing_data = row.dataset.existing || '';
      const data = (inp?.files?.length) ? await this._readFile(inp) : existing_data;
      if (name || data) certs.push({ name, data });
    }
    emp.certificates = certs;

    DB.upsertEmployee(emp);
    DB.initLeaveBalance(emp, new Date().getFullYear());
    bootstrap.Modal.getInstance(document.getElementById('empFormModal')).hide();
    this.render();
    APP.showToast('Employee saved successfully', 'success');
  },

  _readFile(input, maxMB = 5) {
    return new Promise((resolve, reject) => {
      const file = input.files[0];
      if (!file) return resolve('');
      if (file.size > maxMB * 1024 * 1024) { alert(`File too large. Max ${maxMB} MB.`); return resolve(''); }
      const r = new FileReader();
      r.onload = e => resolve(e.target.result);
      r.onerror = () => resolve('');
      r.readAsDataURL(file);
    });
  },

  previewDoc(inputId, previewId, type) {
    const input = document.getElementById(inputId);
    const preview = document.getElementById(previewId);
    if (!input?.files?.length || !preview) return;
    const file = input.files[0];
    if (file.size > 5 * 1024 * 1024) { alert('File too large. Max 5 MB.'); input.value=''; return; }
    const r = new FileReader();
    r.onload = e => {
      if (type === 'photo' || file.type.startsWith('image/')) {
        preview.innerHTML = `<img src="${e.target.result}" style="width:80px;height:80px;${type==='photo'?'border-radius:50%;':''} object-fit:cover;border:2px solid #ddd">`;
      } else {
        preview.innerHTML = `<span class="badge bg-success fs-12"><i class="fas fa-file-pdf me-1"></i>${file.name}</span>`;
      }
    };
    r.readAsDataURL(file);
  },

  _certCounter: 0,
  addCertRow(existing = null) {
    const idx = this._certCounter++;
    const container = document.getElementById('emp_certsContainer');
    if (!container) return;
    const div = document.createElement('div');
    div.className = 'emp-cert-row d-flex gap-2 align-items-center mb-2';
    div.dataset.existing = existing?.data || '';
    div.innerHTML = `
      <input type="text" class="form-control form-control-sm cert-name" placeholder="Certificate / Document name" value="${existing?.name||''}">
      <input type="file" class="form-control form-control-sm cert-file" accept="image/*,application/pdf" style="max-width:220px">
      ${existing?.data ? `<a href="${existing.data}" target="_blank" class="btn btn-sm btn-outline-info" title="View"><i class="fas fa-eye"></i></a>` : ''}
      <button type="button" class="btn btn-sm btn-outline-danger" onclick="this.closest('.emp-cert-row').remove()" title="Remove"><i class="fas fa-times"></i></button>`;
    container.appendChild(div);
  },

  _salHistoryTab(empId) {
    const revs = DB.getSalaryRevsByEmp(empId);
    if (!revs.length) return `<div class="text-center text-muted py-4">No salary revisions recorded</div>`;
    const stars = n => n ? '★'.repeat(n)+'☆'.repeat(5-n) : '-';
    return `<div class="table-responsive"><table class="table table-sm table-bordered fs-12">
      <thead class="table-dark"><tr><th>Effective</th><th>Prev Basic</th><th>New Basic</th><th>Increment</th><th>%</th><th>Type</th><th>Rating</th><th>Grade</th><th>Approved By</th><th>Reason</th></tr></thead>
      <tbody>${revs.map(r=>`<tr>
        <td>${fmtDate(r.effectiveDate)}</td>
        <td>${currFmt(r.prevBasic)}</td>
        <td class="fw-600">${currFmt(r.newBasic)}</td>
        <td class="${r.increment>=0?'text-success':'text-danger'}">${r.increment>=0?'+':''}${currFmt(r.increment)}</td>
        <td>${r.incrementPct||'-'}</td>
        <td>${r.type||'-'}</td>
        <td class="text-warning">${stars(r.rating)}</td>
        <td>${r.grade||'-'}</td>
        <td>${r.approvedBy||'-'}</td>
        <td>${r.reason||'-'}</td>
      </tr>`).join('')}</tbody>
    </table></div>`;
  },

  _docsTab(emp) {
    return `<div class="row g-3">
      ${emp.photo?`<div class="col-md-3 text-center"><div class="text-muted fs-12 mb-1">Photo</div><img src="${emp.photo}" style="width:100px;height:100px;border-radius:50%;object-fit:cover;border:2px solid #ddd"></div>`:''}
      ${emp.appointmentLetter?`<div class="col-md-4"><div class="text-muted fs-12 mb-1">Appointment Letter</div>
        <a href="${emp.appointmentLetter}" target="_blank" class="btn btn-sm btn-outline-primary"><i class="fas fa-file me-1"></i>View Letter</a></div>`:''}
      ${emp.certificates?.length?`<div class="col-12"><div class="text-muted fs-12 mb-1">Certificates</div>
        ${emp.certificates.filter(c=>c.data).map(c=>`<a href="${c.data}" target="_blank" class="btn btn-sm btn-outline-secondary me-1 mb-1"><i class="fas fa-certificate me-1"></i>${c.name||'Document'}</a>`).join('')}</div>`:''}
    </div>`;
  },

  openSalaryRevision(empId) {
    const emp = DB.getEmployee(empId); if (!emp) return;
    document.getElementById('salrev_empId').value = empId;
    const info = document.getElementById('salrev_empInfo');
    if (info) info.innerHTML = `<strong>${emp.empCode} — ${emp.firstName} ${emp.lastName}</strong> | ${emp.designation||''} | ${emp.department||''} | Current Basic: <strong>${currFmt(emp.basic)}</strong>`;
    const prevEl = document.getElementById('salrev_prevBasic'); if (prevEl) prevEl.value = emp.basic||0;
    const newEl = document.getElementById('salrev_newBasic'); if (newEl) newEl.value = '';
    const incEl = document.getElementById('salrev_increment'); if (incEl) incEl.value = '';
    const dateEl = document.getElementById('salrev_effectiveDate'); if (dateEl) dateEl.value = today();
    const gradeEl = document.getElementById('salrev_grade'); if (gradeEl) gradeEl.value = emp.grade||'';
    document.getElementById('salrev_approvedBy').value = '';
    document.getElementById('salrev_reason').value = '';
    document.getElementById('salrev_remarks').value = '';
    document.getElementById('salrev_rating').value = '';
    // History
    const tbody = document.getElementById('salrev_histBody');
    const revs = DB.getSalaryRevsByEmp(empId);
    const stars = n => n ? '★'.repeat(n)+'☆'.repeat(5-n) : '-';
    tbody.innerHTML = revs.length ? revs.map(r=>`<tr>
      <td>${fmtDate(r.effectiveDate)}</td><td>${currFmt(r.prevBasic)}</td><td class="fw-600">${currFmt(r.newBasic)}</td>
      <td class="${r.increment>=0?'text-success':'text-danger'}">${r.increment>=0?'+':''}${currFmt(r.increment)}</td>
      <td>${r.incrementPct||'-'}</td><td>${r.type||'-'}</td>
      <td class="text-warning">${stars(r.rating)}</td><td>${r.grade||'-'}</td><td>${r.approvedBy||'-'}</td>
    </tr>`).join('') : '<tr><td colspan="9" class="text-center text-muted py-2">No revisions yet</td></tr>';
    new bootstrap.Modal(document.getElementById('salRevModal')).show();
  },

  calcRevision() {
    const prev = Number(document.getElementById('salrev_prevBasic')?.value||0);
    const nw = Number(document.getElementById('salrev_newBasic')?.value||0);
    if (!prev || !nw) return;
    const inc = nw - prev;
    const pct = prev > 0 ? ((inc/prev)*100).toFixed(1)+'%' : '-';
    const el = document.getElementById('salrev_increment');
    if (el) el.value = (inc>=0?'+':'')+currFmt(inc)+' ('+pct+')';
  },

  saveSalaryRevision() {
    const g = id => document.getElementById(id)?.value?.trim()||'';
    const empId = g('salrev_empId');
    const emp = DB.getEmployee(empId); if (!emp) return;
    const prevBasic = Number(g('salrev_prevBasic'))||0;
    const newBasic = Number(g('salrev_newBasic'))||0;
    if (!newBasic || !g('salrev_effectiveDate')) { alert('New Basic and Effective Date are required.'); return; }
    const increment = newBasic - prevBasic;
    const incrementPct = prevBasic > 0 ? (increment/prevBasic*100).toFixed(1)+'%' : '-';
    const rec = {
      id: uuid(), empId,
      effectiveDate: g('salrev_effectiveDate'),
      prevBasic, newBasic, increment, incrementPct,
      type: g('salrev_type'), grade: g('salrev_grade'),
      rating: Number(g('salrev_rating'))||0,
      approvedBy: g('salrev_approvedBy'),
      reason: g('salrev_reason'),
      remarks: g('salrev_remarks'),
      recordedOn: today()
    };
    DB.upsertSalaryRevision(rec);
    // Update employee's basic salary and grade
    emp.basic = newBasic;
    if (g('salrev_grade')) emp.grade = g('salrev_grade');
    DB.upsertEmployee(emp);
    bootstrap.Modal.getInstance(document.getElementById('salRevModal')).hide();
    this.render();
    APP.showToast(`Salary revised to ${currFmt(newBasic)} effective ${fmtDate(g('salrev_effectiveDate'))}`, 'success');
  },

  confirmDelete(id) {
    const emp = DB.getEmployee(id);
    if (!emp) return;
    if (confirm(`Delete ${emp.firstName} ${emp.lastName} (${emp.empCode})? This cannot be undone.`)) {
      DB.deleteEmployee(id);
      this.render();
      APP.showToast('Employee deleted', 'danger');
    }
  },

  printProfile(id) {
    const emp = DB.getEmployee(id); if (!emp) return;
    const assets = DB.getAssetsByEmp(id);
    const gross = Number(emp.basic||0) + (emp.hasHRA?Number(emp.hraAmount||0):0) +
      (emp.hasFoodAllowance?Number(emp.foodAmount||0):0) + Number(emp.otherAllowance||0);
    const w = window.open('','_blank','width=800,height=900');
    w.document.write(`<html><head><title>Employee Profile</title>
      <style>body{font-family:Arial;font-size:13px;padding:20px}h2{color:#1a3c5e}table{width:100%;border-collapse:collapse}
      td,th{border:1px solid #ccc;padding:6px 8px}th{background:#f0f0f0;font-weight:600}.sec{margin-top:16px;font-weight:700;font-size:14px;color:#1a3c5e;border-bottom:1px solid #ccc;padding-bottom:4px}</style>
      </head><body>
      <h2>Indus Projects Pvt. Ltd. — Employee Profile</h2>
      <p><strong>${emp.empCode}</strong> | ${emp.firstName} ${emp.lastName} | ${emp.designation} | ${emp.department}</p>
      <div class="sec">Personal Details</div>
      <table><tr><td>DOB</td><td>${fmtDate(emp.dob)}</td><td>Gender</td><td>${emp.gender}</td></tr>
      <tr><td>Phone</td><td>${emp.phone}</td><td>Email</td><td>${emp.email}</td></tr>
      <tr><td>PAN</td><td>${emp.pan}</td><td>Aadhar</td><td>${emp.aadhar}</td></tr>
      <tr><td>Joining Date</td><td>${fmtDate(emp.joiningDate)}</td><td>Status</td><td>${emp.status}</td></tr></table>
      <div class="sec">Salary Structure</div>
      <table><tr><th>Component</th><th>Amount</th></tr>
      <tr><td>Basic</td><td>₹${emp.basic}</td></tr>
      ${emp.hasHRA?`<tr><td>HRA</td><td>₹${emp.hraAmount}</td></tr>`:''}
      ${emp.hasFoodAllowance?`<tr><td>Food Allowance</td><td>₹${emp.foodAmount}</td></tr>`:''}
      ${emp.hasPhoneBillAllowance?`<tr><td>Phone Bill</td><td>₹${emp.phoneBillAmount}</td></tr>`:''}
      <tr><td><strong>Gross</strong></td><td><strong>₹${gross}</strong></td></tr>
      <tr><td>PF Rate</td><td>${emp.pfRate}% of Basic</td></tr>
      <tr><td>Insurance</td><td>${emp.insuranceType}</td></tr></table>
      ${assets.length?`<div class="sec">Assets</div><table><tr><th>Code</th><th>Name</th><th>Serial No</th><th>Assigned</th></tr>
      ${assets.map(a=>`<tr><td>${a.assetCode}</td><td>${a.assetName}</td><td>${a.serialNumber||'-'}</td><td>${fmtDate(a.assignment?.assignedDate)}</td></tr>`).join('')}</table>`:''}
      <br><p>Printed: ${new Date().toLocaleString()}</p>
      </body></html>`);
    w.document.close(); w.print();
  }
};
