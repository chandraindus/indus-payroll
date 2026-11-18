// ============================================================
// payroll.js — Payroll Processing Engine
// ============================================================

const PAY = {

  calcPayroll(emp, yr, mo) {
    const days = daysInMonth(yr, mo);
    const att = DB.getAttByMonth(emp.id, yr, mo);
    // Count working days (exclude Sundays & holidays)
    let workingDays = 0, presentDays = 0, leaveDays = 0, absentDays = 0;
    for (let d = 1; d <= days; d++) {
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
    const other = Number(emp.otherAllowance||0) * factor;
    const grossPay = basic + hra + food + phone + mobile + other;

    const pf = Number(emp.basic||0) * factor * (Number(emp.pfRate||12)/100);
    let esi = 0, medIns = 0;
    if (emp.insuranceType === 'ESI') esi = grossPay * 0.0075;
    else if (emp.insuranceType === 'Medical') medIns = Number(emp.medicalInsuranceAmount||0);

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

    const totalDeductions = pf + esi + medIns + advRecovery;
    const netPay = grossPay - totalDeductions;

    return {
      workingDays, presentDays, leaveDays, absentDays,
      earnings: { basic, hra, food, phoneBill: phone, mobilePhone: mobile, other, grossPay },
      deductions: { pf, esi, medicalInsurance: medIns, advance: advRecovery, totalDeductions },
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
            ${existing?`<button class="btn btn-sm btn-outline-success" onclick="PAY.printSlip('${existing.id}')" title="Payslip"><i class="fas fa-file-invoice"></i></button>`:''}
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

  printSlip(payrollId) {
    const pr = DB.getPayrolls().find(p => p.id===payrollId);
    if (!pr) return;
    const emp = DB.getEmployee(pr.empId); if (!emp) return;
    const co = DB.getSetting('companyName','Indus Projects Pvt. Ltd.');
    const addr = DB.getSetting('companyAddress','');
    const w = window.open('','_blank','width=850,height=950');
    const e = pr.earnings, d = pr.deductions;
    w.document.write(`<html><head><title>Payslip</title>
      <style>
        body{font-family:Arial;font-size:12px;padding:20px;max-width:800px;margin:auto}
        h2{margin:0;color:#1a3c5e}small{color:#666}hr{border:1px solid #1a3c5e;margin:8px 0}
        table{width:100%;border-collapse:collapse}.earn{width:50%;vertical-align:top}.ded{width:50%;vertical-align:top}
        td,th{padding:4px 8px;border:1px solid #ddd}th{background:#f0f4f8;font-weight:600;color:#1a3c5e}
        .total-row{background:#e8f0fe;font-weight:700}.net-row{background:#1a3c5e;color:#fff;font-weight:700;font-size:14px}
        .label{font-weight:600}.sig{margin-top:30px;display:flex;justify-content:space-between}
        .box{border:1px solid #ccc;padding:4px 8px;border-radius:4px;text-align:center}
      </style></head><body>
      <div style="text-align:center;border-bottom:2px solid #1a3c5e;padding-bottom:10px;margin-bottom:10px">
        <h2>${co}</h2><div>${addr}</div><h3 style="color:#2d7dd2;margin:6px 0">Pay Slip — ${monthName(pr.month)} ${pr.year}</h3>
      </div>
      <table style="margin-bottom:10px"><tr>
        <td><span class="label">Emp Code:</span> ${emp.empCode}</td>
        <td><span class="label">Name:</span> ${emp.firstName} ${emp.lastName}</td>
        <td><span class="label">Designation:</span> ${emp.designation||'-'}</td>
      </tr><tr>
        <td><span class="label">Department:</span> ${emp.department||'-'}</td>
        <td><span class="label">Bank Acc:</span> ${emp.bankAccount||'-'}</td>
        <td><span class="label">PAN:</span> ${emp.pan||'-'}</td>
      </tr><tr>
        <td><span class="label">Working Days:</span> ${pr.workingDays}</td>
        <td><span class="label">Present Days:</span> ${pr.presentDays}</td>
        <td><span class="label">Leave Days:</span> ${pr.leaveDays}</td>
      </tr></table>
      <table>
        <tr>
          <th colspan="2">Earnings</th>
          <th colspan="2">Deductions</th>
        </tr>
        <tr>
          <td>Basic Salary</td><td style="text-align:right">₹${numFmt(e.basic)}</td>
          <td>Provident Fund (${emp.pfRate||12}%)</td><td style="text-align:right">₹${numFmt(d.pf)}</td>
        </tr>
        ${e.hra>0?`<tr><td>HRA</td><td style="text-align:right">₹${numFmt(e.hra)}</td>`:`<tr><td></td><td></td>`}
        ${d.esi>0?`<td>ESI (0.75%)</td><td style="text-align:right">₹${numFmt(d.esi)}</td></tr>`:d.medicalInsurance>0?`<td>Medical Insurance</td><td style="text-align:right">₹${numFmt(d.medicalInsurance)}</td></tr>`:`<td></td><td></td></tr>`}
        ${e.food>0?`<tr><td>Food Allowance</td><td style="text-align:right">₹${numFmt(e.food)}</td>`:`<tr><td></td><td></td>`}
        ${d.advance>0?`<td>Advance Recovery</td><td style="text-align:right">₹${numFmt(d.advance)}</td></tr>`:d.other>0?`<td>Other Deductions</td><td style="text-align:right">₹${numFmt(d.other)}</td></tr>`:`<td></td><td></td></tr>`}
        ${e.phoneBill>0?`<tr><td>Phone Bill Allowance</td><td style="text-align:right">₹${numFmt(e.phoneBill)}</td><td></td><td></td></tr>`:''}
        ${e.mobilePhone>0?`<tr><td>Mobile Phone Allowance</td><td style="text-align:right">₹${numFmt(e.mobilePhone)}</td><td></td><td></td></tr>`:''}
        ${e.other>0?`<tr><td>Other Allowance</td><td style="text-align:right">₹${numFmt(e.other)}</td><td></td><td></td></tr>`:''}
        <tr class="total-row"><td>Gross Pay</td><td style="text-align:right">₹${numFmt(e.grossPay)}</td><td>Total Deductions</td><td style="text-align:right">₹${numFmt(d.totalDeductions)}</td></tr>
        <tr class="net-row"><td colspan="2">Net Pay (In Words): ${numToWords(pr.netPay)} Only</td><td colspan="2" style="text-align:right">₹${numFmt(pr.netPay)}</td></tr>
      </table>
      <div class="sig">
        <div class="box" style="width:200px">__________________<br>Employee Signature</div>
        <div class="box" style="width:200px">__________________<br>Accounts / HR</div>
      </div>
      <p style="font-size:10px;color:#999;margin-top:20px">This is a computer generated payslip. Printed: ${new Date().toLocaleString()}</p>
      </body></html>`);
    w.document.close(); w.print();
  },

  renderBonusRegister() {
    const yr = document.getElementById('bonusYear')?.value || new Date().getFullYear();
    const records = DB.getBonusRecords().filter(r => r.year == yr);
    const tbody = document.getElementById('bonusRegBody');
    if (!tbody) return;
    tbody.innerHTML = records.length ? records.map(r => {
      const emp = DB.getEmployee(r.empId);
      return `<tr>
        <td>${emp?.empCode||'-'}</td><td>${emp?`${emp.firstName} ${emp.lastName}`:'-'}</td>
        <td>${emp?.designation||'-'}</td><td>${emp?.department||'-'}</td>
        <td>${currFmt(emp?.basic)}</td>
        <td>${r.month?monthName(r.month):'-'}</td>
        <td>${r.bonusType||'-'}</td>
        <td class="fw-600">${currFmt(r.amount)}</td>
        <td><span class="badge bg-${r.status==='paid'?'success':'warning'}">${r.status}</span></td>
        <td>${r.remarks||'-'}</td>
      </tr>`;
    }).join('') : '<tr><td colspan="10" class="text-center text-muted py-4">No bonus records for this year</td></tr>';
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
    const yr = document.getElementById('ltaYear')?.value || new Date().getFullYear();
    const records = DB.getLTARecords().filter(r => r.year == yr);
    const tbody = document.getElementById('ltaRegBody');
    if (!tbody) return;
    tbody.innerHTML = records.length ? records.map(r => {
      const emp = DB.getEmployee(r.empId);
      return `<tr>
        <td>${emp?.empCode||'-'}</td><td>${emp?`${emp.firstName} ${emp.lastName}`:'-'}</td>
        <td>${fmtDate(r.claimDate)}</td>
        <td>${r.travelFrom} → ${r.travelTo}</td>
        <td>${fmtDate(r.travelFrom_date)} - ${fmtDate(r.travelTo_date)}</td>
        <td>${currFmt(emp?.ltaAmount)}</td>
        <td class="fw-600">${currFmt(r.claimAmount)}</td>
        <td><span class="badge bg-${r.status==='paid'?'success':'warning'}">${r.status}</span></td>
      </tr>`;
    }).join('') : '<tr><td colspan="8" class="text-center text-muted py-4">No LTA records for this year</td></tr>';
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
  }
};

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
