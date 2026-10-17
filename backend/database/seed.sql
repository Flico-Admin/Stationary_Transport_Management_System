-- =====================================================================
-- Request Desk: starting (demo) data. Run AFTER schema.sql (README step 3).
-- Demo password for every user below: Demo@123
-- =====================================================================
USE request_desk;

INSERT INTO roles (role_key, label) VALUES
  ('employee', 'Employee'),
  ('hod', 'HOD'),
  ('admin', 'Admin Department'),
  ('it', 'IT Department'),
  ('finance_hod', 'Finance HOD');

INSERT INTO role_permissions (role_key, module, action) VALUES
  ('employee', 'requests', 'view'),
  ('employee', 'requests', 'add'),
  ('hod', 'requests', 'view'),
  ('hod', 'requests', 'add'),
  ('hod', 'allRequests', 'view'),
  ('hod', 'hodApproval', 'view'),
  ('hod', 'hodApproval', 'edit'),
  ('hod', 'reports', 'view'),
  ('admin', 'requests', 'view'),
  ('admin', 'requests', 'add'),
  ('admin', 'allRequests', 'view'),
  ('admin', 'adminApproval', 'view'),
  ('admin', 'adminApproval', 'edit'),
  ('admin', 'issue', 'view'),
  ('admin', 'issue', 'edit'),
  ('admin', 'items', 'view'),
  ('admin', 'items', 'add'),
  ('admin', 'items', 'edit'),
  ('admin', 'items', 'delete'),
  ('admin', 'vehicles', 'view'),
  ('admin', 'vehicles', 'add'),
  ('admin', 'vehicles', 'edit'),
  ('admin', 'vehicles', 'delete'),
  ('admin', 'purchasing', 'view'),
  ('admin', 'purchasing', 'add'),
  ('admin', 'purchasing', 'edit'),
  ('admin', 'purchasing', 'delete'),
  ('admin', 'maintenance', 'view'),
  ('admin', 'maintenance', 'add'),
  ('admin', 'maintenance', 'edit'),
  ('admin', 'maintenance', 'delete'),
  ('admin', 'reports', 'view'),
  ('it', 'requests', 'view'),
  ('it', 'requests', 'add'),
  ('it', 'requests', 'edit'),
  ('it', 'requests', 'delete'),
  ('it', 'allRequests', 'view'),
  ('it', 'allRequests', 'add'),
  ('it', 'allRequests', 'edit'),
  ('it', 'allRequests', 'delete'),
  ('it', 'hodApproval', 'view'),
  ('it', 'hodApproval', 'add'),
  ('it', 'hodApproval', 'edit'),
  ('it', 'hodApproval', 'delete'),
  ('it', 'adminApproval', 'view'),
  ('it', 'adminApproval', 'add'),
  ('it', 'adminApproval', 'edit'),
  ('it', 'adminApproval', 'delete'),
  ('it', 'issue', 'view'),
  ('it', 'issue', 'add'),
  ('it', 'issue', 'edit'),
  ('it', 'issue', 'delete'),
  ('it', 'items', 'view'),
  ('it', 'items', 'add'),
  ('it', 'items', 'edit'),
  ('it', 'items', 'delete'),
  ('it', 'vehicles', 'view'),
  ('it', 'vehicles', 'add'),
  ('it', 'vehicles', 'edit'),
  ('it', 'vehicles', 'delete'),
  ('it', 'purchasing', 'view'),
  ('it', 'purchasing', 'add'),
  ('it', 'purchasing', 'edit'),
  ('it', 'purchasing', 'delete'),
  ('it', 'maintenance', 'view'),
  ('it', 'maintenance', 'add'),
  ('it', 'maintenance', 'edit'),
  ('it', 'maintenance', 'delete'),
  ('it', 'integration', 'view'),
  ('it', 'integration', 'add'),
  ('it', 'integration', 'edit'),
  ('it', 'integration', 'delete'),
  ('it', 'reports', 'view'),
  ('it', 'reports', 'add'),
  ('it', 'reports', 'edit'),
  ('it', 'reports', 'delete'),
  ('it', 'locations', 'view'),
  ('it', 'locations', 'add'),
  ('it', 'locations', 'edit'),
  ('it', 'locations', 'delete'),
  ('it', 'users', 'view'),
  ('it', 'users', 'add'),
  ('it', 'users', 'edit'),
  ('it', 'users', 'delete'),
  ('finance_hod', 'requests', 'view'),
  ('finance_hod', 'requests', 'add'),
  ('finance_hod', 'costReports', 'view'),
  ('admin', 'costReports', 'view'),
  ('it', 'costReports', 'view'),
  ('it', 'costReports', 'add'),
  ('it', 'costReports', 'edit'),
  ('it', 'costReports', 'delete');

-- ids follow the order below: 1 Operations, 2 Finance, 3 Marketing, 4 IT, 5 Admin, 6-18 Showrooms, 19-21 Warehouses
INSERT INTO units (id, name, type, approver_unit_id, active) VALUES
  (1, 'Operations', 'department', NULL, 1),
  (2, 'Finance', 'department', NULL, 1),
  (3, 'Marketing', 'department', NULL, 1),
  (4, 'IT', 'department', NULL, 1),
  (5, 'Admin', 'department', NULL, 1),
  (6, 'Showroom 1', 'showroom', 1, 1),
  (7, 'Showroom 2', 'showroom', 1, 1),
  (8, 'Showroom 3', 'showroom', 1, 1),
  (9, 'Showroom 4', 'showroom', 1, 1),
  (10, 'Showroom 5', 'showroom', 1, 1),
  (11, 'Showroom 6', 'showroom', 1, 1),
  (12, 'Showroom 7', 'showroom', 1, 1),
  (13, 'Showroom 8', 'showroom', 1, 1),
  (14, 'Showroom 9', 'showroom', 1, 1),
  (15, 'Showroom 10', 'showroom', 1, 1),
  (16, 'Showroom 11', 'showroom', 1, 1),
  (17, 'Showroom 12', 'showroom', 1, 1),
  (18, 'Showroom 13', 'showroom', 1, 1),
  (19, 'Warehouse 1', 'warehouse', 1, 1),
  (20, 'Warehouse 2', 'warehouse', 1, 1),
  (21, 'Warehouse 3', 'warehouse', 1, 1);

INSERT INTO users (id, name, email, password_hash, role_key, unit_id, active) VALUES
  (1, 'Nimal Perera', 'nimal@company.example', '$2b$10$NKBoOh9P1DSCwLsJe/vt6.OeRipr4F9Qb4k3IRYwrRLPe7P5xUchG', 'employee', 3, 1),
  (2, 'Kasun Silva', 'kasun@company.example', '$2b$10$NKBoOh9P1DSCwLsJe/vt6.OeRipr4F9Qb4k3IRYwrRLPe7P5xUchG', 'employee', 6, 1),
  (3, 'Sunil Fernando', 'sunil@company.example', '$2b$10$NKBoOh9P1DSCwLsJe/vt6.OeRipr4F9Qb4k3IRYwrRLPe7P5xUchG', 'hod', 1, 1),
  (4, 'Dilani Jayasinghe', 'dilani@company.example', '$2b$10$NKBoOh9P1DSCwLsJe/vt6.OeRipr4F9Qb4k3IRYwrRLPe7P5xUchG', 'admin', 5, 1),
  (5, 'Ruwan Wickrama', 'ruwan@company.example', '$2b$10$NKBoOh9P1DSCwLsJe/vt6.OeRipr4F9Qb4k3IRYwrRLPe7P5xUchG', 'it', 4, 1),
  (6, 'Chamari Dias', 'chamari@company.example', '$2b$10$NKBoOh9P1DSCwLsJe/vt6.OeRipr4F9Qb4k3IRYwrRLPe7P5xUchG', 'hod', 3, 1);

INSERT INTO categories (id, name) VALUES (1,'Paper'),(2,'Writing'),(3,'Files and folders'),(4,'Printing'),(5,'Office supplies');

INSERT INTO items (id, code, name, category_id, unit, description, stock, min_stock, unit_price, active) VALUES
  (1,'STN-001','A4 Paper',1,'box','5 reams per box, 80gsm',24,10,6500,1),
  (2,'STN-002','Blue Pen',2,'box','50 pens per box',6,8,2250,1),
  (3,'STN-003','Box File',3,'piece','Large, lever arch',40,15,650,1),
  (4,'STN-004','Printer Toner (Black)',4,'piece','Compatible with the main office printer',3,4,18500,1),
  (5,'STN-005','Stapler Pins',5,'pack','No. 24/6',55,20,180,1),
  (6,'STN-006','Marker Pen',2,'pack','Assorted colours, pack of 4',18,6,950,1);

INSERT INTO vehicles (id, number, type, capacity, status, active) VALUES
  (1,'CAB-1234','Car',4,'available',1),
  (2,'KV-5678','Van',9,'available',1),
  (3,'LR-9012','Lorry',2,'not available',1);

INSERT INTO drivers (id, name, phone, active) VALUES
  (1,'Saman Kumara','0771234567',1),
  (2,'Pradeep Nuwan','0712345678',1);

INSERT INTO suppliers (id, name, contact, active) VALUES
  (1,'City Office Supplies','011 2345678 / sales@cityoffice.example',1),
  (2,'PrintPro Traders','011 8765432',1);

INSERT INTO purchase_orders (id, supplier_id, status, created_at) VALUES (1001, 1, 'Sent', DATE_ADD(UTC_TIMESTAMP(), INTERVAL -5 DAY));
INSERT INTO purchase_order_lines (po_id, item_id, qty) VALUES (1001, 2, 20);
INSERT INTO purchase_order_history (po_id, at, by_name, action) VALUES
  (1001, DATE_ADD(UTC_TIMESTAMP(), INTERVAL -6 DAY), 'Dilani Jayasinghe', 'Created as Draft'),
  (1001, DATE_ADD(UTC_TIMESTAMP(), INTERVAL -5 DAY), 'Dilani Jayasinghe', 'Status changed to Approved'),
  (1001, DATE_ADD(UTC_TIMESTAMP(), INTERVAL -5 DAY), 'Dilani Jayasinghe', 'Status changed to Sent');

INSERT INTO maintenance (vehicle_id, date, type, details, cost, next_service, under_repair) VALUES
  (3, DATE_ADD(UTC_DATE(), INTERVAL -3 DAY), 'Repair', 'Gearbox repair', 85000, NULL, 1),
  (1, DATE_ADD(UTC_DATE(), INTERVAL -60 DAY), 'Service', 'Full service and oil change', 22000, DATE_ADD(UTC_DATE(), INTERVAL 20 DAY), 0),
  (2, DATE_ADD(UTC_DATE(), INTERVAL -90 DAY), 'Service', 'Brake pads and oil change', 31000, DATE_ADD(UTC_DATE(), INTERVAL 45 DAY), 0);

INSERT INTO fuel_logs (vehicle_id, date, litres, cost, meter) VALUES
  (1, DATE_ADD(UTC_DATE(), INTERVAL -10 DAY), 32, 14800, 45210),
  (2, DATE_ADD(UTC_DATE(), INTERVAL -8 DAY), 55, 25400, 78320),
  (1, DATE_ADD(UTC_DATE(), INTERVAL -2 DAY), 28, 12950, 45650);

INSERT INTO requests (id, type, user_id, unit_id, status, created_at, required_date, note, rejected_at, rejection_reason, received_by, issued_at,
  trip_purpose, trip_from, trip_to, trip_start, trip_end, trip_passengers, trip_vehicle_type) VALUES
  (1001,'stationery',1,3,'Pending HOD Approval',DATE_ADD(UTC_TIMESTAMP(), INTERVAL -1 DAY),DATE_ADD(UTC_DATE(), INTERVAL 4 DAY),'Needed for the quarterly campaign pack',NULL,NULL,NULL,NULL, NULL,NULL,NULL,NULL,NULL,NULL,NULL),
  (1002,'stationery',2,6,'Pending Admin Approval',DATE_ADD(UTC_TIMESTAMP(), INTERVAL -2 DAY),DATE_ADD(UTC_DATE(), INTERVAL 2 DAY),'',NULL,NULL,NULL,NULL, NULL,NULL,NULL,NULL,NULL,NULL,NULL),
  (1003,'vehicle',1,3,'Approved',DATE_ADD(UTC_TIMESTAMP(), INTERVAL -3 DAY),NULL,'',NULL,NULL,NULL,NULL, 'Client site visit','Head office','Showroom 2',CONCAT(DATE_FORMAT(DATE_ADD(UTC_DATE(), INTERVAL 1 DAY), '%Y-%m-%d'), 'T09:00'),CONCAT(DATE_FORMAT(DATE_ADD(UTC_DATE(), INTERVAL 1 DAY), '%Y-%m-%d'), 'T15:00'),3,'Van'),
  (1004,'stationery',2,6,'Issued / Completed',DATE_ADD(UTC_TIMESTAMP(), INTERVAL -9 DAY),DATE_ADD(UTC_DATE(), INTERVAL -5 DAY),'',NULL,NULL,'Kasun Silva',DATE_ADD(UTC_TIMESTAMP(), INTERVAL -6 DAY), NULL,NULL,NULL,NULL,NULL,NULL,NULL),
  (1005,'stationery',1,3,'Rejected',DATE_ADD(UTC_TIMESTAMP(), INTERVAL -12 DAY),DATE_ADD(UTC_DATE(), INTERVAL -8 DAY),'','hod','Stock requested is more than the team needs this month',NULL,NULL, NULL,NULL,NULL,NULL,NULL,NULL,NULL);

INSERT INTO request_lines (request_id, line_no, item_id, qty, approved_qty, issued_qty, unit_price) VALUES
  (1001,0,1,4,NULL,NULL,NULL),(1001,1,6,3,NULL,NULL,NULL),
  (1002,0,2,2,NULL,NULL,NULL),(1002,1,4,2,NULL,NULL,NULL),
  (1004,0,3,10,8,8,650),
  (1005,0,1,30,NULL,NULL,NULL);

INSERT INTO request_history (request_id, at, by_name, action, comment) VALUES
  (1001, DATE_ADD(UTC_TIMESTAMP(), INTERVAL -1 DAY), 'Nimal Perera', 'Created request', NULL),
  (1002, DATE_ADD(UTC_TIMESTAMP(), INTERVAL -2 DAY), 'Kasun Silva', 'Created request', NULL),
  (1002, DATE_ADD(UTC_TIMESTAMP(), INTERVAL -1 DAY), 'Sunil Fernando', 'HOD approved', 'OK'),
  (1003, DATE_ADD(UTC_TIMESTAMP(), INTERVAL -3 DAY), 'Nimal Perera', 'Created request', NULL),
  (1003, DATE_ADD(UTC_TIMESTAMP(), INTERVAL -2 DAY), 'Sunil Fernando', 'HOD approved', NULL),
  (1003, DATE_ADD(UTC_TIMESTAMP(), INTERVAL -1 DAY), 'Dilani Jayasinghe', 'Admin approved', NULL),
  (1004, DATE_ADD(UTC_TIMESTAMP(), INTERVAL -9 DAY), 'Kasun Silva', 'Created request', NULL),
  (1004, DATE_ADD(UTC_TIMESTAMP(), INTERVAL -8 DAY), 'Sunil Fernando', 'HOD approved', NULL),
  (1004, DATE_ADD(UTC_TIMESTAMP(), INTERVAL -7 DAY), 'Dilani Jayasinghe', 'Admin approved (partial quantity)', NULL),
  (1004, DATE_ADD(UTC_TIMESTAMP(), INTERVAL -6 DAY), 'Dilani Jayasinghe', 'Issued items. Received by Kasun Silva', NULL),
  (1005, DATE_ADD(UTC_TIMESTAMP(), INTERVAL -12 DAY), 'Nimal Perera', 'Created request', NULL),
  (1005, DATE_ADD(UTC_TIMESTAMP(), INTERVAL -11 DAY), 'Sunil Fernando', 'HOD rejected', 'Stock requested is more than the team needs this month');

INSERT INTO integration_log (at, kind, status, message) VALUES
  (DATE_ADD(UTC_TIMESTAMP(), INTERVAL -4 DAY), 'Purchase orders to finance', 'Error', 'Finance system is not configured yet');