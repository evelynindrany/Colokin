// =====================================================
// BACKEND - COLOKIN (Inventori dan Penjualan Aksesori HP)
// Node.js + Express + MySQL (mysql2)
// =====================================================
const express = require('express');
const mysql = require('mysql2/promise');
const path = require('path');
const fs = require('fs/promises');
const crypto = require('crypto');

// ---- KONFIGURASI DATABASE (ubah sesuai MySQL kamu) ----
const DB = {
  host: process.env.DB_HOST || 'localhost',
  port: +(process.env.DB_PORT || 8889),
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || 'root',      // isi password MySQL kamu di sini
  database: process.env.DB_NAME || 'db_toko_aksesori',
};
const PORT = process.env.PORT || 3000;
const pool = mysql.createPool({ ...DB, waitForConnections: true, connectionLimit: 10 });
const app = express();
const sessions = new Map();
app.use(express.json({ limit: '7mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// ---- helper ----
const bad = (m, s = 400) => { const e = new Error(m); e.status = s; return e; };
const wrap = fn => async (req, res) => {
  try { res.json((await fn(req, res)) || { ok: true }); }
  catch (e) {
    if (e.code === 'ER_ROW_IS_REFERENCED_2') e = bad('Data ini sudah dipakai transaksi. Ubah statusnya jadi Nonaktif.', 409);
    if (!e.status) console.error(e);
    res.status(e.status || 500).json({ error: e.status ? e.message : 'Kesalahan server: ' + e.message });
  }
};
function cookie(req, name) {
  const raw = req.headers.cookie || '';
  const found = raw.split(';').map(x => x.trim()).find(x => x.startsWith(name + '='));
  return found ? decodeURIComponent(found.slice(name.length + 1)) : '';
}
app.get('/api/session', (req, res) => {
  const token = cookie(req, 'colokin_session');
  const session = sessions.get(token);
  const user = session && session.expiresAt > Date.now() ? session.user : null;
  if (!user && token) sessions.delete(token);
  res.json({ user: user ? { id: user.id, username: user.username, role: user.role } : null });
});
app.post('/api/login', wrap(async (req, res) => {
  const username = String(req.body.username || '').trim();
  const password = String(req.body.password || '');
  const [[row]] = await pool.query('SELECT u.iduser id, u.username, r.nama_role roleName FROM `user` u JOIN `role` r ON r.idrole=u.idrole WHERE u.username=? AND u.password=SHA2(?,256) LIMIT 1', [username, password]);
  if (!row) throw bad('Username atau password salah', 401);
  const token = crypto.randomBytes(32).toString('hex');
  const roleName = String(row.roleName).toLowerCase();
  const role = roleName === 'super admin' ? 'superadmin' : roleName === 'admin' ? 'admin' : 'kasir';
  const user = { id: row.id, username: row.username, role };
  sessions.set(token, { user, expiresAt: Date.now() + 8 * 60 * 60 * 1000 });
  res.setHeader('Set-Cookie', `colokin_session=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=28800`);
  return { user };
}));
app.post('/api/logout', (req, res) => {
  sessions.delete(cookie(req, 'colokin_session'));
  res.setHeader('Set-Cookie', 'colokin_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0');
  res.json({ ok: true });
});
app.use('/api', (req, res, next) => {
  const token = cookie(req, 'colokin_session');
  const session = sessions.get(token);
  const user = session && session.expiresAt > Date.now() ? session.user : null;
  if (!user && token) sessions.delete(token);
  if (!user) return res.status(401).json({ error: 'Silakan login terlebih dahulu' });
  req.user = user;
  next();
});
app.use(['/api/master', '/api/pengadaan', '/api/terima', '/api/retur', '/api/barang'], (req, res, next) => {
  if (!['admin', 'superadmin'].includes(req.user.role)) return res.status(403).json({ error: 'Fitur ini hanya untuk admin' });
  next();
});
async function tx(fn) {
  const c = await pool.getConnection();
  try { await c.beginTransaction(); const r = await fn(c); await c.commit(); return r; }
  catch (e) { await c.rollback(); throw e; }
  finally { c.release(); }
}
const D = col => `DATE_FORMAT(${col},'%Y-%m-%d %H:%i')`;
async function stockOf(c, b) {
  const [r] = await c.query('SELECT stock FROM kartu_stok WHERE idbarang=? ORDER BY idkartu_stok DESC LIMIT 1 FOR UPDATE', [b]);
  return r.length ? r[0].stock : 0;
}
async function addKartu(c, t, masuk, keluar, trx, b) {
  const stock = (await stockOf(c, b)) + masuk - keluar;
  await c.query('INSERT INTO kartu_stok (jenis_transaksi,masuk,keluar,stock,idtransaksi,idbarang) VALUES (?,?,?,?,?,?)', [t, masuk, keluar, stock, trx, b]);
}

// ---- ambil semua data (bentuknya sudah disesuaikan untuk front end) ----
app.get('/api/data', wrap(async () => {
  const q = async s => (await pool.query(s))[0];
  const [vendor, satuan, barang, margin, pg, dpg, pn, dpn, pj, dpj, retur, kartu] = await Promise.all([
    q('SELECT idvendor id, nama_vendor nama, badan_hukum hukum, status+0 status FROM vendor ORDER BY idvendor'),
    q('SELECT idsatuan id, nama_satuan nama, status FROM satuan ORDER BY idsatuan'),
    q('SELECT idbarang id, jenis, nama, idsatuan satuan, harga, is_new baru, status, gambar, gambar_x gambarX, gambar_y gambarY FROM barang ORDER BY idbarang'),
    q('SELECT idmargin_penjualan id, persen, status FROM margin_penjualan ORDER BY idmargin_penjualan'),
    q(`SELECT idpengadaan id, ${D('`timestamp`')} tgl, vendor_idvendor v, subtotal_nilai sub, ppn, total_nilai total, status FROM pengadaan ORDER BY idpengadaan`),
    q('SELECT idpengadaan p, idbarang b, jumlah j, harga_satuan h FROM detail_pengadaan ORDER BY iddetail_pengadaan'),
    q(`SELECT idpenerimaan id, ${D('created_at')} tgl, idpengadaan pg FROM penerimaan ORDER BY idpenerimaan`),
    q('SELECT idpenerimaan p, barang_idbarang b, jumlah_terima j, harga_satuan_terima h FROM detail_penerimaan ORDER BY iddetail_penerimaan'),
    q(`SELECT idpenjualan id, ${D('created_at')} tgl, subtotal_nilai sub, ppn, total_nilai total, idmargin_penjualan m FROM penjualan ORDER BY idpenjualan`),
    q('SELECT penjualan_idpenjualan p, idbarang b, jumlah j, harga_satuan h, tipe_hp th FROM detail_penjualan ORDER BY iddetail_penjualan'),
    q(`SELECT r.idretur id, ${D('r.created_at')} tgl, r.idpenerimaan pn, dp.barang_idbarang b, dr.jumlah j, dr.alasan
       FROM retur r JOIN detail_retur dr ON dr.idretur=r.idretur
       JOIN detail_penerimaan dp ON dp.iddetail_penerimaan=dr.iddetail_penerimaan ORDER BY dr.iddetail_retur`),
    q(`SELECT idkartu_stok id, ${D('created_at')} tgl, jenis_transaksi t, masuk m, keluar k, stock, idtransaksi trx, idbarang b FROM kartu_stok ORDER BY idkartu_stok`),
  ]);
  const grp = (head, det) => head.map(x => ({ ...x, items: det.filter(i => i.p === x.id).map(({ b, j, h, th }) => ({ b, j, h, th })) }));
  return { vendor, satuan, barang, margin, pengadaan: grp(pg, dpg), penerimaan: grp(pn, dpn), penjualan: grp(pj, dpj), retur, kartu };
}));

// ---- unggah foto produk ----
app.put('/api/barang/:id/gambar', wrap(async req => {
  const id = Number(req.params.id);
  const match = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/]+={0,2})$/.exec(req.body.gambar || '');
  if (!Number.isInteger(id) || id < 1) throw bad('ID barang tidak valid');
  if (!match) throw bad('Pilih gambar JPG, PNG, atau WebP');
  const ext = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }[match[1]];
  const bytes = Buffer.from(match[2], 'base64');
  if (!bytes.length || bytes.length > 5 * 1024 * 1024) throw bad('Ukuran gambar maksimal 5 MB');
  const valid = ext === 'jpg' ? bytes[0] === 0xff && bytes[1] === 0xd8
    : ext === 'png' ? bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]))
    : bytes.toString('ascii', 8, 12) === 'WEBP' && bytes.toString('ascii', 0, 4) === 'RIFF';
  if (!valid) throw bad('Isi file tidak cocok dengan format gambar');
  const [[product]] = await pool.query('SELECT gambar FROM barang WHERE idbarang=?', [id]);
  if (!product) throw bad('Barang tidak ditemukan', 404);
  const folder = path.join(__dirname, 'public', 'uploads');
  await fs.mkdir(folder, { recursive: true });
  const filename = `barang-${id}.${ext}`;
  await fs.writeFile(path.join(folder, filename), bytes);
  await pool.query('UPDATE barang SET gambar=? WHERE idbarang=?', ['/uploads/' + filename, id]);
  if (product.gambar && product.gambar !== '/uploads/' + filename && product.gambar.startsWith('/uploads/barang-' + id + '.')) {
    await fs.unlink(path.join(folder, path.basename(product.gambar))).catch(() => {});
  }
  return { gambar: '/uploads/' + filename };
}));
app.put('/api/barang/:id/posisi-gambar', wrap(async req => {
  const id = Number(req.params.id), x = Number(req.body.x), y = Number(req.body.y);
  if (!Number.isInteger(id) || id < 1) throw bad('ID barang tidak valid');
  if (!Number.isInteger(x) || x < 0 || x > 100 || !Number.isInteger(y) || y < 0 || y > 100) throw bad('Posisi gambar harus antara 0 dan 100');
  const [[product]] = await pool.query('SELECT idbarang FROM barang WHERE idbarang=?', [id]);
  if (!product) throw bad('Barang tidak ditemukan', 404);
  await pool.query('UPDATE barang SET gambar_x=?, gambar_y=? WHERE idbarang=?', [x, y, id]);
  return { x, y };
}));

// ---- CRUD tabel master ----
const M = {
  barang: { t: 'barang', pk: 'idbarang', f: { nama: 'nama', jenis: 'jenis', satuan: 'idsatuan', harga: 'harga', baru: 'is_new', status: 'status' } },
  vendor: { t: 'vendor', pk: 'idvendor', f: { nama: 'nama_vendor', hukum: 'badan_hukum', status: 'status' }, str: ['status'] },
  satuan: { t: 'satuan', pk: 'idsatuan', f: { nama: 'nama_satuan', status: 'status' } },
  margin: { t: 'margin_penjualan', pk: 'idmargin_penjualan', f: { persen: 'persen', status: 'status' } },
};
const cfg = req => M[req.params.t] || (() => { throw bad('Tabel tidak dikenal', 404); })();
function pick(c, body) {
  const o = {};
  for (const [k, col] of Object.entries(c.f)) {
    if (body[k] === undefined || body[k] === '') throw bad('Field ' + k + ' wajib diisi');
    o[col] = (c.str || []).includes(k) ? String(body[k]) : body[k];
  }
  return o;
}
app.post('/api/master/:t', wrap(async req => {
  const c = cfg(req);
  const [r] = await pool.query('INSERT INTO ?? SET ?', [c.t, { ...pick(c, req.body), ...(c.t === 'margin_penjualan' ? { iduser: req.user.id } : {}) }]);
  return { id: r.insertId };
}));
app.put('/api/master/:t/:id', wrap(async req => {
  const c = cfg(req);
  await pool.query('UPDATE ?? SET ? WHERE ??=?', [c.t, pick(c, req.body), c.pk, +req.params.id]);
}));
app.delete('/api/master/:t/:id', wrap(async req => {
  const c = cfg(req);
  await pool.query('DELETE FROM ?? WHERE ??=?', [c.t, c.pk, +req.params.id]);
}));

// ---- PENGADAAN (pesan ke vendor) ----
app.post('/api/pengadaan', wrap(req => tx(async c => {
  const { v, items } = req.body;
  if (!v || !Array.isArray(items) || !items.length) throw bad('Pilih vendor dan tambahkan minimal satu barang');
  let sub = 0;
  for (const i of items) { if (!(i.j > 0 && i.h > 0)) throw bad('Jumlah dan harga harus lebih dari 0'); sub += i.j * i.h; }
  const ppn = Math.round(sub * 0.11);
  const [r] = await c.query('INSERT INTO pengadaan (user_iduser,status,vendor_idvendor,subtotal_nilai,ppn,total_nilai) VALUES (?,?,?,?,?,?)',
    [req.user.id, 'P', v, sub, ppn, sub + ppn]);
  for (const i of items)
    await c.query('INSERT INTO detail_pengadaan (harga_satuan,jumlah,sub_total,idbarang,idpengadaan) VALUES (?,?,?,?,?)',
      [i.h, i.j, i.j * i.h, i.b, r.insertId]);
  return { id: r.insertId };
})));

// ---- PENERIMAAN (barang datang, stok bertambah) ----
app.post('/api/terima/:id', wrap(req => tx(async c => {
  const id = +req.params.id;
  const [[p]] = await c.query('SELECT status FROM pengadaan WHERE idpengadaan=? FOR UPDATE', [id]);
  if (!p) throw bad('Pengadaan tidak ditemukan', 404);
  if (p.status === 'S') throw bad('Pengadaan ini sudah diterima');
  await c.query("UPDATE pengadaan SET status='S' WHERE idpengadaan=?", [id]);
  const [r] = await c.query("INSERT INTO penerimaan (status,idpengadaan,iduser) VALUES ('S',?,?)", [id, req.user.id]);
  const [d] = await c.query('SELECT idbarang,jumlah,harga_satuan,sub_total FROM detail_pengadaan WHERE idpengadaan=?', [id]);
  for (const i of d) {
    await c.query('INSERT INTO detail_penerimaan (idpenerimaan,barang_idbarang,jumlah_terima,harga_satuan_terima,sub_total_terima) VALUES (?,?,?,?,?)',
      [r.insertId, i.idbarang, i.jumlah, i.harga_satuan, i.sub_total]);
    await addKartu(c, 'M', i.jumlah, 0, r.insertId, i.idbarang);
  }
  return { id: r.insertId };
})));

// ---- PENJUALAN (kasir, stok berkurang) ----
app.post('/api/jual', wrap(req => tx(async c => {
  const items = req.body.items;
  if (!Array.isArray(items) || !items.length) throw bad('Keranjang kosong');
  const [[m]] = await c.query('SELECT idmargin_penjualan id, persen FROM margin_penjualan WHERE status=1 ORDER BY idmargin_penjualan LIMIT 1');
  if (!m) throw bad('Belum ada margin aktif. Aktifkan satu margin di menu Margin.');
  const rows = []; let sub = 0;
  for (const i of items) {
    const [[b]] = await c.query('SELECT nama,harga FROM barang WHERE idbarang=? AND status=1', [i.b]);
    if (!b) throw bad('Barang tidak ditemukan atau nonaktif');
    if (!(i.j > 0)) throw bad('Jumlah tidak valid');
    if ((await stockOf(c, i.b)) < i.j) throw bad('Stok ' + b.nama + ' tidak cukup');
    const h = Math.round(b.harga * (1 + m.persen / 100));
    const tipe = String(i.th || 'Universal').trim();
    if (!['iPhone','Samsung','Xiaomi','Oppo','Vivo','Realme','Infinix','Universal'].includes(tipe)) throw bad('Tipe HP tidak valid');
    rows.push({ b: i.b, j: i.j, h, th: tipe }); sub += h * i.j;
  }
  const ppn = Math.round(sub * 0.11);
  const [r] = await c.query('INSERT INTO penjualan (subtotal_nilai,ppn,total_nilai,iduser,idmargin_penjualan) VALUES (?,?,?,?,?)',
    [sub, ppn, sub + ppn, req.user.id, m.id]);
  for (const x of rows) {
    await c.query('INSERT INTO detail_penjualan (harga_satuan,jumlah,subtotal,penjualan_idpenjualan,idbarang,tipe_hp) VALUES (?,?,?,?,?,?)',
      [x.h, x.j, x.h * x.j, r.insertId, x.b, x.th]);
    await addKartu(c, 'K', 0, x.j, r.insertId, x.b);
  }
  return { id: r.insertId };
})));

// ---- RETUR ke vendor (stok berkurang) ----
app.post('/api/retur', wrap(req => tx(async c => {
  const { pn, b, j, alasan } = req.body;
  if (!(j > 0)) throw bad('Jumlah retur harus lebih dari 0');
  if (!alasan) throw bad('Alasan wajib diisi');
  const [[d]] = await c.query('SELECT iddetail_penerimaan id, jumlah_terima jt FROM detail_penerimaan WHERE idpenerimaan=? AND barang_idbarang=? LIMIT 1', [pn, b]);
  if (!d) throw bad('Barang tidak ada di penerimaan tersebut', 404);
  const [[u]] = await c.query('SELECT COALESCE(SUM(jumlah),0) n FROM detail_retur WHERE iddetail_penerimaan=?', [d.id]);
  const sisa = d.jt - Number(u.n);
  if (j > sisa) throw bad('Jumlah melebihi sisa yang bisa diretur (' + sisa + ')');
  if ((await stockOf(c, b)) < j) throw bad('Stok tidak cukup untuk diretur');
  const [r] = await c.query('INSERT INTO retur (idpenerimaan,iduser) VALUES (?,?)', [pn, req.user.id]);
  await c.query('INSERT INTO detail_retur (jumlah,alasan,idretur,iddetail_penerimaan) VALUES (?,?,?,?)', [j, alasan, r.insertId, d.id]);
  await addKartu(c, 'R', 0, j, r.insertId, b);
  return { id: r.insertId };
})));

// ---- siapkan kolom is_new (penanda new arrival) kalau belum ada ----
async function init() {
  await fs.mkdir(path.join(__dirname, 'public', 'uploads'), { recursive: true });
  let [[superRole]] = await pool.query("SELECT idrole FROM `role` WHERE LOWER(nama_role)='super admin' LIMIT 1");
  if (!superRole) {
    const [roleInsert] = await pool.query("INSERT INTO `role` (nama_role) VALUES ('Super Admin')");
    superRole = { idrole: roleInsert.insertId };
  }
  await pool.query("INSERT INTO `user` (username,password,idrole) SELECT ?,SHA2(?,256),? WHERE NOT EXISTS (SELECT 1 FROM `user` WHERE username=?)", ['superadmin', 'superadmin123', superRole.idrole, 'superadmin']);
  const [th] = await pool.query("SELECT COUNT(*) n FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=? AND TABLE_NAME='detail_penjualan' AND COLUMN_NAME='tipe_hp'", [DB.database]);
  if (!th[0].n) await pool.query("ALTER TABLE detail_penjualan ADD COLUMN tipe_hp VARCHAR(40) NOT NULL DEFAULT 'Universal'");
  await pool.query("UPDATE barang SET nama='Casing HP Hitam' WHERE nama='Casing iPhone 13 Hitam'");
  await pool.query("UPDATE barang SET nama='Casing HP Bening' WHERE nama='Casing Samsung A54 Bening'");
  await pool.query("UPDATE barang SET nama='Tempered Glass' WHERE nama='Tempered Glass iPhone 13'");
  const [g] = await pool.query("SELECT COUNT(*) n FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=? AND TABLE_NAME='barang' AND COLUMN_NAME='gambar'", [DB.database]);
  if (!g[0].n) await pool.query('ALTER TABLE barang ADD COLUMN gambar VARCHAR(255) NULL');
  for (const [column, definition] of [['gambar_x', 'TINYINT UNSIGNED NOT NULL DEFAULT 50'], ['gambar_y', 'TINYINT UNSIGNED NOT NULL DEFAULT 50']]) {
    const [found] = await pool.query('SELECT COUNT(*) n FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=? AND TABLE_NAME=\'barang\' AND COLUMN_NAME=?', [DB.database, column]);
    if (!found[0].n) await pool.query(`ALTER TABLE barang ADD COLUMN ${column} ${definition}`);
  }
  const [c] = await pool.query("SELECT COUNT(*) n FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=? AND TABLE_NAME='barang' AND COLUMN_NAME='is_new'", [DB.database]);
  if (!c[0].n) {
    await pool.query('ALTER TABLE barang ADD COLUMN is_new TINYINT NOT NULL DEFAULT 0');
    await pool.query('UPDATE barang SET is_new=1 WHERE idbarang IN (1,2,5)');
    console.log('Kolom is_new ditambahkan ke tabel barang');
  }
}
init()
  .then(() => app.listen(PORT, () => console.log('Colokin jalan di http://localhost:' + PORT)))
  .catch(e => { console.error('Gagal konek ke MySQL:', e.message); process.exit(1); });
