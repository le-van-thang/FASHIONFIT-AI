import React, { useState, useMemo, useEffect, useRef } from 'react';
import type { UserInput, Landmark, BodyMeasurements, SizeRecommendation } from './types';
import { InputForm } from './components/InputForm';
import { BodyCanvas } from './components/BodyCanvas';
import { ResultPanel } from './components/ResultPanel';
import { estimateCircumferences, getRecommendedSize, calculateScaleFactor, formatHeightMeters, AVERAGE_NASION_TO_HIP_RATIO } from './utils/anthropometry';
import { Activity, History, X, Clock, Trash2, FolderOpen } from 'lucide-react';
import { saveMeasurementSession, fetchRecentSessions, deleteSession } from './lib/supabase';
import type { MeasurementSession } from './lib/supabase';

// Default initial keypoints for front view
const initialFrontLandmarks: Landmark[] = [
  { id: 'nasion', name: 'Gốc mũi', x: 200, y: 75, label: 'Gốc Mũi' },
  { id: 'left_shoulder', name: 'Vai trái', x: 165, y: 125, label: 'Vai Trái' },
  { id: 'right_shoulder', name: 'Vai phải', x: 235, y: 125, label: 'Vai Phải' },
  { id: 'left_elbow', name: 'Khuỷu tay trái', x: 155, y: 220, label: 'Khuỷu Trái' },
  { id: 'left_wrist', name: 'Cổ tay trái', x: 145, y: 310, label: 'Cổ Trái' },
  { id: 'right_elbow', name: 'Khuỷu tay phải', x: 245, y: 220, label: 'Khuỷu Phải' },
  { id: 'right_wrist', name: 'Cổ tay phải', x: 255, y: 310, label: 'Cổ Phải' },
  { id: 'left_hip', name: 'Hông trái', x: 175, y: 300, label: 'Hông Trái' },
  { id: 'right_hip', name: 'Hông phải', x: 225, y: 300, label: 'Hông Phải' },
  { id: 'left_knee', name: 'Đầu gối trái', x: 175, y: 460, label: 'Gối Trái' },
  { id: 'left_ankle', name: 'Cổ chân trái', x: 175, y: 610, label: 'Cổ Chân Trái' },
  { id: 'right_knee', name: 'Đầu gối phải', x: 225, y: 460, label: 'Gối Phải' },
  { id: 'right_ankle', name: 'Cổ chân phải', x: 225, y: 610, label: 'Cổ Chân Phải' }
];

// Default initial keypoints for side view
const initialSideLandmarks: Landmark[] = [
  { id: 'nasion', name: 'Gốc mũi', x: 215, y: 75, label: 'Gốc Mũi' },
  { id: 'shoulder', name: 'Khớp vai', x: 195, y: 125, label: 'Khớp Vai' },
  { id: 'elbow', name: 'Khuỷu tay', x: 185, y: 220, label: 'Khuỷu Tay' },
  { id: 'wrist', name: 'Cổ tay', x: 180, y: 310, label: 'Cổ Tay' },
  { id: 'hip', name: 'Khớp hông', x: 195, y: 300, label: 'Khớp Hông' },
  { id: 'knee', name: 'Khớp gối', x: 195, y: 460, label: 'Khớp Gối' },
  { id: 'ankle', name: 'Cổ chân', x: 195, y: 610, label: 'Cổ Chân' },
  { id: 'chest_depth', name: 'Độ sâu ngực', x: 232, y: 160, label: 'Độ Sâu Ngực' },
  { id: 'buttock_depth', name: 'Độ sâu mông', x: 168, y: 320, label: 'Độ Sâu Mông' }
];

function App() {
  const [input, setInput] = useState<UserInput>(() => {
    const saved = localStorage.getItem('fashionfit_input');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (parsed && typeof parsed === 'object') {
          return {
            gender: parsed.gender === 'male' ? 'male' : 'female',
            weight: typeof parsed.weight === 'number' ? parsed.weight : 55,
            calibrationType: ['a4', 'card', 'ipd', 'height'].includes(parsed.calibrationType) ? parsed.calibrationType : 'height',
            customHeight: typeof parsed.customHeight === 'number' ? parsed.customHeight : undefined,
            sizeSystem: parsed.sizeSystem === 'international' ? 'international' : 'vietnam',
            scanRange: ['full', 'half'].includes(parsed.scanRange) ? parsed.scanRange : 'full'
          };
        }
      } catch (e) {
        // Ignore parsing errors
      }
    }
    return {
      gender: 'female',
      weight: 55,
      calibrationType: 'height',
      sizeSystem: 'vietnam',
      scanRange: 'full'
    };
  });

  const [referencePixels, setReferencePixels] = useState<number>(() => {
    const saved = localStorage.getItem('fashionfit_reference_pixels');
    return saved ? Number(saved) : 120;
  });

  const [landmarksFront, setLandmarksFront] = useState<Landmark[]>(() => {
    const saved = localStorage.getItem('fashionfit_landmarks_front');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      } catch (e) {}
    }
    return initialFrontLandmarks;
  });

  const [landmarksSide, setLandmarksSide] = useState<Landmark[]>(() => {
    const saved = localStorage.getItem('fashionfit_landmarks_side');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      } catch (e) {}
    }
    return initialSideLandmarks;
  });

  const processedFrontLandmarks = useMemo(() => {
    if (input.scanRange !== 'half') return landmarksFront;
    const lHip = landmarksFront.find(l => l.id === 'left_hip')!;
    const rHip = landmarksFront.find(l => l.id === 'right_hip')!;
    const lShoulder = landmarksFront.find(l => l.id === 'left_shoulder')!;
    const rShoulder = landmarksFront.find(l => l.id === 'right_shoulder')!;
    
    const midShoulderY = (lShoulder.y + rShoulder.y) / 2;
    const midHipY = (lHip.y + rHip.y) / 2;
    const torsoH = Math.max(50, midHipY - midShoulderY);
    
    return landmarksFront.map(l => {
      if (l.id === 'left_knee') {
        return { ...l, x: lHip.x, y: Math.round(lHip.y + torsoH * 0.9) };
      }
      if (l.id === 'right_knee') {
        return { ...l, x: rHip.x, y: Math.round(rHip.y + torsoH * 0.9) };
      }
      if (l.id === 'left_ankle') {
        return { ...l, x: lHip.x, y: Math.round(lHip.y + torsoH * 1.8) };
      }
      if (l.id === 'right_ankle') {
        return { ...l, x: rHip.x, y: Math.round(rHip.y + torsoH * 1.8) };
      }
      return l;
    });
  }, [landmarksFront, input.scanRange]);

  const processedSideLandmarks = useMemo(() => {
    if (input.scanRange !== 'half') return landmarksSide;
    const hip = landmarksSide.find(l => l.id === 'hip')!;
    const shoulder = landmarksSide.find(l => l.id === 'shoulder')!;
    const torsoH = Math.max(50, hip.y - shoulder.y);

    return landmarksSide.map(l => {
      if (l.id === 'knee') {
        return { ...l, x: hip.x, y: Math.round(hip.y + torsoH * 0.9) };
      }
      if (l.id === 'ankle') {
        return { ...l, x: hip.x, y: Math.round(hip.y + torsoH * 1.8) };
      }
      return l;
    });
  }, [landmarksSide, input.scanRange]);

  const [view, setView] = useState<'front' | 'side'>('front');
  const [inputSource, setInputSource] = useState<'mannequin' | 'image' | 'webcam' | 'video'>(() => {
    const saved = localStorage.getItem('fashionfit_input_source');
    return ['mannequin', 'image', 'webcam', 'video'].includes(saved || '') 
      ? (saved as any) 
      : 'mannequin';
  });

  const [deletingSessionId, setDeletingSessionId] = useState<string | null>(null);

  // Sync settings to localStorage
  useEffect(() => {
    localStorage.setItem('fashionfit_input', JSON.stringify(input));
  }, [input]);

  useEffect(() => {
    localStorage.setItem('fashionfit_reference_pixels', referencePixels.toString());
  }, [referencePixels]);

  useEffect(() => {
    localStorage.setItem('fashionfit_landmarks_front', JSON.stringify(landmarksFront));
  }, [landmarksFront]);

  useEffect(() => {
    localStorage.setItem('fashionfit_landmarks_side', JSON.stringify(landmarksSide));
  }, [landmarksSide]);

  useEffect(() => {
    localStorage.setItem('fashionfit_input_source', inputSource);
  }, [inputSource]);

  const [uploadedImageFront, setUploadedImageFront] = useState<string | null>(null);
  const [uploadedImageSide, setUploadedImageSide] = useState<string | null>(null);

  // Supabase history states & saving state
  const [history, setHistory] = useState<MeasurementSession[]>([]);
  const [isHistoryOpen, setIsHistoryOpen] = useState<boolean>(false);
  const [syncState, setSyncState] = useState<'idle' | 'pending' | 'saving' | 'saved' | 'error'>('idle');
  const [savedAt, setSavedAt] = useState<string>('');

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isFirstRender = useRef(true);
  const skipSaveRef = useRef(false);

  // Fetch recent sessions from database
  const loadHistory = async () => {
    const { data, error } = await fetchRecentSessions();
    if (!error) {
      setHistory(data);
    }
  };

  useEffect(() => {
    loadHistory();
  }, []);

  // Delete session from history
  const handleDeleteSession = async (id: string) => {
    const { error } = await deleteSession(id);
    if (!error) {
      loadHistory();
      setDeletingSessionId(null);
    } else {
      alert("Lỗi khi xóa phiên đo: " + error);
    }
  };

  // Load a session's parameters back into current state
  const handleLoadSession = (session: MeasurementSession) => {
    skipSaveRef.current = true; // Tell auto-save effect to skip this state update
    setInput({
      gender: session.gender,
      weight: session.weight_kg,
      calibrationType: (session.calibration_type as any) || 'a4',
      customHeight: session.height_cm,
      sizeSystem: input.sizeSystem || 'vietnam'
    });
    setReferencePixels(session.reference_pixels || 120);

    const parseLandmarks = (val: any): Landmark[] | null => {
      if (!val) return null;
      let parsed = val;
      if (typeof val === 'string') {
        try {
          parsed = JSON.parse(val);
        } catch (e) {
          return null;
        }
      }
      if (Array.isArray(parsed) && parsed.length > 0) {
        const isValid = parsed.every(
          item => item && typeof item === 'object' && 'id' in item && 'x' in item && 'y' in item
        );
        return isValid ? parsed : null;
      }
      return null;
    };

    const parsedFront = parseLandmarks(session.landmarks_front);
    if (parsedFront) {
      setLandmarksFront(parsedFront);
    }
    const parsedSide = parseLandmarks(session.landmarks_side);
    if (parsedSide) {
      setLandmarksSide(parsedSide);
    }

    // Switch input source back to 'mannequin' to view the 3D model
    setInputSource('mannequin');
    
    // Switch view to 'front' so they can see the front view first
    setView('front');

    // Close the history drawer
    setIsHistoryOpen(false);
  };

  // Handle updates to specific landmarks
  const handleLandmarkChange = (id: string, x: number, y: number) => {
    if (view === 'front') {
      setLandmarksFront(prev => prev.map(l => (l.id === id ? { ...l, x, y } : l)));
    } else {
      setLandmarksSide(prev => prev.map(l => (l.id === id ? { ...l, x, y } : l)));
    }
  };

  // Upload handlers
  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      if (event.target?.result) {
        if (view === 'front') {
          setUploadedImageFront(event.target.result as string);
        } else {
          setUploadedImageSide(event.target.result as string);
        }
      }
    };
    reader.readAsDataURL(file);
  };

  const scale = useMemo(() => {
    if (input.scanRange === 'half' && inputSource !== 'mannequin') {
      const heightVal = input.customHeight || 165;
      const nasionPt = (view === 'front' ? processedFrontLandmarks : processedSideLandmarks).find(l => l.id === 'nasion')!;
      const hipPt = view === 'front'
        ? (() => {
            const lHip = processedFrontLandmarks.find(l => l.id === 'left_hip')!;
            const rHip = processedFrontLandmarks.find(l => l.id === 'right_hip')!;
            return { x: (lHip.x + rHip.x) / 2, y: (lHip.y + rHip.y) / 2 };
          })()
        : processedSideLandmarks.find(l => l.id === 'hip')!;

      const nasionToHipPixels = Math.max(80, hipPt.y - nasionPt.y);
      return Math.max(0.05, Math.min(1.0, (heightVal * AVERAGE_NASION_TO_HIP_RATIO) / nasionToHipPixels));
    }

    if (input.calibrationType === 'height' || inputSource === 'mannequin') {
      const heightVal = input.customHeight || 165;
      const nasionPt = (view === 'front' ? processedFrontLandmarks : processedSideLandmarks).find(l => l.id === 'nasion')!;
      const anklePt = view === 'front'
        ? (() => {
            const lAnkle = processedFrontLandmarks.find(l => l.id === 'left_ankle')!;
            const rAnkle = processedFrontLandmarks.find(l => l.id === 'right_ankle')!;
            return { x: (lAnkle.x + rAnkle.x) / 2, y: (lAnkle.y + rAnkle.y) / 2 };
          })()
        : processedSideLandmarks.find(l => l.id === 'ankle')!;

      const heightPixels = Math.max(100, anklePt.y - nasionPt.y);
      return Math.max(0.05, Math.min(1.0, (heightVal - 9.5) / heightPixels));
    }
    return calculateScaleFactor(referencePixels, input.calibrationType);
  }, [referencePixels, input.calibrationType, input.customHeight, input.scanRange, processedFrontLandmarks, processedSideLandmarks, view, inputSource]);

  // Human Anthropometric Computations
  const measurements = useMemo<BodyMeasurements>(() => {
    // 2. Extract keypoints
    const nasionF = processedFrontLandmarks.find(l => l.id === 'nasion')!;
    const lShoulder = processedFrontLandmarks.find(l => l.id === 'left_shoulder')!;
    const rShoulder = processedFrontLandmarks.find(l => l.id === 'right_shoulder')!;
    const lElbow = processedFrontLandmarks.find(l => l.id === 'left_elbow')!;
    const lWrist = processedFrontLandmarks.find(l => l.id === 'left_wrist')!;
    const rElbow = processedFrontLandmarks.find(l => l.id === 'right_elbow')!;
    const rWrist = processedFrontLandmarks.find(l => l.id === 'right_wrist')!;
    const lHip = processedFrontLandmarks.find(l => l.id === 'left_hip')!;
    const rHip = processedFrontLandmarks.find(l => l.id === 'right_hip')!;
    const lKnee = processedFrontLandmarks.find(l => l.id === 'left_knee')!;
    const rKnee = processedFrontLandmarks.find(l => l.id === 'right_knee')!;
    const lAnkle = processedFrontLandmarks.find(l => l.id === 'left_ankle')!;
    const rAnkle = processedFrontLandmarks.find(l => l.id === 'right_ankle')!;

    const dist = (p1: Landmark, p2: Landmark) =>
      Math.sqrt(Math.pow(p1.x - p2.x, 2) + Math.pow(p1.y - p2.y, 2));

    // Height calculation (From nasion to midpoint of ankles)
    const midAnkleY = (lAnkle.y + rAnkle.y) / 2;
    const heightPixels = midAnkleY - nasionF.y;
    // Lock physical height to customHeight in half-body mode to prevent runaway values
    const height = input.scanRange === 'half'
      ? (input.customHeight || 165)
      : Math.max(50, Math.min(220, heightPixels * scale + 9.5));

    // Shoulder Width (Bi-acromial diameter)
    const shoulderWidth = dist(lShoulder, rShoulder) * scale;

    // Arm Length
    const leftArm = dist(lShoulder, lElbow) + dist(lElbow, lWrist);
    const rightArm = dist(rShoulder, rElbow) + dist(rElbow, rWrist);
    const armLength = ((leftArm + rightArm) / 2) * scale;

    // Leg Length (Inseam)
    const leftLeg = dist(lHip, lKnee) + dist(lKnee, lAnkle);
    const rightLeg = dist(rHip, rKnee) + dist(rKnee, rAnkle);
    const legLength = ((leftLeg + rightLeg) / 2) * scale;

    // 3. Torso circumference estimation using volume constraints
    const baseCircs = estimateCircumferences(input.gender, input.weight, height);

    // 4. Refine estimates based on side-view profile depths if available
    const shoulderS = processedSideLandmarks.find(l => l.id === 'shoulder')!;
    const chestDepthPt = processedSideLandmarks.find(l => l.id === 'chest_depth')!;
    const hipS = processedSideLandmarks.find(l => l.id === 'hip')!;
    const buttockDepthPt = processedSideLandmarks.find(l => l.id === 'buttock_depth')!;

    // Horizontal depth in pixels
    const chestDepthCm = Math.abs(chestDepthPt.x - shoulderS.x) * scale;
    const hipDepthCm = Math.abs(hipS.x - buttockDepthPt.x) * scale;

    // Expected depth ratios based on heights
    const expectedChestDepth = height * 0.12; 
    const expectedHipDepth = height * 0.14; 

    // Scale adjustments
    const hasSideProfile = (inputSource === 'image' && uploadedImageSide !== null);
    const chestDepthFactor = hasSideProfile && expectedChestDepth > 0 ? chestDepthCm / expectedChestDepth : 1;
    const hipDepthFactor = hasSideProfile && expectedHipDepth > 0 ? hipDepthCm / expectedHipDepth : 1;

    // Final circumferences (combining volume lock + side silhouette inputs)
    const chestCircumference = baseCircs.chest * (0.8 + 0.2 * chestDepthFactor);
    const hipCircumference = baseCircs.hips * (0.7 + 0.3 * hipDepthFactor);
    
    // Waist gets affected partially by chest and hip changes organically
    const waistCircumference = baseCircs.waist * (0.85 + 0.08 * chestDepthFactor + 0.07 * hipDepthFactor);

    // Waist depth estimation from volume constraint and adjustments
    const totalVolumeCm3 = input.weight / 0.00101;
    const abdomenVolume = totalVolumeCm3 * 0.28;
    const waistSegmentHeight = height * 0.10;
    const waistArea = (abdomenVolume * 0.42) / waistSegmentHeight;
    const waistRatio = input.gender === 'female' ? 1.30 : 1.25;
    const baseWaistDepth = 2 * Math.sqrt(waistArea / (Math.PI * waistRatio));
    const waistDepth = baseWaistDepth * (0.85 + 0.08 * chestDepthFactor + 0.07 * hipDepthFactor) * (input.gender === 'female' ? 0.98 : 1.02);

    return {
      height,
      shoulderWidth,
      armLength,
      legLength,
      chestCircumference,
      waistCircumference,
      hipCircumference,
      chestDepth: hasSideProfile ? chestDepthCm : expectedChestDepth,
      waistDepth,
      hipDepth: hasSideProfile ? hipDepthCm : expectedHipDepth
    };
  }, [input, referencePixels, processedFrontLandmarks, processedSideLandmarks, scale, inputSource, uploadedImageSide]);

  // Sizing recommendations
  const recommendation = useMemo<SizeRecommendation>(() => {
    const sizeData = getRecommendedSize(input.gender, measurements, input.sizeSystem);
    
    // Fit detail analysis based on standard deviations
    const evaluateFit = (current: number, base: number) => {
      const diff = current - base;
      if (diff > 4) return 'loose' as const;
      if (diff < -3) return 'tight' as const;
      return 'fit' as const;
    };

    // Reference base chest/waist/hip mapping (Size M for selected system)
    const baseLimits = input.sizeSystem === 'vietnam'
      ? (input.gender === 'male' 
          ? { chest: 92, waist: 74, hips: 94 }
          : { chest: 86, waist: 70, hips: 92 })
      : (input.gender === 'male'
          ? { chest: 96, waist: 84, hips: 100 }
          : { chest: 88, waist: 70, hips: 94 });

    return {
      size: sizeData.size,
      matchPercentage: sizeData.matchPercentage,
      details: {
        chest: evaluateFit(measurements.chestCircumference, baseLimits.chest),
        waist: evaluateFit(measurements.waistCircumference, baseLimits.waist),
        hips: evaluateFit(measurements.hipCircumference, baseLimits.hips)
      }
    };
  }, [input.gender, measurements]);

  // Check for anatomical logic warnings to prevent user from dragging points out of logical bounds
  const anatomicalWarning = useMemo(() => {
    const { height, shoulderWidth, armLength, legLength } = measurements;
    
    if (height < 45 || height > 220) {
      return "Chiều cao bất thường (Yêu cầu: 45cm - 220cm). Vui lòng kéo chỉnh lại điểm Gốc Mũi hoặc Cổ Chân.";
    }
    if (shoulderWidth < 10 || shoulderWidth > 60) {
      return "Chiều rộng vai bất thường (Yêu cầu: 10cm - 60cm). Vui lòng kéo chỉnh lại khớp Vai Trái/Phải.";
    }
    if (armLength < 10 || armLength > 95) {
      return "Chiều dài tay bất thường (Yêu cầu: 10cm - 95cm). Vui lòng kéo chỉnh lại các khớp Khuỷu/Cổ tay.";
    }
    if (legLength < 15 || legLength > 115) {
      return "Chiều dài chân bất thường (Yêu cầu: 15cm - 115cm). Vui lòng kéo chỉnh lại các khớp Hông/Gối/Cổ chân.";
    }
    return null;
  }, [measurements]);

  const savePayload = useMemo(() => ({
    gender: input.gender,
    weight_kg: input.weight,
    calibration_type: input.calibrationType,
    reference_pixels: referencePixels,
    height_cm: parseFloat(measurements.height.toFixed(1)),
    shoulder_width_cm: parseFloat(measurements.shoulderWidth.toFixed(1)),
    arm_length_cm: parseFloat(measurements.armLength.toFixed(1)),
    bust_cm: parseFloat(measurements.chestCircumference.toFixed(1)),
    waist_cm: parseFloat(measurements.waistCircumference.toFixed(1)),
    hip_cm: parseFloat(measurements.hipCircumference.toFixed(1)),
    inseam_cm: parseFloat(measurements.legLength.toFixed(1)),
    bust_depth_cm: parseFloat((measurements.chestDepth || 0).toFixed(1)),
    waist_depth_cm: parseFloat((measurements.waistDepth || 0).toFixed(1)),
    hip_depth_cm: parseFloat((measurements.hipDepth || 0).toFixed(1)),
    recommended_size: recommendation.size,
    confidence_pct: recommendation.matchPercentage,
    landmarks_front: processedFrontLandmarks,
    landmarks_side: processedSideLandmarks,
  }), [input, referencePixels, measurements, recommendation, processedFrontLandmarks, processedSideLandmarks]);

  // Debounced auto-save effect triggered in App.tsx to allow skipping saving during session loads
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }

    if (skipSaveRef.current) {
      skipSaveRef.current = false; // consume the skip flag
      return;
    }

    setSyncState('pending');

    if (debounceRef.current) clearTimeout(debounceRef.current);

    debounceRef.current = setTimeout(async () => {
      setSyncState('saving');
      const { error } = await saveMeasurementSession(savePayload);
      if (error) {
        setSyncState('error');
        setTimeout(() => setSyncState('idle'), 5000);
      } else {
        setSyncState('saved');
        const now = new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
        setSavedAt(now);
        loadHistory(); // Refresh history panel
      }
    }, 2000);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [savePayload]);

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="app-container">
      {/* Header */}
      <header className="app-header">
        <div className="header-logo-group">
          <Activity className="pulse-logo" />
          <div>
            <h1>FASHIONFIT AI</h1>
            <p className="subtitle">Hệ Thống Đo Đạc Hình Thể Tự Động Nhân Trắc Học 3D</p>
          </div>
        </div>
        <button
          type="button"
          className="history-toggle-btn"
          onClick={() => setIsHistoryOpen(true)}
        >
          <History size={16} />
          <span>Lịch Sử Đo ({history.length})</span>
        </button>
      </header>

      {/* Main layout */}
      <main className="main-content">
        <div className="left-column">
          <InputForm
            input={input}
            onChange={setInput}
            referencePixels={referencePixels}
            onReferencePixelsChange={setReferencePixels}
            inputSource={inputSource}
          />
        </div>

        <div className="center-column">
          <BodyCanvas
            gender={input.gender}
            weight={input.weight}
            scaleFactor={scale}
            landmarks={view === 'front' ? processedFrontLandmarks : processedSideLandmarks}
            onLandmarkChange={handleLandmarkChange}
            view={view}
            onViewChange={setView}
            uploadedImage={view === 'front' ? uploadedImageFront : uploadedImageSide}
            onImageUpload={handleImageUpload}
            warning={anatomicalWarning}
            measurements={measurements}
            recommendation={recommendation}
            inputSource={inputSource}
            onInputSourceChange={setInputSource}
            scanRange={input.scanRange}
          />
        </div>

        <div className="right-column">
          <ResultPanel
            measurements={measurements}
            recommendation={recommendation}
            onPrint={handlePrint}
            view={view}
            syncState={syncState}
            savedAt={savedAt}
            sizeSystem={input.sizeSystem}
          />
        </div>
      </main>

      {/* Slide-out History Drawer */}
      <div className={`history-drawer ${isHistoryOpen ? 'open' : ''}`}>
        <div className="drawer-header">
          <div className="drawer-title-group">
            <History size={18} />
            <h3>Lịch Sử Phiên Đo</h3>
          </div>
          <button className="drawer-close-btn" onClick={() => setIsHistoryOpen(false)}>
            <X size={18} />
          </button>
        </div>

        <div className="drawer-content">
          {history.length === 0 ? (
            <div className="history-empty">
              <Clock size={32} />
              <p>Chưa có phiên đo nào được lưu.</p>
              <span>Thực hiện thay đổi số đo hoặc kéo landmark để hệ thống tự động lưu vào Supabase.</span>
            </div>
          ) : (
            <div className="history-list">
              {history.map((session) => {
                const date = session.created_at
                  ? new Date(session.created_at).toLocaleString('vi-VN', {
                      day: '2-digit',
                      month: '2-digit',
                      hour: '2-digit',
                      minute: '2-digit'
                    })
                  : 'Không rõ';

                return (
                  <div
                    key={session.id}
                    className={`history-item-card ${deletingSessionId === session.id ? 'deleting' : ''}`}
                    onClick={() => deletingSessionId !== session.id && handleLoadSession(session)}
                  >
                    {deletingSessionId === session.id && (
                      <div className="card-delete-confirm-overlay" onClick={(e) => e.stopPropagation()}>
                        <p>Xóa phiên đo này?</p>
                        <div className="confirm-buttons">
                          <button
                            className="confirm-btn delete"
                            onClick={() => handleDeleteSession(session.id!)}
                          >
                            Xóa
                          </button>
                          <button
                            className="confirm-btn cancel"
                            onClick={() => setDeletingSessionId(null)}
                          >
                            Hủy
                          </button>
                        </div>
                      </div>
                    )}

                    <div className="item-header">
                      <span className="item-time">{date}</span>
                      <button
                        className="item-delete-btn"
                        onClick={(e) => {
                          e.stopPropagation();
                          setDeletingSessionId(session.id!);
                        }}
                        title="Xóa phiên đo này"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                    <div className="item-body">
                      <div className="item-badge-row">
                        <span className={`gender-badge ${session.gender}`}>
                          {session.gender === 'male' ? 'Nam' : 'Nữ'}
                        </span>
                        <span className="size-badge-small">{session.recommended_size}</span>
                      </div>
                      <div className="item-metrics">
                        <div>
                          <span className="metric-label">Cân nặng:</span>
                          <span className="metric-val">{session.weight_kg} kg</span>
                        </div>
                        <div>
                          <span className="metric-label">Chiều cao:</span>
                          <span className="metric-val">{session.height_cm} cm ({formatHeightMeters(session.height_cm)})</span>
                        </div>
                      </div>
                    </div>
                    <div className="item-action">
                      <FolderOpen size={12} />
                      <span>Bấm để tải lại mô hình 3D</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Drawer Overlay */}
      {isHistoryOpen && (
        <div className="drawer-overlay" onClick={() => setIsHistoryOpen(false)} />
      )}

      {/* Footer */}
      <footer className="app-footer">
        <p>© 2026 FashionFit AI Project. Xây dựng bởi Sinh viên Nghiên cứu Khoa học & Kỹ thuật May mặc.</p>
      </footer>
    </div>
  );
}

export default App;
