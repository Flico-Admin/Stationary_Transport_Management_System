// Same permission model as the frontend (src/permissions.js). The server checks it on every action.
export const ACTIONS = ['view', 'add', 'edit', 'delete'];
export const MODULES = [
  'requests', 'allRequests', 'hodApproval', 'adminApproval', 'issue', 'items', 'vehicles',
  'purchasing', 'maintenance', 'reports', 'reportsAll', 'costReports', 'locations', 'users',
];

// user.perms = { module: ['view', ...] }  (role permissions + the user's extra permissions, merged)
export const can = (user, module, action = 'view') => !!user && (user.perms[module] || []).includes(action);