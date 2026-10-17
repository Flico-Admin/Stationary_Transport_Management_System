// Permission model (matches Requirements Document sections 5.2 and 6).
// Every module can be given view / add / edit / delete.
// For "action" modules (hodApproval, adminApproval, issue), "edit" means "can act".

export const ACTIONS = ['view', 'add', 'edit', 'delete'];

export const MODULES = [
  { key: 'requests', label: 'Create and view own requests' },
  { key: 'allRequests', label: 'View all requests' },
  { key: 'hodApproval', label: 'HOD approval' },
  { key: 'adminApproval', label: 'Admin approval' },
  { key: 'issue', label: 'Issue items / assign vehicles' },
  { key: 'items', label: 'Stationery items and stock' },
  { key: 'vehicles', label: 'Vehicles and drivers' },
  { key: 'purchasing', label: 'Purchase orders and suppliers' },
  { key: 'maintenance', label: 'Vehicle maintenance and fuel' },
  { key: 'reports', label: 'Reports (own locations)' },
  { key: 'reportsAll', label: 'Reports for all locations' },
  { key: 'costReports', label: 'Cost reports (vehicles and stationery)' },
  { key: 'locations', label: 'Departments, showrooms and warehouses' },
  { key: 'users', label: 'Users and permissions' },
];

const all = ['view', 'add', 'edit', 'delete'];

export const ROLE_DEFAULTS = {
  employee: { label: 'Employee', perms: { requests: ['view', 'add'] } },
  hod: {
    label: 'HOD',
    perms: { requests: ['view', 'add'], allRequests: ['view'], hodApproval: ['view', 'edit'], reports: ['view'] },
  },
  admin: {
    label: 'Admin Department',
    perms: {
      requests: ['view', 'add'],
      allRequests: ['view'],
      adminApproval: ['view', 'edit'],
      issue: ['view', 'edit'],
      items: all,
      vehicles: all,
      purchasing: all,
      maintenance: all,
      reports: ['view'],
      reportsAll: ['view'],
      costReports: ['view'],
    },
  },
  finance_hod: { label: 'Finance HOD', perms: { requests: ['view', 'add'], costReports: ['view'] } },
  // IT has full access to every part of the system and controls everything
  it: { label: 'IT Department', perms: Object.fromEntries(MODULES.map((m) => [m.key, [...all]])) },
};

// Role permissions + extra permissions given to one specific user (FR-07)
export function canDo(user, roles, module, action = 'view') {
  if (!user) return false;
  const base = roles[user.role]?.perms?.[module] || [];
  const extra = user.extra?.[module] || [];
  return base.includes(action) || extra.includes(action);
}