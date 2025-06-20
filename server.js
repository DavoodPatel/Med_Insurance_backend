// server.js
const express = require('express');
const Razorpay = require('razorpay');
const cors = require('cors');
const bodyParser = require('body-parser');
const dotenv = require('dotenv');
const mysql = require('mysql2');

dotenv.config();
const app = express();

app.use(cors());
app.use(bodyParser.json());
app.use(express.json());

const razorpay = new Razorpay({
  key_id: 'rzp_test_pJmYPmKKs1w1Ct',
  key_secret: 'dt96M10JbbxVZoQvtju3lZ8K',
});

// MySQL connection
const pool = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,

}).promise();

// ================= Payment Order Route ================= //
app.post('/create-order', async (req, res) => {
  const { amount } = req.body;
  try {
    const options = {
      amount: amount * 100,
      currency: 'INR',
      payment_capture: 1,
    };
    const order = await razorpay.orders.create(options);
    res.json({ orderId: order.id });
  } catch (err) {
    console.error(err);
    res.status(500).send('Error creating order');
  }
}); 

// ================= Package Routes ================= //
app.get('/api/packages', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM packages');
    res.json(rows);
  } catch (error) {
    console.error('Error fetching packages:', error);
    res.status(500).json({ message: 'Internal Server Error' });
  }
});
//to add package
app.post('/api/add/package', async (req, res) => {
  const { id, name, description, price, package_type } = req.body;

  try {
    const [result] = await pool.execute(
      'INSERT INTO packages (id, name, description, price, package_type) VALUES (?, ?, ?, ?, ?)',
      [id, name, description, price, package_type]
    );
    res.json({ success: true });
  } catch (err) {
    console.error('Error adding package:', err);
    res.status(500).json({ success: false, message: 'Server error while adding package' });
  }
});


app.delete('/api/packages/:id', async (req, res) => {
  const id = req.params.id;
  try {
    const [result] = await pool.query('DELETE FROM packages WHERE id = ?', [id]);
    if (result.affectedRows === 0) {
      return res.status(404).json({ message: 'Package not found' });
    }
    res.json({ message: 'Package deleted successfully' });
  } catch (err) {
    console.error('Delete error:', err);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// ================= Patient Routes ================= //
app.post('/api/patient/save-package', async (req, res) => {
  const { mobile_no, packageDetails, payment_mode } = req.body;
  if (!mobile_no || !packageDetails || !payment_mode) {
    return res.status(400).json({ success: false, message: 'Missing required fields' });
  }
  try {
    const sql = 'UPDATE patients SET package = ?, payment_mode = ? WHERE mobile_no = ?';
    await pool.query(sql, [JSON.stringify(packageDetails), payment_mode, mobile_no]);
    return res.json({ success: true, message: 'Package and payment mode saved ✅' });
  } catch (err) {
    console.error('❌ Error saving package:', err);
    return res.status(500).json({ success: false, message: 'Database error ❌' });
  }
});

// GET /api/payments?method=cash or online
app.get('/api/payments', async (req, res) => {
  const { method } = req.query;

  if (!method || !['cash', 'online'].includes(method)) {
    return res.status(400).json({ message: 'Invalid or missing payment method' });
  }

  try {
    const [rows] = await pool.query(
      `SELECT name, mobile_no, package, created_at FROM patients WHERE payment_mode = ? ORDER BY created_at DESC`,
      [method]
    );

    // Parse JSON and simplify results
    const parsed = rows.map(row => {
      let pkg = {};
      try {
        pkg = JSON.parse(row.package || '{}');
      } catch (e) {}

      return {
        patient_name: row.name,
        mobile_no: row.mobile_no,
        package_name: pkg.name || 'N/A',
        amount: pkg.price || 'N/A',
        created_at: row.created_at,
      };
    });

    res.json(parsed);
  } catch (err) {
    console.error('❌ Error fetching payments:', err);
    res.status(500).json({ message: 'Internal Server Error' });
  }
});




// ================= Patient Management ================= //
app.get('/api/patients', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM patients');
    res.json(rows);
  } catch (err) {
    console.error('Error fetching patients:', err);
    res.status(500).json({ message: 'Failed to fetch patients' });
  }
});

app.delete('/api/patients/:id', async (req, res) => {
  const id = req.params.id;
  try {
    const [result] = await pool.query('DELETE FROM patients WHERE id = ?', [id]);
    if (result.affectedRows === 0) {
      return res.status(404).json({ message: 'Patient not found' });
    }
    res.json({ message: 'Patient deleted successfully' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Failed to delete patient' });
  }
});

app.get('/api/patient/by-mobile/:mobile_no', async (req, res) => {
  const { mobile_no } = req.params;
  try {
    const [rows] = await pool.query('SELECT * FROM patients WHERE mobile_no = ?', [mobile_no]);
    if (rows.length === 0) {
      return res.json({ success: false, message: 'Patient not found' });
    }
    return res.json({ success: true, patient: rows[0] });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, message: 'Database error' });
  }
});

app.post('/api/hr/refer-patient-dashboard', async (req, res) => {
  const {
    mobile_no,
    name,
    referred_by,
    father_name,
    mother_name,
    address,
    no_of_children,
    children_names,
  } = req.body;

  if (!mobile_no || !name || !referred_by ||  !address ){
    return res.status(400).json({ success: false, message: 'All required fields must be filled' });
  }

  try {
    const sql = `INSERT INTO patients (mobile_no, name, created_at, referred_by, father_name, mother_name, address, no_of_children, children_names) VALUES (?, ?, NOW(), ?, ?, ?, ?, ?, ?)`;
    const values = [mobile_no, name, referred_by, father_name, mother_name, address, no_of_children, JSON.stringify(children_names || [])];
    await pool.query(sql, values);
    return res.status(201).json({ success: true, message: 'Patient referred and saved successfully.' });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ success: false, message: 'Patient with this mobile number already exists.' });
    }
    console.error('Database insert error:', err);
    return res.status(500).json({ success: false, message: 'Database error', error: err.message });
  }
});

// ================= Auth Routes ================= //
app.post('/api/doctor/login', async (req, res) => {
  const { email, password } = req.body;
  try {
    const [rows] = await pool.query('SELECT * FROM doctors WHERE email = ? AND password = ?', [email, password]);
    if (rows.length > 0) {
      res.json({ success: true, doctor: rows[0] });
    } else {
      res.status(401).json({ success: false, message: 'Invalid credentials' });
    }
  } catch (err) {
    console.error(err);
    res.status(500).send('Server error');
  }
});

app.post('/api/hr/login', async (req, res) => {
  const { email, password } = req.body;
  try {
    const [rows] = await pool.query('SELECT * FROM hr WHERE email = ? AND password = ?', [email, password]);
    if (rows.length > 0) {
      res.json({ success: true, hr: rows[0] });
    } else {
      res.status(401).json({ success: false, message: 'Invalid credentials' });
    }
  } catch (err) {
    console.error(err);
    res.status(500).send('Server error');
  }
});

app.post('/api/hr/create', async (req, res) => {
  const { name, email, password } = req.body;
  try {
    await pool.query('INSERT INTO hr (name, email, password) VALUES (?, ?, ?)', [name, email, password]);
    res.json({ success: true, message: 'HR created successfully' });
  } catch (err) {
    console.error('Error inserting HR:', err);
    res.status(500).json({ success: false, error: 'DB error' });
  }
});

// View patients referred by HR
app.get('/api/patients/referred-by/:name', async (req, res) => {
  const { name } = req.params;
  try {
    const [rows] = await pool.query(
      'SELECT name, mobile_no FROM patients WHERE referred_by = ?',
      [name]
    );
    res.json(rows);
  } catch (err) {
    console.error('Error fetching referred patients:', err);
    res.status(500).json({ error: 'Database error' });
  }
});



// ================= Start Server ================= //
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`✅ Server running on port ${PORT}`));