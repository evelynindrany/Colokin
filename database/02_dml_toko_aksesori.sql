-- =====================================================
-- DML - DATA CONTOH TOKO AKSESORI HP
-- Jalankan file ini KEDUA (setelah DDL berhasil)
-- =====================================================

USE db_toko_aksesori;

-- =====================================================

INSERT INTO `role` (idrole, nama_role) VALUES
(1, 'Admin'),
(2, 'Kasir'),
(3, 'Super Admin');

INSERT INTO satuan (idsatuan, nama_satuan, status) VALUES
(1, 'pcs', 1),
(2, 'box', 1),
(3, 'lusin', 1),
(4, 'set', 1);

INSERT INTO vendor (idvendor, nama_vendor, badan_hukum, status) VALUES
(1, 'PT Mitra Gadget Nusantara', 'Y', '1'),
(2, 'CV Aksesori Jaya', 'Y', '1'),
(3, 'Budi Grosir Aksesori', 'N', '1');

INSERT INTO `user` (iduser, username, password, idrole) VALUES
(1, 'admin',  SHA2('admin123', 256), 1),
(2, 'kasir1', SHA2('kasir123', 256), 2),
(3, 'superadmin', SHA2('superadmin123', 256), 3);

INSERT INTO barang (idbarang, jenis, nama, idsatuan, status, harga) VALUES
(1, 'C', 'Casing HP Hitam',             1, 1,  35000),
(2, 'C', 'Casing HP Bening',            1, 1,  30000),
(3, 'H', 'Charger 20W Type-C',          1, 1,  55000),
(4, 'K', 'Kabel Data Type-C 1m',        1, 1,  15000),
(5, 'A', 'Earphone TWS',                1, 1,  90000),
(6, 'P', 'Powerbank 10000mAh',          1, 1, 120000),
(7, 'G', 'Tempered Glass',              1, 1,  12000),
(8, 'A', 'Earphone Kabel 3.5mm',        1, 1,  20000);

INSERT INTO margin_penjualan (idmargin_penjualan, persen, status, iduser) VALUES
(1, 30, 1, 1),
(2, 40, 0, 1);

-- Pengadaan 1: ke PT Mitra Gadget Nusantara
-- subtotal 3.200.000 + ppn 11% 352.000 = 3.552.000
INSERT INTO pengadaan (idpengadaan, user_iduser, status, vendor_idvendor, subtotal_nilai, ppn, total_nilai) VALUES
(1, 1, 'S', 1, 3200000, 352000, 3552000);

-- Pengadaan 2: ke CV Aksesori Jaya
-- subtotal 3.180.000 + ppn 11% 349.800 = 3.529.800
INSERT INTO pengadaan (idpengadaan, user_iduser, status, vendor_idvendor, subtotal_nilai, ppn, total_nilai) VALUES
(2, 1, 'S', 2, 3180000, 349800, 3529800);

INSERT INTO detail_pengadaan (iddetail_pengadaan, harga_satuan, jumlah, sub_total, idbarang, idpengadaan) VALUES
(1,  55000, 20, 1100000, 3, 1),
(2,  90000, 10,  900000, 5, 1),
(3, 120000, 10, 1200000, 6, 1),
(4,  35000, 30, 1050000, 1, 2),
(5,  30000, 30,  900000, 2, 2),
(6,  15000, 50,  750000, 4, 2),
(7,  12000, 40,  480000, 7, 2);

INSERT INTO penerimaan (idpenerimaan, status, idpengadaan, iduser) VALUES
(1, 'S', 1, 1),
(2, 'S', 2, 1);

INSERT INTO detail_penerimaan (iddetail_penerimaan, idpenerimaan, barang_idbarang, jumlah_terima, harga_satuan_terima, sub_total_terima) VALUES
(1, 1, 3, 20,  55000, 1100000),
(2, 1, 5, 10,  90000,  900000),
(3, 1, 6, 10, 120000, 1200000),
(4, 2, 1, 30,  35000, 1050000),
(5, 2, 2, 30,  30000,  900000),
(6, 2, 4, 50,  15000,  750000),
(7, 2, 7, 40,  12000,  480000);

-- Penjualan 1 (margin 30%): subtotal 396.500 + ppn 11% 43.615 = 440.115
INSERT INTO penjualan (idpenjualan, subtotal_nilai, ppn, total_nilai, iduser, idmargin_penjualan) VALUES
(1, 396500, 43615, 440115, 2, 1);

-- Penjualan 2 (margin 30%): subtotal 159.900 + ppn 11% 17.589 = 177.489
INSERT INTO penjualan (idpenjualan, subtotal_nilai, ppn, total_nilai, iduser, idmargin_penjualan) VALUES
(2, 159900, 17589, 177489, 2, 1);

INSERT INTO detail_penjualan (iddetail_penjualan, harga_satuan, jumlah, subtotal, penjualan_idpenjualan, idbarang) VALUES
(1,  71500, 2, 143000, 1, 3),
(2, 117000, 1, 117000, 1, 5),
(3,  45500, 3, 136500, 1, 1),
(4,  19500, 5,  97500, 2, 4),
(5,  15600, 4,  62400, 2, 7);

-- Retur: 1 earphone TWS dari penerimaan 1 mati sebelah
INSERT INTO retur (idretur, idpenerimaan, iduser) VALUES
(1, 1, 1);

INSERT INTO detail_retur (iddetail_retur, jumlah, alasan, idretur, iddetail_penerimaan) VALUES
(1, 1, 'Earphone mati sebelah', 1, 2);

-- Kartu stok (M = penerimaan, K = penjualan, R = retur)
INSERT INTO kartu_stok (jenis_transaksi, masuk, keluar, stock, idtransaksi, idbarang) VALUES
('M', 20, 0, 20, 1, 3),
('M', 10, 0, 10, 1, 5),
('M', 10, 0, 10, 1, 6),
('M', 30, 0, 30, 2, 1),
('M', 30, 0, 30, 2, 2),
('M', 50, 0, 50, 2, 4),
('M', 40, 0, 40, 2, 7),
('K', 0, 2, 18, 1, 3),
('K', 0, 1,  9, 1, 5),
('K', 0, 3, 27, 1, 1),
('K', 0, 5, 45, 2, 4),
('K', 0, 4, 36, 2, 7),
('R', 0, 1,  8, 1, 5);

-- Cek cepat
-- SELECT * FROM barang;
-- SELECT * FROM kartu_stok ORDER BY idbarang, idkartu_stok;
