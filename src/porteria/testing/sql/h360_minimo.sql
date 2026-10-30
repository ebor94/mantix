-- Esquema MÍNIMO de las tablas de H360/Mantix que Portería lee, solo para pruebas.
-- Columnas tomadas de los controladores de H360; en la Fase 1 se contrasta con SHOW CREATE TABLE
-- de la base real y se ajusta este archivo (no el código) si difiere.
CREATE TABLE sedes (
  id INT AUTO_INCREMENT PRIMARY KEY,
  codigo VARCHAR(10) NOT NULL UNIQUE,
  nombre VARCHAR(100) NOT NULL,
  direccion VARCHAR(200) NULL,
  ciudad VARCHAR(100) NULL,
  activo TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE vehiculos (
  id INT AUTO_INCREMENT PRIMARY KEY,
  placa VARCHAR(20) NOT NULL,
  marca VARCHAR(50) NULL,
  modelo VARCHAR(50) NULL,
  anio INT NULL,
  tipo VARCHAR(30) NOT NULL DEFAULT 'CARROZA',
  activo TINYINT(1) NOT NULL DEFAULT 1,
  observaciones TEXT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE asistencias (
  id INT AUTO_INCREMENT PRIMARY KEY,
  codigo VARCHAR(30) NOT NULL,
  nombre_ser_querido VARCHAR(200) NULL,
  contrato VARCHAR(50) NULL,
  conductor_id VARCHAR(100) NULL,
  estado VARCHAR(30) NOT NULL DEFAULT 'NUEVO',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE exequias (
  id INT AUTO_INCREMENT PRIMARY KEY,
  asistencia_id INT NULL,
  tipo VARCHAR(50) NULL,
  fecha DATE NULL,
  hora TIME NULL,
  lugar VARCHAR(200) NULL,
  vehiculo_id INT NULL,
  conductor_id VARCHAR(100) NULL,
  estado VARCHAR(30) NOT NULL DEFAULT 'PENDIENTE_CONFIRMAR',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
