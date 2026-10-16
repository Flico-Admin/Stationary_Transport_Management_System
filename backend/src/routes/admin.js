// Departments / showrooms / warehouses, users, roles and permissions.
import { Router } from 'express';
import { q, tx, bad, notFound } from '../db.js';
import { need, hashPassword } from '../auth.js';
import { ACTIONS, MODULES } from '../permissions.js';

const r = Router();
const now = () => new Date();
const audit = (conn, by, text) => q('INSERT INTO audit_log (at, by_name, text) VALUES (?,?,?)', [now(), by, text], conn);

// ---------- departments, showrooms, warehouses ----------
r.post('/units/save', async (req, res) => {
  const b = req.body || {};
  need(req.user, 'locations', b.id ? 'edit' : 'add');
  const name = (b.name || '').trim();
  if (!name) throw bad('Enter a name.');
  if (!['department', 'showroom', 'warehouse'].includes(b.type)) throw bad('Choose a type.');
  let approver = null;
  if (b.type !== 'department') {
    if (!b.approverUnitId) throw bad('Choose whose HOD approves requests from here.');
    const [a] = await q('SELECT id FROM units WHERE id = ?', [b.approverUnitId]);
    if (!a) throw bad('Approver department not found.');
    approver = a.id;
  }
  await tx(async (conn) => {
    const [dup] = await q('SELECT id FROM units WHERE LOWER(name) = LOWER(?) AND id <> ?', [name, b.id || 0], conn);
    if (dup) throw bad('A department, showroom or warehouse with this name already exists.');
    if (b.id) {
      const upd = await q('UPDATE units SET name=?, type=?, approver_unit_id=? WHERE id=?', [name, b.type, approver, b.id], conn);
      if (!upd.affectedRows) throw notFound();
      await audit(conn, req.user.name, `Edited ${b.type} ${name}`);
    } else {
      await q('INSERT INTO units (name, type, approver_unit_id, active) VALUES (?,?,?,1)', [name, b.type, approver], conn);
      await audit(conn, req.user.name, `Added ${b.type} ${name}`);
    }
  });
  res.json({ ok: true });
});
r.post('/units/:id/active', async (req, res) => {
  need(req.user, 'locations', 'delete');
  const active = !!req.body?.active;
  await tx(async (conn) => {
    const [u] = await q('SELECT * FROM units WHERE id = ?', [req.params.id], conn);
    if (!u) throw notFound();
    if (!active) {
      const [n] = await q('SELECT COUNT(*) AS n FROM users WHERE unit_id = ? AND active = 1', [u.id], conn);
      if (n.n > 0) throw bad(`${u.name} still has active users. Move or deactivate them first.`);
    }
    await q('UPDATE units SET active = ? WHERE id = ?', [active ? 1 : 0, u.id], conn);
    await audit(conn, req.user.name, `${active ? 'Activated' : 'Deactivated'} ${u.type} ${u.name}`);
  });
  res.json({ ok: true });
});

// ---------- users ----------
r.post('/users/save', async (req, res) => {
  const b = req.body || {};
  need(req.user, 'users', b.id ? 'edit' : 'add');
  const name = (b.name || '').trim(); const email = (b.email || '').trim().toLowerCase();
  if (!name || !email) throw bad('Name and email are required.');
  if (!/^\S+@\S+\.\S+$/.test(email)) throw bad('Enter a valid email address.');
  if (!b.id && (b.password || '').length < 6) throw bad('Set a password with at least 6 characters.');
  if (b.id && b.password && b.password.length < 6) throw bad('The new password must have at least 6 characters.');
  await tx(async (conn) => {
    const [role] = await q('SELECT role_key FROM roles WHERE role_key = ?', [b.role], conn);
    if (!role) throw bad('Choose a role.');
    const [unit] = await q('SELECT id FROM units WHERE id = ?', [b.unitId], conn);
    if (!unit) throw bad('Choose a department, showroom or warehouse.');
    const [dup] = await q('SELECT id FROM users WHERE email = ? AND id <> ?', [email, b.id || 0], conn);
    if (dup) throw bad('This email is already used by another user.');
    if (b.id) {
      const upd = await q('UPDATE users SET name=?, email=?, role_key=?, unit_id=? WHERE id=?', [name, email, b.role, unit.id, b.id], conn);
      if (!upd.affectedRows) throw notFound('User not found.');
      if (b.password) { await q('UPDATE users SET password_hash = ? WHERE id = ?', [hashPassword(b.password), b.id], conn); await audit(conn, req.user.name, `Changed password for ${name}`); }
      await audit(conn, req.user.name, `Edited user ${name}`);
    } else {
      await q('INSERT INTO users (name, email, password_hash, role_key, unit_id, active) VALUES (?,?,?,?,?,1)', [name, email, hashPassword(b.password), b.role, unit.id], conn);
      await audit(conn, req.user.name, `Created user ${name}`);
    }
  });
  res.json({ ok: true });
});
r.post('/users/:id/active', async (req, res) => {
  need(req.user, 'users', 'delete');
  const active = !!req.body?.active;
  if (!active && Number(req.params.id) === req.user.id) throw bad('You cannot deactivate your own account.');
  await tx(async (conn) => {
    const [u] = await q('SELECT id, name FROM users WHERE id = ?', [req.params.id], conn);
    if (!u) throw notFound('User not found.');
    await q('UPDATE users SET active = ? WHERE id = ?', [active ? 1 : 0, u.id], conn);
    await audit(conn, req.user.name, `${active ? 'Activated' : 'Deactivated'} user ${u.name}`);
  });
  res.json({ ok: true });
});

// ---------- permissions ----------
const checkPerm = (module, action) => { if (!MODULES.includes(module) || !ACTIONS.includes(action)) throw bad('Unknown permission.'); };
r.post('/roles/:role/perm', async (req, res) => {
  need(req.user, 'users', 'edit');
  const { module, action } = req.body || {}; checkPerm(module, action);
  await tx(async (conn) => {
    const [role] = await q('SELECT label FROM roles WHERE role_key = ?', [req.params.role], conn);
    if (!role) throw notFound('Role not found.');
    const [has] = await q('SELECT 1 AS x FROM role_permissions WHERE role_key=? AND module=? AND action=?', [req.params.role, module, action], conn);
    if (has) await q('DELETE FROM role_permissions WHERE role_key=? AND module=? AND action=?', [req.params.role, module, action], conn);
    else await q('INSERT INTO role_permissions (role_key, module, action) VALUES (?,?,?)', [req.params.role, module, action], conn);
    await audit(conn, req.user.name, `${has ? 'Removed' : 'Gave'} "${action}" on ${module} ${has ? 'from' : 'to'} role ${role.label}`);
  });
  res.json({ ok: true });
});
r.post('/users/:id/perm', async (req, res) => {
  need(req.user, 'users', 'edit');
  const { module, action } = req.body || {}; checkPerm(module, action);
  await tx(async (conn) => {
    const [u] = await q('SELECT id, name FROM users WHERE id = ?', [req.params.id], conn);
    if (!u) throw notFound('User not found.');
    const [has] = await q('SELECT 1 AS x FROM user_permissions WHERE user_id=? AND module=? AND action=?', [u.id, module, action], conn);
    if (has) await q('DELETE FROM user_permissions WHERE user_id=? AND module=? AND action=?', [u.id, module, action], conn);
    else await q('INSERT INTO user_permissions (user_id, module, action) VALUES (?,?,?)', [u.id, module, action], conn);
    await audit(conn, req.user.name, `${has ? 'Removed extra' : 'Gave extra'} "${action}" on ${module} ${has ? 'from' : 'to'} user ${u.name}`);
  });
  res.json({ ok: true });
});
r.post('/roles', async (req, res) => {
  need(req.user, 'users', 'edit');
  const label = (req.body?.label || '').trim();
  const key = label.toLowerCase().replace(/\W+/g, '_');
  if (!label || !key) throw bad('Enter a role name.');
  await tx(async (conn) => {
    const [dup] = await q('SELECT 1 AS x FROM roles WHERE role_key = ?', [key], conn);
    if (dup) throw bad('A role with this name already exists.');
    await q('INSERT INTO roles (role_key, label) VALUES (?,?)', [key, label], conn);
    await audit(conn, req.user.name, `Created role ${label}`);
  });
  res.json({ ok: true });
});

export default r;