import React, { useState, useMemo, useEffect } from 'react';
import type { UserInput, Landmark, BodyMeasurements, SizeRecommendation } from './types';
import { InputForm } from './components/InputForm';
import { BodyCanvas } from './components/BodyCanvas';
import { ResultPanel } from './components/ResultPanel';
import { Mannequin3DView } from './components/Mannequin3DView';
import { estimateCircumferences, getRecommendedSize, getSizeLimits, calculateScaleFactor, AVERAGE_NASION_TO_HIP_RATIO } from './utils/anthropometry';
import { Activity, History as HistoryIcon, X, Clock, Trash2, FolderOpen, UserPlus, Layers, Sliders, Camera, Shirt } from 'lucide-react';
import { saveMeasurementSession, deleteSession, clearAllSessions } from './lib/supabase';
import type { MeasurementSession } from './lib/supabase';
import { saveBackendSession, fetchBackendSessions, deleteBackendSession, clearAllBackendSessions } from './lib/api';

// Helper function to get initial landmarks based on gender and view
const getInitialLandmarks = (gender: 'male' | 'female', view: 'front' | 'side'): Landmark[] => {
  if (gender === 'male') {
    if (view === 'front') {
      return [
        { id: 'nasion', name: 'Gốc mũi', x: 200, y: 100, label: 'Gốc Mũi' },
        { id: 'left_shoulder', name: 'Vai trái', x: 142, y: 145, label: 'Vai Trái' },
        { id: 'right_shoulder', name: 'Vai phải', x: 258, y: 145, label: 'Vai Phải' },
        { id: 'left_elbow', name: 'Khuỷu tay trái', x: 95, y: 145, label: 'Khuỷu Tay Trái' },
        { id: 'left_wrist', name: 'Cổ tay trái', x: 50, y: 145, label: 'Cổ Tay Trái' },
        { id: 'right_elbow', name: 'Khuỷu tay phải', x: 305, y: 145, label: 'Khuỷu Tay Phải' },
        { id: 'right_wrist', name: 'Cổ tay phải', x: 350, y: 145, label: 'Cổ Tay Phải' },
        { id: 'left_hip', name: 'Hông trái', x: 165, y: 295, label: 'Hông Trái' },
        { id: 'right_hip', name: 'Hông phải', x: 235, y: 295, label: 'Hông Phải' },
        { id: 'left_knee', name: 'Đầu gối trái', x: 170, y: 395, label: 'Đầu Gối Trái' },
        { id: 'left_ankle', name: 'Cổ chân trái', x: 175, y: 580, label: 'Cổ Chân Trái' },
        { id: 'right_knee', name: 'Đầu gối phải', x: 230, y: 395, label: 'Đầu Gối Phải' },
        { id: 'right_ankle', name: 'Cổ chân phải', x: 225, y: 580, label: 'Cổ Chân Phải' }
      ];
    } else {
      return [
        { id: 'nasion', name: 'Gốc mũi', x: 215, y: 100, label: 'Gốc Mũi' },
        { id: 'shoulder', name: 'Khớp vai', x: 200, y: 145, label: 'Khớp Vai' },
        { id: 'elbow', name: 'Khuỷu tay', x: 190, y: 238, label: 'Khuỷu Tay' },
        { id: 'wrist', name: 'Cổ tay', x: 185, y: 320, label: 'Cổ Tay' },
        { id: 'hip', name: 'Khớp hông', x: 200, y: 295, label: 'Khớp Hông' },
        { id: 'knee', name: 'Khớp gối', x: 200, y: 395, label: 'Khớp Gối' },
        { id: 'ankle', name: 'Cổ chân', x: 200, y: 580, label: 'Cổ Chân' },
        { id: 'chest_depth', name: 'Độ sâu ngực', x: 232, y: 195, label: 'Độ Sâu Ngực' },
        { id: 'buttock_depth', name: 'Độ sâu mông', x: 168, y: 305, label: 'Độ Sâu Mông' }
      ];
    }
  } else {
    if (view === 'front') {
      return [
        { id: 'nasion', name: 'Gốc mũi', x: 200, y: 110, label: 'Gốc Mũi' },
        { id: 'left_shoulder', name: 'Vai trái', x: 146, y: 152, label: 'Vai Trái' },
        { id: 'right_shoulder', name: 'Vai phải', x: 254, y: 152, label: 'Vai Phải' },
        { id: 'left_elbow', name: 'Khuỷu tay trái', x: 100, y: 152, label: 'Khuỷu Tay Trái' },
        { id: 'left_wrist', name: 'Cổ tay trái', x: 50, y: 152, label: 'Cổ Tay Trái' },
        { id: 'right_elbow', name: 'Khuỷu tay phải', x: 300, y: 152, label: 'Khuỷu Tay Phải' },
        { id: 'right_wrist', name: 'Cổ tay phải', x: 350, y: 152, label: 'Cổ Tay Phải' },
        { id: 'left_hip', name: 'Hông trái', x: 168, y: 305, label: 'Hông Trái' },
        { id: 'right_hip', name: 'Hông phải', x: 232, y: 305, label: 'Hông Phải' },
        { id: 'left_knee', name: 'Đầu gối trái', x: 172, y: 405, label: 'Đầu Gối Trái' },
        { id: 'left_ankle', name: 'Cổ chân trái', x: 175, y: 580, label: 'Cổ Chân Trái' },
        { id: 'right_knee', name: 'Đầu gối phải', x: 228, y: 405, label: 'Đầu Gối Phải' },
        { id: 'right_ankle', name: 'Cổ chân phải', x: 225, y: 580, label: 'Cổ Chân Phải' }
      ];
    } else {
      return [
        { id: 'nasion', name: 'Gốc mũi', x: 215, y: 110, label: 'Gốc Mũi' },
        { id: 'shoulder', name: 'Khớp vai', x: 200, y: 152, label: 'Khớp Vai' },
        { id: 'elbow', name: 'Khuỷu tay', x: 185, y: 248, label: 'Khuỷu Tay' },
        { id: 'wrist', name: 'Cổ tay', x: 180, y: 328, label: 'Cổ Tay' },
        { id: 'hip', name: 'Khớp hông', x: 200, y: 305, label: 'Khớp Hông' },
        { id: 'knee', name: 'Khớp gối', x: 200, y: 405, label: 'Khớp Gối' },
        { id: 'ankle', name: 'Cổ chân', x: 200, y: 580, label: 'Cổ Chân' },
        { id: 'chest_depth', name: 'Độ sâu ngực', x: 232, y: 200, label: 'Độ Sâu Ngực' },
        { id: 'buttock_depth', name: 'Độ sâu mông', x: 168, y: 315, label: 'Độ Sâu Mông' }
      ];
    }
  }
};

// Default initial keypoints for front and side views (using female as startup default)
const initialFrontLandmarks: Landmark[] = getInitialLandmarks('female', 'front');
const initialSideLandmarks: Landmark[] = getInitialLandmarks('female', 'side');

function App() {
  const [input, setInput] = useState<UserInput>(() => {
    const saved = localStorage.getItem('fashionfit_input');
    const savedSource = localStorage.getItem('fashionfit_input_source') || 'mannequin';
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (parsed && typeof parsed === 'object') {
          const g = parsed.gender === 'male' ? 'male' : 'female';
          const defaultH = g === 'female' ? 165 : 180;
          const h = (typeof parsed.customHeight === 'number' && parsed.customHeight >= 130 && parsed.customHeight <= 230)
            ? parsed.customHeight 
            : defaultH;

          return {
            gender: g,
            weight: (typeof parsed.weight === 'number' && parsed.weight >= 30) ? parsed.weight : (g === 'female' ? 55 : 75),
            calibrationType: ['a4', 'card', 'ipd', 'height'].includes(parsed.calibrationType) ? parsed.calibrationType : 'height',
            customHeight: h,
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
      customHeight: 165,
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
    if (!Array.isArray(landmarksFront) || landmarksFront.length === 0) return initialFrontLandmarks;
    if (input.scanRange !== 'half') return landmarksFront;
    const lHip = landmarksFront.find(l => l.id === 'left_hip');
    const rHip = landmarksFront.find(l => l.id === 'right_hip');
    const lShoulder = landmarksFront.find(l => l.id === 'left_shoulder');
    const rShoulder = landmarksFront.find(l => l.id === 'right_shoulder');

    if (!lHip || !rHip || !lShoulder || !rShoulder) return landmarksFront;
    
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
    if (!Array.isArray(landmarksSide) || landmarksSide.length === 0) return initialSideLandmarks;
    if (input.scanRange !== 'half') return landmarksSide;
    const hip = landmarksSide.find(l => l.id === 'hip');
    const shoulder = landmarksSide.find(l => l.id === 'shoulder');
    if (!hip || !shoulder) return landmarksSide;
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

  const handleInputSourceChange = (source: 'mannequin' | 'image' | 'webcam' | 'video') => {
    setInputSource(source);
  };

  // Auto-detect reference object pixels using exact anthropometric scale ratios
  useEffect(() => {
    if ((inputSource === 'image' || inputSource === 'webcam') && processedFrontLandmarks.length > 0) {
      const nasionPt = processedFrontLandmarks.find(l => l.id === 'nasion');
      const lAnkle = processedFrontLandmarks.find(l => l.id === 'left_ankle');
      const rAnkle = processedFrontLandmarks.find(l => l.id === 'right_ankle');

      if (nasionPt && lAnkle && rAnkle) {
        const ankleY = (lAnkle.y + rAnkle.y) / 2;
        const bodyHeightPixels = Math.max(120, ankleY - nasionPt.y);

        if (input.calibrationType === 'card') {
          // Standard card 8.56cm (Nasion-to-Ankle = 158cm, Total Height = 158 + 9.5 = 167.5cm)
          const autoCardPixels = Math.round(bodyHeightPixels * (8.56 / 158.0));
          setReferencePixels(Math.max(10, Math.min(250, autoCardPixels)));
        } else if (input.calibrationType === 'a4') {
          // Standard A4 paper 21.0cm (Nasion-to-Ankle = 158cm, Total Height = 158 + 9.5 = 167.5cm)
          const autoA4Pixels = Math.round(bodyHeightPixels * (21.0 / 158.0));
          setReferencePixels(Math.max(20, Math.min(450, autoA4Pixels)));
        } else if (input.calibrationType === 'ipd') {
          // Standard IPD 6.3cm (Nasion-to-Ankle = 158cm, Total Height = 158 + 9.5 = 167.5cm)
          const autoIpdPixels = Math.round(bodyHeightPixels * (6.3 / 158.0));
          setReferencePixels(Math.max(8, Math.min(150, autoIpdPixels)));
        }
      }
    }
  }, [input.calibrationType, inputSource, processedFrontLandmarks]);

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

  const [scannedSources, setScannedSources] = useState<{
    mannequin: boolean;
    image: boolean;
    webcam: boolean;
    video: boolean;
  }>({
    mannequin: false,
    image: false,
    webcam: false,
    video: false,
  });

  const [toast, setToast] = useState<{
    show: boolean;
    type: 'warning' | 'success' | 'info';
    title: string;
    message: string;
  }>({
    show: false,
    type: 'warning',
    title: '',
    message: ''
  });

  useEffect(() => {
    if (toast.show) {
      const timer = setTimeout(() => {
        setToast(prev => ({ ...prev, show: false }));
      }, 4500);
      return () => clearTimeout(timer);
    }
  }, [toast.show]);

  const handleScanComplete = (source: string) => {
    setScannedSources(prev => ({
      ...prev,
      [source]: true
    }));
  };

  const handleResetScan = (source?: string) => {
    const targetSource = source || inputSource;
    setScannedSources(prev => ({
      ...prev,
      [targetSource]: false
    }));
  };

  const [uploadedImageFront, setUploadedImageFront] = useState<string | null>(null);
  const [uploadedImageSide, setUploadedImageSide] = useState<string | null>(null);

  // Synchronize gender changes to automatically load the corresponding template coordinates
  useEffect(() => {
    if (!uploadedImageFront) {
      setLandmarksFront(getInitialLandmarks(input.gender, 'front'));
    }
    if (!uploadedImageSide) {
      setLandmarksSide(getInitialLandmarks(input.gender, 'side'));
    }
  }, [input.gender, inputSource, uploadedImageFront, uploadedImageSide]);

  // Supabase & MongoDB history states & saving state
  const [history, setHistory] = useState<MeasurementSession[]>([]);
  const [isHistoryOpen, setIsHistoryOpen] = useState<boolean>(false);
  const [historySearchQuery, setHistorySearchQuery] = useState<string>('');
  const [historySourceFilter, setHistorySourceFilter] = useState<string>('all');
  const [showClearAllConfirm, setShowClearAllConfirm] = useState<boolean>(false);
  const [activeMobileTab, setActiveMobileTab] = useState<'3d' | 'input' | 'scan' | 'result'>('3d');
  const [customerName, setCustomerName] = useState<string>('');
  const [customerPhone, setCustomerPhone] = useState<string>('');
  const [syncState, setSyncState] = useState<'idle' | 'pending' | 'saving' | 'saved' | 'error'>('idle');
  const [savedAt, setSavedAt] = useState<string>('');
  const [selectedCompareIds, setSelectedCompareIds] = useState<string[]>([]);
  const [isCompareModalOpen, setIsCompareModalOpen] = useState<boolean>(false);
  const [rotationCompare, setRotationCompare] = useState<number>(0);

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

  const handleToggleCompare = (id: string) => {
    setSelectedCompareIds(prev => {
      if (prev.includes(id)) {
        return prev.filter(x => x !== id);
      }
      if (prev.length >= 2) {
        alert("Chỉ chọn tối đa 2 phiên đo để so sánh vóc dáng!");
        return prev;
      }
      return [...prev, id];
    });
  };


  const LOCAL_STORAGE_HISTORY_KEY = 'fashionfit_customer_history_v3';

  // Load customer measurement history from LocalStorage with backend sync
  const loadHistory = async () => {
    const localData = localStorage.getItem(LOCAL_STORAGE_HISTORY_KEY);
    if (localData !== null) {
      try {
        const parsed = JSON.parse(localData);
        if (Array.isArray(parsed)) {
          setHistory(parsed);
          return;
        }
      } catch (e) {}
    }

    // If local storage has never been initialized, check MongoDB backend
    const backendRes = await fetchBackendSessions();
    if (!backendRes.error && backendRes.data && backendRes.data.length > 0) {
      const formattedSessions = backendRes.data.map(item => ({
        id: item._id || Math.random().toString(),
        created_at: item.created_at || new Date().toISOString(),
        customer_name: item.customer_name || 'Khách Vãng Lai',
        customer_phone: item.customer_phone || '',
        notes: item.notes || '',
        source: item.source || 'mannequin',
        snapshot_img: item.snapshot_img || '',
        gender: item.gender,
        weight_kg: item.weight_kg,
        height_cm: item.height_cm,
        shoulder_width_cm: item.shoulder_width_cm,
        arm_length_cm: item.arm_length_cm,
        bust_cm: item.bust_cm,
        waist_cm: item.waist_cm,
        hip_cm: item.hip_cm,
        inseam_cm: item.inseam_cm,
        bust_depth_cm: item.bust_depth_cm || 0,
        waist_depth_cm: item.waist_depth_cm || 0,
        hip_depth_cm: item.hip_depth_cm || 0,
        recommended_size: item.recommended_size,
        confidence_pct: item.confidence_pct,
        calibration_type: item.calibration_type,
        reference_pixels: item.reference_pixels,
        landmarks_front: item.landmarks_front,
        landmarks_side: item.landmarks_side
      }));
      setHistory(formattedSessions as any);
      localStorage.setItem(LOCAL_STORAGE_HISTORY_KEY, JSON.stringify(formattedSessions));
      return;
    }

    // Default to empty array if no previous history
    setHistory([]);
    localStorage.setItem(LOCAL_STORAGE_HISTORY_KEY, JSON.stringify([]));
  };

  useEffect(() => {
    loadHistory();
  }, []);

  // Delete single session from history
  const handleDeleteSession = async (id: string) => {
    setHistory(prev => {
      const updated = prev.filter(s => s.id !== id);
      localStorage.setItem(LOCAL_STORAGE_HISTORY_KEY, JSON.stringify(updated));
      return updated;
    });
    deleteBackendSession(id).catch(() => {});
    deleteSession(id).catch(() => {});
    setDeletingSessionId(null);
  };

  // Clear ALL sessions from history (Wipes LocalStorage & backends permanently)
  const handleClearAllHistory = async () => {
    localStorage.setItem(LOCAL_STORAGE_HISTORY_KEY, JSON.stringify([]));
    setHistory([]);
    setShowClearAllConfirm(false);
    clearAllBackendSessions().catch(() => {});
    clearAllSessions().catch(() => {});
  };

  // Load a session's parameters back into current state
  const handleLoadSession = (session: MeasurementSession) => {
    setCustomerName(session.customer_name || '');
    setCustomerPhone(session.customer_phone || '');
    setInput({
      gender: session.gender,
      weight: session.weight_kg,
      calibrationType: (session.calibration_type as any) || 'a4',
      customHeight: session.height_cm,
      sizeSystem: input.sizeSystem || 'vietnam'
    });
    setReferencePixels(session.reference_pixels || 120);

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

  // High-performance batch landmark update for 60FPS real-time webcam tracking
  const handleLandmarksBatchChange = (updatedLandmarks: Landmark[]) => {
    if (view === 'front') {
      setLandmarksFront(updatedLandmarks);
    } else {
      setLandmarksSide(updatedLandmarks);
    }
  };

  // Reset landmarks to anatomically correct default positions
  const handleResetLandmarks = () => {
    if (view === 'front') {
      setLandmarksFront(getInitialLandmarks(input.gender, 'front'));
    } else {
      setLandmarksSide(getInitialLandmarks(input.gender, 'side'));
    }
  };

  // Reset model proportions and sliders to standard values (Nam, 180cm, 80kg)
  const handleResetModel = () => {
    setInput({
      gender: 'male',
      weight: 80,
      calibrationType: 'height',
      customHeight: 180,
      sizeSystem: 'vietnam',
      scanRange: 'full'
    });
    setReferencePixels(120);
    setLandmarksFront(getInitialLandmarks('male', 'front'));
    setLandmarksSide(getInitialLandmarks('male', 'side'));
  };

  // Upload handlers
  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      if (event.target?.result) {
        const imgSrc = event.target.result as string;
        if (view === 'front') {
          setUploadedImageFront(imgSrc);
        } else {
          setUploadedImageSide(imgSrc);
        }
        setScannedSources(prev => ({ ...prev, image: true }));

        // Run MediaPipe Pose immediately on the newly uploaded image!
        const img = new Image();
        img.crossOrigin = "anonymous";
        img.onload = async () => {
          try {
            const Pose = (window as any).Pose;
            if (!Pose) return;
            const pose = new Pose({
              locateFile: (f: string) => `https://cdn.jsdelivr.net/npm/@mediapipe/pose/${f}`
            });
            pose.setOptions({
              modelComplexity: 1,
              smoothLandmarks: true,
              enableSegmentation: false,
              minDetectionConfidence: 0.5,
              minTrackingConfidence: 0.5
            });
            pose.onResults((results: any) => {
              if (results.poseLandmarks) {
                const mp = results.poseLandmarks;
                const mapPt = (rx: number, ry: number) => ({
                  x: Math.round(rx * 400),
                  y: Math.round(ry * 650)
                });

                if (view === 'front') {
                  const updated = getInitialLandmarks(input.gender, 'front').map(l => {
                    let mpIndex = -1;
                    switch (l.id) {
                      case 'nasion': mpIndex = 0; break;
                      case 'left_shoulder': mpIndex = 11; break;
                      case 'right_shoulder': mpIndex = 12; break;
                      case 'left_elbow': mpIndex = 13; break;
                      case 'right_elbow': mpIndex = 14; break;
                      case 'left_wrist': mpIndex = 15; break;
                      case 'right_wrist': mpIndex = 16; break;
                      case 'left_hip': mpIndex = 23; break;
                      case 'right_hip': mpIndex = 24; break;
                      case 'left_knee': mpIndex = 25; break;
                      case 'right_knee': mpIndex = 26; break;
                      case 'left_ankle': mpIndex = 27; break;
                      case 'right_ankle': mpIndex = 28; break;
                    }
                    if (mpIndex !== -1 && mp[mpIndex]) {
                      const rx = mpIndex === 0 ? mp[0].x : mp[mpIndex].x;
                      const ry = (mpIndex === 11 || mpIndex === 12) ? mp[mpIndex].y - 0.015 : mp[mpIndex].y;
                      const pt = mapPt(rx, ry);
                      return { ...l, x: pt.x, y: pt.y, visibility: mp[mpIndex].visibility ?? 1 };
                    }
                    return l;
                  });
                  setLandmarksFront(updated);
                } else {
                  const shoulderIdx = (mp[11]?.visibility || 0) >= (mp[12]?.visibility || 0) ? 11 : 12;
                  const elbowIdx = shoulderIdx === 11 ? 13 : 14;
                  const wristIdx = shoulderIdx === 11 ? 15 : 16;
                  const hipIdx = shoulderIdx === 11 ? 23 : 24;
                  const kneeIdx = shoulderIdx === 11 ? 25 : 26;
                  const ankleIdx = shoulderIdx === 11 ? 27 : 28;

                  const updated = getInitialLandmarks(input.gender, 'side').map(l => {
                    let mpPt = null;
                    switch (l.id) {
                      case 'nasion': mpPt = mp[0]; break;
                      case 'shoulder': mpPt = mp[shoulderIdx]; break;
                      case 'elbow': mpPt = mp[elbowIdx]; break;
                      case 'wrist': mpPt = mp[wristIdx]; break;
                      case 'hip': mpPt = mp[hipIdx]; break;
                      case 'knee': mpPt = mp[kneeIdx]; break;
                      case 'ankle': mpPt = mp[ankleIdx]; break;
                    }
                    if (mpPt) {
                      const pt = mapPt(mpPt.x, mpPt.y);
                      return { ...l, x: pt.x, y: pt.y };
                    }
                    return l;
                  });
                  setLandmarksSide(updated);
                }
              }
            });
            await pose.send({ image: img });
          } catch (err) {
            console.error("Auto image upload pose failed:", err);
          }
        };
        img.src = imgSrc;
      }
      e.target.value = ''; // Reset value to allow re-uploading same file!
    };
    reader.readAsDataURL(file);
  };

  const handleClearImage = () => {
    if (view === 'front') {
      setUploadedImageFront(null);
    } else {
      setUploadedImageSide(null);
    }
    setScannedSources(prev => ({ ...prev, image: false }));
  };

  const scale = useMemo(() => {
    if (input.scanRange === 'half' && inputSource !== 'mannequin') {
      const heightVal = input.customHeight || 165;
      const nasionPt = processedFrontLandmarks.find(l => l.id === 'nasion')!;
      const hipPt = (() => {
        const lHip = processedFrontLandmarks.find(l => l.id === 'left_hip')!;
        const rHip = processedFrontLandmarks.find(l => l.id === 'right_hip')!;
        return { x: (lHip.x + rHip.x) / 2, y: (lHip.y + rHip.y) / 2 };
      })();

      const nasionToHipPixels = Math.max(80, hipPt.y - nasionPt.y);
      return Math.max(0.05, Math.min(1.0, (heightVal * AVERAGE_NASION_TO_HIP_RATIO) / nasionToHipPixels));
    }

    if (input.calibrationType === 'height' || inputSource === 'mannequin') {
      const heightVal = input.customHeight || 165;
      const nasionPt = processedFrontLandmarks.find(l => l.id === 'nasion')!;
      const anklePt = (() => {
        const lAnkle = processedFrontLandmarks.find(l => l.id === 'left_ankle')!;
        const rAnkle = processedFrontLandmarks.find(l => l.id === 'right_ankle')!;
        return { x: (lAnkle.x + rAnkle.x) / 2, y: (lAnkle.y + rAnkle.y) / 2 };
      })();

      const heightPixels = Math.max(100, anklePt.y - nasionPt.y);
      const rawScale = (heightVal - 9.5) / heightPixels;
      if (inputSource === 'image') {
        return rawScale; // 100% exact mathematical scale factor for uploaded photos!
      }
      // Clamp scale to safe physical limits for live webcams
      return Math.max(0.10, Math.min(0.45, rawScale));
    }
    return calculateScaleFactor(referencePixels, input.calibrationType);
  }, [referencePixels, input.calibrationType, input.customHeight, input.scanRange, processedFrontLandmarks, inputSource]);

  // Human Anthropometric Computations
  const measurements = useMemo<BodyMeasurements>(() => {
    // 2. Extract keypoints with safe fallbacks to initial landmarks
    const nasionF = processedFrontLandmarks.find(l => l.id === 'nasion') || initialFrontLandmarks[0];
    const lShoulder = processedFrontLandmarks.find(l => l.id === 'left_shoulder') || initialFrontLandmarks[1];
    const rShoulder = processedFrontLandmarks.find(l => l.id === 'right_shoulder') || initialFrontLandmarks[2];
    const lElbow = processedFrontLandmarks.find(l => l.id === 'left_elbow') || initialFrontLandmarks[3];
    const lWrist = processedFrontLandmarks.find(l => l.id === 'left_wrist') || initialFrontLandmarks[4];
    const rElbow = processedFrontLandmarks.find(l => l.id === 'right_elbow') || initialFrontLandmarks[5];
    const rWrist = processedFrontLandmarks.find(l => l.id === 'right_wrist') || initialFrontLandmarks[6];
    const lHip = processedFrontLandmarks.find(l => l.id === 'left_hip') || initialFrontLandmarks[7];
    const rHip = processedFrontLandmarks.find(l => l.id === 'right_hip') || initialFrontLandmarks[8];
    const lKnee = processedFrontLandmarks.find(l => l.id === 'left_knee') || initialFrontLandmarks[9];
    const rKnee = processedFrontLandmarks.find(l => l.id === 'right_knee') || initialFrontLandmarks[10];
    const lAnkle = processedFrontLandmarks.find(l => l.id === 'left_ankle') || initialFrontLandmarks[11];
    const rAnkle = processedFrontLandmarks.find(l => l.id === 'right_ankle') || initialFrontLandmarks[12];

    const dist = (p1: Landmark, p2: Landmark) =>
      Math.sqrt(Math.pow(p1.x - p2.x, 2) + Math.pow(p1.y - p2.y, 2));

    // Height calculation (From nasion to midpoint of ankles + 9.5cm cranial crown offset)
    const midAnkleY = (lAnkle.y + rAnkle.y) / 2;
    const heightPixels = midAnkleY - nasionF.y;
    // Lock physical height to customHeight in half-body mode to prevent runaway values
    const height = input.scanRange === 'half'
      ? (input.customHeight || 165)
      : Math.max(50, Math.min(220, heightPixels * scale + 9.5));

    // Raw calculated physical lengths in cm
    const rawShoulderWidth = dist(lShoulder, rShoulder) * scale;
    const leftArm = dist(lShoulder, lElbow) + dist(lElbow, lWrist);
    const rightArm = dist(rShoulder, rElbow) + dist(rElbow, rWrist);
    const rawArmLength = ((leftArm + rightArm) / 2) * scale;
    const leftLeg = dist(lHip, lKnee) + dist(lKnee, lAnkle);
    const rightLeg = dist(rHip, rKnee) + dist(rKnee, rAnkle);
    const rawLegLength = ((leftLeg + rightLeg) / 2) * scale;

    // ANATOMICAL SAFETY CLAMPING (Prevents runaway values like 289cm shoulders when sitting close to camera)
    const expectedShoulder = height * (input.gender === 'male' ? 0.25 : 0.23);
    const shoulderWidth = Math.max(30.0, Math.min(58.0, isNaN(rawShoulderWidth) || rawShoulderWidth > 65 || rawShoulderWidth < 15 ? expectedShoulder : rawShoulderWidth));

    const expectedArm = height * 0.41;
    const armLength = Math.max(40.0, Math.min(85.0, isNaN(rawArmLength) || rawArmLength > 90 || rawArmLength < 20 ? expectedArm : rawArmLength));

    const expectedLeg = height * 0.44;
    const legLength = Math.max(45.0, Math.min(112.0, isNaN(rawLegLength) || rawLegLength > 115 || rawLegLength < 25 ? expectedLeg : rawLegLength));

    // 3. Torso circumference estimation using volume constraints
    const baseCircs = estimateCircumferences(input.gender, input.weight, height);

    // 4. Refine estimates based on side-view profile depths if available
    const shoulderS = processedSideLandmarks.find(l => l.id === 'shoulder') || initialSideLandmarks[0];
    const chestDepthPt = processedSideLandmarks.find(l => l.id === 'chest_depth') || initialSideLandmarks[1];
    const hipS = processedSideLandmarks.find(l => l.id === 'hip') || initialSideLandmarks[2];
    const buttockDepthPt = processedSideLandmarks.find(l => l.id === 'buttock_depth') || initialSideLandmarks[3];

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

    const neckCircumference = chestCircumference * (input.gender === 'female' ? 0.38 : 0.41);
    const thighCircumference = hipCircumference * (input.gender === 'female' ? 0.58 : 0.55);
    const calfCircumference = hipCircumference * 0.38;
    const ankleCircumference = hipCircumference * 0.22;

    return {
      height,
      shoulderWidth,
      armLength,
      legLength,
      chestCircumference,
      waistCircumference,
      hipCircumference,
      neckCircumference,
      thighCircumference,
      calfCircumference,
      ankleCircumference,
      chestDepth: hasSideProfile ? chestDepthCm : expectedChestDepth,
      waistDepth,
      hipDepth: hasSideProfile ? hipDepthCm : expectedHipDepth
    };
  }, [input, referencePixels, processedFrontLandmarks, processedSideLandmarks, scale, inputSource, uploadedImageSide]);

  // Sizing recommendations
  const recommendation = useMemo<SizeRecommendation>(() => {
    const sizeData = getRecommendedSize(input.gender, measurements, input.sizeSystem, input.weight);
    
    // Fit detail analysis based on standard deviations relative to the recommended size limits
    const evaluateFit = (current: number, base: number) => {
      const diff = current - base;
      if (diff > 4) return 'loose' as const;
      if (diff < -3) return 'tight' as const;
      return 'fit' as const;
    };

    // Dynamic base limits for the specific recommended size
    const baseLimits = getSizeLimits(input.gender, sizeData.size, input.sizeSystem);

    return {
      size: sizeData.size,
      matchPercentage: sizeData.matchPercentage,
      details: {
        chest: evaluateFit(measurements.chestCircumference, baseLimits.chest),
        waist: evaluateFit(measurements.waistCircumference, baseLimits.waist),
        hips: evaluateFit(measurements.hipCircumference, baseLimits.hips)
      }
    };
  }, [input.gender, input.sizeSystem, input.weight, measurements]);

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

  // Manual save handler triggered when clicking "Lưu Hồ Sơ Khách Hàng"
  const handleSaveSession = async () => {
    const hasRealAIScan = scannedSources.image || scannedSources.webcam || scannedSources.video || Boolean(uploadedImageFront || uploadedImageSide);

    // Rule 1: Must have AI scanned data (images/webcam/video)
    if (inputSource === 'mannequin' && !hasRealAIScan) {
      setToast({
        show: true,
        type: 'warning',
        title: 'Chưa Có Số Đo AI Thực Tế!',
        message: 'Bạn đang ở chế độ Mô hình 3D mặc định. Vui lòng chuyển sang tab "Ảnh mẫu", "Webcam AI" hoặc "Video AI" để quét số đo thực tế trước khi lưu hồ sơ.'
      });
      return;
    }

    setSyncState('saving');
    
    const formattedName = customerName.trim() || 'Khách Vãng Lai';
    const formattedPhone = customerPhone.trim();

    let sessionToSave: MeasurementSession | null = null;
    let isExistingUpdate = false;

    setHistory(prev => {
      // Find existing customer session by phone (if provided) or by name
      const existingIndex = prev.findIndex(item => {
        if (formattedPhone && item.customer_phone) {
          return item.customer_phone.trim() === formattedPhone;
        }
        return item.customer_name.trim().toLowerCase() === formattedName.toLowerCase() && formattedName !== 'Khách Vãng Lai';
      });

      if (existingIndex >= 0) {
        isExistingUpdate = true;
        // Upsert: Update existing customer record in-place with latest AI measurements
        const existing = prev[existingIndex];
        sessionToSave = {
          ...existing,
          updated_at: new Date().toISOString(),
          customer_name: formattedName,
          customer_phone: formattedPhone,
          source: inputSource,
          snapshot_img: uploadedImageFront || existing.snapshot_img || '',
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
          landmarks_front: processedFrontLandmarks || existing.landmarks_front,
          landmarks_side: processedSideLandmarks || existing.landmarks_side
        };

        const updated = [...prev];
        updated[existingIndex] = sessionToSave;
        localStorage.setItem(LOCAL_STORAGE_HISTORY_KEY, JSON.stringify(updated));
        return updated;
      } else {
        // Create new customer record
        sessionToSave = {
          id: 'session_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
          created_at: new Date().toISOString(),
          customer_name: formattedName,
          customer_phone: formattedPhone,
          source: inputSource,
          snapshot_img: uploadedImageFront || '',
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
          landmarks_side: processedSideLandmarks
        };

        const updated = [sessionToSave, ...prev];
        localStorage.setItem(LOCAL_STORAGE_HISTORY_KEY, JSON.stringify(updated));
        return updated;
      }
    });

    setSyncState('saved');
    const now = new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
    setSavedAt(now);

    setToast({
      show: true,
      type: 'success',
      title: isExistingUpdate ? 'Đã Cập Nhật Hồ Sơ Khách Hàng!' : 'Đã Lưu Hồ Sơ Mới!',
      message: `${isExistingUpdate ? 'Đã cập nhật đè bộ số đo AI mới nhất cho' : 'Tạo mới thành công hồ sơ khách hàng'} ${formattedName} (${formattedPhone || 'Chưa nhập SĐT'}).`
    });

    // Save to backends in background
    if (sessionToSave) {
      saveBackendSession(sessionToSave as any).catch(() => {});
      saveMeasurementSession(sessionToSave as any).catch(() => {});
    }
  };

  const handlePrint = () => {
    window.print();
  };

  const handleNewCustomer = () => {
    setCustomerName('');
    setCustomerPhone('');
    setUploadedImageFront('');
    setUploadedImageSide('');
    setInputSource('mannequin');
    if (inputSource === 'webcam') {
      handleResetScan();
    } else if (inputSource === 'mannequin') {
      handleResetModel();
    }
    setSyncState('idle');
  };

  return (
    <div className="app-container">
      {/* Floating Toast Notification Alert */}
      {toast.show && (
        <div style={{
          position: 'fixed',
          top: '24px',
          left: '50%',
          transform: 'translateX(-50%)',
          zIndex: 99999,
          background: 'rgba(15, 23, 42, 0.96)',
          backdropFilter: 'blur(10px)',
          WebkitBackdropFilter: 'blur(10px)',
          border: toast.type === 'warning' ? '1.5px solid #eab308' : '1.5px solid #22c55e',
          borderRadius: '12px',
          padding: '12px 20px',
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          boxShadow: '0 12px 32px rgba(0, 0, 0, 0.5)',
          maxWidth: '480px',
          color: '#ffffff',
          pointerEvents: 'auto'
        }}>
          <div style={{ fontSize: '1.4rem', lineHeight: 1 }}>
            {toast.type === 'warning' ? '⚠️' : '🟢'}
          </div>
          <div style={{ flex: 1 }}>
            <strong style={{ display: 'block', fontSize: '0.85rem', color: toast.type === 'warning' ? '#fef08a' : '#4ade80', marginBottom: '2px' }}>
              {toast.title}
            </strong>
            <span style={{ fontSize: '0.74rem', color: '#cbd5e1', lineHeight: 1.4 }}>
              {toast.message}
            </span>
          </div>
          <button
            type="button"
            onClick={() => setToast(prev => ({ ...prev, show: false }))}
            style={{
              background: 'none',
              border: 'none',
              color: '#94a3b8',
              cursor: 'pointer',
              fontSize: '1.1rem',
              padding: '2px 6px',
              marginLeft: '4px'
            }}
          >
            ✕
          </button>
        </div>
      )}

      {/* Header */}
      <header className="app-header">
        <div className="header-logo-group">
          <Activity className="pulse-logo" />
          <div>
            <h1>FASHIONFIT AI</h1>
            <p className="subtitle">Hệ Thống Đo Đạc Hình Thể Tự Động Nhân Trắc Học 3D</p>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
          <button
            type="button"
            onClick={handleNewCustomer}
            style={{
              background: 'linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)',
              color: '#ffffff',
              border: 'none',
              borderRadius: 'var(--radius-sm)',
              padding: '0.45rem 0.85rem',
              fontSize: '0.78rem',
              fontWeight: 700,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '5px',
              boxShadow: '0 2px 8px rgba(37, 99, 235, 0.35)'
            }}
            title="Tạo phiên đo mới cho khách hàng tiếp theo"
          >
            <UserPlus size={16} />
            <span>➕ Đo Khách Hàng Mới</span>
          </button>

          <button
            type="button"
            className="history-toggle-btn"
            onClick={() => setIsHistoryOpen(true)}
          >
            <HistoryIcon size={16} />
            <span>Lịch Sử Đo ({history.length})</span>
          </button>
        </div>
      </header>

      {/* Main layout */}
      <main className="main-content">
        <div className={`left-column ${activeMobileTab === 'input' ? 'mobile-visible' : 'mobile-hidden'}`}>
          <InputForm
            input={input}
            onChange={setInput}
            referencePixels={referencePixels}
            onReferencePixelsChange={setReferencePixels}
            inputSource={inputSource}
            onResetModel={handleResetModel}
            customerName={customerName}
            onCustomerNameChange={setCustomerName}
            customerPhone={customerPhone}
            onCustomerPhoneChange={setCustomerPhone}
            onNewCustomer={handleNewCustomer}
            onSave={handleSaveSession}
          />
        </div>

        <div className={`center-column ${(activeMobileTab === '3d' || activeMobileTab === 'scan') ? 'mobile-visible' : 'mobile-hidden'}`}>
          <BodyCanvas
            gender={input.gender}
            weight={input.weight}
            scaleFactor={scale}
            landmarks={view === 'front' ? processedFrontLandmarks : processedSideLandmarks}
            onLandmarkChange={handleLandmarkChange}
            onLandmarksBatchChange={handleLandmarksBatchChange}
            onResetLandmarks={handleResetLandmarks}
            onResetModel={handleResetModel}
            view={view}
            onViewChange={setView}
            uploadedImage={view === 'front' ? uploadedImageFront : uploadedImageSide}
            onImageUpload={handleImageUpload}
            onClearImage={handleClearImage}
            warning={anatomicalWarning}
            measurements={measurements}
            recommendation={recommendation}
            inputSource={inputSource}
            onInputSourceChange={handleInputSourceChange}
            scanRange={input.scanRange}
            isScanned={scannedSources[inputSource] ?? true}
            onScanComplete={handleScanComplete}
            onResetScan={handleResetScan}
          />
        </div>

        <div className={`right-column ${activeMobileTab === 'result' ? 'mobile-visible' : 'mobile-hidden'}`}>
          <ResultPanel
            gender={input.gender}
            weight={input.weight}
            measurements={measurements}
            recommendation={recommendation}
            onPrint={handlePrint}
            view={view}
            syncState={syncState}
            savedAt={savedAt}
            sizeSystem={input.sizeSystem}
            isScanned={scannedSources[inputSource] ?? true}
            inputSource={inputSource}
            customerName={customerName}
            customerPhone={customerPhone}
          />
        </div>
      </main>

      {/* Floating Glassmorphism Mobile Bottom Navigation Bar */}
      <nav className="mobile-bottom-nav">
        <button
          type="button"
          className={`mobile-nav-btn ${activeMobileTab === '3d' ? 'active' : ''}`}
          onClick={() => setActiveMobileTab('3d')}
        >
          <Layers size={18} />
          <span>Mô Hình 3D</span>
        </button>

        <button
          type="button"
          className={`mobile-nav-btn ${activeMobileTab === 'input' ? 'active' : ''}`}
          onClick={() => setActiveMobileTab('input')}
        >
          <Sliders size={18} />
          <span>Nhập Liệu</span>
        </button>

        <button
          type="button"
          className={`mobile-nav-btn ${activeMobileTab === 'scan' ? 'active' : ''}`}
          onClick={() => setActiveMobileTab('scan')}
        >
          <Camera size={18} />
          <span>Quét AI</span>
        </button>

        <button
          type="button"
          className={`mobile-nav-btn ${activeMobileTab === 'result' ? 'active' : ''}`}
          onClick={() => setActiveMobileTab('result')}
        >
          <Shirt size={18} />
          <span>Kết Quả Size</span>
        </button>
      </nav>

      {/* Slide-out History Drawer */}
      <div className={`history-drawer ${isHistoryOpen ? 'open' : ''}`}>
        <div className="drawer-header" style={{ flexDirection: 'column', gap: '0.6rem', alignItems: 'stretch', padding: '1rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div className="drawer-title-group" style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', minWidth: 0 }}>
              <HistoryIcon size={18} style={{ color: '#38bdf8', flexShrink: 0 }} />
              <h3 style={{ margin: 0, fontSize: '0.9rem', fontWeight: 700, color: '#f8fafc', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                Hồ Sơ & Lịch Sử Đo ({history.length})
              </h3>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              {history.length > 0 && (
                <button
                  type="button"
                  onClick={() => setShowClearAllConfirm(true)}
                  style={{
                    background: 'rgba(239, 68, 68, 0.15)',
                    border: '1px solid rgba(239, 68, 68, 0.35)',
                    color: '#f87171',
                    borderRadius: 'var(--radius-sm)',
                    padding: '0.25rem 0.55rem',
                    fontSize: '0.68rem',
                    fontWeight: 600,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '3px'
                  }}
                  title="Xóa toàn bộ lịch sử đo đạc"
                >
                  <Trash2 size={11} />
                  <span>Xóa Tất Cả</span>
                </button>
              )}
              <button className="drawer-close-btn" onClick={() => setIsHistoryOpen(false)}>
                <X size={18} />
              </button>
            </div>
          </div>

          {/* Search Bar & Source Filters */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem', marginTop: '0.2rem' }}>
            <input
              type="text"
              placeholder="🔍 Tìm theo tên khách, SĐT, size (M/L/Savani), ngày đo..."
              value={historySearchQuery}
              onChange={(e) => setHistorySearchQuery(e.target.value)}
              style={{
                width: '100%',
                background: 'rgba(15, 23, 42, 0.6)',
                border: '1px solid rgba(255, 255, 255, 0.15)',
                borderRadius: 'var(--radius-sm)',
                padding: '0.4rem 0.65rem',
                fontSize: '0.72rem',
                color: '#f8fafc',
                outline: 'none'
              }}
            />
            <div style={{ display: 'flex', gap: '3px', overflowX: 'auto', paddingBottom: '2px' }}>
              {[
                { id: 'all', label: 'Tất cả' },
                { id: 'webcam', label: '📹 Webcam AI' },
                { id: 'image', label: '📷 Ảnh chụp' },
                { id: 'mannequin', label: '🌐 Mô hình 3D' },
                { id: 'video', label: '🎥 Video' },
              ].map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setHistorySourceFilter(tab.id)}
                  style={{
                    background: historySourceFilter === tab.id ? 'rgba(56, 189, 248, 0.25)' : 'rgba(15, 23, 42, 0.4)',
                    border: `1px solid ${historySourceFilter === tab.id ? '#38bdf8' : 'rgba(255, 255, 255, 0.08)'}`,
                    color: historySourceFilter === tab.id ? '#38bdf8' : '#94a3b8',
                    borderRadius: '12px',
                    padding: '0.2rem 0.5rem',
                    fontSize: '0.64rem',
                    fontWeight: 600,
                    cursor: 'pointer',
                    whiteSpace: 'nowrap'
                  }}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Clear All Confirmation Modal */}
        {showClearAllConfirm && (
          <div style={{
            padding: '0.75rem 1rem',
            background: 'rgba(239, 68, 68, 0.12)',
            borderBottom: '1px solid rgba(239, 68, 68, 0.3)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '0.5rem'
          }}>
            <span style={{ fontSize: '0.72rem', color: '#fca5a5', fontWeight: 600 }}>
              ⚠️ Xóa TOÀN BỘ {history.length} phiên đo lịch sử?
            </span>
            <div style={{ display: 'flex', gap: '4px' }}>
              <button
                type="button"
                onClick={handleClearAllHistory}
                style={{ background: '#ef4444', color: '#fff', border: 'none', borderRadius: '4px', padding: '0.25rem 0.5rem', fontSize: '0.68rem', fontWeight: 700, cursor: 'pointer' }}
              >
                Đồng Ý Xóa
              </button>
              <button
                type="button"
                onClick={() => setShowClearAllConfirm(false)}
                style={{ background: 'rgba(255,255,255,0.1)', color: '#cbd5e1', border: 'none', borderRadius: '4px', padding: '0.25rem 0.5rem', fontSize: '0.68rem', cursor: 'pointer' }}
              >
                Hủy
              </button>
            </div>
          </div>
        )}

        <div className="drawer-content">
          {history.length === 0 ? (
            <div className="history-empty">
              <Clock size={32} />
              <p>Chưa có phiên đo nào được lưu.</p>
              <span>Thực hiện thay đổi số đo hoặc quét AI để hệ thống tự động lưu vào cơ sở dữ liệu.</span>
            </div>
          ) : (() => {
            const filtered = history.filter(session => {
              if (historySourceFilter !== 'all' && (session.source || 'mannequin') !== historySourceFilter) {
                return false;
              }
              if (historySearchQuery.trim()) {
                const q = historySearchQuery.toLowerCase();
                const nameMatch = (session.customer_name || '').toLowerCase().includes(q);
                const phoneMatch = (session.customer_phone || '').toLowerCase().includes(q);
                const sizeMatch = (session.recommended_size || '').toLowerCase().includes(q);
                const genderMatch = (session.gender === 'male' ? 'nam' : 'nữ').includes(q);
                const dateMatch = (session.created_at || '').includes(q);
                return nameMatch || phoneMatch || sizeMatch || genderMatch || dateMatch;
              }
              return true;
            });

            if (filtered.length === 0) {
              return (
                <div className="history-empty" style={{ padding: '2rem 1rem' }}>
                  <Clock size={28} />
                  <p style={{ fontSize: '0.82rem' }}>Không tìm thấy phiên đo phù hợp.</p>
                  <span style={{ fontSize: '0.72rem' }}>Thử tìm từ khóa khác hoặc chuyển tab bộ lọc.</span>
                </div>
              );
            }

            return (
              <>
                <div className="history-list" style={{ paddingBottom: selectedCompareIds.length === 2 ? '60px' : '0' }}>
                  {filtered.map((session) => {
                    const dateObj = session.created_at ? new Date(session.created_at) : new Date();
                    const fullDateStr = session.created_at
                      ? `${dateObj.getHours().toString().padStart(2, '0')}:${dateObj.getMinutes().toString().padStart(2, '0')}:${dateObj.getSeconds().toString().padStart(2, '0')} - ${dateObj.getDate().toString().padStart(2, '0')}/${(dateObj.getMonth() + 1).toString().padStart(2, '0')}/${dateObj.getFullYear()}`
                      : 'Không rõ';

                    const source = session.source || 'mannequin';
                    const getSourceBadge = () => {
                      if (source === 'webcam') return { label: '📹 Webcam AI', bg: 'rgba(34, 197, 94, 0.15)', color: '#4ade80', border: 'rgba(34, 197, 94, 0.3)' };
                      if (source === 'image') return { label: '📷 Ảnh Chụp AI', bg: 'rgba(168, 85, 247, 0.15)', color: '#c084fc', border: 'rgba(168, 85, 247, 0.3)' };
                      if (source === 'video') return { label: '🎥 Video AI', bg: 'rgba(249, 115, 22, 0.15)', color: '#fb923c', border: 'rgba(249, 115, 22, 0.3)' };
                      return { label: '🌐 Mô Hình 3D', bg: 'rgba(56, 189, 248, 0.15)', color: '#38bdf8', border: 'rgba(56, 189, 248, 0.3)' };
                    };
                    const badge = getSourceBadge();

                    return (
                      <div
                        key={session.id}
                        className={`history-item-card ${deletingSessionId === session.id ? 'deleting' : ''}`}
                        onClick={() => deletingSessionId !== session.id && handleLoadSession(session)}
                        style={{ position: 'relative', border: '1px solid rgba(56, 189, 248, 0.25)', borderRadius: 'var(--radius-md)', marginBottom: '0.75rem', background: '#0f172a', overflow: 'hidden' }}
                      >
                        {deletingSessionId === session.id && (
                          <div className="card-delete-confirm-overlay" onClick={(e) => e.stopPropagation()}>
                            <p style={{ color: '#f8fafc', fontWeight: 700 }}>Xóa phiên đo này?</p>
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
                                style={{ background: 'rgba(255,255,255,0.1)', color: '#cbd5e1' }}
                              >
                                Hủy
                              </button>
                            </div>
                          </div>
                        )}

                        <div className="item-header" style={{ padding: '0.55rem 0.8rem', background: 'rgba(30, 41, 59, 0.9)', borderBottom: '1px solid rgba(255, 255, 255, 0.08)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }} onClick={(e) => e.stopPropagation()}>
                            <input
                              type="checkbox"
                              checked={selectedCompareIds.includes(session.id!)}
                              onChange={() => handleToggleCompare(session.id!)}
                              style={{ cursor: 'pointer', accentColor: '#38bdf8' }}
                              title="Chọn để so sánh 2 phiên đo"
                            />
                            <span className="item-time" style={{ fontSize: '0.7rem', fontWeight: 700, color: '#38bdf8' }}>
                              📅 {fullDateStr}
                            </span>
                          </div>
                          <button
                            className="item-delete-btn"
                            onClick={(e) => {
                              e.stopPropagation();
                              setDeletingSessionId(session.id!);
                            }}
                            title="Xóa phiên đo này"
                            style={{ background: 'none', border: 'none', color: '#f87171', cursor: 'pointer', padding: '2px' }}
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>

                        <div className="item-body" style={{ padding: '0.75rem 0.8rem', background: '#0f172a' }}>
                          {/* Source & Customer Name Row */}
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem', flexWrap: 'wrap', gap: '4px' }}>
                            <span style={{
                              background: badge.bg,
                              color: badge.color,
                              border: `1px solid ${badge.border}`,
                              borderRadius: '12px',
                              padding: '0.2rem 0.55rem',
                              fontSize: '0.64rem',
                              fontWeight: 700
                            }}>
                              {badge.label}
                            </span>

                            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                              <span className={`gender-badge ${session.gender}`} style={{ fontSize: '0.64rem', padding: '0.18rem 0.45rem', fontWeight: 700 }}>
                                {session.gender === 'male' ? 'Nam' : 'Nữ'}
                              </span>
                              <span className="size-badge-small" style={{ fontSize: '0.68rem', fontWeight: 800, background: 'rgba(56, 189, 248, 0.25)', color: '#38bdf8', padding: '0.18rem 0.5rem', borderRadius: '4px', border: '1px solid rgba(56, 189, 248, 0.4)' }}>
                                {session.recommended_size}
                              </span>
                            </div>
                          </div>

                          <div style={{
                            fontSize: '0.78rem',
                            color: '#38bdf8',
                            fontWeight: 700,
                            marginBottom: '0.5rem',
                            background: 'rgba(56, 189, 248, 0.12)',
                            border: '1px solid rgba(56, 189, 248, 0.3)',
                            padding: '0.35rem 0.65rem',
                            borderRadius: '6px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between'
                          }}>
                            <span>👤 KH: <strong>{session.customer_name || 'Khách Vãng Lai'}</strong></span>
                            {session.customer_phone ? <span>📞 {session.customer_phone}</span> : <span style={{ opacity: 0.6, fontSize: '0.7rem' }}>Chưa có SĐT</span>}
                          </div>

                          <div className="item-metrics" style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '0.4rem', fontSize: '0.74rem', color: '#e2e8f0' }}>
                            <div>
                              <span style={{ color: '#94a3b8' }}>Cao: </span>
                              <strong style={{ color: '#ffffff' }}>{session.height_cm}cm</strong>
                            </div>
                            <div>
                              <span style={{ color: '#94a3b8' }}>Nặng: </span>
                              <strong style={{ color: '#ffffff' }}>{session.weight_kg}kg</strong>
                            </div>
                            <div>
                              <span style={{ color: '#94a3b8' }}>Vai: </span>
                              <strong style={{ color: '#ffffff' }}>{session.shoulder_width_cm}cm</strong>
                            </div>
                            <div>
                              <span style={{ color: '#94a3b8' }}>Tay: </span>
                              <strong style={{ color: '#ffffff' }}>{session.arm_length_cm}cm</strong>
                            </div>
                            <div>
                              <span style={{ color: '#94a3b8' }}>Ngực: </span>
                              <strong style={{ color: '#ffffff' }}>{session.bust_cm}cm</strong>
                            </div>
                            <div>
                              <span style={{ color: '#94a3b8' }}>Eo: </span>
                              <strong style={{ color: '#ffffff' }}>{session.waist_cm}cm</strong>
                            </div>
                          </div>
                        </div>

                        <div className="item-action" style={{ padding: '0.5rem 0.8rem', background: '#020617', borderTop: '1px solid rgba(255, 255, 255, 0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', fontSize: '0.72rem', color: '#38bdf8', fontWeight: 700, cursor: 'pointer' }}>
                          <FolderOpen size={13} />
                          <span>Bấm để tải lại số đo & mô hình 3D</span>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {selectedCompareIds.length === 2 && (
                  <div className="drawer-compare-bar" style={{ padding: '0.75rem 1rem', background: 'rgba(30, 41, 59, 0.95)', borderTop: '1px solid rgba(255, 255, 255, 0.1)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem', position: 'sticky', bottom: 0, left: 0, right: 0, zIndex: 10 }}>
                    <span style={{ fontSize: '0.75rem', color: '#cbd5e1' }}>Đã chọn 2 phiên đo</span>
                    <button 
                      type="button" 
                      onClick={() => setIsCompareModalOpen(true)}
                      style={{ background: '#38bdf8', color: '#0f172a', border: 'none', padding: '0.4rem 0.75rem', borderRadius: 'var(--radius-sm)', fontSize: '0.7rem', fontWeight: 700, cursor: 'pointer' }}
                    >
                      📊 So Sánh Vóc Dáng
                    </button>
                  </div>
                )}
              </>
            );
          })()}
        </div>
      </div>

      {/* Drawer Overlay */}
      {isHistoryOpen && (
        <div className="drawer-overlay" onClick={() => setIsHistoryOpen(false)} />
      )}

      {/* Comparison Modal */}
      {isCompareModalOpen && (() => {
        const sessionA = history.find(s => s.id === selectedCompareIds[0]);
        const sessionB = history.find(s => s.id === selectedCompareIds[1]);
        if (!sessionA || !sessionB) return null;

        const dateA = sessionA.created_at ? new Date(sessionA.created_at).toLocaleDateString('vi-VN') : 'Không rõ';
        const dateB = sessionB.created_at ? new Date(sessionB.created_at).toLocaleDateString('vi-VN') : 'Không rõ';

        const lFrontA = parseLandmarks(sessionA.landmarks_front) || [];
        const lFrontB = parseLandmarks(sessionB.landmarks_front) || [];

        const scaleA = (sessionA.reference_pixels && sessionA.height_cm) ? sessionA.height_cm / sessionA.reference_pixels : 0.26;
        const scaleB = (sessionB.reference_pixels && sessionB.height_cm) ? sessionB.height_cm / sessionB.reference_pixels : 0.26;

        const renderDelta = (valA: number, valB: number, unit = 'cm') => {
          const diff = valB - valA;
          if (diff > 0) return <span style={{ color: '#ef4444', fontWeight: 600 }}>+{diff.toFixed(1)} {unit}</span>;
          if (diff < 0) return <span style={{ color: '#22c55e', fontWeight: 600 }}>{diff.toFixed(1)} {unit}</span>;
          return <span style={{ color: '#94a3b8' }}>0 {unit}</span>;
        };

        return (
          <div className="compare-modal-overlay" style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(15, 23, 42, 0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10000, padding: '1.5rem', backdropFilter: 'blur(8px)' }}>
            <div className="compare-modal-card" style={{ backgroundColor: '#1e293b', border: '1px solid rgba(255, 255, 255, 0.1)', borderRadius: 'var(--radius-lg)', width: '100%', maxWidth: '850px', maxHeight: '90vh', display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.5)' }}>
              <div className="compare-header" style={{ padding: '1rem 1.5rem', borderBottom: '1px solid rgba(255, 255, 255, 0.08)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700, color: '#f8fafc', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  📊 So Sánh Sự Biến Đổi Hình Thể 3D
                </h3>
                <button 
                  className="compare-close-btn" 
                  onClick={() => setIsCompareModalOpen(false)}
                  style={{ background: 'transparent', border: 'none', color: '#94a3b8', fontSize: '1.25rem', cursor: 'pointer', hover: { color: '#f8fafc' } } as any}
                >
                  ✕
                </button>
              </div>

              <div className="compare-body" style={{ padding: '1.5rem', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                <div className="compare-visuals-row" style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '1.5rem' }}>
                  <div className="compare-visual-col" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.75rem' }}>
                    <div className="session-title-card" style={{ width: '100%', padding: '0.6rem 0.8rem', backgroundColor: 'rgba(15, 23, 42, 0.3)', borderRadius: 'var(--radius-md)', border: '1px solid rgba(255, 255, 255, 0.05)', textAlign: 'center' }}>
                      <span className="date-badge" style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, color: '#38bdf8', marginBottom: '0.2rem' }}>Lần 1: {dateA}</span>
                      <span className="info-text" style={{ fontSize: '0.68rem', color: '#94a3b8' }}>{sessionA.weight_kg} kg | {sessionA.height_cm} cm | Size: {sessionA.recommended_size}</span>
                    </div>
                    <div className="compare-mannequin-container" style={{ width: '200px', height: '320px', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
                      <Mannequin3DView
                        gender={sessionA.gender}
                        weight={sessionA.weight_kg}
                        scaleFactor={scaleA}
                        landmarks={lFrontA}
                        rotationAngle={rotationCompare}
                        meshStyle="neon"
                        width={200}
                        height={320}
                        scanRange={sessionA.inseam_cm > 0 ? 'full' : 'half'}
                        measurements={{
                          height: sessionA.height_cm,
                          shoulderWidth: sessionA.shoulder_width_cm,
                          armLength: sessionA.arm_length_cm,
                          legLength: sessionA.inseam_cm,
                          chestCircumference: sessionA.bust_cm,
                          waistCircumference: sessionA.waist_cm,
                          hipCircumference: sessionA.hip_cm,
                          neckCircumference: sessionA.bust_cm * (sessionA.gender === 'female' ? 0.38 : 0.41),
                          thighCircumference: sessionA.hip_cm * (sessionA.gender === 'female' ? 0.58 : 0.55),
                          calfCircumference: sessionA.hip_cm * 0.38,
                          ankleCircumference: sessionA.hip_cm * 0.22,
                          chestDepth: sessionA.bust_depth_cm,
                          waistDepth: sessionA.waist_depth_cm,
                          hipDepth: sessionA.hip_depth_cm
                        }}
                      />
                    </div>
                  </div>

                  <div className="compare-visual-col" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.75rem' }}>
                    <div className="session-title-card" style={{ width: '100%', padding: '0.6rem 0.8rem', backgroundColor: 'rgba(15, 23, 42, 0.3)', borderRadius: 'var(--radius-md)', border: '1px solid rgba(255, 255, 255, 0.05)', textAlign: 'center' }}>
                      <span className="date-badge active" style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, color: '#f43f5e', marginBottom: '0.2rem' }}>Lần 2: {dateB}</span>
                      <span className="info-text" style={{ fontSize: '0.68rem', color: '#94a3b8' }}>{sessionB.weight_kg} kg | {sessionB.height_cm} cm | Size: {sessionB.recommended_size}</span>
                    </div>
                    <div className="compare-mannequin-container" style={{ width: '200px', height: '320px', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
                      <Mannequin3DView
                        gender={sessionB.gender}
                        weight={sessionB.weight_kg}
                        scaleFactor={scaleB}
                        landmarks={lFrontB}
                        rotationAngle={rotationCompare}
                        meshStyle="neon"
                        width={200}
                        height={320}
                        scanRange={sessionB.inseam_cm > 0 ? 'full' : 'half'}
                        measurements={{
                          height: sessionB.height_cm,
                          shoulderWidth: sessionB.shoulder_width_cm,
                          armLength: sessionB.arm_length_cm,
                          legLength: sessionB.inseam_cm,
                          chestCircumference: sessionB.bust_cm,
                          waistCircumference: sessionB.waist_cm,
                          hipCircumference: sessionB.hip_cm,
                          neckCircumference: sessionB.bust_cm * (sessionB.gender === 'female' ? 0.38 : 0.41),
                          thighCircumference: sessionB.hip_cm * (sessionB.gender === 'female' ? 0.58 : 0.55),
                          calfCircumference: sessionB.hip_cm * 0.38,
                          ankleCircumference: sessionB.hip_cm * 0.22,
                          chestDepth: sessionB.bust_depth_cm,
                          waistDepth: sessionB.waist_depth_cm,
                          hipDepth: sessionB.hip_depth_cm
                        }}
                      />
                    </div>
                  </div>
                </div>

                <div className="rotation-slider-wrapper" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.35rem', backgroundColor: 'rgba(15, 23, 42, 0.2)', padding: '0.5rem 1rem', borderRadius: 'var(--radius-sm)' }}>
                  <label style={{ fontSize: '0.72rem', color: '#cbd5e1', fontWeight: 500 }}>Xoay 3D Đồng Bộ: {rotationCompare}°</label>
                  <input 
                    type="range" 
                    min="0" 
                    max="360" 
                    value={rotationCompare} 
                    onChange={(e) => setRotationCompare(parseInt(e.target.value))} 
                    style={{ width: '50%', cursor: 'pointer', accentColor: '#38bdf8' }}
                  />
                </div>

                <div className="compare-table-wrapper" style={{ border: '1px solid rgba(255, 255, 255, 0.06)', borderRadius: 'var(--radius-md)', overflow: 'hidden' }}>
                  <table className="compare-table" style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.75rem', textAlign: 'left' }}>
                    <thead>
                      <tr style={{ backgroundColor: 'rgba(15, 23, 42, 0.4)', borderBottom: '1px solid rgba(255, 255, 255, 0.08)' }}>
                        <th style={{ padding: '0.6rem 0.8rem', color: '#94a3b8', fontWeight: 600 }}>Chỉ số đo</th>
                        <th style={{ padding: '0.6rem 0.8rem', color: '#f8fafc', fontWeight: 600 }}>Lần 1 ({dateA.split(' ')[0]})</th>
                        <th style={{ padding: '0.6rem 0.8rem', color: '#f8fafc', fontWeight: 600 }}>Lần 2 ({dateB.split(' ')[0]})</th>
                        <th style={{ padding: '0.6rem 0.8rem', color: '#38bdf8', fontWeight: 600 }}>Biến động</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.04)' }}>
                        <td style={{ padding: '0.55rem 0.8rem', color: '#cbd5e1' }}>Cân nặng</td>
                        <td style={{ padding: '0.55rem 0.8rem', color: '#f8fafc', fontWeight: 600 }}>{sessionA.weight_kg} kg</td>
                        <td style={{ padding: '0.55rem 0.8rem', color: '#f8fafc', fontWeight: 600 }}>{sessionB.weight_kg} kg</td>
                        <td style={{ padding: '0.55rem 0.8rem' }}>{renderDelta(sessionA.weight_kg, sessionB.weight_kg, 'kg')}</td>
                      </tr>
                      <tr style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.04)' }}>
                        <td style={{ padding: '0.55rem 0.8rem', color: '#cbd5e1' }}>Chiều cao</td>
                        <td style={{ padding: '0.55rem 0.8rem', color: '#f8fafc', fontWeight: 600 }}>{sessionA.height_cm.toFixed(1)} cm</td>
                        <td style={{ padding: '0.55rem 0.8rem', color: '#f8fafc', fontWeight: 600 }}>{sessionB.height_cm.toFixed(1)} cm</td>
                        <td style={{ padding: '0.55rem 0.8rem' }}>{renderDelta(sessionA.height_cm, sessionB.height_cm)}</td>
                      </tr>
                      <tr style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.04)' }}>
                        <td style={{ padding: '0.55rem 0.8rem', color: '#cbd5e1' }}>Vòng ngực</td>
                        <td style={{ padding: '0.55rem 0.8rem', color: '#f8fafc', fontWeight: 600 }}>{sessionA.bust_cm.toFixed(1)} cm</td>
                        <td style={{ padding: '0.55rem 0.8rem', color: '#f8fafc', fontWeight: 600 }}>{sessionB.bust_cm.toFixed(1)} cm</td>
                        <td style={{ padding: '0.55rem 0.8rem' }}>{renderDelta(sessionA.bust_cm, sessionB.bust_cm)}</td>
                      </tr>
                      <tr style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.04)' }}>
                        <td style={{ padding: '0.55rem 0.8rem', color: '#cbd5e1' }}>Vòng eo</td>
                        <td style={{ padding: '0.55rem 0.8rem', color: '#f8fafc', fontWeight: 600 }}>{sessionA.waist_cm.toFixed(1)} cm</td>
                        <td style={{ padding: '0.55rem 0.8rem', color: '#f8fafc', fontWeight: 600 }}>{sessionB.waist_cm.toFixed(1)} cm</td>
                        <td style={{ padding: '0.55rem 0.8rem' }}>{renderDelta(sessionA.waist_cm, sessionB.waist_cm)}</td>
                      </tr>
                      <tr style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.04)' }}>
                        <td style={{ padding: '0.55rem 0.8rem', color: '#cbd5e1' }}>Vòng mông</td>
                        <td style={{ padding: '0.55rem 0.8rem', color: '#f8fafc', fontWeight: 600 }}>{sessionA.hip_cm.toFixed(1)} cm</td>
                        <td style={{ padding: '0.55rem 0.8rem', color: '#f8fafc', fontWeight: 600 }}>{sessionB.hip_cm.toFixed(1)} cm</td>
                        <td style={{ padding: '0.55rem 0.8rem' }}>{renderDelta(sessionA.hip_cm, sessionB.hip_cm)}</td>
                      </tr>
                      <tr style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.04)' }}>
                        <td style={{ padding: '0.55rem 0.8rem', color: '#cbd5e1' }}>Rộng vai</td>
                        <td style={{ padding: '0.55rem 0.8rem', color: '#f8fafc', fontWeight: 600 }}>{sessionA.shoulder_width_cm.toFixed(1)} cm</td>
                        <td style={{ padding: '0.55rem 0.8rem', color: '#f8fafc', fontWeight: 600 }}>{sessionB.shoulder_width_cm.toFixed(1)} cm</td>
                        <td style={{ padding: '0.55rem 0.8rem' }}>{renderDelta(sessionA.shoulder_width_cm, sessionB.shoulder_width_cm)}</td>
                      </tr>
                      <tr style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.04)' }}>
                        <td style={{ padding: '0.55rem 0.8rem', color: '#cbd5e1' }}>Dài tay</td>
                        <td style={{ padding: '0.55rem 0.8rem', color: '#f8fafc', fontWeight: 600 }}>{sessionA.arm_length_cm.toFixed(1)} cm</td>
                        <td style={{ padding: '0.55rem 0.8rem', color: '#f8fafc', fontWeight: 600 }}>{sessionB.arm_length_cm.toFixed(1)} cm</td>
                        <td style={{ padding: '0.55rem 0.8rem' }}>{renderDelta(sessionA.arm_length_cm, sessionB.arm_length_cm)}</td>
                      </tr>
                      <tr style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.04)' }}>
                        <td style={{ padding: '0.55rem 0.8rem', color: '#cbd5e1' }}>Dài chân (Inseam)</td>
                        <td style={{ padding: '0.55rem 0.8rem', color: '#f8fafc', fontWeight: 600 }}>{sessionA.inseam_cm.toFixed(1)} cm</td>
                        <td style={{ padding: '0.55rem 0.8rem', color: '#f8fafc', fontWeight: 600 }}>{sessionB.inseam_cm.toFixed(1)} cm</td>
                        <td style={{ padding: '0.55rem 0.8rem' }}>{renderDelta(sessionA.inseam_cm, sessionB.inseam_cm)}</td>
                      </tr>
                      <tr>
                        <td style={{ padding: '0.55rem 0.8rem', color: '#cbd5e1' }}>Gợi ý Size</td>
                        <td style={{ padding: '0.55rem 0.8rem' }}><span className="compare-size-tag" style={{ padding: '0.2rem 0.4rem', backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: '3px', fontWeight: 700, color: '#f8fafc' }}>{sessionA.recommended_size}</span></td>
                        <td style={{ padding: '0.55rem 0.8rem' }}><span className="compare-size-tag active" style={{ padding: '0.2rem 0.4rem', backgroundColor: 'rgba(56, 189, 248, 0.15)', borderRadius: '3px', fontWeight: 700, color: '#38bdf8' }}>{sessionB.recommended_size}</span></td>
                        <td style={{ padding: '0.55rem 0.8rem' }}>
                          {sessionA.recommended_size === sessionB.recommended_size ? (
                            <span style={{ color: '#94a3b8' }}>Giữ nguyên</span>
                          ) : (
                            <span style={{ color: '#38bdf8', fontWeight: 600 }}>{sessionA.recommended_size} → {sessionB.recommended_size}</span>
                          )}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Footer */}
      <footer className="app-footer">
        <p>© 2026 FashionFit AI Project. Xây dựng bởi Sinh viên Nghiên cứu Khoa học & Kỹ thuật May mặc.</p>
      </footer>
    </div>
  );
}

export default App;
