-- =====================================================================
-- Request Desk: database schema (MySQL 8)
-- Run this whole file ONCE in MySQL Workbench (see README step 2).
-- It creates the database "request_desk" and all tables.
-- WARNING: it drops the old tables first, so running it again resets everything.
-- =====================================================================
CREATE DATABASE IF NOT EXISTS request_desk CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE request_desk;

SET FOREIGN_KEY_CHECKS = 0;
DROP TABLE IF EXISTS audit_log, integration_log, request_history, request_lines, requests,
  fuel_logs, maintenance, purchase_order_history, purchase_order_lines, purchase_orders,
  suppliers, drivers, vehicles, items, categories, user_permissions, users, units,
  role_permissions, roles;
SET FOREIGN_KEY_CHECKS = 1;

-- ---------- roles and permissions ----------
CREATE TABLE roles (
  role_key VARCHAR(50)  NOT NULL PRIMARY KEY,
  label    VARCHAR(100) NOT NULL
) ENGINE=InnoDB;

CREATE TABLE role_permissions (
  role_key VARCHAR(50) NOT NULL,
  module   VARCHAR(50) NOT NULL,
  action   ENUM('view','add','edit','delete') NOT NULL,
  PRIMARY KEY (role_key, module, action),
  CONSTRAINT fk_rp_role FOREIGN KEY (role_key) REFERENCES roles(role_key) ON DELETE CASCADE
) ENGINE=InnoDB;

-- ---------- departments, showrooms, warehouses ----------
CREATE TABLE units (
  id               INT AUTO_INCREMENT PRIMARY KEY,
  name             VARCHAR(100) NOT NULL UNIQUE,
  type             ENUM('department','showroom','warehouse') NOT NULL,
  approver_unit_id INT NULL,                       -- whose HOD signs requests from this unit (NULL = its own HOD)
  active           TINYINT(1) NOT NULL DEFAULT 1,
  CONSTRAINT fk_unit_approver FOREIGN KEY (approver_unit_id) REFERENCES units(id)
) ENGINE=InnoDB;

-- ---------- users ----------
CREATE TABLE users (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  name          VARCHAR(100) NOT NULL,
  email         VARCHAR(150) NOT NULL UNIQUE,
  password_hash VARCHAR(100) NOT NULL,             -- bcrypt hash, never the real password
  role_key      VARCHAR(50)  NOT NULL,
  unit_id       INT NOT NULL,
  active        TINYINT(1) NOT NULL DEFAULT 1,
  created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_user_role FOREIGN KEY (role_key) REFERENCES roles(role_key),
  CONSTRAINT fk_user_unit FOREIGN KEY (unit_id)  REFERENCES units(id)
) ENGINE=InnoDB;

-- extra permissions given to one specific user (on top of the role)
CREATE TABLE user_permissions (
  user_id INT NOT NULL,
  module  VARCHAR(50) NOT NULL,
  action  ENUM('view','add','edit','delete') NOT NULL,
  PRIMARY KEY (user_id, module, action),
  CONSTRAINT fk_up_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- ---------- stationery ----------
CREATE TABLE categories (
  id   INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100) NOT NULL UNIQUE
) ENGINE=InnoDB;

CREATE TABLE items (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  code        VARCHAR(30)  NOT NULL UNIQUE,
  name        VARCHAR(150) NOT NULL,
  category_id INT NOT NULL,
  unit        VARCHAR(30)  NOT NULL,
  description VARCHAR(255) NOT NULL DEFAULT '',
  stock       INT NOT NULL DEFAULT 0,
  min_stock   INT NOT NULL DEFAULT 0,
  unit_price  DECIMAL(12,2) NOT NULL DEFAULT 0,   -- price of one unit, used by the Stationery costs report
  active      TINYINT(1) NOT NULL DEFAULT 1,
  CONSTRAINT fk_item_cat FOREIGN KEY (category_id) REFERENCES categories(id)
) ENGINE=InnoDB;

-- ---------- vehicles and drivers ----------
CREATE TABLE vehicles (
  id       INT AUTO_INCREMENT PRIMARY KEY,
  number   VARCHAR(30) NOT NULL UNIQUE,
  type     VARCHAR(30) NOT NULL,
  capacity INT NOT NULL DEFAULT 1,
  status   ENUM('available','not available') NOT NULL DEFAULT 'available',   -- repairs / out of service only
  active   TINYINT(1) NOT NULL DEFAULT 1
) ENGINE=InnoDB;

CREATE TABLE drivers (
  id     INT AUTO_INCREMENT PRIMARY KEY,
  name   VARCHAR(100) NOT NULL,
  phone  VARCHAR(30)  NOT NULL DEFAULT '',
  active TINYINT(1) NOT NULL DEFAULT 1
) ENGINE=InnoDB;

-- ---------- suppliers and purchase orders ----------
CREATE TABLE suppliers (
  id      INT AUTO_INCREMENT PRIMARY KEY,
  name    VARCHAR(150) NOT NULL,
  contact VARCHAR(255) NOT NULL DEFAULT '',
  active  TINYINT(1) NOT NULL DEFAULT 1
) ENGINE=InnoDB;

CREATE TABLE purchase_orders (            -- shown in the app as PO-<id>
  id          INT AUTO_INCREMENT PRIMARY KEY,
  supplier_id INT NOT NULL,
  status      ENUM('Draft','Approved','Sent','Received') NOT NULL DEFAULT 'Draft',
  created_at  DATETIME NOT NULL,
  CONSTRAINT fk_po_supplier FOREIGN KEY (supplier_id) REFERENCES suppliers(id)
) ENGINE=InnoDB AUTO_INCREMENT=1001;

CREATE TABLE purchase_order_lines (
  id      INT AUTO_INCREMENT PRIMARY KEY,
  po_id   INT NOT NULL,
  item_id INT NOT NULL,
  qty     INT NOT NULL,
  CONSTRAINT fk_pol_po   FOREIGN KEY (po_id)   REFERENCES purchase_orders(id) ON DELETE CASCADE,
  CONSTRAINT fk_pol_item FOREIGN KEY (item_id) REFERENCES items(id)
) ENGINE=InnoDB;

CREATE TABLE purchase_order_history (
  id      INT AUTO_INCREMENT PRIMARY KEY,
  po_id   INT NOT NULL,
  at      DATETIME NOT NULL,
  by_name VARCHAR(100) NOT NULL,
  action  VARCHAR(255) NOT NULL,
  CONSTRAINT fk_poh_po FOREIGN KEY (po_id) REFERENCES purchase_orders(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- ---------- vehicle maintenance and fuel ----------
CREATE TABLE maintenance (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  vehicle_id    INT NOT NULL,
  date          DATE NOT NULL,
  type          VARCHAR(30) NOT NULL,
  details       VARCHAR(500) NOT NULL,
  cost          DECIMAL(12,2) NOT NULL DEFAULT 0,
  next_service  DATE NULL,
  under_repair  TINYINT(1) NOT NULL DEFAULT 0,
  CONSTRAINT fk_mt_vehicle FOREIGN KEY (vehicle_id) REFERENCES vehicles(id)
) ENGINE=InnoDB;

CREATE TABLE fuel_logs (
  id         INT AUTO_INCREMENT PRIMARY KEY,
  vehicle_id INT NOT NULL,
  date       DATE NOT NULL,
  litres     DECIMAL(8,2) NOT NULL,
  cost       DECIMAL(12,2) NOT NULL,
  meter      INT NULL,
  CONSTRAINT fk_fuel_vehicle FOREIGN KEY (vehicle_id) REFERENCES vehicles(id)
) ENGINE=InnoDB;

-- ---------- requests (stationery and vehicle) ----------
CREATE TABLE requests (                   -- shown in the app as REQ-<id>
  id                 INT AUTO_INCREMENT PRIMARY KEY,
  type               ENUM('stationery','vehicle') NOT NULL,
  user_id            INT NOT NULL,
  unit_id            INT NOT NULL,
  status             VARCHAR(40) NOT NULL,
  created_at         DATETIME NOT NULL,
  required_date      DATE NULL,                 -- stationery only
  note               VARCHAR(1000) NOT NULL DEFAULT '',
  rejected_at        ENUM('hod','admin') NULL,
  rejection_reason   VARCHAR(1000) NULL,
  received_by        VARCHAR(100) NULL,
  issued_at          DATETIME NULL,
  -- vehicle trip details (trip_start / trip_end keep the exact 'YYYY-MM-DDTHH:mm' text the screen uses)
  trip_purpose       VARCHAR(255) NULL,
  trip_from          VARCHAR(255) NULL,
  trip_to            VARCHAR(255) NULL,
  trip_start         VARCHAR(16)  NULL,
  trip_end           VARCHAR(16)  NULL,
  trip_passengers    INT NULL,
  trip_vehicle_type  VARCHAR(30)  NULL,
  trip_vehicle_id    INT NULL,
  trip_driver_id     INT NULL,
  trip_completed_at  DATETIME NULL,
  CONSTRAINT fk_req_user    FOREIGN KEY (user_id)        REFERENCES users(id),
  CONSTRAINT fk_req_unit    FOREIGN KEY (unit_id)        REFERENCES units(id),
  CONSTRAINT fk_req_vehicle FOREIGN KEY (trip_vehicle_id) REFERENCES vehicles(id),
  CONSTRAINT fk_req_driver  FOREIGN KEY (trip_driver_id)  REFERENCES drivers(id),
  INDEX idx_req_status (status),
  INDEX idx_req_user (user_id)
) ENGINE=InnoDB AUTO_INCREMENT=1001;

CREATE TABLE request_lines (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  request_id  INT NOT NULL,
  line_no     INT NOT NULL,
  item_id     INT NOT NULL,
  qty         INT NOT NULL,
  approved_qty INT NULL,
  issued_qty   INT NULL,
  unit_price   DECIMAL(12,2) NULL,                -- item price at the moment it was issued (so old costs never change)
  CONSTRAINT fk_rl_req  FOREIGN KEY (request_id) REFERENCES requests(id) ON DELETE CASCADE,
  CONSTRAINT fk_rl_item FOREIGN KEY (item_id)    REFERENCES items(id)
) ENGINE=InnoDB;

CREATE TABLE request_history (
  id         INT AUTO_INCREMENT PRIMARY KEY,
  request_id INT NOT NULL,
  at         DATETIME NOT NULL,
  by_name    VARCHAR(100) NOT NULL,
  action     VARCHAR(255) NOT NULL,
  comment    VARCHAR(1000) NULL,
  CONSTRAINT fk_rh_req FOREIGN KEY (request_id) REFERENCES requests(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- ---------- logs ----------
CREATE TABLE integration_log (
  id      INT AUTO_INCREMENT PRIMARY KEY,
  at      DATETIME NOT NULL,
  kind    VARCHAR(100) NOT NULL,
  status  VARCHAR(30)  NOT NULL,
  message VARCHAR(500) NOT NULL
) ENGINE=InnoDB;

CREATE TABLE audit_log (
  id      INT AUTO_INCREMENT PRIMARY KEY,
  at      DATETIME NOT NULL,
  by_name VARCHAR(100) NOT NULL,
  text    VARCHAR(500) NOT NULL
) ENGINE=InnoDB;