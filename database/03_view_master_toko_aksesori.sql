-- =====================================================
-- VIEW DATA MASTER - TOKO AKSESORI HP
-- Jalankan file ini KETIGA (setelah DDL dan DML)
-- =====================================================

USE db_toko_aksesori;

-- 1. View role
CREATE OR REPLACE VIEW v_role AS
SELECT idrole,
       nama_role
FROM `role`;

-- 2. View user (JOIN role, password sengaja tidak ditampilkan)
CREATE OR REPLACE VIEW v_user AS
SELECT u.iduser,
       u.username,
       r.idrole,
       r.nama_role
FROM `user` u
JOIN `role` r ON r.idrole = u.idrole;

-- 3. View vendor
CREATE OR REPLACE VIEW v_vendor AS
SELECT idvendor,
       nama_vendor,
       CASE badan_hukum
            WHEN 'Y' THEN 'Berbadan Hukum'
            ELSE 'Non Badan Hukum'
       END AS badan_hukum,
       CASE status
            WHEN '1' THEN 'Aktif'
            ELSE 'Nonaktif'
       END AS status
FROM vendor;

-- 4. View satuan
CREATE OR REPLACE VIEW v_satuan AS
SELECT idsatuan,
       nama_satuan,
       CASE status
            WHEN 1 THEN 'Aktif'
            ELSE 'Nonaktif'
       END AS status
FROM satuan;

-- 5. View barang (JOIN satuan, kode jenis diterjemahkan)
CREATE OR REPLACE VIEW v_barang AS
SELECT b.idbarang,
       CASE b.jenis
            WHEN 'C' THEN 'Casing'
            WHEN 'H' THEN 'Charger'
            WHEN 'K' THEN 'Kabel'
            WHEN 'A' THEN 'Audio'
            WHEN 'P' THEN 'Powerbank'
            WHEN 'G' THEN 'Tempered Glass'
            ELSE 'Lainnya'
       END AS jenis,
       b.nama,
       s.idsatuan,
       s.nama_satuan,
       b.harga AS harga_beli,
       CASE b.status
            WHEN 1 THEN 'Aktif'
            ELSE 'Nonaktif'
       END AS status
FROM barang b
JOIN satuan s ON s.idsatuan = b.idsatuan;

-- 6. View margin_penjualan (JOIN user)
CREATE OR REPLACE VIEW v_margin_penjualan AS
SELECT m.idmargin_penjualan,
       m.persen,
       CASE m.status
            WHEN 1 THEN 'Aktif'
            ELSE 'Nonaktif'
       END AS status,
       u.username AS dibuat_oleh,
       m.created_at,
       m.updated_at
FROM margin_penjualan m
JOIN `user` u ON u.iduser = m.iduser;

-- =====================================================
-- Cek hasil
-- =====================================================
-- SELECT * FROM v_role;
-- SELECT * FROM v_user;
-- SELECT * FROM v_vendor;
-- SELECT * FROM v_satuan;
-- SELECT * FROM v_barang;
-- SELECT * FROM v_margin_penjualan;
