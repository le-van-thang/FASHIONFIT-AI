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
