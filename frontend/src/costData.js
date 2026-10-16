// Calculations for the Vehicle cost report (repairs + fuel). The screen only shows what this file returns.
const sum = (list, key) => list.reduce((s, x) => s + (Number(x[key]) || 0), 0);
const monthName = (ym) => new Date(`${ym}-01T00:00:00`).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' });

// Repairs and fuel records narrowed by the filters on screen
export function pickRecords(db, { vehicleId, from, to }) {
  const ok = (x) => (!vehicleId || x.vehicleId === Number(vehicleId)) && (!from || x.date >= from) && (!to || x.date <= to);
  return { repairs: db.maintenance.filter(ok), fuel: db.fuel.filter(ok) };
}

export function totals({ repairs, fuel }) {
  const repair = sum(repairs, 'cost');
  const fuelCost = sum(fuel, 'cost');
  return { repair, fuel: fuelCost, all: repair + fuelCost, litres: sum(fuel, 'litres'), jobs: repairs.length, fills: fuel.length };
}

const withTotal = (rows, cols) => {
  if (rows.length < 2) return rows;
  const row = rows[0].map(() => '');
  row[0] = 'Total';
  cols.forEach((c) => { row[c] = rows.reduce((s, r) => s + Number(r[c]), 0); });
  return [...rows, row];
};

export function buildCostReport(db, kind, rec) {
  const veh = (id) => db.vehicles.find((v) => v.id === id);

  if (kind === 'By vehicle') {
    const m = new Map();
    const get = (id) => { if (!m.has(id)) m.set(id, { rep: 0, jobs: 0, fuel: 0, litres: 0 }); return m.get(id); };
    rec.repairs.forEach((r) => { const o = get(r.vehicleId); o.rep += r.cost; o.jobs++; });
    rec.fuel.forEach((f) => { const o = get(f.vehicleId); o.fuel += f.cost; o.litres += f.litres; });
    const rows = [...m.entries()].map(([id, o]) => [veh(id)?.number || '-', veh(id)?.type || '', o.jobs, o.rep, Math.round(o.litres * 100) / 100, o.fuel, o.rep + o.fuel])
      .sort((a, b) => b[6] - a[6]);
    return { head: ['Vehicle', 'Type', 'Repair jobs', 'Repair cost', 'Fuel (litres)', 'Fuel cost', 'Total cost'], rows: withTotal(rows, [2, 3, 4, 5, 6]), money: [3, 5, 6] };
  }

  if (kind === 'By month') {
    const m = new Map();
    const get = (d) => { const k = d.slice(0, 7); if (!m.has(k)) m.set(k, { rep: 0, fuel: 0 }); return m.get(k); };
    rec.repairs.forEach((r) => { get(r.date).rep += r.cost; });
    rec.fuel.forEach((f) => { get(f.date).fuel += f.cost; });
    const rows = [...m.entries()].sort((a, b) => b[0].localeCompare(a[0])).map(([k, o]) => [monthName(k), o.rep, o.fuel, o.rep + o.fuel]);
    return { head: ['Month', 'Repair cost', 'Fuel cost', 'Total cost'], rows: withTotal(rows, [1, 2, 3]), money: [1, 2, 3] };
  }

  if (kind === 'Repair details') {
    const rows = rec.repairs.map((r) => [veh(r.vehicleId)?.number || '-', r.date, r.type, r.details, r.cost, r.underRepair ? 'Under repair' : 'Done'])
      .sort((a, b) => b[1].localeCompare(a[1]));
    return { head: ['Vehicle', 'Date', 'Type', 'Details', 'Cost', 'Status'], rows: withTotal(rows, [4]), money: [4], dates: [1] };
  }

  // Fuel details
  const rows = rec.fuel.map((f) => [veh(f.vehicleId)?.number || '-', f.date, f.litres, f.cost, f.meter])
    .sort((a, b) => b[1].localeCompare(a[1]));
  return { head: ['Vehicle', 'Date', 'Litres', 'Fuel cost', 'Meter reading'], rows: withTotal(rows, [2, 3]), money: [3, 4], dates: [1] };
}