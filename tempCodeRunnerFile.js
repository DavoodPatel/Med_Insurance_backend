app.post('/doctor/login', async (req, res) => {
  const { email, password } = req.body;

  try {
    const doctor = await db.query('SELECT * FROM doctors WHERE email = ?', [email]);

    if (!doctor.length) {
      return res.status(401).json({ success: false, message: 'Invalid email or password' });
    }

    if (doctor[0].password !== password) {
      return res.status(401).json({ success: false, message: 'Invalid email or password' });
    }

    // Normally, create and return JWT or session here.
    // For now, send doctor info as JSON (remove sensitive data like password)
    const { password: _, ...doctorData } = doctor[0];

    res.json({ success: true, doctor: doctorData });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});