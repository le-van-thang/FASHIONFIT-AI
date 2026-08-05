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
  customer_name: { type: String, default: '' },
  customer_phone: { type: String, default: '' },
  notes: { type: String, default: '' },
  source: { type: String, default: 'mannequin' },
  snapshot_img: { type: String, default: '' },
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
  landmarks_front: { type: mongoose.Schema.Types.Mixed, default: null },
  landmarks_side: { type: mongoose.Schema.Types.Mixed, default: null },
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
        customer_name: 'Mẫu Nam Tiêu Chuẩn',
        customer_phone: '0905000000',
        notes: 'Hồ sơ đo mẫu thử nghiệm',
        source: 'mannequin',
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

// GET /api/measurements - Retrieve all saved customer measurement sessions (up to 1000)
app.get('/api/measurements', async (req, res) => {
  try {
    const sessions = await Measurement.find().sort({ created_at: -1 }).limit(1000);
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

// DELETE /api/measurements - Clear ALL measurement sessions
app.delete('/api/measurements', async (req, res) => {
  try {
    await Measurement.deleteMany({});
    res.json({ message: 'All measurement sessions deleted successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
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

// ─── Gemini 2.5 Flash Key Pool & Body Analysis API ──────────────
const GEMINI_API_KEYS = [
  'AIzaSyBRLnzBRL0wDyXu7xpl0fooRSX0iXWyElc',
  'AIzaSyDNLVyvhB4pxSAzuZqtEdFF7zB0hnTjNNM',
  'AIzaSyBzcb_v6jqr_HNTXb7f7GDn91ADzxD2GmU',
  'AIzaSyDilndJMrA_ttKroSd-Vv96bJYj1pjO74c',
  'AIzaSyBjmBfjGTTJSjQR_hwwTho2h8Y1xjuCrGw'
];

let currentKeyIndex = 0;

// POST /api/analyze-body - Gemini 2.5 Flash Anthropometric Analysis
app.post('/api/analyze-body', async (req, res) => {
  try {
    const { gender, height_cm, weight_kg, chest_cm, waist_cm, hip_cm, shoulder_cm, arm_length_cm, inseam_cm } = req.body;

    const prompt = `Bạn là FashionFit AI Agent - Chuyên gia Nhân trắc học và Kỹ thuật May đo Cao cấp.
Dựa vào chỉ số nhân trắc học của khách hàng:
- Giới tính: ${gender === 'male' ? 'Nam' : 'Nữ'}
- Chiều cao: ${height_cm} cm
- Cân nặng: ${weight_kg} kg
- Vòng ngực: ${chest_cm} cm
- Vòng eo: ${waist_cm} cm
- Vòng mông: ${hip_cm} cm
- Rộng vai: ${shoulder_cm || '--'} cm
- Dài tay: ${arm_length_cm || '--'} cm
- Dài chân: ${inseam_cm || '--'} cm

Hãy phân tích kiểu dáng người chuẩn xác (như Đồng hồ cát, Tam giác ngược, Dáng chữ V thể thao, Dáng quả lê, Dáng bụng tròn, Dáng cân đối...) và đưa ra lời khuyên kỹ thuật cắt may chuyên sâu cho thợ may (chiết ly, hạ nách, độ cử động vải, chất liệu phù hợp).

BẮT BUỘC trả về duy nhất định dạng JSON nguyên bản (không dùng markdown code fence):
{
  "body_type": "Tên dáng người chính xác",
  "shape_desc": "Mô tả tỷ lệ thân người trong 1 câu ngắn gọn",
  "seam_advice": "Hướng dẫn chít ly eo, nẹp vai, nếp gấu và hạ nách áo cho thợ may",
  "ease_advice": "Độ dư cử động vải (Ease Allowance) khuyến nghị cho ngực/eo/hông",
  "fabric_advice": "Khuyên dùng loại chất liệu vải phù hợp để tôn phom dáng"
}`;

    let lastError = null;
    let attempts = 0;

    while (attempts < GEMINI_API_KEYS.length) {
      const apiKey = GEMINI_API_KEYS[currentKeyIndex];
      attempts++;

      try {
        console.log(`[Gemini API] Trying Key #${currentKeyIndex + 1} (Attempt ${attempts}/${GEMINI_API_KEYS.length})...`);
        const geminiRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: { responseMimeType: 'application/json' }
          })
        });

        if (!geminiRes.ok) {
          const errData = await geminiRes.text();
          console.warn(`[Gemini API] Key #${currentKeyIndex + 1} failed (${geminiRes.status}):`, errData);
          currentKeyIndex = (currentKeyIndex + 1) % GEMINI_API_KEYS.length;
          lastError = `Status ${geminiRes.status}: ${errData}`;
          continue;
        }

        const data = await geminiRes.json();
        const textRes = data.candidates?.[0]?.content?.parts?.[0]?.text;

        if (textRes) {
          const parsed = JSON.parse(textRes);
          const activeKeyIdx = currentKeyIndex;
          currentKeyIndex = (currentKeyIndex + 1) % GEMINI_API_KEYS.length;
          return res.json({ success: true, keyUsedIndex: activeKeyIdx + 1, data: parsed });
        }
      } catch (err) {
        console.warn(`[Gemini API] Key #${currentKeyIndex + 1} error:`, err.message);
        currentKeyIndex = (currentKeyIndex + 1) % GEMINI_API_KEYS.length;
        lastError = err.message;
      }
    }

    res.status(500).json({ error: `All ${GEMINI_API_KEYS.length} Gemini API keys exhausted: ${lastError}` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`🚀 FashionFit AI Server running on port ${PORT}`);
});
