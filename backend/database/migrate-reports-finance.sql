-- Vehicle cost report (repairs + fuel) and the new "Finance HOD" role.
-- Safe for a live database: nothing is deleted, it can be run more than once.
USE request_desk;

INSERT IGNORE INTO roles (role_key, label) VALUES ('finance_hod', 'Finance HOD');

INSERT IGNORE INTO role_permissions (role_key, module, action) VALUES
  ('finance_hod', 'requests',    'view'),
  ('finance_hod', 'requests',    'add'),
  ('finance_hod', 'costReports', 'view'),
  ('admin',       'costReports', 'view'),
  ('it',          'costReports', 'view'),
  ('it',          'costReports', 'add'),
  ('it',          'costReports', 'edit'),
  ('it',          'costReports', 'delete');