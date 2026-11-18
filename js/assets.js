// ============================================================
// assets.js — Asset Register & Assignment Management
// ============================================================

const ASSETS = {

  render() {
    const assets = DB.getAssets();
    const q = (document.getElementById('assetSearch')||{}).value||'';
    const cat = (document.getElementById('assetCatFilter')||{}).value||'';
    const stat = (document.getElementById('assetStatFilter')||{}).value||'';
    let list = assets.filter(a => {
      if (q && !(`${a.assetCode} ${a.assetName} ${a.serialNumber||''}`).toLowerCase().includes(q.toLowerCase())) return false;
      if (cat && a.category !== cat) return false;
      if (stat && a.status !== stat) return false;
      return true;
    });
    const tbody = document.getElementById('assetTableBody');
    if (!tbody) return;
    tbody.innerHTML = list.length ? list.map(a => {
      const assignments = DB.getAssetAssignments().filter(x => x.assetId===a.id && x.status==='active');
      let assignedTo = '-';
      if (assignments.length) {
        const emp = DB.getEmployee(assignments[0].empId);
        assignedTo = emp ? `${emp.empCode} - ${emp.firstName} ${emp.lastName}` : 'Unknown';
      }
      return `<tr>
        <td><span class="fw-500">${a.assetCode}</span></td>
        <td>${a.assetName}</td>
        <td>${a.category||'-'}</td>
        <td>${a.brand||'-'} ${a.model||''}</td>
        <td>${a.serialNumber||'-'}</td>
        <td>${a.purchaseDate?fmtDate(a.purchaseDate):'-'}</td>
        <td>${currFmt(a.purchaseValue)}</td>
        <td>${a.status==='assigned'?`<span class="text-primary">${assignedTo}</span>`:'-'}</td>
        <td><span class="badge bg-${a.status==='available'?'success':a.status==='assigned'?'primary':a.status==='under-repair'?'warning':'secondary'}">${a.status}</span></td>
        <td>
          <div class="d-flex gap-1">
            <button class="btn btn-sm btn-outline-primary" onclick="ASSETS.openAssignModal(null,'${a.id}')" title="Assign/Return"><i class="fas fa-exchange-alt"></i></button>
            <button class="btn btn-sm btn-outline-secondary" onclick="ASSETS.edit('${a.id}')" title="Edit"><i class="fas fa-edit"></i></button>
            <button class="btn btn-sm btn-outline-info" onclick="ASSETS.viewHistory('${a.id}')" title="History"><i class="fas fa-history"></i></button>
          </div>
        </td>
      </tr>`;
    }).join('') : '<tr><td colspan="10" class="text-center text-muted py-4">No assets found</td></tr>';

    // Category filter
    const cats = [...new Set(assets.map(a => a.category).filter(Boolean))];
    const cf = document.getElementById('assetCatFilter');
    if (cf) {
      const cur = cf.value;
      cf.innerHTML = `<option value="">All Categories</option>` + cats.map(c => `<option value="${c}" ${c===cur?'selected':''}>${c}</option>`).join('');
    }

    // Summary
    const total = assets.length;
    const assigned = assets.filter(a=>a.status==='assigned').length;
    const available = assets.filter(a=>a.status==='available').length;
    if (document.getElementById('assetStatTotal')) document.getElementById('assetStatTotal').textContent = total;
    if (document.getElementById('assetStatAssigned')) document.getElementById('assetStatAssigned').textContent = assigned;
    if (document.getElementById('assetStatAvailable')) document.getElementById('assetStatAvailable').textContent = available;
  },

  openForm(id = null) {
    const asset = id ? DB.getAsset(id) : null;
    const f = document.getElementById('assetForm'); if (!f) return;
    f.reset();
    document.getElementById('assetFormTitle').textContent = id ? 'Edit Asset' : 'Add New Asset';
    if (asset) {
      ['assetCode','assetName','category','brand','model','serialNumber','description',
       'purchaseDate','purchaseValue','currentValue','status'].forEach(k => {
        const el = document.getElementById('asset_'+k); if (el) el.value = asset[k]||'';
      });
      document.getElementById('asset_id').value = id;
    } else {
      document.getElementById('asset_id').value = '';
      document.getElementById('asset_assetCode').value = DB.nextAssetCode();
      document.getElementById('asset_status').value = 'available';
    }
    new bootstrap.Modal(document.getElementById('assetFormModal')).show();
  },

  edit(id) { this.openForm(id); },

  save() {
    const g = id => document.getElementById(id)?.value?.trim()||'';
    const asset = {
      id: g('asset_id') || uuid(),
      assetCode: g('asset_assetCode'), assetName: g('asset_assetName'),
      category: g('asset_category'), brand: g('asset_brand'), model: g('asset_model'),
      serialNumber: g('asset_serialNumber'), description: g('asset_description'),
      purchaseDate: g('asset_purchaseDate'), purchaseValue: Number(g('asset_purchaseValue'))||0,
      currentValue: Number(g('asset_currentValue'))||0, status: g('asset_status')||'available',
    };
    if (!asset.assetName) { alert('Asset Name is required.'); return; }
    DB.upsertAsset(asset);
    bootstrap.Modal.getInstance(document.getElementById('assetFormModal')).hide();
    this.render();
    APP.showToast('Asset saved', 'success');
  },

  openAssignModal(empId = null, assetId = null) {
    const f = document.getElementById('assetAssignForm'); if (!f) return;
    f.reset();
    document.getElementById('asgn_id').value = '';
    document.getElementById('asgn_assignedDate').value = today();

    // Populate employee dropdown
    const emps = DB.getEmployees().filter(e => e.status==='active');
    const empSel = document.getElementById('asgn_empId');
    empSel.innerHTML = `<option value="">Select Employee</option>` + emps.map(e => `<option value="${e.id}" ${e.id===empId?'selected':''}>${e.empCode} - ${e.firstName} ${e.lastName}</option>`).join('');

    // Populate asset dropdown
    const assets = DB.getAssets().filter(a => a.status==='available' || (assetId && a.id===assetId));
    const astSel = document.getElementById('asgn_assetId');
    astSel.innerHTML = `<option value="">Select Asset</option>` + assets.map(a => `<option value="${a.id}" ${a.id===assetId?'selected':''}>${a.assetCode} - ${a.assetName}</option>`).join('');

    // Check if returning
    if (assetId) {
      const activeAsgn = DB.getAssetAssignments().find(x => x.assetId===assetId && x.status==='active');
      if (activeAsgn) {
        document.getElementById('asgn_id').value = activeAsgn.id;
        document.getElementById('asgn_empId').value = activeAsgn.empId;
        document.getElementById('asgn_assetId').value = assetId;
        document.getElementById('assetAssignTitle').textContent = 'Return Asset';
        document.getElementById('assetAssignMode').value = 'return';
        document.getElementById('assetReturnFields').style.display = 'block';
        document.getElementById('assetAssignFields').style.display = 'none';
        return new bootstrap.Modal(document.getElementById('assetAssignModal')).show();
      }
    }
    document.getElementById('assetAssignTitle').textContent = 'Assign Asset to Employee';
    document.getElementById('assetAssignMode').value = 'assign';
    document.getElementById('assetReturnFields').style.display = 'none';
    document.getElementById('assetAssignFields').style.display = 'block';
    new bootstrap.Modal(document.getElementById('assetAssignModal')).show();
  },

  saveAssignment() {
    const g = id => document.getElementById(id)?.value?.trim()||'';
    const mode = g('assetAssignMode');
    const asgnId = g('asgn_id');
    const empId = g('asgn_empId');
    const assetId = g('asgn_assetId');

    if (!empId || !assetId) { alert('Please select both employee and asset.'); return; }

    if (mode === 'return') {
      const asgn = DB.getAssetAssignments().find(a => a.id===asgnId);
      if (asgn) {
        asgn.status = 'returned';
        asgn.returnDate = g('asgn_returnDate') || today();
        asgn.conditionOnReturn = g('asgn_conditionOnReturn') || 'good';
        asgn.returnRemarks = g('asgn_returnRemarks');
        DB.upsertAssetAssignment(asgn);
      }
      const asset = DB.getAsset(assetId);
      if (asset) { asset.status = 'available'; DB.upsertAsset(asset); }
    } else {
      const asgn = {
        id: uuid(), assetId, empId,
        assignedDate: g('asgn_assignedDate') || today(),
        assignedBy: g('asgn_assignedBy'),
        conditionOnAssign: g('asgn_conditionOnAssign') || 'good',
        remarks: g('asgn_remarks'),
        status: 'active'
      };
      DB.upsertAssetAssignment(asgn);
      const asset = DB.getAsset(assetId);
      if (asset) { asset.status = 'assigned'; DB.upsertAsset(asset); }
    }
    bootstrap.Modal.getInstance(document.getElementById('assetAssignModal')).hide();
    this.render();
    APP.showToast(mode==='return' ? 'Asset returned' : 'Asset assigned', 'success');
  },

  viewHistory(assetId) {
    const asset = DB.getAsset(assetId); if (!asset) return;
    const history = DB.getAssetAssignments().filter(a => a.assetId===assetId).sort((a,b)=>a.assignedDate<b.assignedDate?1:-1);
    document.getElementById('assetHistoryTitle').textContent = `${asset.assetCode} — ${asset.assetName}`;
    document.getElementById('assetHistoryBody').innerHTML = history.length
      ? history.map(h => {
          const emp = DB.getEmployee(h.empId);
          return `<tr>
            <td>${emp?`${emp.empCode} - ${emp.firstName} ${emp.lastName}`:'Unknown'}</td>
            <td>${fmtDate(h.assignedDate)}</td>
            <td>${h.conditionOnAssign||'-'}</td>
            <td>${h.returnDate?fmtDate(h.returnDate):'-'}</td>
            <td>${h.conditionOnReturn||'-'}</td>
            <td><span class="badge bg-${h.status==='active'?'primary':'secondary'}">${h.status}</span></td>
            <td>${h.remarks||'-'}</td>
          </tr>`;
        }).join('')
      : '<tr><td colspan="7" class="text-center text-muted">No history</td></tr>';
    new bootstrap.Modal(document.getElementById('assetHistoryModal')).show();
  },

  renderEmpAssets() {
    const empId = document.getElementById('empAssetFilter')?.value;
    if (!empId) { document.getElementById('empAssetTableBody').innerHTML = '<tr><td colspan="6" class="text-center text-muted">Select an employee to view assets</td></tr>'; return; }
    const assets = DB.getAssetsByEmp(empId);
    document.getElementById('empAssetTableBody').innerHTML = assets.length
      ? assets.map(a => `<tr>
          <td>${a.assetCode}</td>
          <td>${a.assetName}</td>
          <td>${a.category||'-'}</td>
          <td>${a.serialNumber||'-'}</td>
          <td>${fmtDate(a.assignment?.assignedDate)}</td>
          <td><span class="badge bg-${a.assignment?.conditionOnAssign==='good'?'success':'warning'}">${a.assignment?.conditionOnAssign||'-'}</span></td>
        </tr>`).join('')
      : '<tr><td colspan="6" class="text-center text-muted">No assets assigned to this employee</td></tr>';
  }
};
