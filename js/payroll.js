// ============================================================
// payroll.js — Payroll Processing Engine
// ============================================================

const PAY = {

  calcPayroll(emp, yr, mo) {
    const days = daysInMonth(yr, mo);
    // For the current month, only count days up to today (don't count future days as absent)
    const todayD = new Date();
    const isCurrentMonth = (yr === todayD.getFullYear() && mo === todayD.getMonth() + 1);
    const lastDay = isCurrentMonth ? Math.min(days, todayD.getDate()) : days;

    const att = DB.getAttByMonth(emp.id, yr, mo);
    // Count working days (exclude Sundays & holidays)
    let workingDays = 0, presentDays = 0, leaveDays = 0, absentDays = 0;
    for (let d = 1; d <= lastDay; d++) {
      const dt = `${yr}-${fmt2(mo)}-${fmt2(d)}`;
      const dow = new Date(dt).getDay();
      if (dow === 0 || DB.isHoliday(dt)) continue;
      workingDays++;
      const rec = DB.getAttByEmpDate(emp.id, dt);
      if (rec?.status === 'present') presentDays++;
      else if (rec?.status === 'half-day') { presentDays += 0.5; }
      else if (rec?.status === 'on-leave') leaveDays++;
      else absentDays++;
    }
    const payableDays = presentDays + leaveDays;
    const factor = workingDays > 0 ? payableDays / workingDays : 0;

    const basic = Number(emp.basic||0) * factor;
    const hra   = emp.hasHRA ? Number(emp.hraAmount||0) * factor : 0;
    const food  = emp.hasFoodAllowance ? Number(emp.foodAmount||0) * factor : 0;
    const phone = emp.hasPhoneBillAllowance ? Number(emp.phoneBillAmount||0) : 0; // flat
    const mobile= emp.hasMobilePhoneAllowance ? Number(emp.mobilePhoneAmount||0) : 0;
    const conveyance = emp.hasConveyance ? Number(emp.conveyanceAmount||1600) : 0; // flat
    const other = Number(emp.otherAllowance||0) * factor;
    const grossPay = basic + hra + food + phone + mobile + conveyance + other;

    // PF capped at ₹3,000 (wage ceiling ₹25,000)
    const pf = Math.min(Number(emp.basic||0) * factor * (Number(emp.pfRate||12)/100), 3000);
    let esi = 0, medIns = 0;
    if (emp.insuranceType === 'ESI') esi = grossPay * 0.0075;
    else if (emp.insuranceType === 'Medical') medIns = Number(emp.medicalInsuranceAmount||0);
    // Professional Tax: ₹200 if gross > ₹20,000; ₹150 if ₹15,001–₹20,000; else ₹0
    const pt = grossPay > 20000 ? 200 : grossPay > 15000 ? 150 : 0;
    // TDS / Income Tax
    const tds = Number(emp.tdsAmount||0);

    // Advance recovery
    const advances = DB.getAdvancesByEmp(emp.id).filter(a => a.status==='approved');
    let advRecovery = 0;
    advances.forEach(adv => {
      if (adv.repaymentMonths > 0) {
        const instalment = Number(adv.amount) / Number(adv.repaymentMonths);
        const paidSoFar = (adv.repayments||[]).reduce((s,r)=>s+r.amount,0);
        if (paidSoFar < Number(adv.amount)) advRecovery += instalment;
      }
    });

    const totalDeductions = pf + esi + medIns + pt + tds + advRecovery;
    const netPay = grossPay - totalDeductions;

    return {
      workingDays, presentDays, leaveDays, absentDays,
      earnings: { basic, hra, food, phoneBill: phone, mobilePhone: mobile, conveyance, other, grossPay },
      deductions: { pf, esi, medicalInsurance: medIns, pt, tds, advance: advRecovery, totalDeductions },
      netPay: Math.max(0, netPay),
      factor
    };
  },

  renderProcessing() {
    const mo = Number(document.getElementById('payMonth')?.value || new Date().getMonth()+1);
    const yr = Number(document.getElementById('payYear')?.value || new Date().getFullYear());
    const emps = DB.getEmployees().filter(e => e.status==='active');
    const tbody = document.getElementById('payProcessBody');
    if (!tbody) return;

    tbody.innerHTML = emps.map(emp => {
      const existing = DB.getPayroll(emp.id, mo, yr);
      const calc = this.calcPayroll(emp, yr, mo);
      return `<tr id="payrow_${emp.id}">
        <td><div class="fw-500">${emp.empCode}</div><div class="text-muted fs-12">${emp.firstName} ${emp.lastName}</div></td>
        <td>${emp.designation||'-'}</td>
        <td class="text-center">${calc.workingDays}</td>
        <td class="text-center">${calc.presentDays}</td>
        <td class="text-center text-danger">${calc.absentDays}</td>
        <td class="text-end">${currFmt(calc.earnings.grossPay)}</td>
        <td class="text-end text-danger">${currFmt(calc.deductions.totalDeductions)}</td>
        <td class="text-end fw-600 text-success">${currFmt(calc.netPay)}</td>
        <td><span class="badge bg-${existing?.status==='paid'?'success':existing?.status==='processed'?'info':'secondary'}">${existing?.status||'draft'}</span></td>
        <td>
          <div class="d-flex gap-1">
            <button class="btn btn-sm btn-outline-primary" onclick="PAY.processOne('${emp.id}',${mo},${yr})" title="Process"><i class="fas fa-cog"></i></button>
            <button class="btn btn-sm btn-outline-success" onclick="PAY.generateSlip('${emp.id}',${mo},${yr})" title="Payslip"><i class="fas fa-file-invoice"></i></button>
          </div>
        </td>
      </tr>`;
    }).join('') || '<tr><td colspan="10" class="text-center text-muted py-4">No active employees</td></tr>';

    // Totals
    let totalGross=0, totalDed=0, totalNet=0;
    emps.forEach(e => { const c = this.calcPayroll(e,yr,mo); totalGross+=c.earnings.grossPay; totalDed+=c.deductions.totalDeductions; totalNet+=c.netPay; });
    if (document.getElementById('payTotalGross')) document.getElementById('payTotalGross').textContent = currFmt(totalGross);
    if (document.getElementById('payTotalDed')) document.getElementById('payTotalDed').textContent = currFmt(totalDed);
    if (document.getElementById('payTotalNet')) document.getElementById('payTotalNet').textContent = currFmt(totalNet);
  },

  processOne(empId, mo, yr) {
    const emp = DB.getEmployee(empId); if (!emp) return;
    const calc = this.calcPayroll(emp, yr, mo);
    const existing = DB.getPayroll(empId, mo, yr);
    const pr = {
      id: existing?.id || uuid(),
      empId, month: mo, year: yr,
      workingDays: calc.workingDays, presentDays: calc.presentDays,
      leaveDays: calc.leaveDays, absentDays: calc.absentDays,
      earnings: calc.earnings,
      deductions: calc.deductions,
      netPay: calc.netPay,
      status: 'processed',
      processedDate: today()
    };
    DB.upsertPayroll(pr);
    this.renderProcessing();
    APP.showToast(`Payroll processed for ${emp.firstName}`, 'success');
  },

  processAll() {
    const mo = Number(document.getElementById('payMonth')?.value || new Date().getMonth()+1);
    const yr = Number(document.getElementById('payYear')?.value || new Date().getFullYear());
    const emps = DB.getEmployees().filter(e => e.status==='active');
    emps.forEach(emp => this.processOne(emp.id, mo, yr));
    APP.showToast(`All payrolls processed for ${monthName(mo)} ${yr}`, 'success');
  },

  markAllPaid() {
    const mo = Number(document.getElementById('payMonth')?.value || new Date().getMonth()+1);
    const yr = Number(document.getElementById('payYear')?.value || new Date().getFullYear());
    const all = DB.getPayrolls().filter(p => p.month===mo && p.year===yr && p.status==='processed');
    all.forEach(p => { p.status='paid'; p.paidDate=today(); DB.upsertPayroll(p); });
    this.renderProcessing();
    APP.showToast(`${all.length} payrolls marked as paid`, 'success');
  },

  // Generate payslip for any employee + month (uses saved payroll if exists, else live calc)
  generateSlip(empId, mo, yr) {
    const emp = DB.getEmployee(empId); if (!emp) return;
    const saved = DB.getPayroll(empId, mo, yr);
    const calc  = saved || this.calcPayroll(emp, yr, mo);
    const e = calc.earnings, d = calc.deductions;
    const co   = DB.getSetting('companyName', 'Indus Projects Pvt. Ltd.');
    const addr = DB.getSetting('companyAddress', '');
    const phone= DB.getSetting('companyPhone', '');

    const row = (label, val) => val > 0 ? `<tr><td>${label}</td><td class="amt">₹ ${numFmt(val)}</td></tr>` : '';
    const drow = (label, val) => val > 0 ? `<tr><td>${label}</td><td class="amt ded">₹ ${numFmt(val)}</td></tr>` : '';

    const html = `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><title>Pay Slip — ${emp.empCode} — ${monthName(mo)} ${yr}</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:'Arial',sans-serif;font-size:11.5px;color:#222;background:#fff;padding:24px;max-width:820px;margin:auto}
  .header{background:#1a3c5e;color:#fff;padding:14px 20px;border-radius:6px 6px 0 0;display:flex;justify-content:space-between;align-items:center}
  .header h1{font-size:18px;font-weight:700;margin:0}.header .sub{font-size:11px;opacity:.85;margin-top:3px}
  .slip-title{background:#2d7dd2;color:#fff;text-align:center;padding:7px;font-size:13px;font-weight:700;letter-spacing:1px}
  .emp-block{display:grid;grid-template-columns:1fr 1fr 1fr;gap:0;border:1px solid #d0d7e3;border-top:none}
  .emp-cell{padding:6px 10px;border-right:1px solid #d0d7e3;border-bottom:1px solid #d0d7e3}
  .emp-cell:last-child{border-right:none}.emp-cell .lbl{font-size:10px;color:#666;text-transform:uppercase;letter-spacing:.4px}
  .emp-cell .val{font-weight:600;font-size:12px;margin-top:1px}
  .pay-section{display:grid;grid-template-columns:1fr 1fr;gap:0;margin-top:12px;border:1px solid #d0d7e3;border-radius:4px;overflow:hidden}
  .col-head{background:#1a3c5e;color:#fff;font-weight:700;padding:7px 10px;font-size:12px}
  table.pay{width:100%;border-collapse:collapse}
  table.pay td{padding:5px 10px;border-bottom:1px solid #eef0f5}
  table.pay tr:last-child td{border-bottom:none}
  table.pay .amt{text-align:right;font-variant-numeric:tabular-nums}
  table.pay .ded{color:#c0392b}
  .total-row td{background:#e8f0fe;font-weight:700;padding:7px 10px}
  .net-bar{background:#1a3c5e;color:#fff;border-radius:0 0 4px 4px;padding:10px 16px;display:flex;justify-content:space-between;align-items:center;margin-top:0}
  .net-bar .words{font-size:11px;opacity:.9}.net-bar .amount{font-size:16px;font-weight:700}
  .att-row{display:flex;gap:8px;margin:10px 0}
  .att-box{flex:1;border:1px solid #d0d7e3;border-radius:4px;padding:6px 10px;text-align:center}
  .att-box .n{font-size:18px;font-weight:700;color:#1a3c5e}.att-box .l{font-size:10px;color:#777;margin-top:2px}
  .sig-row{display:flex;justify-content:space-between;margin-top:24px}
  .sig-box{border-top:1px solid #999;padding-top:4px;width:160px;text-align:center;font-size:10px;color:#555}
  .footer{font-size:9.5px;color:#aaa;margin-top:16px;border-top:1px solid #eee;padding-top:8px;text-align:center}
  .status-badge{display:inline-block;background:${saved?.status==='paid'?'#27ae60':saved?.status==='processed'?'#2d7dd2':'#aaa'};color:#fff;border-radius:3px;padding:2px 7px;font-size:10px;font-weight:700;vertical-align:middle}
  @media print{body{padding:0}button{display:none!important}}
</style></head><body>

<div class="header">
  <div>
    <h1>${co}</h1>
    <div class="sub">${addr}${phone?'  ·  Tel: '+phone:''}</div>
  </div>
  <div style="text-align:right">
    <div style="font-size:11px;opacity:.8">Pay Slip</div>
    <div style="font-size:15px;font-weight:700">${monthName(mo)} ${yr}</div>
    ${saved ? `<div class="status-badge">${saved.status.toUpperCase()}</div>` : '<div style="font-size:10px;opacity:.7">Draft / Preview</div>'}
  </div>
</div>
<div class="slip-title">SALARY SLIP</div>

<div class="emp-block">
  <div class="emp-cell"><div class="lbl">Employee Code</div><div class="val">${emp.empCode}</div></div>
  <div class="emp-cell"><div class="lbl">Employee Name</div><div class="val">${emp.firstName} ${emp.lastName}</div></div>
  <div class="emp-cell"><div class="lbl">Designation</div><div class="val">${emp.designation||'-'}</div></div>
  <div class="emp-cell"><div class="lbl">Department</div><div class="val">${emp.department||'-'}</div></div>
  <div class="emp-cell"><div class="lbl">Date of Joining</div><div class="val">${emp.doj?fmtDate(emp.doj):'-'}</div></div>
  <div class="emp-cell"><div class="lbl">Date of Birth</div><div class="val">${emp.dob?fmtDate(emp.dob):'-'}</div></div>
  <div class="emp-cell"><div class="lbl">PAN</div><div class="val">${emp.pan||'-'}</div></div>
  <div class="emp-cell"><div class="lbl">PF Number</div><div class="val">${emp.pfNumber||'-'}</div></div>
  <div class="emp-cell"><div class="lbl">Bank Account</div><div class="val">${emp.bankAccount||'-'}</div></div>
</div>

<div class="att-row">
  <div class="att-box"><div class="n">${calc.workingDays||0}</div><div class="l">Working Days</div></div>
  <div class="att-box"><div class="n" style="color:#27ae60">${calc.presentDays||0}</div><div class="l">Days Present</div></div>
  <div class="att-box"><div class="n" style="color:#e67e22">${calc.leaveDays||0}</div><div class="l">Leave Days</div></div>
  <div class="att-box"><div class="n" style="color:#c0392b">${calc.absentDays||0}</div><div class="l">Absent Days</div></div>
  <div class="att-box"><div class="n" style="color:#2d7dd2">${typeof calc.factor==='number'?(calc.factor*100).toFixed(0)+'%':'—'}</div><div class="l">Pay Factor</div></div>
</div>

<div class="pay-section">
  <div>
    <div class="col-head">Earnings</div>
    <table class="pay">
      ${row('Basic Salary', e.basic)}
      ${row('House Rent Allowance (HRA)', e.hra)}
      ${row('Food Allowance', e.food)}
      ${row('Conveyance Allowance', e.conveyance)}
      ${row('Phone Bill Allowance', e.phoneBill)}
      ${row('Mobile Phone Allowance', e.mobilePhone)}
      ${row('Other Allowance', e.other)}
      <tr class="total-row"><td>Gross Earnings</td><td class="amt">₹ ${numFmt(e.grossPay)}</td></tr>
    </table>
  </div>
  <div style="border-left:1px solid #d0d7e3">
    <div class="col-head">Deductions</div>
    <table class="pay">
      ${drow(`Provident Fund (${emp.pfRate||12}%)`, d.pf)}
      ${drow('Professional Tax (PT)', d.pt)}
      ${drow('ESI (Employee 0.75%)', d.esi)}
      ${drow('Medical Insurance', d.medicalInsurance)}
      ${drow('TDS / Income Tax', d.tds)}
      ${drow('Advance Recovery', d.advance)}
      <tr class="total-row"><td>Total Deductions</td><td class="amt ded">₹ ${numFmt(d.totalDeductions)}</td></tr>
    </table>
  </div>
</div>

<div class="net-bar">
  <div>
    <div class="words">Net Pay (in words): <strong>${numToWords(Math.round(calc.netPay))} Rupees Only</strong></div>
  </div>
  <div class="amount">₹ ${numFmt(calc.netPay)}</div>
</div>

<div class="sig-row">
  <div class="sig-box">Employee Signature</div>
  <div class="sig-box">Prepared By</div>
  <div class="sig-box">Authorized Signatory</div>
</div>

<div class="footer">
  This is a computer-generated pay slip. No signature is required if generated electronically. &nbsp;|&nbsp;
  Generated: ${new Date().toLocaleString('en-IN')}
</div>

<div style="text-align:center;margin-top:12px;display:flex;gap:8px;justify-content:center">
  <button onclick="window.print()" style="background:#1a3c5e;color:#fff;border:none;padding:8px 20px;border-radius:4px;cursor:pointer;font-size:13px">🖨 Print / Save PDF</button>
  <button onclick="window.close()" style="background:#ccc;color:#333;border:none;padding:8px 20px;border-radius:4px;cursor:pointer;font-size:13px">Close</button>
</div>

</body></html>`;

    const w = window.open('', '_blank', 'width=870,height=1000');
    w.document.write(html);
    w.document.close();
  },

  printSlip(payrollId) {
    const pr = DB.getPayrolls().find(p => p.id === payrollId);
    if (!pr) return;
    this.generateSlip(pr.empId, pr.month, pr.year);
  },

  renderBonusRegister() {
    const formula = document.getElementById('bonusFormula')?.value || '1month';
    const tbody = document.getElementById('bonusRegBody');
    if (!tbody) return;
    const emps = DB.getEmployees().filter(e => e.status === 'active' && e.hasBonus);
    if (!emps.length) {
      tbody.innerHTML = '<tr><td colspan="9" class="text-center text-muted py-4">No employees with bonus eligibility — configure in Employee Register → Payroll tab</td></tr>';
      return;
    }
    const labels = { '1month':'Festival (1 Month Basic)', 'statutory':'Statutory Min (8.33%)', '20pct':'Annual (20% of Basic)', 'configured':'As Configured' };
    let total = 0;
    tbody.innerHTML = emps.map((emp, i) => {
      const basic = Number(emp.basic || 0);
      let amount = 0;
      if (formula === '1month') {
        amount = basic;
      } else if (formula === 'statutory') {
        amount = Math.min(basic, 7000) * 12 * 8.33 / 100;
      } else if (formula === '20pct') {
        amount = basic * 12 * 20 / 100;
      } else {
        amount = emp.bonusType === 'percentage' ? basic * Number(emp.bonusValue||0)/100 : Number(emp.bonusValue||0);
      }
      amount = Math.round(amount);
      total += amount;
      return `<tr>
        <td>${i+1}</td><td>${emp.empCode||''}</td>
        <td>${emp.firstName||''} ${emp.lastName||''}</td>
        <td>${emp.designation||'-'}</td><td>${emp.department||'-'}</td>
        <td class="text-end">${currFmt(basic)}</td>
        <td>${labels[formula]||formula}</td>
        <td class="text-end fw-600">${currFmt(amount)}</td>
        <td class="text-end">${currFmt(amount)}</td>
      </tr>`;
    }).join('') + `<tr class="table-dark fw-bold"><td colspan="7" class="text-end">Total Bonus:</td><td class="text-end">${currFmt(total)}</td><td class="text-end">${currFmt(total)}</td></tr>`;
  },

  openBonusForm() {
    const f = document.getElementById('bonusForm'); if (!f) return;
    f.reset();
    const emps = DB.getEmployees().filter(e=>e.status==='active'&&e.hasBonus);
    document.getElementById('bon_empId').innerHTML = `<option value="">Select Employee</option>` +
      emps.map(e=>`<option value="${e.id}">${e.empCode} - ${e.firstName} ${e.lastName}</option>`).join('');
    document.getElementById('bon_date').value = today();
    document.getElementById('bon_year').value = new Date().getFullYear();
    new bootstrap.Modal(document.getElementById('bonusModal')).show();
  },

  updateBonusCalc() {
    const empId = document.getElementById('bon_empId')?.value;
    const emp = empId ? DB.getEmployee(empId) : null;
    if (!emp) return;
    if (emp.bonusType === 'percentage') {
      const amt = Number(emp.basic||0) * Number(emp.bonusValue||0) / 100;
      document.getElementById('bon_amount').value = amt.toFixed(2);
      document.getElementById('bon_type').value = `${emp.bonusValue}% of Basic`;
    } else {
      document.getElementById('bon_amount').value = emp.bonusValue||'';
      document.getElementById('bon_type').value = 'Fixed Amount';
    }
  },

  saveBonus() {
    const g = id => document.getElementById(id)?.value?.trim()||'';
    const rec = {
      id: uuid(), empId: g('bon_empId'), year: g('bon_year'),
      month: g('bon_month'), bonusDate: g('bon_date'),
      bonusType: g('bon_type'), amount: Number(g('bon_amount')),
      remarks: g('bon_remarks'), status: 'paid'
    };
    if (!rec.empId || !rec.amount) { alert('Please fill required fields.'); return; }
    DB.upsertBonusRecord(rec);
    bootstrap.Modal.getInstance(document.getElementById('bonusModal')).hide();
    this.renderBonusRegister();
    APP.showToast('Bonus recorded', 'success');
  },

  renderLTARegister() {
    const yr = Number(document.getElementById('ltaYear')?.value || new Date().getFullYear());
    const tbody = document.getElementById('ltaRegBody');
    if (!tbody) return;
    const emps = DB.getEmployees().filter(e => e.status === 'active' && e.hasLTA);
    if (!emps.length) {
      tbody.innerHTML = '<tr><td colspan="9" class="text-center text-muted py-4">No employees with LTA eligibility — configure in Employee Register → Payroll tab</td></tr>';
      return;
    }
    const yrStr = String(yr);
    let total = 0;
    tbody.innerHTML = emps.map((emp, i) => {
      const basic = Number(emp.basic || 0);
      // Sum paid days from payroll records for the year
      let paidDays = 0;
      for (let mo = 1; mo <= 12; mo++) {
        const pr = DB.getPayroll(emp.id, mo, yr);
        if (pr) paidDays += (Number(pr.presentDays || 0) + Number(pr.leaveDays || 0));
      }
      // Fall back to attendance records if no payroll data
      if (!paidDays) {
        const att = DB.getAttendance().filter(a => a.empId === emp.id && a.date.startsWith(yrStr));
        paidDays = att.filter(a => ['P','present','HD','half-day','on-leave','PL','SL','CL','EL','WO','H','paid'].includes(a.status)).length;
      }
      const payableMonths = Math.min(paidDays / 30, 12);
      const annual = Math.round((basic / 12) * payableMonths);
      total += annual;
      return `<tr>
        <td>${i+1}</td><td>${emp.empCode||''}</td>
        <td>${emp.firstName||''} ${emp.lastName||''}</td>
        <td>${emp.designation||'-'}</td><td>${emp.department||'-'}</td>
        <td class="text-end">${currFmt(basic)}</td>
        <td class="text-center">${paidDays}</td>
        <td class="text-end">${numFmt(payableMonths)}</td>
        <td class="text-end fw-600">${currFmt(annual)}</td>
      </tr>`;
    }).join('') + `<tr class="table-dark fw-bold"><td colspan="8" class="text-end">Total Annual LTA:</td><td class="text-end">${currFmt(total)}</td></tr>`;
  },

  openLTAForm() {
    const f = document.getElementById('ltaForm'); if (!f) return;
    f.reset();
    const emps = DB.getEmployees().filter(e=>e.status==='active'&&e.hasLTA);
    document.getElementById('lta_empId').innerHTML = `<option value="">Select Employee</option>` +
      emps.map(e=>`<option value="${e.id}">${e.empCode} - ${e.firstName} ${e.lastName} (LTA: ₹${e.ltaAmount})</option>`).join('');
    document.getElementById('lta_claimDate').value = today();
    document.getElementById('lta_year').value = new Date().getFullYear();
    new bootstrap.Modal(document.getElementById('ltaModal')).show();
  },

  saveLTA() {
    const g = id => document.getElementById(id)?.value?.trim()||'';
    const rec = {
      id: uuid(), empId: g('lta_empId'), year: g('lta_year'),
      claimDate: g('lta_claimDate'),
      travelFrom: g('lta_from'), travelTo: g('lta_to'),
      travelFrom_date: g('lta_travelFrom'), travelTo_date: g('lta_travelTo'),
      claimAmount: Number(g('lta_amount')),
      remarks: g('lta_remarks'), status: 'paid'
    };
    if (!rec.empId || !rec.claimAmount) { alert('Please fill required fields.'); return; }
    DB.upsertLTARecord(rec);
    bootstrap.Modal.getInstance(document.getElementById('ltaModal')).hide();
    this.renderLTARegister();
    APP.showToast('LTA claim recorded', 'success');
  },

  exportPayroll() {
    const mo = Number(document.getElementById('payMonth')?.value || new Date().getMonth()+1);
    const yr = Number(document.getElementById('payYear')?.value || new Date().getFullYear());
    const payrolls = DB.getPayrolls().filter(p=>p.month===mo&&p.year===yr);
    if (!payrolls.length) { alert('No payroll data for selected month.'); return; }
    let csv = 'Emp Code,Name,Designation,Department,Working Days,Present,Basic,HRA,Food,Phone Bill,Mobile,Other,Gross Pay,PF,ESI,Medical Ins,Advance,Total Deductions,Net Pay,Status\n';
    payrolls.forEach(p => {
      const emp = DB.getEmployee(p.empId);
      const e = p.earnings, d = p.deductions;
      csv += `${emp?.empCode||''},${emp?`${emp.firstName} ${emp.lastName}`:''},${emp?.designation||''},${emp?.department||''},`;
      csv += `${p.workingDays},${p.presentDays},`;
      csv += `${numFmt(e.basic)},${numFmt(e.hra)},${numFmt(e.food)},${numFmt(e.phoneBill)},${numFmt(e.mobilePhone)},${numFmt(e.other)},${numFmt(e.grossPay)},`;
      csv += `${numFmt(d.pf)},${numFmt(d.esi)},${numFmt(d.medicalInsurance)},${numFmt(d.advance)},${numFmt(d.totalDeductions)},${numFmt(p.netPay)},${p.status}\n`;
    });
    const blob = new Blob([csv],{type:'text/csv'});
    const a = document.createElement('a'); a.href=URL.createObjectURL(blob);
    a.download=`Payroll_${yr}_${fmt2(mo)}.csv`; a.click();
  },

  // ── Salary Register ──────────────────────────────────────────
  renderSalaryRegister() {
    const mo = Number(document.getElementById('salRegMonth')?.value || new Date().getMonth()+1);
    const yr = Number(document.getElementById('salRegYear')?.value  || new Date().getFullYear());
    const emps = DB.getEmployees().filter(e => e.status === 'active');

    document.getElementById('salRegLabel').textContent = `${monthName(mo)} ${yr}`;

    let totBasic=0, totHRA=0, totFood=0, totConv=0, totPhone=0, totMobile=0, totOther=0,
        totGross=0, totPF=0, totPT=0, totESI=0, totMed=0, totTDS=0, totAdv=0, totDed=0, totNet=0;

    const rows = emps.map((emp, i) => {
      const c = this.calcPayroll(emp, yr, mo);
      const e = c.earnings, d = c.deductions;
      totBasic+=e.basic; totHRA+=e.hra; totFood+=e.food; totConv+=e.conveyance;
      totPhone+=e.phoneBill; totMobile+=e.mobilePhone; totOther+=e.other; totGross+=e.grossPay;
      totPF+=d.pf; totPT+=d.pt; totESI+=d.esi; totMed+=d.medicalInsurance;
      totTDS+=d.tds; totAdv+=d.advance; totDed+=d.totalDeductions; totNet+=c.netPay;
      return `<tr>
        <td class="sr-no">${i+1}</td>
        <td class="sr-code">${emp.empCode}</td>
        <td class="sr-name">${emp.firstName} ${emp.lastName}</td>
        <td class="sr-desig">${emp.designation||'-'}</td>
        <td class="sr-num">${c.workingDays}</td>
        <td class="sr-num text-success">${c.presentDays}</td>
        <td class="sr-num text-danger">${c.absentDays}</td>
        <td class="sr-amt">${e.basic>0?currFmt(e.basic):'-'}</td>
        <td class="sr-amt">${e.hra>0?currFmt(e.hra):'-'}</td>
        <td class="sr-amt">${e.conveyance>0?currFmt(e.conveyance):'-'}</td>
        <td class="sr-amt">${e.food>0?currFmt(e.food):'-'}</td>
        <td class="sr-amt">${e.phoneBill>0?currFmt(e.phoneBill):'-'}</td>
        <td class="sr-amt">${e.mobilePhone>0?currFmt(e.mobilePhone):'-'}</td>
        <td class="sr-amt">${e.other>0?currFmt(e.other):'-'}</td>
        <td class="sr-amt sr-gross">${currFmt(e.grossPay)}</td>
        <td class="sr-amt sr-ded">${d.pf>0?currFmt(d.pf):'-'}</td>
        <td class="sr-amt sr-ded">${d.pt>0?currFmt(d.pt):'-'}</td>
        <td class="sr-amt sr-ded">${d.esi>0?currFmt(d.esi):'-'}</td>
        <td class="sr-amt sr-ded">${d.medicalInsurance>0?currFmt(d.medicalInsurance):'-'}</td>
        <td class="sr-amt sr-ded">${d.tds>0?currFmt(d.tds):'-'}</td>
        <td class="sr-amt sr-ded">${d.advance>0?currFmt(d.advance):'-'}</td>
        <td class="sr-amt sr-ded">${d.totalDeductions>0?currFmt(d.totalDeductions):'-'}</td>
        <td class="sr-amt sr-net">${currFmt(c.netPay)}</td>
        <td class="sr-proj">${emp.projectName||'-'}</td>
      </tr>`;
    }).join('');

    const totalRow = `<tr class="sr-total">
      <td colspan="7" class="text-end fw-700 pe-2">TOTAL</td>
      <td class="sr-amt">${currFmt(totBasic)}</td>
      <td class="sr-amt">${currFmt(totHRA)}</td>
      <td class="sr-amt">${currFmt(totConv)}</td>
      <td class="sr-amt">${currFmt(totFood)}</td>
      <td class="sr-amt">${currFmt(totPhone)}</td>
      <td class="sr-amt">${currFmt(totMobile)}</td>
      <td class="sr-amt">${currFmt(totOther)}</td>
      <td class="sr-amt sr-gross">${currFmt(totGross)}</td>
      <td class="sr-amt sr-ded">${currFmt(totPF)}</td>
      <td class="sr-amt sr-ded">${currFmt(totPT)}</td>
      <td class="sr-amt sr-ded">${currFmt(totESI)}</td>
      <td class="sr-amt sr-ded">${currFmt(totMed)}</td>
      <td class="sr-amt sr-ded">${currFmt(totTDS)}</td>
      <td class="sr-amt sr-ded">${currFmt(totAdv)}</td>
      <td class="sr-amt sr-ded">${currFmt(totDed)}</td>
      <td class="sr-amt sr-net">${currFmt(totNet)}</td>
      <td></td>
    </tr>`;

    document.getElementById('salRegBody').innerHTML = rows + totalRow;
  },

  exportSalaryExcel() {
    const mo = Number(document.getElementById('salRegMonth')?.value || new Date().getMonth()+1);
    const yr = Number(document.getElementById('salRegYear')?.value  || new Date().getFullYear());
    const tableEl = document.querySelector('#regSalary table');
    if (!tableEl) { APP.showToast('No data to export','danger'); return; }
    exportRegisterExcel(null, `SalaryRegister_${yr}_${fmt2(mo)}`, tableEl);
  },

  exportSalaryPDF() {
    const mo = Number(document.getElementById('salRegMonth')?.value || new Date().getMonth()+1);
    const yr = Number(document.getElementById('salRegYear')?.value  || new Date().getFullYear());
    const tableEl = document.querySelector('#regSalary table');
    if (!tableEl) return;
    exportRegisterPDF(`Salary Register — ${monthName(mo)} ${yr}`, tableEl);
  },

  exportSalaryWord() {
    const mo = Number(document.getElementById('salRegMonth')?.value || new Date().getMonth()+1);
    const yr = Number(document.getElementById('salRegYear')?.value  || new Date().getFullYear());
    const tableEl = document.querySelector('#regSalary table');
    if (!tableEl) return;
    exportRegisterWord(`Salary Register — ${monthName(mo)} ${yr}`, tableEl, `SalaryRegister_${yr}_${fmt2(mo)}`);
  },

  renderBankPaymentStatement() {
    const mo = Number(document.getElementById('bankRegMonth')?.value || new Date().getMonth()+1);
    const yr = Number(document.getElementById('bankRegYear')?.value  || new Date().getFullYear());
    if (document.getElementById('bankRegLabel')) document.getElementById('bankRegLabel').textContent = `${monthName(mo)} ${yr}`;
    const emps = DB.getEmployees().filter(e => e.status === 'active');
    const tbody = document.getElementById('bankRegBody');
    const tfoot = document.getElementById('bankRegFoot');
    if (!tbody) return;
    if (!emps.length) { tbody.innerHTML = '<tr><td colspan="10" class="text-center text-muted py-4">No active employees found</td></tr>'; if (tfoot) tfoot.innerHTML = ''; return; }
    let totalNet = 0;
    tbody.innerHTML = emps.map((emp, i) => {
      const calc = this.calcPayroll(emp, yr, mo);
      totalNet += calc.netPay;
      return `<tr>
        <td>${i+1}</td>
        <td>${emp.empCode||''}</td>
        <td>${emp.firstName||''} ${emp.lastName||''}</td>
        <td>${emp.designation||'-'}</td>
        <td>${emp.department||'-'}</td>
        <td>${emp.bankName||'-'}</td>
        <td>${emp.bankAccount||'-'}</td>
        <td>${emp.ifsc||'-'}</td>
        <td>${emp.bankBranch||'-'}</td>
        <td class="text-end fw-600">${currFmt(calc.netPay)}</td>
      </tr>`;
    }).join('');
    if (tfoot) tfoot.innerHTML = `<tr class="table-dark fw-bold"><td colspan="9" class="text-end">Total Net Pay:</td><td class="text-end">${currFmt(totalNet)}</td></tr>`;
  },

  exportBankExcel() {
    const mo = Number(document.getElementById('bankRegMonth')?.value || new Date().getMonth()+1);
    const yr = Number(document.getElementById('bankRegYear')?.value  || new Date().getFullYear());
    const tableEl = document.getElementById('bankRegTable');
    exportRegisterExcel(null, `BankPaymentStatement_${yr}_${fmt2(mo)}`, tableEl);
  },

  exportBankPDF() {
    const mo = Number(document.getElementById('bankRegMonth')?.value || new Date().getMonth()+1);
    const yr = Number(document.getElementById('bankRegYear')?.value  || new Date().getFullYear());
    const tableEl = document.getElementById('bankRegTable');
    exportRegisterPDF(`Bank Payment Statement — ${monthName(mo)} ${yr}`, tableEl);
  },

  exportBankWord() {
    const mo = Number(document.getElementById('bankRegMonth')?.value || new Date().getMonth()+1);
    const yr = Number(document.getElementById('bankRegYear')?.value  || new Date().getFullYear());
    const tableEl = document.getElementById('bankRegTable');
    exportRegisterWord(`Bank Payment Statement — ${monthName(mo)} ${yr}`, tableEl, `BankPaymentStatement_${yr}_${fmt2(mo)}`);
  },

  exportSalaryRegister() {
    const mo = Number(document.getElementById('salRegMonth')?.value || new Date().getMonth()+1);
    const yr = Number(document.getElementById('salRegYear')?.value  || new Date().getFullYear());
    const emps = DB.getEmployees().filter(e => e.status==='active');
    let csv = `Salary Register — ${monthName(mo)} ${yr} — Indus Projects Pvt. Ltd.\n`;
    csv += 'Sr,Emp Code,Name,Designation,Working Days,Present,Absent,Basic,HRA,Conveyance,Food Allow.,Phone Bill,Mobile Phone,Other Allow.,Gross Pay,PF,PT,ESI,Med.Ins,TDS,Advance,Total Deductions,Net Pay,Project Name\n';
    emps.forEach((emp,i) => {
      const c = this.calcPayroll(emp, yr, mo);
      const e = c.earnings, d = c.deductions;
      csv += `${i+1},${emp.empCode},"${emp.firstName} ${emp.lastName}",${emp.designation||''},`;
      csv += `${c.workingDays},${c.presentDays},${c.absentDays},`;
      csv += `${numFmt(e.basic)},${numFmt(e.hra)},${numFmt(e.conveyance)},${numFmt(e.food)},${numFmt(e.phoneBill)},${numFmt(e.mobilePhone)},${numFmt(e.other)},${numFmt(e.grossPay)},`;
      csv += `${numFmt(d.pf)},${numFmt(d.pt)},${numFmt(d.esi)},${numFmt(d.medicalInsurance)},${numFmt(d.tds)},${numFmt(d.advance)},${numFmt(d.totalDeductions)},${numFmt(c.netPay)},"${emp.projectName||''}"\n`;
    });
    const blob = new Blob(['﻿'+csv], {type:'text/csv;charset=utf-8'});
    const a = document.createElement('a'); a.href=URL.createObjectURL(blob);
    a.download=`SalaryRegister_${yr}_${fmt2(mo)}.csv`; a.click();
  }
};

// ── Export Utility Functions ──────────────────────────────────────────

function exportRegisterExcel(tbodyId, filename, tableElParam) {
  if (typeof XLSX === 'undefined') { alert('Excel library not loaded. Please refresh the page.'); return; }
  const tableEl = tableElParam || (tbodyId ? document.getElementById(tbodyId)?.closest('table') : null);
  if (!tableEl) { alert('No data to export'); return; }
  const wb = XLSX.utils.table_to_book(tableEl, {sheet: 'Sheet1'});
  XLSX.writeFile(wb, (filename||'Report') + '.xlsx');
}

function exportRegisterPDF(title, tableEl) {
  if (!tableEl) { alert('No data to export'); return; }
  const co = DB.getSetting('companyName','Indus Projects Pvt. Ltd.');
  const win = window.open('', '_blank');
  if (!win) { alert('Please allow popups for PDF export'); return; }
  win.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>${title}</title>
    <style>
      body{font-family:Arial,sans-serif;font-size:9pt;margin:12px}
      h2{text-align:center;font-size:13pt;margin-bottom:3px}
      .sub{text-align:center;font-size:9pt;color:#555;margin-bottom:8px}
      table{width:100%;border-collapse:collapse}
      th{background:#1a3c5e;color:#fff;padding:4px 5px;font-size:8pt;text-align:center;border:1px solid #aaa}
      td{border:1px solid #ccc;padding:3px 5px;font-size:8pt}
      .text-end{text-align:right} .sr-total td{background:#e8f0fe;font-weight:bold}
      @page{size:A4 landscape;margin:8mm}
      .no-print{display:none}
      @media screen{.no-print{display:block;text-align:center;margin-top:12px}}
    </style></head><body>
    <h2>${title}</h2>
    <div class="sub">${co} &nbsp;·&nbsp; Printed: ${new Date().toLocaleDateString('en-IN')}</div>
    ${tableEl.outerHTML}
    <div class="no-print"><button onclick="window.print()" style="padding:6px 24px;background:#1a3c5e;color:#fff;border:none;cursor:pointer;border-radius:4px">Print / Save as PDF</button></div>
    <scr`+`ipt>window.onload=()=>setTimeout(()=>window.print(),400)<\/scr`+`ipt>
    </body></html>`);
  win.document.close();
}

function exportRegisterWord(title, tableEl, filename) {
  if (!tableEl) { alert('No data to export'); return; }
  const co = DB.getSetting('companyName','Indus Projects Pvt. Ltd.');
  const html = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word">
    <head><meta charset="utf-8"><title>${title}</title>
    <style>
      body{font-family:Arial,sans-serif;font-size:9pt}
      h2{text-align:center;font-size:14pt;margin-bottom:3px}
      .sub{text-align:center;font-size:9pt;color:#555}
      table{border-collapse:collapse;width:100%}
      th{background:#1a3c5e;color:#fff;padding:3px 5px;font-size:8pt;border:1px solid #000;text-align:center}
      td{border:1px solid #000;padding:3px 5px;font-size:8pt}
    </style></head>
    <body>
    <h2>${title}</h2>
    <p class="sub">${co}</p>
    ${tableEl.outerHTML}
    </body></html>`;
  const blob = new Blob(['﻿'+html], {type:'application/msword'});
  const a = document.createElement('a'); a.href=URL.createObjectURL(blob);
  a.download=(filename||'Report')+'.doc'; a.click();
}

// Number to words (Indian style)
function numToWords(num) {
  num = Math.round(num);
  if (num === 0) return 'Zero';
  const a = ['','One','Two','Three','Four','Five','Six','Seven','Eight','Nine','Ten','Eleven','Twelve','Thirteen','Fourteen','Fifteen','Sixteen','Seventeen','Eighteen','Nineteen'];
  const b = ['','','Twenty','Thirty','Forty','Fifty','Sixty','Seventy','Eighty','Ninety'];
  function nt(n) {
    if (n < 20) return a[n];
    return b[Math.floor(n/10)] + (n%10?' '+a[n%10]:'');
  }
  if (num < 100) return nt(num);
  if (num < 1000) return a[Math.floor(num/100)] + ' Hundred' + (num%100?' '+nt(num%100):'');
  if (num < 100000) return numToWords(Math.floor(num/1000)) + ' Thousand' + (num%1000?' '+numToWords(num%1000):'');
  if (num < 10000000) return numToWords(Math.floor(num/100000)) + ' Lakh' + (num%100000?' '+numToWords(num%100000):'');
  return numToWords(Math.floor(num/10000000)) + ' Crore' + (num%10000000?' '+numToWords(num%10000000):'');
}
