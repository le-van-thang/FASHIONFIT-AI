// API Client for FashionFit AI Node.js Express + MongoDB Backend

const API_BASE_URL = 'http://localhost:5000/api';

export interface BackendMeasurementPayload {
  _id?: string;
  customer_name?: string;
  customer_phone?: string;
  notes?: string;
  source?: string;
  snapshot_img?: string;
  gender: 'male' | 'female';
  weight_kg: number;
  calibration_type: string;
  reference_pixels: number;
  height_cm: number;
  shoulder_width_cm: number;
  arm_length_cm: number;
  bust_cm: number;
  waist_cm: number;
  hip_cm: number;
  inseam_cm: number;
  bust_depth_cm?: number;
  waist_depth_cm?: number;
  hip_depth_cm?: number;
  recommended_size: string;
  confidence_pct: number;
  landmarks_front?: any;
  landmarks_side?: any;
  created_at?: string;
}

// Fetch all saved measurement sessions from MongoDB backend
export async function fetchBackendSessions(): Promise<{ data: BackendMeasurementPayload[]; error: string | null }> {
  try {
    const res = await fetch(`${API_BASE_URL}/measurements`);
    if (!res.ok) {
      throw new Error(`Server status ${res.status}`);
    }
    const data = await res.json();
    return { data, error: null };
  } catch (err: any) {
    console.warn('Backend server offline or unreachable, using local fallback:', err.message);
    return { data: [], error: err.message };
  }
}

// Save a new measurement session to MongoDB database
export async function saveBackendSession(payload: BackendMeasurementPayload): Promise<{ data: BackendMeasurementPayload | null; error: string | null }> {
  try {
    const res = await fetch(`${API_BASE_URL}/measurements`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      throw new Error(`Server returned status ${res.status}`);
    }

    const data = await res.json();
    return { data, error: null };
  } catch (err: any) {
    console.warn('Failed to save session to MongoDB backend:', err.message);
    return { data: null, error: err.message };
  }
}

// Clear ALL measurement sessions from MongoDB backend
export async function clearAllBackendSessions(): Promise<{ error: string | null }> {
  try {
    const res = await fetch(`${API_BASE_URL}/measurements`, {
      method: 'DELETE',
    });

    if (!res.ok) {
      throw new Error(`Server status ${res.status}`);
    }

    return { error: null };
  } catch (err: any) {
    return { error: err.message };
  }
}

// Delete a session by ID from MongoDB backend
export async function deleteBackendSession(id: string): Promise<{ error: string | null }> {
  try {
    const res = await fetch(`${API_BASE_URL}/measurements/${id}`, {
      method: 'DELETE',
    });

    if (!res.ok) {
      throw new Error(`Server status ${res.status}`);
    }

    return { error: null };
  } catch (err: any) {
    return { error: err.message };
  }
}

// ─── Gemini 2.5 Flash API Key Pool & Client Fallback Engine ─────────────
export const GEMINI_API_KEYS = [
  'AIzaSyBRLnzBRL0wDyXu7xpl0fooRSX0iXWyElc',
  'AIzaSyDNLVyvhB4pxSAzuZqtEdFF7zB0hnTjNNM',
  'AIzaSyBzcb_v6jqr_HNTXb7f7GDn91ADzxD2GmU',
  'AIzaSyDilndJMrA_ttKroSd-Vv96bJYj1pjO74c',
  'AIzaSyBjmBfjGTTJSjQR_hwwTho2h8Y1xjuCrGw'
];

let clientKeyIndex = 0;

export interface GeminiTailoringAdvice {
  body_type: string;
  shape_desc: string;
  seam_advice: string;
  ease_advice: string;
  fabric_advice: string;
  keyUsedIndex?: number;
}

export async function analyzeBodyWithGemini(payload: {
  gender: string;
  height_cm: number;
  weight_kg: number;
  chest_cm: number;
  waist_cm: number;
  hip_cm: number;
  shoulder_cm: number;
  arm_length_cm?: number;
  inseam_cm?: number;
}): Promise<{ data: GeminiTailoringAdvice | null; error: string | null }> {
  // First try calling local Express backend endpoint
  try {
    const res = await fetch(`${API_BASE_URL}/analyze-body`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (res.ok) {
      const result = await res.json();
      if (result.data) {
        return { data: result.data, error: null };
      }
    }
  } catch (e) {
    console.warn('Backend server offline, calling Gemini 2.5 Flash API key pool directly...');
  }

  // Fallback: Call Google Gemini 2.5 Flash API directly from client using Key Pool Rotation
  const prompt = `Bạn là FashionFit AI Agent - Chuyên gia Nhân trắc học và Kỹ thuật May đo Cao cấp.
Dựa vào chỉ số nhân trắc học của khách hàng:
- Giới tính: ${payload.gender === 'male' ? 'Nam' : 'Nữ'}
- Chiều cao: ${payload.height_cm} cm
- Cân nặng: ${payload.weight_kg} kg
- Vòng ngực: ${payload.chest_cm} cm
- Vòng eo: ${payload.waist_cm} cm
- Vòng mông: ${payload.hip_cm} cm
- Rộng vai: ${payload.shoulder_cm || '--'} cm

Hãy phân tích kiểu dáng người chuẩn xác (như Đồng hồ cát, Tam giác ngược, Dáng chữ V thể thao, Dáng quả lê, Dáng bụng tròn, Dáng cân đối...) và đưa ra lời khuyên kỹ thuật cắt may chuyên sâu cho thợ may (chiết ly, hạ nách, độ cử động vải, chất liệu phù hợp).

BẮT BUỘC trả về duy nhất định dạng JSON nguyên bản (không sử dụng markdown block):
{
  "body_type": "Tên dáng người chính xác",
  "shape_desc": "Mô tả tỷ lệ thân người trong 1 câu ngắn gọn",
  "seam_advice": "Hướng dẫn chít ly eo, nẹp vai, nếp gấu và hạ nách áo cho thợ may",
  "ease_advice": "Độ dư cử động vải (Ease Allowance) khuyến nghị cho ngực/eo/hông",
  "fabric_advice": "Khuyên dùng loại chất liệu vải phù hợp để tôn phom dáng"
}`;

  let attempts = 0;
  let lastErr = null;

  while (attempts < GEMINI_API_KEYS.length) {
    const apiKey = GEMINI_API_KEYS[clientKeyIndex];
    attempts++;

    try {
      console.log(`[Client Gemini API] Rotating Key #${clientKeyIndex + 1} (Attempt ${attempts}/${GEMINI_API_KEYS.length})...`);
      const geminiRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { responseMimeType: 'application/json' }
        })
      });

      if (!geminiRes.ok) {
        const errText = await geminiRes.text();
        console.warn(`[Client Gemini API] Key #${clientKeyIndex + 1} failed:`, errText);
        clientKeyIndex = (clientKeyIndex + 1) % GEMINI_API_KEYS.length;
        lastErr = `Status ${geminiRes.status}: ${errText}`;
        continue;
      }

      const resJson = await geminiRes.json();
      const textRes = resJson.candidates?.[0]?.content?.parts?.[0]?.text;
      if (textRes) {
        const parsed = JSON.parse(textRes);
        const activeKey = clientKeyIndex + 1;
        clientKeyIndex = (clientKeyIndex + 1) % GEMINI_API_KEYS.length;
        return { data: { ...parsed, keyUsedIndex: activeKey }, error: null };
      }
    } catch (err: any) {
      console.warn(`[Client Gemini API] Key #${clientKeyIndex + 1} error:`, err.message);
      clientKeyIndex = (clientKeyIndex + 1) % GEMINI_API_KEYS.length;
      lastErr = err.message;
    }
  }

  return { data: null, error: `All 5 Gemini API keys exhausted: ${lastErr}` };
}
