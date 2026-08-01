const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');

const app = express();
const PORT = process.env.PORT || 5000;
const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/fashionfit_db';

// Middleware
app.use(cors());
app.use(express.json());

// MongoDB Schema for Anthropometric Measurement Profile
const MeasurementSchema = new mongoose.Schema({
  gender: { type: String, enum: ['male', 'female'], required: true },
  weight_kg: { type: Number, required: true },
  calibration_type: { type: String, default: 'height' },
  reference_pixels: { type: Number, default: 120 },
  height_cm: { type: Number, required: true },
  shoulder_width_cm: { type: Number, required: true },
  arm_length_cm: { type: Number, required: true },
  bust_cm: { type: Number, required: true },
  waist_cm: { type: Number, required: true },
  hip_cm: { type: Number, required: true },
  inseam_cm: { type: Number, required: true },
  bust_depth_cm: { type: Number, default: 0 },
  waist_depth_cm: { type: Number, default: 0 },
  hip_depth_cm: { type: Number, default: 0 },
  recommended_size: { type: String, required: true },
  confidence_pct: { type: Number, default: 95 },
  created_at: { type: Date, default: Date.now }
});

const Measurement = mongoose.model('Measurement', MeasurementSchema);

// Connect to MongoDB and seed initial sample if empty
mongoose.connect(MONGO_URI)
  .then(async () => {
    console.log('✅ Connected to MongoDB database successfully!');
    const count = await Measurement.countDocuments();
    if (count === 0) {
      await Measurement.create({
        gender: 'male',
        weight_kg: 75,
        calibration_type: 'height',
        reference_pixels: 120,
        height_cm: 180.0,
        shoulder_width_cm: 45.2,
        arm_length_cm: 62.5,
        bust_cm: 98.0,
        waist_cm: 82.0,
        hip_cm: 96.0,
        inseam_cm: 78.0,
        bust_depth_cm: 21.6,
        waist_depth_cm: 23.4,
        hip_depth_cm: 25.2,
        recommended_size: 'L (Savani Vietnam)',
        confidence_pct: 95
      });
      console.log('📦 Created initial sample document in fashionfit_db database!');
    }
  })
  .catch(err => console.error('⚠️ MongoDB Connection Note:', err.message));

// Health Check API
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', service: 'FashionFit AI Backend Server', timestamp: new Date() });
});

// GET /api/measurements - Retrieve all saved customer measurement sessions
app.get('/api/measurements', async (req, res) => {
  try {
    const sessions = await Measurement.find().sort({ created_at: -1 }).limit(50);
    res.json(sessions);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/measurements - Save new measurement session
app.post('/api/measurements', async (req, res) => {
  try {
    const newMeasurement = new Measurement(req.body);
    const saved = await newMeasurement.save();
    res.status(201).json(saved);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// DELETE /api/measurements/:id - Delete a session by ID
app.delete('/api/measurements/:id', async (req, res) => {
  try {
    await Measurement.findByIdAndDelete(req.params.id);
    res.json({ message: 'Session deleted successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`🚀 FashionFit AI Server running on port ${PORT}`);
});
