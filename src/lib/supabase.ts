import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// ─── Types for DB ───────────────────────────────────────────────
export interface MeasurementSession {
  id?: string;
  created_at?: string;
  session_name?: string;

  // Inputs
  gender: 'male' | 'female';
  weight_kg: number;
  calibration_type: string;
  reference_pixels: number;

  // Measurements (cm)
  height_cm: number;
  shoulder_width_cm: number;
  arm_length_cm: number;
  bust_cm: number;
  waist_cm: number;
  hip_cm: number;
  inseam_cm: number;
  bust_depth_cm: number;
  waist_depth_cm: number;
  hip_depth_cm: number;

  // Recommendation
  recommended_size: string;
  confidence_pct: number;

  // Landmarks coordinates stored as JSONB
  landmarks_front?: any;
  landmarks_side?: any;
}

// ─── Save a session ─────────────────────────────────────────────
export async function saveMeasurementSession(
  session: MeasurementSession
): Promise<{ data: MeasurementSession | null; error: string | null }> {
  const { data, error } = await supabase
    .from('measurement_sessions')
    .insert([session])
    .select()
    .single();

  if (error) {
    // Check if error is due to missing columns (PostgreSQL undefined_column error code 42703, or messages containing column names)
    if (error.code === '42703' || error.message?.includes('landmarks_front') || error.message?.includes('landmarks_side')) {
      const { landmarks_front, landmarks_side, ...sessionWithoutLandmarks } = session;
      const retryResult = await supabase
        .from('measurement_sessions')
        .insert([sessionWithoutLandmarks])
        .select()
        .single();
      
      if (retryResult.error) {
        return { data: null, error: retryResult.error.message };
      }
      return { data: retryResult.data, error: null };
    }
    return { data: null, error: error.message };
  }
  return { data, error: null };
}

// ─── Fetch recent sessions ────────────────────────────────────
export async function fetchRecentSessions(
  limit = 15
): Promise<{ data: MeasurementSession[]; error: string | null }> {
  const { data, error } = await supabase
    .from('measurement_sessions')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    return { data: [], error: error.message };
  }
  return { data: data ?? [], error: null };
}

// ─── Delete a session ─────────────────────────────────────────
export async function deleteSession(
  id: string
): Promise<{ error: string | null }> {
  const { error } = await supabase
    .from('measurement_sessions')
    .delete()
    .eq('id', id);

  return { error: error ? error.message : null };
}
