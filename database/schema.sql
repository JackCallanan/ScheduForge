-- ScheduForge — normalized schema (ERD core + app extensions)
-- Run against MySQL 8+

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

DROP TABLE IF EXISTS shift_requests;
DROP TABLE IF EXISTS available_shifts;
DROP TABLE IF EXISTS schedule_shifts;
DROP TABLE IF EXISTS shifts;
DROP TABLE IF EXISTS schedules;
DROP TABLE IF EXISTS notifications;
DROP TABLE IF EXISTS user_credentials;
DROP TABLE IF EXISTS managers;
DROP TABLE IF EXISTS app_settings;
DROP TABLE IF EXISTS employees;

SET FOREIGN_KEY_CHECKS = 1;

CREATE TABLE employees (
  employee_id INT PRIMARY KEY,
  first_name VARCHAR(120) NOT NULL,
  last_name VARCHAR(120) NOT NULL DEFAULT '',
  email VARCHAR(255) NOT NULL UNIQUE,
  phone_number VARCHAR(50) NOT NULL DEFAULT 'N/A',
  role ENUM('Employee', 'Manager') NOT NULL,
  department VARCHAR(120) NOT NULL,
  INDEX idx_employees_role (role)
) ENGINE=InnoDB;

CREATE TABLE managers (
  manager_id INT PRIMARY KEY,
  employee_id INT NOT NULL UNIQUE,
  CONSTRAINT fk_managers_employee FOREIGN KEY (employee_id) REFERENCES employees (employee_id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE user_credentials (
  email VARCHAR(255) PRIMARY KEY,
  password VARCHAR(500) NOT NULL,
  CONSTRAINT fk_credentials_employee_email FOREIGN KEY (email) REFERENCES employees (email) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE schedules (
  schedule_id INT PRIMARY KEY,
  manager_id INT NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  published BOOLEAN NOT NULL DEFAULT FALSE,
  CONSTRAINT fk_schedules_manager FOREIGN KEY (manager_id) REFERENCES managers (manager_id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE shifts (
  shift_id INT PRIMARY KEY,
  assigned_employee_id INT NOT NULL,
  shift_date DATE NOT NULL,
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  duration_hours DECIMAL(6, 2) NOT NULL,
  position VARCHAR(120) NOT NULL,
  location VARCHAR(200) NOT NULL,
  assigned_by_manager_employee_id INT NULL,
  CONSTRAINT fk_shifts_assignee FOREIGN KEY (assigned_employee_id) REFERENCES employees (employee_id) ON DELETE CASCADE,
  CONSTRAINT fk_shifts_assigned_by FOREIGN KEY (assigned_by_manager_employee_id) REFERENCES employees (employee_id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE schedule_shifts (
  schedule_id INT NOT NULL,
  shift_id INT NOT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  PRIMARY KEY (schedule_id, shift_id),
  CONSTRAINT fk_ss_schedule FOREIGN KEY (schedule_id) REFERENCES schedules (schedule_id) ON DELETE CASCADE,
  CONSTRAINT fk_ss_shift FOREIGN KEY (shift_id) REFERENCES shifts (shift_id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE available_shifts (
  available_shift_id INT PRIMARY KEY,
  shift_id INT NOT NULL,
  reason TEXT NOT NULL,
  is_open BOOLEAN NOT NULL DEFAULT TRUE,
  posted_by_employee_id INT NOT NULL,
  CONSTRAINT fk_avail_shift FOREIGN KEY (shift_id) REFERENCES shifts (shift_id) ON DELETE CASCADE,
  CONSTRAINT fk_avail_poster FOREIGN KEY (posted_by_employee_id) REFERENCES employees (employee_id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- ERD: shift_id + requester + status; app also needs available_shift_id for posting/coverage flow
CREATE TABLE shift_requests (
  request_id INT PRIMARY KEY,
  shift_id INT NOT NULL,
  available_shift_id INT NOT NULL,
  requester_id INT NOT NULL,
  status VARCHAR(20) NOT NULL,
  reviewed_by_manager_id INT NULL,
  CONSTRAINT fk_sr_shift FOREIGN KEY (shift_id) REFERENCES shifts (shift_id) ON DELETE CASCADE,
  CONSTRAINT fk_sr_available FOREIGN KEY (available_shift_id) REFERENCES available_shifts (available_shift_id) ON DELETE CASCADE,
  CONSTRAINT fk_sr_requester FOREIGN KEY (requester_id) REFERENCES employees (employee_id) ON DELETE CASCADE,
  CONSTRAINT fk_sr_reviewer FOREIGN KEY (reviewed_by_manager_id) REFERENCES employees (employee_id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE notifications (
  notification_id INT PRIMARY KEY,
  user_id INT NOT NULL,
  message TEXT NOT NULL,
  created_at DATETIME(3) NOT NULL,
  CONSTRAINT fk_notif_user FOREIGN KEY (user_id) REFERENCES employees (employee_id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE app_settings (
  id INT PRIMARY KEY,
  ai_hands_off_mode BOOLEAN NOT NULL DEFAULT FALSE,
  business_open_time TIME NOT NULL,
  business_close_time TIME NOT NULL,
  required_positions JSON NOT NULL,
  minimum_opening_managers INT NOT NULL,
  minimum_opening_employees INT NOT NULL,
  daily_business_rules JSON NOT NULL,
  CONSTRAINT chk_singleton CHECK (id = 1)
) ENGINE=InnoDB;
