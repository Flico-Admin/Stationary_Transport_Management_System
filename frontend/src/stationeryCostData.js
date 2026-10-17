// Calculations for the Stationery cost report. The rows come from the backend (one row per issued item line).
// The screen only shows what this file returns.
const monthName = (ym) => new Date(`${ym}-01T00:00:00`).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' });
const round2 = (n) => Math.round(n * 100) / 100;

// Rows narrowed by the filters on screen
export function pickRows(rows, { unitId, category, from, to }) {
  return rows.filter((r) => (!unitId || r.unitId === Number(unitId)) && (!category || r.category === category)
    && (!from || r.date >= from) && (!to || r.date <= to));
}

export function totals(rows) {
  return {
    cost: round2(rows.reduce((s, r) => s + r.amount, 0)),
    qty: rows.reduce((s, r) => s + r.qty, 0),
    requests: new Set(rows.map((r) => r.requestId)).size,
    unpriced: rows.filter((r) => !(r.unitPrice > 0)).length,   // issued lines whose item has no price yet
  };
}

const withTotal = (rows, cols) => {
  if (rows.length < 2) return rows;
  const row = rows[0].map(() => '');
  row[0] = 'Total';
  cols.forEach((c) => { row[c] = round2(rows.reduce((s, r) => s + Number(r[c]), 0)); });
  return [...rows, row];
};

// Groups rows by a key and adds up quantity and cost
function group(rows, keyOf, labelOf) {
  const m = new Map();
  rows.forEach((r) => {
    const k = keyOf(r);
    if (!m.has(k)) m.set(k, { label: labelOf(r), lines: 0, qty: 0, amount: 0, reqs: new Set() });
    const o = m.get(k);
    o.lines++; o.qty += r.qty; o.amount += r.amount; o.reqs.add(r.requestId);
  });
  return [...m.entries()].map(([k, o]) => ({ key: k, ...o, requests: o.reqs.size }));
}

export function buildStationeryReport(rows, kind) {
  if (kind === 'By location') {
    const out = group(rows, (r) => r.unitId, (r) => r.unitName).sort((a, b) => b.amount - a.amount)
      .map((o) => [o.label, rows.find((r) => r.unitId === o.key)?.unitType || '', o.requests, o.qty, round2(o.amount)]);
    return { head: ['Department / location', 'Type', 'Requests', 'Items issued', 'Total cost'], rows: withTotal(out, [2, 3, 4]), money: [4] };
  }
  if (kind === 'By item') {
    const out = group(rows, (r) => r.itemId, (r) => `${r.code} ${r.itemName}`).sort((a, b) => b.amount - a.amount)
      .map((o) => { const f = rows.find((r) => r.itemId === o.key); return [o.label, f.category, f.unit, o.qty, round2(o.amount)]; });
    return { head: ['Item', 'Category', 'Unit', 'Quantity issued', 'Total cost'], rows: withTotal(out, [3, 4]), money: [4] };
  }
  if (kind === 'By category') {
    const out = group(rows, (r) => r.category, (r) => r.category).sort((a, b) => b.amount - a.amount)
      .map((o) => [o.label, o.requests, o.qty, round2(o.amount)]);
    return { head: ['Category', 'Requests', 'Items issued', 'Total cost'], rows: withTotal(out, [1, 2, 3]), money: [3] };
  }
  if (kind === 'By month') {
    const out = group(rows, (r) => r.date.slice(0, 7), (r) => r.date.slice(0, 7)).sort((a, b) => b.key.localeCompare(a.key))
      .map((o) => [monthName(o.key), o.requests, o.qty, round2(o.amount)]);
    return { head: ['Month', 'Requests', 'Items issued', 'Total cost'], rows: withTotal(out, [1, 2, 3]), money: [3] };
  }
  // Issued details
  const out = rows.map((r) => [r.date, r.requestId, r.unitName, r.requester, `${r.code} ${r.itemName}`, r.qty, r.unitPrice, r.amount]);
  return { head: ['Issued on', 'Request', 'Department / location', 'Requested by', 'Item', 'Quantity', 'Unit price', 'Cost'], rows: withTotal(out, [5, 7]), money: [6, 7], dates: [0] };
}