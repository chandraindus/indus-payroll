// ============================================================
// attendance.js — Attendance Management with Geolocation
// ============================================================

const ATT = {
  viewMonth: new Date().getMonth() + 1,
  viewYear: new Date().getFullYear(),

  render() {
    const emps = DB.getEmployees().filter(e => e.status === 'active');
    const yr = this.viewYear, mo = this.viewMonth;
    const days = daysInMonth(yr, mo);
    document.getElementById('attMonthLabel').textContent = `${monthName(mo)} ${yr}`;

    const tbody = document.getElementById('attTableBody');
    if (!tbody) return;
    tbody.innerHTML = emps.map(emp => {
      let cells = '';
      let P=0,A=0,H=0,L=0;
      for (let d=1; d<=days; d++) {
        const dt = `${yr}-${fmt2(mo)}-${fmt2(d)}`;
        const rec = DB.getAttByEmpDate(emp.id, dt);
        const dow = new Date(dt).getDay();
        let code = '', cls = '';
        if (DB.isHoliday(dt)) { code='HOL'; cls='att-HOL'; }
        else if (dow===0) { code='WO'; cls='att-WO'; } // Sunday
        else if (rec) { code=rec.status?.toUpperCase().slice(0,1)||'P'; cls=`att-${rec.status?.toUpperCase().slice(0,1)||'P'}`; }
        else { code='-'; cls='att-'; }
        if (code==='P') P++; else if (code==='A') A++; else if (code==='H') H++; else if (code==='L') L++;
        cells += `<td class="p-0 text-center"><div class="att-cell ${cls} mx-auto" onclick="ATT.openEntry('${emp.id}','${dt}')" title="${dt}">${code}</div></td>`;
      }
      return `<tr>
        <td class="sticky-col"><div class="fw-500 fs-13">${emp.empCode}</div><div class="text-muted" style="font-size:11px">${emp.firstName} ${emp.lastName}</div></td>
        ${cells}
        <td class="text-success fw-600">${P}</td>
        <td class="text-danger fw-600">${A}</td>
        <td class="text-warning fw-600">${H}</td>
        <td class="text-info fw-600">${L}</td>
      </tr>`;
    }).join('') || '<tr><td colspan="40" class="text-center text-muted py-4">No active employees</td></tr>';

    // Build header days
    let hdr = `<tr><th class="sticky-col">Employee</th>`;
    for (let d=1;d<=days;d++) {
      const dt = new Date(yr,mo-1,d);
      const dow = ['Su','Mo','Tu','We','Th','Fr','Sa'][dt.getDay()];
      const isWO = dt.getDay()===0;
      hdr += `<th class="p-0 text-center" style="width:32px;min-width:32px;font-size:10px;${isWO?'color:#999':''}"><div>${d}</div><div>${dow}</div></th>`;
    }
    hdr += `<th>P</th><th>A</th><th>H</th><th>L</th></tr>`;
    document.getElementById('attHeaderRow').innerHTML = hdr;
  },

  prevMonth() {
    if (this.viewMonth === 1) { this.viewMonth = 12; this.viewYear--; }
    else this.viewMonth--;
    this.render();
  },

  nextMonth() {
    if (this.viewMonth === 12) { this.viewMonth = 1; this.viewYear++; }
    else this.viewMonth++;
    this.render();
  },

  openEntry(empId, date) {
    const emp = DB.getEmployee(empId); if (!emp) return;
    const rec = DB.getAttByEmpDate(empId, date) || { id: uuid(), empId, date, punchIn:{}, punchOut:{}, status:'present', remarks:'' };
    document.getElementById('attEntryEmpName').textContent = `${emp.firstName} ${emp.lastName} (${emp.empCode})`;
    document.getElementById('attEntryDate').textContent = fmtDate(date);
    document.getElementById('att_id').value = rec.id;
    document.getElementById('att_empId').value = empId;
    document.getElementById('att_date').value = date;
    document.getElementById('att_status').value = rec.status || 'present';
    document.getElementById('att_remarks').value = rec.remarks || '';
    // In time
    document.getElementById('att_inTime').value = rec.punchIn?.time || '';
    document.getElementById('att_inMethod').value = rec.punchIn?.method || 'manual';
    document.getElementById('att_inLat').value = rec.punchIn?.lat || '';
    document.getElementById('att_inLng').value = rec.punchIn?.lng || '';
    document.getElementById('att_inAddress').value = rec.punchIn?.address || '';
    // Out time
    document.getElementById('att_outTime').value = rec.punchOut?.time || '';
    document.getElementById('att_outMethod').value = rec.punchOut?.method || 'manual';
    document.getElementById('att_outLat').value = rec.punchOut?.lat || '';
    document.getElementById('att_outLng').value = rec.punchOut?.lng || '';
    document.getElementById('att_outAddress').value = rec.punchOut?.address || '';
    new bootstrap.Modal(document.getElementById('attEntryModal')).show();
  },

  captureLocation(type) {
    // type = 'in' or 'out'
    const btn = document.getElementById(`att_${type}LocBtn`);
    if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>'; }
    if (!navigator.geolocation) { alert('Geolocation not supported by this browser.'); return; }
    navigator.geolocation.getCurrentPosition(
      pos => {
        const lat = pos.coords.latitude.toFixed(6);
        const lng = pos.coords.longitude.toFixed(6);
        document.getElementById(`att_${type}Lat`).value = lat;
        document.getElementById(`att_${type}Lng`).value = lng;
        document.getElementById(`att_${type}Method`).value = 'phone';
        // Reverse geocode using Nominatim (free)
        fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}`)
          .then(r => r.json())
          .then(d => {
            const addr = d.display_name || `${lat}, ${lng}`;
            document.getElementById(`att_${type}Address`).value = addr.length > 100 ? addr.slice(0,100)+'...' : addr;
          })
          .catch(() => { document.getElementById(`att_${type}Address`).value = `${lat}, ${lng}`; })
          .finally(() => { if (btn) { btn.disabled=false; btn.innerHTML='<i class="fas fa-map-marker-alt"></i> Get Location'; }});
        // Set current time if empty
        const timeEl = document.getElementById(`att_${type}Time`);
        if (!timeEl.value) timeEl.value = new Date().toTimeString().slice(0,5);
      },
      err => {
        if (btn) { btn.disabled=false; btn.innerHTML='<i class="fas fa-map-marker-alt"></i> Get Location'; }
        alert('Could not get location: ' + err.message);
      },
      { enableHighAccuracy: true, timeout: 15000 }
    );
  },

  saveEntry() {
    const g = id => document.getElementById(id)?.value||'';
    const rec = {
      id: g('att_id') || uuid(),
      empId: g('att_empId'),
      date: g('att_date'),
      status: g('att_status'),
      remarks: g('att_remarks'),
      punchIn: {
        time: g('att_inTime'),
        method: g('att_inMethod'),
        lat: g('att_inLat'),
        lng: g('att_inLng'),
        address: g('att_inAddress'),
      },
      punchOut: {
        time: g('att_outTime'),
        method: g('att_outMethod'),
        lat: g('att_outLat'),
        lng: g('att_outLng'),
        address: g('att_outAddress'),
      }
    };
    DB.upsertAttendance(rec);
    bootstrap.Modal.getInstance(document.getElementById('attEntryModal')).hide();
    this.render();
    APP.showToast('Attendance saved', 'success');
  },

  // Self-service phone attendance (employee punches in/out themselves)
  openSelfService() {
    document.getElementById('selfAttEmpSearch').value = '';
    document.getElementById('selfAttPanel').style.display = 'none';
    new bootstrap.Modal(document.getElementById('selfAttModal')).show();
    this.searchEmpForSelf(); // show all employees immediately
  },

  searchEmpForSelf() {
    const q = document.getElementById('selfAttEmpSearch').value.trim().toLowerCase();
    const emps = DB.getEmployees().filter(e => e.status==='active' &&
      (!q || e.empCode.toLowerCase().includes(q) || (e.firstName+' '+e.lastName).toLowerCase().includes(q) || e.phone.includes(q)));
    document.getElementById('selfAttEmpList').innerHTML = emps.length
      ? emps.map(e => `<div class="list-group-item list-group-item-action cursor-pointer py-3" onclick="ATT.selectEmpSelf('${e.id}')">
          <div class="fw-bold">${e.firstName} ${e.lastName}</div>
          <small class="text-muted">${e.empCode} · ${e.designation}</small>
        </div>`).join('')
      : '<div class="list-group-item text-muted">No employee found</div>';
  },

  selectEmpSelf(empId) {
    const emp = DB.getEmployee(empId); if (!emp) return;
    const dt = today();
    const rec = DB.getAttByEmpDate(empId, dt);
    document.getElementById('selfAttEmpList').innerHTML = '';
    document.getElementById('selfAttEmpSearch').value = '';
    const panel = document.getElementById('selfAttPanel');
    panel.style.display = 'block';
    panel.dataset.empId = empId;
    panel.dataset.date = dt;
    document.getElementById('selfAttEmpName').textContent = `${emp.firstName} ${emp.lastName} (${emp.empCode})`;
    document.getElementById('selfAttDate').textContent = fmtDate(dt);

    if (rec?.punchIn?.time) {
      document.getElementById('selfAttInInfo').innerHTML = `<div class="text-success"><i class="fas fa-check-circle me-1"></i>Punched In: ${rec.punchIn.time}${rec.punchIn.address?`<br><small class="text-muted">${rec.punchIn.address.slice(0,80)}</small>`:''}</div>`;
      document.getElementById('btnSelfPunchIn').disabled = true;
    } else {
      document.getElementById('selfAttInInfo').innerHTML = '';
      document.getElementById('btnSelfPunchIn').disabled = false;
    }
    if (rec?.punchOut?.time) {
      document.getElementById('selfAttOutInfo').innerHTML = `<div class="text-info"><i class="fas fa-check-circle me-1"></i>Punched Out: ${rec.punchOut.time}${rec.punchOut.address?`<br><small class="text-muted">${rec.punchOut.address.slice(0,80)}</small>`:''}</div>`;
      document.getElementById('btnSelfPunchOut').disabled = true;
    } else {
      document.getElementById('selfAttOutInfo').innerHTML = '';
      document.getElementById('btnSelfPunchOut').disabled = rec?.punchIn?.time ? false : true;
    }
  },

  selfPunch(type) {
    const panel = document.getElementById('selfAttPanel');
    const empId = panel.dataset.empId;
    const date = panel.dataset.date;
    const btn = document.getElementById(`btnSelfPunch${type==='in'?'In':'Out'}`);
    btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Getting location...';

    const doSave = (lat, lng, address, method) => {
      const existing = DB.getAttByEmpDate(empId, date) || { id: uuid(), empId, date, status:'present', punchIn:{}, punchOut:{}, remarks:'' };
      const timeNow = new Date().toTimeString().slice(0,5);
      if (type === 'in') {
        existing.punchIn = { time: timeNow, lat, lng, address, method };
      } else {
        existing.punchOut = { time: timeNow, lat, lng, address, method };
      }
      DB.upsertAttendance(existing);
      this.selectEmpSelf(empId);
      this.render();
      APP.showToast(`Punch ${type==='in'?'In':'Out'} recorded at ${timeNow}`, 'success');
    };

    if (!navigator.geolocation) {
      btn.disabled = false; btn.innerHTML = type==='in'?'Punch In':'Punch Out';
      APP.showToast('GPS not supported on this device.', 'danger'); return;
    }
    navigator.geolocation.getCurrentPosition(
      pos => {
        const lat = pos.coords.latitude.toFixed(6);
        const lng = pos.coords.longitude.toFixed(6);
        fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}`)
          .then(r=>r.json()).then(d => doSave(lat, lng, d.display_name||`${lat},${lng}`, 'phone'))
          .catch(() => doSave(lat, lng, `${lat},${lng}`, 'phone'));
      },
      () => {
        btn.disabled = false; btn.innerHTML = type==='in'?'Punch In':'Punch Out';
        APP.showToast('Location access denied. Please allow location to punch attendance.', 'danger');
      },
      { enableHighAccuracy: true, timeout: 15000 }
    );
  },

  exportMonthly() {
    const yr = this.viewYear, mo = this.viewMonth;
    const emps = DB.getEmployees().filter(e => e.status==='active');
    const days = daysInMonth(yr, mo);
    let csv = 'Emp Code,Name,Designation,Department';
    for (let d=1;d<=days;d++) csv += `,${d}`;
    csv += ',Present,Absent,Half Day,Leave\n';
    emps.forEach(emp => {
      let row = `${emp.empCode},"${emp.firstName} ${emp.lastName}",${emp.designation||''},${emp.department||''}`;
      let P=0,A=0,H=0,L=0;
      for (let d=1;d<=days;d++) {
        const dt = `${yr}-${fmt2(mo)}-${fmt2(d)}`;
        const rec = DB.getAttByEmpDate(emp.id, dt);
        const dow = new Date(dt).getDay();
        let code = '-';
        if (DB.isHoliday(dt)) code='HOL';
        else if (dow===0) code='WO';
        else if (rec) { code=rec.status?.toUpperCase().slice(0,1)||'P'; }
        if (code==='P') P++; else if (code==='A') A++; else if (code==='H') H++; else if (code==='L') L++;
        row += `,${code}`;
      }
      row += `,${P},${A},${H},${L}`;
      csv += row + '\n';
    });
    const blob = new Blob([csv], {type:'text/csv'});
    const a = document.createElement('a'); a.href=URL.createObjectURL(blob);
    a.download = `Attendance_${yr}_${fmt2(mo)}.csv`; a.click();
  },

  renderDailyReport() {
    const dt = document.getElementById('dailyAttDate')?.value || today();
    const emps = DB.getEmployees().filter(e => e.status==='active');
    const tbody = document.getElementById('dailyAttBody');
    if (!tbody) return;
    tbody.innerHTML = emps.map(emp => {
      const rec = DB.getAttByEmpDate(emp.id, dt);
      const pi = rec?.punchIn||{}, po = rec?.punchOut||{};
      return `<tr>
        <td>${emp.empCode}</td>
        <td>${emp.firstName} ${emp.lastName}</td>
        <td>${emp.designation||'-'}</td>
        <td>${rec?.punchIn?.time||'-'} ${pi.lat?`<span class="location-chip"><i class="fas fa-map-marker-alt"></i>${pi.method||''}</span>`:''}</td>
        <td>${pi.address?`<small>${pi.address.slice(0,60)}</small>`:'-'}</td>
        <td>${rec?.punchOut?.time||'-'} ${po.lat?`<span class="location-chip"><i class="fas fa-map-marker-alt"></i>${po.method||''}</span>`:''}</td>
        <td>${po.address?`<small>${po.address.slice(0,60)}</small>`:'-'}</td>
        <td><span class="badge bg-${rec?.status==='present'?'success':rec?.status==='absent'?'danger':rec?.status==='half-day'?'warning':'info'}">${rec?.status||'absent'}</span></td>
      </tr>`;
    }).join('');
  },

  // ── Timing Register (Registers section) ──────────────────────
  renderTimingRegister() {
    const mo = Number(document.getElementById('timRegMonth')?.value || new Date().getMonth()+1);
    const yr = Number(document.getElementById('timRegYear')?.value  || new Date().getFullYear());
    const empFilter = document.getElementById('timRegEmp')?.value || '';
    document.getElementById('timRegLabel').textContent = `${monthName(mo)} ${yr}`;

    const emps = DB.getEmployees().filter(e => e.status==='active' && (!empFilter || e.id===empFilter));
    const days = daysInMonth(yr, mo);
    const rows = [];

    for (const emp of emps) {
      for (let d = 1; d <= days; d++) {
        const dt = `${yr}-${fmt2(mo)}-${fmt2(d)}`;
        const dow = new Date(dt).getDay();
        if (dow === 0) continue; // skip Sundays
        const rec = DB.getAttByEmpDate(emp.id, dt);
        const pi = rec?.punchIn || {}, po = rec?.punchOut || {};
        const hours = this._calcHours(pi.time, po.time);
        const status = rec?.status || '-';
        const mapLink = (lat, lng) => lat && lng
          ? `<a href="https://maps.google.com/?q=${lat},${lng}" target="_blank" class="btn btn-xs btn-outline-primary py-0 px-1 fs-11" title="Open in Google Maps"><i class="fas fa-map"></i></a>`
          : '';
        rows.push(`<tr>
          <td class="text-muted fs-12">${fmtDate(dt)}</td>
          <td class="fw-500">${emp.empCode}</td>
          <td>${emp.firstName} ${emp.lastName}</td>
          <td class="text-muted fs-12">${emp.designation||'-'}</td>
          <td class="text-center">${pi.time ? `<span class="fw-600 text-success">${pi.time}</span>` : '<span class="text-muted">-</span>'}</td>
          <td class="fs-11">${pi.address ? pi.address.slice(0,60)+(pi.address.length>60?'…':'') : (pi.lat ? `${pi.lat}, ${pi.lng}` : '-')} ${mapLink(pi.lat, pi.lng)}</td>
          <td class="text-center">${po.time ? `<span class="fw-600 text-primary">${po.time}</span>` : '<span class="text-muted">-</span>'}</td>
          <td class="fs-11">${po.address ? po.address.slice(0,60)+(po.address.length>60?'…':'') : (po.lat ? `${po.lat}, ${po.lng}` : '-')} ${mapLink(po.lat, po.lng)}</td>
          <td class="text-center fw-600">${hours || '-'}</td>
          <td class="text-center"><span class="badge bg-${status==='present'?'success':status==='absent'?'danger':status==='half-day'?'warning':status==='on-leave'?'info':'secondary'}">${status==='on-leave'?'Leave':status==='half-day'?'Half':status!=='-'?status.charAt(0).toUpperCase()+status.slice(1):'-'}</span></td>
        </tr>`);
      }
    }

    const tbody = document.getElementById('timRegBody');
    if (tbody) tbody.innerHTML = rows.length ? rows.join('') : '<tr><td colspan="10" class="text-center text-muted py-4">No punch data for this period</td></tr>';
  },

  _calcHours(inTime, outTime) {
    if (!inTime || !outTime) return '';
    const [ih, im] = inTime.split(':').map(Number);
    const [oh, om] = outTime.split(':').map(Number);
    let mins = (oh * 60 + om) - (ih * 60 + im);
    if (mins <= 0) return '';
    return `${Math.floor(mins/60)}h ${mins%60}m`;
  },

  exportTimingRegister() {
    const mo = Number(document.getElementById('timRegMonth')?.value || new Date().getMonth()+1);
    const yr = Number(document.getElementById('timRegYear')?.value  || new Date().getFullYear());
    const empFilter = document.getElementById('timRegEmp')?.value || '';
    const emps = DB.getEmployees().filter(e => e.status==='active' && (!empFilter || e.id===empFilter));
    const days = daysInMonth(yr, mo);
    let csv = `Timing Register — ${monthName(mo)} ${yr}\n`;
    csv += 'Date,Emp Code,Name,Designation,Punch In,In Location,In Lat,In Lng,Punch Out,Out Location,Out Lat,Out Lng,Hours Worked,Status\n';
    for (const emp of emps) {
      for (let d = 1; d <= days; d++) {
        const dt = `${yr}-${fmt2(mo)}-${fmt2(d)}`;
        if (new Date(dt).getDay() === 0) continue;
        const rec = DB.getAttByEmpDate(emp.id, dt);
        const pi = rec?.punchIn||{}, po = rec?.punchOut||{};
        const hours = this._calcHours(pi.time, po.time);
        csv += `${fmtDate(dt)},${emp.empCode},"${emp.firstName} ${emp.lastName}",${emp.designation||''},`;
        csv += `${pi.time||''},${pi.address||''},${pi.lat||''},${pi.lng||''},`;
        csv += `${po.time||''},${po.address||''},${po.lat||''},${po.lng||''},`;
        csv += `${hours},${rec?.status||''}\n`;
      }
    }
    const blob = new Blob(['﻿'+csv], {type:'text/csv;charset=utf-8'});
    const a = document.createElement('a'); a.href=URL.createObjectURL(blob);
    a.download = `TimingRegister_${yr}_${fmt2(mo)}.csv`; a.click();
  }
};
