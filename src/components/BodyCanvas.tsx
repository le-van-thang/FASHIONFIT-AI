import React, { useState, useRef, useEffect, useMemo } from 'react';
import type { Landmark, Gender, BodyMeasurements, SizeRecommendation } from '../types';
import { RefreshCw, Maximize2, Minimize2, Camera, CameraOff } from 'lucide-react';
import { formatHeightMeters } from '../utils/anthropometry';

interface BodyCanvasProps {
  gender: Gender;
  weight: number;
  scaleFactor: number;
  landmarks: Landmark[];
  onLandmarkChange: (id: string, x: number, y: number) => void;
  onResetLandmarks?: () => void;
  view: 'front' | 'side';
  onViewChange: (view: 'front' | 'side') => void;
  uploadedImage: string | null;
  onImageUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
  warning: string | null;
  measurements?: BodyMeasurements;
  recommendation?: SizeRecommendation;
  inputSource: 'mannequin' | 'image' | 'webcam' | 'video';
  onInputSourceChange: (source: 'mannequin' | 'image' | 'webcam' | 'video') => void;
  scanRange?: 'full' | 'half';
}

export const BodyCanvas: React.FC<BodyCanvasProps> = ({
  gender,
  weight,
  scaleFactor,
  landmarks,
  onLandmarkChange,
  onResetLandmarks,
  view,
  onViewChange,
  uploadedImage,
  onImageUpload,
  warning,
  measurements,
  recommendation,
  inputSource,
  onInputSourceChange,
  scanRange = 'full'
}) => {
  const containerRef = useRef<SVGSVGElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const fileInputVideoRef = useRef<HTMLInputElement | null>(null);
  const [activePointId, setActivePointId] = useState<string | null>(null);
  
  // 3D rotation angle in degrees
  const [rotationAngle, setRotationAngle] = useState<number>(0);
  const [isScanning, setIsScanning] = useState<boolean>(false);
  const [isModelLoading, setIsModelLoading] = useState<boolean>(false);
  const [uploadedVideo, setUploadedVideo] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const cameraInstanceRef = useRef<any>(null);
  const poseInstanceRef = useRef<any>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // Ref to store the latest values of props/states to avoid stale closures in MediaPipe callbacks
  const trackingParamsRef = useRef({
    view,
    landmarks,
    onLandmarkChange,
    inputSource,
    scanRange
  });

  useEffect(() => {
    trackingParamsRef.current = {
      view,
      landmarks,
      onLandmarkChange,
      inputSource,
      scanRange
    };
  });

  // Helper to dynamically load MediaPipe scripts from CDN
  const loadMediaPipeScripts = (): Promise<void> => {
    return new Promise((resolve) => {
      if ((window as any).Pose && (window as any).Camera) {
        resolve();
        return;
      }

      // Check if scripts are already loading/loaded in head
      const existingCamera = document.querySelector('script[src*="camera_utils"]');
      const existingPose = document.querySelector('script[src*="pose.js"]');
      if (existingCamera && existingPose) {
        const checkInterval = setInterval(() => {
          if ((window as any).Pose && (window as any).Camera) {
            clearInterval(checkInterval);
            resolve();
          }
        }, 100);
        return;
      }

      const scriptCamera = document.createElement('script');
      scriptCamera.src = 'https://cdn.jsdelivr.net/npm/@mediapipe/camera_utils/camera_utils.js';
      scriptCamera.async = true;
      scriptCamera.onload = () => {
        const scriptPose = document.createElement('script');
        scriptPose.src = 'https://cdn.jsdelivr.net/npm/@mediapipe/pose/pose.js';
        scriptPose.async = true;
        scriptPose.onload = () => {
          resolve();
        };
        document.body.appendChild(scriptPose);
      };
      document.body.appendChild(scriptCamera);
    });
  };

  const updateLandmarksFromMediaPipe = (results: any) => {
    if (!results.poseLandmarks) return;
    const mp = results.poseLandmarks;
    const { view, landmarks, onLandmarkChange, inputSource, scanRange } = trackingParamsRef.current;

    if (view === 'front') {
      const newLandmarks = landmarks.map(l => {
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
          case 'left_knee': mpIndex = scanRange === 'half' ? -1 : 25; break;
          case 'right_knee': mpIndex = scanRange === 'half' ? -1 : 26; break;
          case 'left_ankle': mpIndex = scanRange === 'half' ? -1 : 27; break;
          case 'right_ankle': mpIndex = scanRange === 'half' ? -1 : 28; break;
        }

        if (mpIndex !== -1 && mp[mpIndex]) {
          // Mirrored if webcam
          const normalizedX = inputSource === 'webcam' ? (1 - mp[mpIndex].x) : mp[mpIndex].x;
          const xVal = normalizedX * 400;
          const yVal = mp[mpIndex].y * 650;
          return { ...l, x: Math.round(xVal), y: Math.round(yVal) };
        }
        return l;
      });

      newLandmarks.forEach(l => {
        if (l.id.includes('knee') || l.id.includes('ankle')) {
          if (scanRange === 'half') return; // Skip updating lower joints state in half mode
        }
        onLandmarkChange(l.id, l.x, l.y);
      });
    } else {
      const leftVisible = (mp[11]?.visibility || 0) + (mp[13]?.visibility || 0) + (mp[15]?.visibility || 0);
      const rightVisible = (mp[12]?.visibility || 0) + (mp[14]?.visibility || 0) + (mp[16]?.visibility || 0);
      const isLeftSide = leftVisible >= rightVisible;

      const shoulderIdx = isLeftSide ? 11 : 12;
      const elbowIdx = isLeftSide ? 13 : 14;
      const wristIdx = isLeftSide ? 15 : 16;
      const hipIdx = isLeftSide ? 23 : 24;
      const kneeIdx = isLeftSide ? 25 : 26;
      const ankleIdx = isLeftSide ? 27 : 28;

      const nose = mp[0];
      const shoulder = mp[shoulderIdx];
      const elbow = mp[elbowIdx];
      const wrist = mp[wristIdx];
      const hip = mp[hipIdx];
      const knee = mp[kneeIdx];
      const ankle = mp[ankleIdx];

      const newLandmarks = landmarks.map(l => {
        let mpPt = null;
        switch (l.id) {
          case 'nasion': mpPt = nose; break;
          case 'shoulder': mpPt = shoulder; break;
          case 'elbow': mpPt = elbow; break;
          case 'wrist': mpPt = wrist; break;
          case 'hip': mpPt = hip; break;
          case 'knee': mpPt = scanRange === 'half' ? null : knee; break;
          case 'ankle': mpPt = scanRange === 'half' ? null : ankle; break;
        }

        if (mpPt) {
          const normalizedX = inputSource === 'webcam' ? (1 - mpPt.x) : mpPt.x;
          const xVal = normalizedX * 400;
          const yVal = mpPt.y * 650;
          return { ...l, x: Math.round(xVal), y: Math.round(yVal) };
        }
        return l;
      });

      const shoulderPt = newLandmarks.find(l => l.id === 'shoulder')!;
      const hipPt = newLandmarks.find(l => l.id === 'hip')!;
      const nosePt = newLandmarks.find(l => l.id === 'nasion')!;

      const facingRight = nosePt.x > shoulderPt.x;

      const chestDepthPt = newLandmarks.find(l => l.id === 'chest_depth')!;
      const buttockDepthPt = newLandmarks.find(l => l.id === 'buttock_depth')!;

      if (chestDepthPt) {
        chestDepthPt.x = Math.round(facingRight ? shoulderPt.x + 35 : shoulderPt.x - 35);
        chestDepthPt.y = Math.round(shoulderPt.y + 35);
      }
      if (buttockDepthPt) {
        buttockDepthPt.x = Math.round(facingRight ? hipPt.x - 25 : hipPt.x + 25);
        buttockDepthPt.y = Math.round(hipPt.y + 20);
      }

      newLandmarks.forEach(l => {
        if (l.id === 'knee' || l.id === 'ankle') {
          if (scanRange === 'half') return; // Skip updating lower joints state in half mode
        }
        onLandmarkChange(l.id, l.x, l.y);
      });
    }
  };

  const startWebcam = async () => {
    setIsModelLoading(true);
    try {
      await loadMediaPipeScripts();

      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 640, height: 480, facingMode: 'user' }
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play();
      }

      if (!poseInstanceRef.current) {
        const Pose = (window as any).Pose;
        const pose = new Pose({
          locateFile: (file: string) => `https://cdn.jsdelivr.net/npm/@mediapipe/pose/${file}`
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
            updateLandmarksFromMediaPipe(results);
          }
        });

        poseInstanceRef.current = pose;
      }

      if (videoRef.current) {
        const CameraHelper = (window as any).Camera;
        const camera = new CameraHelper(videoRef.current, {
          onFrame: async () => {
            if (poseInstanceRef.current && videoRef.current && streamRef.current) {
              try {
                await poseInstanceRef.current.send({ image: videoRef.current });
              } catch (e) {
                // Ignore send errors during transitions
              }
            }
          },
          width: 640,
          height: 480
        });
        camera.start();
        cameraInstanceRef.current = camera;
      }

      setIsWebcamActive(true);
      setIsScanning(true);
    } catch (err) {
      console.error(err);
      alert("Không thể kết nối Camera. Vui lòng kiểm tra quyền truy cập webcam.");
      onInputSourceChange('mannequin');
    } finally {
      setIsModelLoading(false);
    }
  };

  const stopWebcam = () => {
    setIsScanning(false);
    setIsWebcamActive(false);
    if (cameraInstanceRef.current) {
      cameraInstanceRef.current.stop();
      cameraInstanceRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  };

  const startVideoScanning = async (file: File) => {
    setIsModelLoading(true);
    try {
      await loadMediaPipeScripts();
      const videoURL = URL.createObjectURL(file);
      setUploadedVideo(videoURL);

      if (!poseInstanceRef.current) {
        const Pose = (window as any).Pose;
        const pose = new Pose({
          locateFile: (file: string) => `https://cdn.jsdelivr.net/npm/@mediapipe/pose/${file}`
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
            updateLandmarksFromMediaPipe(results);
          }
        });

        poseInstanceRef.current = pose;
      }

      setIsScanning(true);
    } catch (err) {
      console.error(err);
      alert("Lỗi khi mở tệp video");
      onInputSourceChange('mannequin');
    } finally {
      setIsModelLoading(false);
    }
  };

  // Video Frame Loop
  useEffect(() => {
    let active = true;
    let animationFrameId: number;

    const processVideoFrame = async () => {
      if (!active) return;
      if (inputSource === 'video' && videoRef.current && !videoRef.current.paused && !videoRef.current.ended && poseInstanceRef.current && isScanning) {
        try {
          await poseInstanceRef.current.send({ image: videoRef.current });
        } catch (e) {
          // Ignore frame skip errors
        }
      }
      if (inputSource === 'video') {
        animationFrameId = requestAnimationFrame(processVideoFrame);
      }
    };

    if (inputSource === 'video' && isScanning) {
      processVideoFrame();
    }

    return () => {
      active = false;
      cancelAnimationFrame(animationFrameId);
    };
  }, [inputSource, isScanning]);

  // Input source triggers and webcam safety lifecycle
  useEffect(() => {
    if (inputSource !== 'webcam') {
      stopWebcam();
    }

    if (inputSource === 'image' && !uploadedImage) {
      fileInputRef.current?.click();
    } else if (inputSource === 'video' && !uploadedVideo) {
      fileInputVideoRef.current?.click();
    }
  }, [inputSource]);

  // Make sure to stop webcam on component unmount
  useEffect(() => {
    return () => {
      stopWebcam();
    };
  }, []);

  // Cleanup effect
  useEffect(() => {
    return () => {
      stopWebcam();
      if (uploadedVideo) {
        URL.revokeObjectURL(uploadedVideo);
      }
    };
  }, [uploadedVideo]);

  const handleVideoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    startVideoScanning(file);
  };

  // New rotation dragging states
  const [isRotating, setIsRotating] = useState<boolean>(false);
  const [meshStyle, setMeshStyle] = useState<'solid' | 'neon' | 'heatmap'>('solid');
  const [isWebcamActive, setIsWebcamActive] = useState<boolean>(false);
  const [showTiltTips, setShowTiltTips] = useState<boolean>(false);
  const [isHudOpen, setIsHudOpen] = useState<boolean>(true);
  const [isMaximized, setIsMaximized] = useState<boolean>(false);
  const [showInlineGuide, setShowInlineGuide] = useState<boolean>(false);
  const [scanProgress, setScanProgress] = useState<number>(0);
  const [scanStatus, setScanStatus] = useState<'idle' | 'scanning' | 'success'>('idle');
  const dragStartRef = useRef<{ x: number; angle: number }>({ x: 0, angle: 0 });

  // Audio Feedback Synthesizer using Web Audio API
  const playAudioBeep = (type: 'success' | 'double' = 'success') => {
    try {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioContextClass) return;
      const ctx = new AudioContextClass();
      
      if (type === 'success') {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(800, ctx.currentTime);
        gain.gain.setValueAtTime(0.08, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.15);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start();
        osc.stop(ctx.currentTime + 0.15);
      } else {
        // Double beep for complete
        const osc1 = ctx.createOscillator();
        const gain1 = ctx.createGain();
        osc1.type = 'sine';
        osc1.frequency.setValueAtTime(800, ctx.currentTime);
        gain1.gain.setValueAtTime(0.08, ctx.currentTime);
        gain1.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.1);
        osc1.connect(gain1);
        gain1.connect(ctx.destination);
        osc1.start();
        osc1.stop(ctx.currentTime + 0.1);
        
        setTimeout(() => {
          try {
            const ctx2 = new AudioContextClass();
            const osc2 = ctx2.createOscillator();
            const gain2 = ctx2.createGain();
            osc2.type = 'sine';
            osc2.frequency.setValueAtTime(1200, ctx2.currentTime);
            gain2.gain.setValueAtTime(0.08, ctx2.currentTime);
            gain2.gain.exponentialRampToValueAtTime(0.001, ctx2.currentTime + 0.25);
            osc2.connect(gain2);
            gain2.connect(ctx2.destination);
            osc2.start();
            osc2.stop(ctx2.currentTime + 0.25);
          } catch (err) {}
        }, 120);
      }
    } catch (e) {
      console.warn("AudioContext playback blocked", e);
    }
  };

  // Scanning progress & automated freezing logic
  useEffect(() => {
    let interval: ReturnType<typeof setInterval> | null = null;
    if (isScanning) {
      setScanStatus('scanning');
      interval = setInterval(() => {
        setScanProgress(prev => {
          if (prev >= 100) {
            clearInterval(interval!);
            setIsScanning(false);
            setScanStatus('success');
            playAudioBeep('double');
            return 100;
          }
          return prev + 5; // takes 4 seconds (20 * 200ms)
        });
      }, 200);
    } else {
      if (scanStatus === 'scanning') {
        setScanStatus('idle');
        setScanProgress(0);
      }
    }

    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isScanning]);

  // Reset scan state on view change
  useEffect(() => {
    setScanProgress(0);
    setScanStatus('idle');
  }, [view]);

  // SVG dimensions
  const width = 400;
  const height = 650;

  // Handle drag mechanics
  const handleMouseDown = (pointId: string) => {
    setActivePointId(pointId);
  };

  const handleCanvasMouseDown = (e: React.MouseEvent<SVGSVGElement>) => {
    const target = e.target as SVGElement;
    if (target.classList.contains('landmark-dot')) {
      return;
    }
    setIsRotating(true);
    dragStartRef.current = {
      x: e.clientX,
      angle: rotationAngle
    };
  };

  const handleCanvasTouchStart = (e: React.TouchEvent<SVGSVGElement>) => {
    const target = e.target as SVGElement;
    if (target.classList.contains('landmark-dot')) {
      return;
    }
    if (e.touches.length === 1) {
      setIsRotating(true);
      dragStartRef.current = {
        x: e.touches[0].clientX,
        angle: rotationAngle
      };
    }
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (activePointId && containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        const rawX = e.clientX - rect.left;
        const rawY = e.clientY - rect.top;
        
        const x = Math.max(0, Math.min(width, (rawX / rect.width) * width));
        const y = Math.max(0, Math.min(height, (rawY / rect.height) * height));

        onLandmarkChange(activePointId, Math.round(x), Math.round(y));
      } else if (isRotating) {
        const deltaX = e.clientX - dragStartRef.current.x;
        let newAngle = (dragStartRef.current.angle + deltaX * 0.8) % 360;
        if (newAngle < 0) newAngle += 360;
        setRotationAngle(Math.round(newAngle));
      }
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (activePointId && containerRef.current && e.touches.length > 0) {
        const rect = containerRef.current.getBoundingClientRect();
        const rawX = e.touches[0].clientX - rect.left;
        const rawY = e.touches[0].clientY - rect.top;
        
        const x = Math.max(0, Math.min(width, (rawX / rect.width) * width));
        const y = Math.max(0, Math.min(height, (rawY / rect.height) * height));

        onLandmarkChange(activePointId, Math.round(x), Math.round(y));
      } else if (isRotating && e.touches.length > 0) {
        const deltaX = e.touches[0].clientX - dragStartRef.current.x;
        let newAngle = (dragStartRef.current.angle + deltaX * 0.8) % 360;
        if (newAngle < 0) newAngle += 360;
        setRotationAngle(Math.round(newAngle));
      }
    };

    const handleMouseUpOrTouchEnd = () => {
      setActivePointId(null);
      setIsRotating(false);
    };

    if (activePointId || isRotating) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUpOrTouchEnd);
      window.addEventListener('touchmove', handleTouchMove, { passive: false });
      window.addEventListener('touchend', handleMouseUpOrTouchEnd);
    }

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUpOrTouchEnd);
      window.removeEventListener('touchmove', handleTouchMove);
      window.removeEventListener('touchend', handleMouseUpOrTouchEnd);
    };
  }, [activePointId, isRotating, onLandmarkChange]);

  // Generate bone paths between landmarks (for 2D editing mode)
  const getBones = () => {
    const connections: [string, string][] = [];
    
    if (view === 'front') {
      connections.push(
        ['nasion', 'left_shoulder'],
        ['nasion', 'right_shoulder'],
        ['left_shoulder', 'right_shoulder'],
        ['left_shoulder', 'left_elbow'],
        ['left_elbow', 'left_wrist'],
        ['right_shoulder', 'right_elbow'],
        ['right_elbow', 'right_wrist'],
        ['left_shoulder', 'left_hip'],
        ['right_shoulder', 'right_hip'],
        ['left_hip', 'right_hip'],
        ['left_hip', 'left_knee'],
        ['left_knee', 'left_ankle'],
        ['right_hip', 'right_knee'],
        ['right_knee', 'right_ankle']
      );
    } else {
      connections.push(
        ['nasion', 'shoulder'],
        ['shoulder', 'elbow'],
        ['elbow', 'wrist'],
        ['shoulder', 'hip'],
        ['hip', 'knee'],
        ['knee', 'ankle'],
        ['hip', 'chest_depth'],
        ['hip', 'buttock_depth']
      );
    }

    return connections.map(([startId, endId], index) => {
      const start = landmarks.find(l => l.id === startId);
      const end = landmarks.find(l => l.id === endId);
      if (!start || !end) return null;
      return (
        <line
          key={`bone-${index}`}
          x1={start.x}
          y1={start.y}
          x2={end.x}
          y2={end.y}
          className="skeletal-line"
        />
      );
    });
  };

  // Generate 3D Wireframe Mannequin mesh points and project them to 2D
  const projected3DData = useMemo(() => {
    // Rotation matrix variables
    const rad = (rotationAngle * Math.PI) / 180;
    const cosA = Math.cos(rad);
    const sinA = Math.sin(rad);

    // Helpers to project 3D point (x, y, z) to 2D screen
    const project = (x3d: number, y3d: number, z3d: number) => {
      // Rotate around Y-axis (vertical body axis)
      const rotatedX = x3d * cosA - z3d * sinA;
      // Screen projection centered at X=200
      return { x: 200 + rotatedX, y: y3d };
    };

    // Calculate dimensions from landmarks to shape the 3D mannequin
    const nasionF = landmarks.find(l => l.id === 'nasion') || { x: 200, y: 75 };
    const lShoulder = landmarks.find(l => l.id === 'left_shoulder') || { x: 165, y: 125 };
    const rShoulder = landmarks.find(l => l.id === 'right_shoulder') || { x: 235, y: 125 };
    const lHip = landmarks.find(l => l.id === 'left_hip') || { x: 175, y: 300 };
    const rHip = landmarks.find(l => l.id === 'right_hip') || { x: 225, y: 300 };
    const rAnkle = landmarks.find(l => l.id === 'right_ankle') || { x: 225, y: 610 };

    const bodyHeight = rAnkle.y - nasionF.y;
    const shoulderWidth = Math.abs(rShoulder.x - lShoulder.x);
    const hipWidth = Math.abs(rHip.x - lHip.x);

    // 1. Target volume logic (W in kg / (density = 1.01 g/cm^3 = 0.00101 kg/cm^3))
    const HUMAN_BODY_DENSITY = 0.00101; 
    const targetVolumeCm3 = weight / HUMAN_BODY_DENSITY;

    // 2. Head volume subtraction using spherical mesh prior (with dynamic pediatric ratio)
    const heightCm = bodyHeight * scaleFactor;
    const headRatio = Math.max(0.07, Math.min(0.15, 0.15 - (heightCm - 50) * (0.08 / 120)));
    const headRadius = bodyHeight * headRatio; // in pixels
    const headCenterY = nasionF.y - headRadius * 0.3; // in pixels
    const headRadiusCm = headRadius * scaleFactor;
    const headVolumeCm3 = (4 / 3) * Math.PI * Math.pow(headRadiusCm, 3);
    const targetTorsoVolumeCm3 = Math.max(0.1 * targetVolumeCm3, targetVolumeCm3 - headVolumeCm3);

    // 3. Define the unscaled body slices (rings)
    // Gender-specific unscaled depth-to-width ratio (Fat distribution prior / Biometric shaping)
    const baseDepthRatio = gender === 'female' 
      ? { neck: 0.80, shoulder: 0.45, chest: 0.85, waist: 0.70, hips: 0.90, thighs: 0.85 } 
      : { neck: 0.85, shoulder: 0.50, chest: 0.70, waist: 0.88, hips: 0.75, thighs: 0.70 };

    // Widths of each slice in pixels
    const widths = {
      neck: shoulderWidth * 0.22,
      shoulder: shoulderWidth,
      chest: shoulderWidth * 0.82,
      waist: hipWidth * 0.80,
      hips: hipWidth,
      thighs: hipWidth * 0.88
    };

    // Heights of each slice in pixels
    const heights = {
      neck: nasionF.y + bodyHeight * 0.08,
      shoulder: lShoulder.y,
      chest: nasionF.y + bodyHeight * 0.20,
      waist: nasionF.y + bodyHeight * 0.30,
      hips: lHip.y,
      thighs: nasionF.y + bodyHeight * 0.55
    };

    // Base/unscaled depths in pixels
    const unscaledDepths = {
      neck: widths.neck * baseDepthRatio.neck,
      shoulder: widths.shoulder * baseDepthRatio.shoulder,
      chest: widths.chest * baseDepthRatio.chest,
      waist: widths.waist * baseDepthRatio.waist,
      hips: widths.hips * baseDepthRatio.hips,
      thighs: widths.thighs * baseDepthRatio.thighs
    };

    const ringsList: { id: 'neck' | 'shoulder' | 'chest' | 'waist' | 'hips' | 'thighs'; y: number; w: number; dUnscaled: number }[] = [
      { id: 'neck', y: heights.neck, w: widths.neck, dUnscaled: unscaledDepths.neck },
      { id: 'shoulder', y: heights.shoulder, w: widths.shoulder, dUnscaled: unscaledDepths.shoulder },
      { id: 'chest', y: heights.chest, w: widths.chest, dUnscaled: unscaledDepths.chest },
      { id: 'waist', y: heights.waist, w: widths.waist, dUnscaled: unscaledDepths.waist },
      { id: 'hips', y: heights.hips, w: widths.hips, dUnscaled: unscaledDepths.hips },
      { id: 'thighs', y: heights.thighs, w: widths.thighs, dUnscaled: unscaledDepths.thighs }
    ];

    // 4. Calculate unscaled torso volume using elliptical frustums
    // Frustum volume = h * pi/3 * (a1*b1 + a2*b2 + (a1*b2 + a2*b1)/2) in physical units (cm)
    let unscaledTorsoVolume = 0;
    for (let i = 0; i < ringsList.length - 1; i++) {
      const r1 = ringsList[i];
      const r2 = ringsList[i + 1];

      const h_cm = (r2.y - r1.y) * scaleFactor;
      const a1_cm = (r1.w * scaleFactor) / 2;
      const b1_cm = (r1.dUnscaled * scaleFactor) / 2;
      const a2_cm = (r2.w * scaleFactor) / 2;
      const b2_cm = (r2.dUnscaled * scaleFactor) / 2;

      const vFrustum = (h_cm * Math.PI / 3) * (a1_cm * b1_cm + a2_cm * b2_cm + (a1_cm * b2_cm + a2_cm * b1_cm) / 2);
      unscaledTorsoVolume += vFrustum;
    }

    // Solve for scale factor k to lock V_mesh to V
    const k = Math.max(0.3, Math.min(3.0, targetTorsoVolumeCm3 / unscaledTorsoVolume));

    // Construct the finalized rings with optimized depths
    const finalizedRings = ringsList.map(r => ({
      id: r.id,
      y: r.y,
      w: r.w,
      d: r.dUnscaled * k
    }));

    const meshLines: { x1: number; y1: number; x2: number; y2: number; type: 'ring' | 'vertical' }[] = [];
    const numPointsPerRing = 16;
    const ringsPoints2D: { x: number; y: number }[][] = [];

    // 5. Generate optimized elliptical slices (horizontal rings)
    finalizedRings.forEach((ring) => {
      const ringPoints: { x: number; y: number }[] = [];
      const radiusX = ring.w / 2;
      const radiusZ = ring.d / 2;

      for (let i = 0; i < numPointsPerRing; i++) {
        const phi = (i * 2 * Math.PI) / numPointsPerRing;
        
        let x3d = radiusX * Math.cos(phi);
        let z3d = radiusZ * Math.sin(phi);

        // Biometric Fat Distribution adjustments (bulging areas)
        // If female chest, model front-facing breast projection (z3d > 0 points forward)
        if (gender === 'female' && ring.id === 'chest' && z3d > 0) {
          z3d = z3d * (1.0 + 0.3 * Math.sin(phi)); // add organic breast bulge
        }

        const pt2d = project(x3d, ring.y, z3d);
        ringPoints.push(pt2d);
      }
      ringsPoints2D.push(ringPoints);

      // Connect ring points into closed loop
      for (let i = 0; i < numPointsPerRing; i++) {
        const next = (i + 1) % numPointsPerRing;
        meshLines.push({
          x1: ringPoints[i].x,
          y1: ringPoints[i].y,
          x2: ringPoints[next].x,
          y2: ringPoints[next].y,
          type: 'ring'
        });
      }
    });

    // 6. Connect rings vertically to form a 3D volume mesh
    for (let r = 0; r < ringsPoints2D.length - 1; r++) {
      const ringA = ringsPoints2D[r];
      const ringB = ringsPoints2D[r + 1];
      for (let i = 0; i < numPointsPerRing; i++) {
        meshLines.push({
          x1: ringA[i].x,
          y1: ringA[i].y,
          x2: ringB[i].x,
          y2: ringB[i].y,
          type: 'vertical'
        });
      }
    }

    // 7. Spherical head mesh smoothing function with longitude connections
    const numSphereRings = 4;
    const numPointsPerSphereRing = 12;
    const sphereRingsPoints2D: { x: number; y: number }[][] = [];

    for (let j = 0; j <= numSphereRings + 1; j++) {
      const theta = (j * Math.PI) / (numSphereRings + 1); // Elevation from 0 (top pole) to PI (bottom pole)
      const r = headRadius * Math.sin(theta);
      const ringY = headCenterY + headRadius * Math.cos(theta);

      const sphereRingPoints: { x: number; y: number }[] = [];
      for (let i = 0; i < numPointsPerSphereRing; i++) {
        const phi = (i * 2 * Math.PI) / numPointsPerSphereRing;
        const x3d = r * Math.cos(phi);
        const z3d = r * Math.sin(phi);

        const pt2d = project(x3d, ringY, z3d);
        sphereRingPoints.push(pt2d);
      }
      sphereRingsPoints2D.push(sphereRingPoints);
    }

    // Connect sphere points to form a smooth spherical mesh (latitude + longitude)
    for (let j = 0; j < sphereRingsPoints2D.length; j++) {
      const currentRing = sphereRingsPoints2D[j];

      // Latitude rings (exclude poles where r = 0 for drawing loops, though they are mathematically fine)
      if (j > 0 && j <= numSphereRings) {
        for (let i = 0; i < numPointsPerSphereRing; i++) {
          const next = (i + 1) % numPointsPerSphereRing;
          meshLines.push({
            x1: currentRing[i].x,
            y1: currentRing[i].y,
            x2: currentRing[next].x,
            y2: currentRing[next].y,
            type: 'ring'
          });
        }
      }

      // Longitude lines connecting rings vertically
      if (j < sphereRingsPoints2D.length - 1) {
        const nextRing = sphereRingsPoints2D[j + 1];
        for (let i = 0; i < numPointsPerSphereRing; i++) {
          meshLines.push({
            x1: currentRing[i].x,
            y1: currentRing[i].y,
            x2: nextRing[i].x,
            y2: nextRing[i].y,
            type: 'vertical'
          });
        }
      }
    }

    return {
      meshLines,
      ringsPoints2D,
      headCenterY,
      headRadius
    };
  }, [rotationAngle, landmarks, gender, weight, scaleFactor]);

  const projected3DMesh = projected3DData.meshLines;

  // Mannequin SVG Path Render for background reference
  const renderSilhouette = () => {
    const { ringsPoints2D, headCenterY, headRadius } = projected3DData;

    if (hasMediaBackground && meshStyle !== 'solid') {
      return null;
    }

    if (ringsPoints2D.length < 6) return null;

    const getOuterPoints = (ringPoints: { x: number; y: number }[]) => {
      let left = ringPoints[0];
      let right = ringPoints[0];
      ringPoints.forEach(pt => {
        if (pt.x < left.x) left = pt;
        if (pt.x > right.x) right = pt;
      });
      return { left, right };
    };

    const pNeck = getOuterPoints(ringsPoints2D[0]);
    const pShoulder = getOuterPoints(ringsPoints2D[1]);
    const pChest = getOuterPoints(ringsPoints2D[2]);
    const pWaist = getOuterPoints(ringsPoints2D[3]);
    const pHips = getOuterPoints(ringsPoints2D[4]);
    const pThighs = getOuterPoints(ringsPoints2D[5]);

    // Find knees and ankles for dynamic leg taper
    const lKnee = landmarks.find(l => l.id === 'left_knee') || landmarks.find(l => l.id === 'knee') || { x: 185, y: 460 };
    const rKnee = landmarks.find(l => l.id === 'right_knee') || landmarks.find(l => l.id === 'knee') || { x: 215, y: 460 };
    const lAnkle = landmarks.find(l => l.id === 'left_ankle') || landmarks.find(l => l.id === 'ankle') || { x: 185, y: 610 };
    const rAnkle = landmarks.find(l => l.id === 'right_ankle') || landmarks.find(l => l.id === 'ankle') || { x: 215, y: 610 };

    // Gradients & styling based on meshStyle
    let fillUrl = 'url(#body3dGrad)';
    let strokeColor = 'url(#body3dStroke)';
    let strokeWidth = '1.5';
    let opacity = 1.0;

    if (meshStyle === 'heatmap') {
      fillUrl = 'url(#bodyHeatGrad)';
      strokeColor = 'rgba(255, 255, 255, 0.2)';
    } else if (meshStyle === 'neon') {
      fillUrl = 'rgba(15, 23, 42, 0.7)';
      strokeColor = '#06b6d4';
      strokeWidth = '2';
    } else if (hasMediaBackground) {
      // Semi-transparent overlay on top of photo/camera
      fillUrl = 'url(#body3dGrad)';
      opacity = 0.45;
    }

    // Torso path construction
    const pathParts = [];
    pathParts.push(`M ${pNeck.left.x} ${pNeck.left.y}`);
    
    // Shoulder Left
    pathParts.push(`C ${pNeck.left.x - 4} ${(pNeck.left.y + pShoulder.left.y)/2}, ${pShoulder.left.x} ${pShoulder.left.y - 12}, ${pShoulder.left.x} ${pShoulder.left.y}`);
    
    // Chest Left
    pathParts.push(`C ${pShoulder.left.x} ${pShoulder.left.y + 12}, ${pChest.left.x - 4} ${pChest.left.y - 12}, ${pChest.left.x} ${pChest.left.y}`);
    
    // Waist Left (smooth curve inward)
    pathParts.push(`C ${pChest.left.x + 3} ${pChest.left.y + 18}, ${pWaist.left.x + 2} ${pWaist.left.y - 18}, ${pWaist.left.x} ${pWaist.left.y}`);
    
    // Hips Left (smooth curve outward)
    pathParts.push(`C ${pWaist.left.x - 2} ${pWaist.left.y + 18}, ${pHips.left.x - 6} ${pHips.left.y - 18}, ${pHips.left.x} ${pHips.left.y}`);
    
    // Thighs Left
    pathParts.push(`C ${pHips.left.x + 2} ${pHips.left.y + 18}, ${pThighs.left.x - 4} ${pThighs.left.y - 8}, ${pThighs.left.x} ${pThighs.left.y}`);

    if (scanRange === 'full') {
      // Left leg outer -> bottom -> inner
      pathParts.push(`L ${lKnee.x - 12} ${lKnee.y}`);
      pathParts.push(`L ${lAnkle.x - 8} ${lAnkle.y}`);
      pathParts.push(`L ${lAnkle.x + 8} ${lAnkle.y}`);
      pathParts.push(`L ${lKnee.x + 10} ${lKnee.y}`);
      pathParts.push(`L 200 ${pThighs.left.y + 20}`); // Crotch area
      
      // Right leg inner -> bottom -> outer
      pathParts.push(`L ${rKnee.x - 10} ${rKnee.y}`);
      pathParts.push(`L ${rAnkle.x - 8} ${rAnkle.y}`);
      pathParts.push(`L ${rAnkle.x + 8} ${rAnkle.y}`);
      pathParts.push(`L ${rKnee.x + 12} ${rKnee.y}`);
      pathParts.push(`L ${pThighs.right.x} ${pThighs.right.y}`);
    } else {
      // Half body rounded crotch bottom
      pathParts.push(`C ${pThighs.left.x} ${pThighs.left.y + 22}, ${pThighs.right.x} ${pThighs.right.y + 22}, ${pThighs.right.x} ${pThighs.right.y}`);
    }

    // Thighs Right to Hips Right
    pathParts.push(`C ${pThighs.right.x - 2} ${pThighs.right.y - 8}, ${pHips.right.x + 2} ${pHips.right.y + 18}, ${pHips.right.x} ${pHips.right.y}`);
    
    // Waist Right
    pathParts.push(`C ${pHips.right.x - 6} ${pHips.right.y - 18}, ${pWaist.right.x - 2} ${pWaist.right.y + 18}, ${pWaist.right.x} ${pWaist.right.y}`);
    
    // Chest Right
    pathParts.push(`C ${pWaist.right.x + 2} ${pWaist.right.y - 18}, ${pChest.right.x - 3} ${pChest.right.y + 18}, ${pChest.right.x} ${pChest.right.y}`);
    
    // Shoulder Right
    pathParts.push(`C ${pChest.right.x + 4} ${pChest.right.y - 12}, ${pShoulder.right.x} ${pShoulder.right.y + 12}, ${pShoulder.right.x} ${pShoulder.right.y}`);
    
    // Neck Right
    pathParts.push(`C ${pShoulder.right.x} ${pShoulder.right.y - 12}, ${pNeck.right.x + 4} ${(pNeck.right.y + pShoulder.right.y)/2}, ${pNeck.right.x} ${pNeck.right.y}`);
    
    // Close to Neck Left
    pathParts.push(`L ${pNeck.left.x} ${pNeck.left.y}`);

    const bodyPathD = pathParts.join(' ');

    return (
      <>
        <defs>
          {/* Metallic 3D Mannequin Shading Gradient */}
          <radialGradient id="body3dGrad" cx="50%" cy="30%" r="70%" fx="50%" fy="20%">
            <stop offset="0%" stopColor="#f8fafc" />
            <stop offset="30%" stopColor="#e2e8f0" />
            <stop offset="65%" stopColor="#94a3b8" />
            <stop offset="85%" stopColor="#475569" />
            <stop offset="100%" stopColor="#1e293b" />
          </radialGradient>
          <linearGradient id="body3dStroke" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#64748b" />
            <stop offset="100%" stopColor="#334155" />
          </linearGradient>

          {/* Scientific thermal heatmap gradient */}
          <linearGradient id="bodyHeatGrad" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#38bdf8" />  {/* Blue (neck) */}
            <stop offset="25%" stopColor="#22c55e" /> {/* Green (chest) */}
            <stop offset="50%" stopColor="#eab308" /> {/* Yellow (waist) */}
            <stop offset="75%" stopColor="#f97316" /> {/* Orange (hips) */}
            <stop offset="100%" stopColor="#ef4444" /> {/* Red (thighs) */}
          </linearGradient>
          
          {/* Subtle grid pattern for scientific feel */}
          <pattern id="grid" width="20" height="20" patternUnits="userSpaceOnUse">
            <path d="M 20 0 L 0 0 0 20" fill="none" stroke="rgba(148, 163, 184, 0.05)" strokeWidth="1" />
          </pattern>
        </defs>

        {/* Grid Background only when no media background */}
        {!hasMediaBackground && <rect width={width} height={height} fill="url(#grid)" />}

        <g style={{ opacity, transition: 'opacity 0.25s ease' }}>
          {/* Head Sphere */}
          <circle
            cx={200}
            cy={headCenterY}
            r={headRadius}
            fill={fillUrl}
            stroke={strokeColor}
            strokeWidth={strokeWidth}
          />
          {/* Torso & Legs */}
          <path
            d={bodyPathD}
            fill={fillUrl}
            stroke={strokeColor}
            strokeWidth={strokeWidth}
          />
          
          {/* Anatomical Shading for 3D realism (pecs/breasts, abs, waist shadow) */}
          {meshStyle === 'solid' && (
            <>
              {/* Center line highlight */}
              <path
                d={`M 200 ${pNeck.left.y} L 200 ${pThighs.left.y}`}
                stroke="rgba(255, 255, 255, 0.2)"
                strokeWidth="1.5"
                strokeDasharray="2,4"
              />
              {/* Female breasts shading */}
              {gender === 'female' && (
                <>
                  {/* Left Breast curve */}
                  <path
                    d={`M ${200 - 15} ${pChest.left.y + 5} Q ${pChest.left.x + 15} ${pChest.left.y + 15} ${200 - 3} ${pChest.left.y + 20}`}
                    fill="none"
                    stroke="rgba(255, 255, 255, 0.25)"
                    strokeWidth="2.5"
                  />
                  <path
                    d={`M ${200 - 15} ${pChest.left.y + 7} Q ${pChest.left.x + 15} ${pChest.left.y + 17} ${200 - 3} ${pChest.left.y + 22}`}
                    fill="none"
                    stroke="rgba(15, 23, 42, 0.35)"
                    strokeWidth="3.5"
                  />
                  {/* Right Breast curve */}
                  <path
                    d={`M ${200 + 15} ${pChest.right.y + 5} Q ${pChest.right.x - 15} ${pChest.right.y + 15} ${200 + 3} ${pChest.right.y + 20}`}
                    fill="none"
                    stroke="rgba(255, 255, 255, 0.25)"
                    strokeWidth="2.5"
                  />
                  <path
                    d={`M ${200 + 15} ${pChest.right.y + 7} Q ${pChest.right.x - 15} ${pChest.right.y + 17} ${200 + 3} ${pChest.right.y + 22}`}
                    fill="none"
                    stroke="rgba(15, 23, 42, 0.35)"
                    strokeWidth="3.5"
                  />
                </>
              )}
              
              {/* Male chest/pecs shading */}
              {gender === 'male' && (
                <>
                  <path
                    d={`M ${pChest.left.x + 15} ${pChest.left.y + 5} L ${200 - 5} ${pChest.left.y + 12} L ${200 - 5} ${pChest.left.y + 14} L ${pChest.left.x + 18} ${pChest.left.y + 7}`}
                    fill="rgba(15, 23, 42, 0.25)"
                  />
                  <path
                    d={`M ${pChest.right.x - 15} ${pChest.right.y + 5} L ${200 + 5} ${pChest.right.y + 12} L ${200 + 5} ${pChest.right.y + 14} L ${pChest.right.x - 18} ${pChest.right.y + 7}`}
                    fill="rgba(15, 23, 42, 0.25)"
                  />
                </>
              )}
              
              {/* Waist shading (curved shadows on the side to emphasize thinness/abdominal shape) */}
              <path
                d={`M ${pChest.left.x + 8} ${pChest.left.y + 10} Q ${pWaist.left.x + 10} ${pWaist.left.y} ${pHips.left.x + 8} ${pHips.left.y}`}
                fill="none"
                stroke="rgba(15, 23, 42, 0.15)"
                strokeWidth="4"
              />
              <path
                d={`M ${pChest.right.x - 8} ${pChest.right.y + 10} Q ${pWaist.right.x - 10} ${pWaist.right.y} ${pHips.right.x - 8} ${pHips.right.y}`}
                fill="none"
                stroke="rgba(15, 23, 42, 0.15)"
                strokeWidth="4"
              />
            </>
          )}
        </g>
      </>
    );
  };

  const hasMediaBackground = 
    (inputSource === 'image' && uploadedImage) || 
    (inputSource === 'webcam') || 
    (inputSource === 'video' && uploadedVideo);

  return (
    <div className={`canvas-wrapper ${isMaximized ? 'maximized' : ''}`}>
      <div className="canvas-header">
        <div className="source-select-tabs">
          <button
            type="button"
            className={`source-tab ${inputSource === 'mannequin' ? 'active' : ''}`}
            onClick={() => {
              onInputSourceChange('mannequin');
            }}
          >
            Mô hình 3D
          </button>
          <button
            type="button"
            className={`source-tab ${inputSource === 'image' ? 'active' : ''}`}
            onClick={() => {
              onInputSourceChange('image');
            }}
          >
            Ảnh mẫu
          </button>
          <button
            type="button"
            className={`source-tab ${inputSource === 'webcam' ? 'active' : ''}`}
            onClick={() => {
              onInputSourceChange('webcam');
            }}
          >
            Webcam AI
          </button>
          <button
            type="button"
            className={`source-tab ${inputSource === 'video' ? 'active' : ''}`}
            onClick={() => {
              onInputSourceChange('video');
            }}
          >
            Video AI
          </button>
        </div>

        <div className="canvas-header-row2">
          <div className="view-toggle-tabs">
            <button
              type="button"
              className={`tab-btn ${view === 'front' ? 'active' : ''}`}
              onClick={() => onViewChange('front')}
            >
              Mặt trước
            </button>
            <button
              type="button"
              className={`tab-btn ${view === 'side' ? 'active' : ''}`}
              onClick={() => onViewChange('side')}
            >
              Mặt nghiêng
            </button>
          </div>
          {/* Reset landmark dots button */}
          {onResetLandmarks && (
            <button
              type="button"
              onClick={onResetLandmarks}
              title="Đặt lại vị trí các chấm đỏ về mặc định chuẩn"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.25rem',
                background: 'rgba(239, 68, 68, 0.08)',
                border: '1px solid rgba(239, 68, 68, 0.3)',
                borderRadius: 'var(--radius-sm)',
                padding: '0.3rem 0.55rem',
                fontSize: '0.68rem',
                fontWeight: 600,
                color: '#ef4444',
                cursor: 'pointer',
                transition: 'all 0.15s ease',
                whiteSpace: 'nowrap',
                flexShrink: 0
              }}
              onMouseEnter={e => (e.currentTarget.style.backgroundColor = 'rgba(239, 68, 68, 0.18)')}
              onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'rgba(239, 68, 68, 0.08)')}
            >
              <RefreshCw size={11} />
              Reset chấm
            </button>
          )}
        </div>
      </div>


      <div className="canvas-container">
        <div className="media-viewport">
          {(inputSource !== 'webcam' || isWebcamActive) && (
            <div className="mesh-style-controls" style={{ position: 'absolute', top: '10px', right: '10px', zIndex: 30, display: 'flex', gap: '0.25rem', background: 'rgba(15, 23, 42, 0.85)', padding: '0.25rem', borderRadius: 'var(--radius-sm)', border: '1px solid rgba(255, 255, 255, 0.1)' }}>
              <button
                type="button"
                className={`style-btn ${meshStyle === 'solid' ? 'active' : ''}`}
                onClick={() => setMeshStyle('solid')}
                style={{ background: meshStyle === 'solid' ? '#3b82f6' : 'transparent', color: '#fff', border: 'none', padding: '0.25rem 0.5rem', borderRadius: '3px', fontSize: '0.65rem', cursor: 'pointer', fontWeight: 600 }}
              >
                Khối đặc
              </button>
              <button
                type="button"
                className={`style-btn ${meshStyle === 'neon' ? 'active' : ''}`}
                onClick={() => setMeshStyle('neon')}
                style={{ background: meshStyle === 'neon' ? '#3b82f6' : 'transparent', color: '#fff', border: 'none', padding: '0.25rem 0.5rem', borderRadius: '3px', fontSize: '0.65rem', cursor: 'pointer', fontWeight: 600 }}
              >
                Neon
              </button>
              <button
                type="button"
                className={`style-btn ${meshStyle === 'heatmap' ? 'active' : ''}`}
                onClick={() => setMeshStyle('heatmap')}
                style={{ background: meshStyle === 'heatmap' ? '#3b82f6' : 'transparent', color: '#fff', border: 'none', padding: '0.25rem 0.5rem', borderRadius: '3px', fontSize: '0.65rem', cursor: 'pointer', fontWeight: 600 }}
              >
                Nhiệt (AI)
              </button>
            </div>
          )}
          {hasMediaBackground && (
            <button
              type="button"
              className="canvas-maximize-btn"
              onClick={() => setIsMaximized(!isMaximized)}
              title={isMaximized ? "Thu nhỏ camera" : "Phóng to camera toàn màn hình"}
            >
              {isMaximized ? <Minimize2 size={13} /> : <Maximize2 size={13} />}
              <span>{isMaximized ? "Thu nhỏ" : "Phóng to"}</span>
            </button>
          )}
          {isModelLoading && (
            <div className="model-loading-overlay">
              <RefreshCw size={24} className="spin-anim" />
              <p>Đang tải Camera & mô hình AI...</p>
            </div>
          )}

          {inputSource === 'webcam' && isWebcamActive && (
            <video
              ref={videoRef}
              className="background-media webcam-feed"
              playsInline
              muted
              style={{ 
                transform: 'scaleX(-1)', // Mirror webcam
                display: isModelLoading ? 'none' : 'block'
              }}
            />
          )}
          {inputSource === 'webcam' && !isWebcamActive && !isModelLoading && (
            <div className="webcam-placeholder-overlay" style={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              background: 'radial-gradient(circle at center, rgba(15, 23, 42, 0.9) 0%, rgba(15, 23, 42, 0.98) 100%)',
              color: '#f8fafc',
              padding: '2rem',
              textAlign: 'center',
              zIndex: 5,
              borderRadius: 'var(--radius-md)'
            }}>
              <div style={{
                background: 'rgba(37, 99, 235, 0.1)',
                border: '1px solid rgba(37, 99, 235, 0.25)',
                borderRadius: '50%',
                padding: '1.5rem',
                marginBottom: '1rem',
                boxShadow: '0 0 20px rgba(37, 99, 235, 0.15)',
                animation: 'neonPulse 3s infinite ease-in-out'
              }}>
                <CameraOff size={40} style={{ color: '#60a5fa' }} />
              </div>
              <h3 style={{ fontSize: '1.15rem', fontWeight: 700, marginBottom: '0.5rem', color: '#f8fafc' }}>
                Webcam AI Chưa Khởi Động
              </h3>
              <p style={{ fontSize: '0.78rem', color: '#94a3b8', maxWidth: '300px', lineHeight: 1.45, marginBottom: '1.5rem' }}>
                Bấm nút bên dưới để cấp quyền camera và bắt đầu phân tích hình thể 3D thời gian thực.
              </p>
              <button
                type="button"
                onClick={startWebcam}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  backgroundColor: '#2563eb',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: 'var(--radius-md)',
                  padding: '0.65rem 1.25rem',
                  fontSize: '0.82rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                  boxShadow: '0 4px 12px rgba(37, 99, 235, 0.3)',
                  transition: 'all 0.2s ease'
                }}
                onMouseEnter={e => {
                  e.currentTarget.style.backgroundColor = '#1d4ed8';
                  e.currentTarget.style.transform = 'translateY(-1px)';
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.backgroundColor = '#2563eb';
                  e.currentTarget.style.transform = 'translateY(0)';
                }}
              >
                <Camera size={15} />
                Bắt Đầu Quét AI
              </button>
            </div>
          )}

          {inputSource === 'video' && uploadedVideo && (
            <video
              ref={videoRef}
              src={uploadedVideo}
              className="background-media uploaded-video-feed"
              controls
              loop
              playsInline
              muted
            />
          )}

          {inputSource === 'image' && uploadedImage && (
            <img
              src={uploadedImage}
              className="background-media uploaded-image-view"
              alt="Uploaded mannequin source"
            />
          )}

          <svg
            ref={containerRef}
            viewBox={`0 0 ${width} ${height}`}
            className="landmark-svg"
            onMouseDown={handleCanvasMouseDown}
            onTouchStart={handleCanvasTouchStart}
            style={{ 
              cursor: isRotating ? 'grabbing' : 'grab',
              zIndex: 10,
              background: hasMediaBackground ? 'transparent' : 'var(--bg-card)'
            }}
          >
            {/* We render background silhouette only when no media background exists */}
            {!hasMediaBackground && renderSilhouette()}

            {/* Render webcam guide silhouette to help user align their body */}
            {hasMediaBackground && inputSource === 'webcam' && (
              <g className="webcam-guide-group">
                {gender === 'male' ? (
                  <path
                    d="M 200 45 C 212 45, 216 70, 216 82 C 216 90, 204 98, 200 98 C 196 98, 184 90, 184 82 C 184 70, 188 45, 200 45 Z
                       M 200 98 C 205 98, 215 106, 228 116 C 255 136, 266 148, 270 185 C 274 220, 268 255, 262 290 C 258 310, 253 320, 248 335 C 242 355, 242 390, 242 450 C 242 510, 245 560, 240 595 C 238 610, 232 615, 222 615 C 212 615, 208 605, 206 575 C 204 545, 202 480, 200 470 C 198 480, 196 545, 194 575 C 192 605, 188 615, 178 615 C 168 615, 162 610, 160 595 C 155 560, 158 510, 158 450 C 158 390, 158 355, 152 335 C 147 320, 142 310, 138 290 C 132 255, 126 220, 130 185 C 134 148, 145 136, 172 116 C 185 106, 195 98, 200 98 Z"
                    className={`webcam-guide-silhouette ${scanRange === 'half' ? 'half-body-fade' : ''}`}
                  />
                ) : (
                  <path
                    d="M 200 48 C 210 48, 214 70, 214 82 C 214 90, 204 96, 200 96 C 196 96, 186 90, 186 82 C 186 70, 190 48, 200 48 Z
                       M 200 96 C 204 96, 211 104, 222 114 C 245 132, 258 145, 262 178 C 266 210, 256 242, 248 275 C 242 295, 248 312, 250 335 C 252 358, 242 395, 240 450 C 238 505, 241 555, 236 585 C 233 600, 227 605, 220 605 C 212 605, 209 595, 207 565 C 205 535, 202 480, 200 470 C 198 470, 195 535, 193 565 C 191 595, 188 605, 180 605 C 173 605, 167 600, 164 585 C 159 555, 162 505, 160 450 C 158 395, 148 358, 150 335 C 152 312, 158 295, 152 275 C 144 242, 134 210, 138 178 C 142 132, 155 132, 178 114 C 189 104, 196 96, 200 96 Z"
                    className={`webcam-guide-silhouette ${scanRange === 'half' ? 'half-body-fade' : ''}`}
                  />
                )}
                {/* Dotted lines pointing to head and ankles/hips */}
                <line x1="0" y1="45" x2="400" y2="45" className="webcam-guide-line limit" />
                <line x1="0" y1={scanRange === 'half' ? 350 : 615} x2="400" y2={scanRange === 'half' ? 350 : 615} className="webcam-guide-line limit" />
                <text x="200" y="35" className="webcam-guide-text">Đỉnh đầu (Align Head)</text>
                <text x="200" y={scanRange === 'half' ? 370 : 635} className="webcam-guide-text">{scanRange === 'half' ? 'Hông (Align Hips)' : 'Gót chân (Align Heels)'}</text>
              </g>
            )}

            {/* Render 3D Wireframe Mesh if in mannequin mode OR if webcam scanning is active */}
            {(!hasMediaBackground || meshStyle !== 'solid' || (isScanning && (inputSource === 'webcam' || inputSource === 'video'))) && (
              <g className={`mesh-group ${meshStyle} ${hasMediaBackground ? 'ar-overlay' : ''}`}>
                {projected3DMesh.map((line, idx) => {
                  let strokeColor = undefined;
                  if (meshStyle === 'heatmap') {
                    const y = (line.y1 + line.y2) / 2;
                    if (y < 160) {
                      strokeColor = '#38bdf8'; // Blue (neck)
                    } else if (y < 230) {
                      strokeColor = '#f43f5e'; // Pink/Red (chest/bust depth area)
                    } else if (y < 330) {
                      strokeColor = '#fb923c'; // Orange (waist/belly fat area)
                    } else if (y < 460) {
                      strokeColor = '#fbbf24'; // Yellow (hips/glute depth area)
                    } else {
                      strokeColor = '#4ade80'; // Green (thighs/legs)
                    }
                  }

                  return (
                    <line
                      key={`mesh-${idx}`}
                      x1={line.x1}
                      y1={line.y1}
                      x2={line.x2}
                      y2={line.y2}
                      className={`mesh-line ${line.type}`}
                      style={strokeColor ? { stroke: strokeColor, strokeWidth: line.type === 'ring' ? '1.2px' : '0.6px' } : undefined}
                    />
                  );
                })}
              </g>
            )}

            {/* Render connecting bone lines in 2D calibration editing mode */}
            {getBones()}

            {/* Render interactive landmarks */}
            {landmarks.map((point) => {
              // Smart layout text offsets to prevent overlapping labels
              const getTextOffset = (id: string) => {
                if (id.includes('left')) return { dx: -12, dy: 4, anchor: 'end' as const };
                if (id.includes('right')) return { dx: 12, dy: 4, anchor: 'start' as const };
                if (id === 'nasion') return { dx: 0, dy: -12, anchor: 'middle' as const };
                if (id === 'chest_depth') return { dx: 12, dy: 4, anchor: 'start' as const };
                if (id === 'buttock_depth') return { dx: -12, dy: 4, anchor: 'end' as const };
                return { dx: 12, dy: 4, anchor: 'start' as const };
              };
              const offset = getTextOffset(point.id);
              const isLowerJoint = ['left_knee', 'right_knee', 'left_ankle', 'right_ankle', 'knee', 'ankle'].includes(point.id);
              if (isLowerJoint && scanRange === 'half') {
                return null;
              }

              return (
                <g key={point.id} className="landmark-group">
                  <circle
                    cx={point.x}
                    cy={point.y}
                    r={activePointId === point.id ? 8 : 6}
                    onMouseDown={() => handleMouseDown(point.id)}
                    onTouchStart={(e) => {
                      e.stopPropagation();
                      handleMouseDown(point.id);
                    }}
                    className={`landmark-dot ${activePointId === point.id ? 'dragging' : ''}`}
                  />
                  <text
                    x={point.x + offset.dx}
                    y={point.y + offset.dy}
                    textAnchor={offset.anchor}
                    className="landmark-text"
                  >
                    {point.label}
                  </text>
                </g>
              );
            })}
          </svg>

          {/* Floating AI Scanning Controls Overlay */}
          {inputSource === 'webcam' && isWebcamActive && !isModelLoading && (
            <div className="ai-controls-overlay">
              <button
                type="button"
                className={`ai-scan-btn ${isScanning ? 'scanning' : 'paused'}`}
                onClick={() => {
                  if (scanStatus === 'success') {
                    setScanProgress(0);
                    setScanStatus('idle');
                  }
                  setIsScanning(!isScanning);
                }}
              >
                {isScanning ? <span className="icon-pulse">⏸️</span> : <span>▶️</span>}
                <span>{isScanning ? 'Tạm Dừng Quét AI' : (scanStatus === 'success' ? 'Quét Lại (Rescan)' : 'Bắt Đầu Quét AI')}</span>
              </button>
              <span className={`ai-scanning-badge ${isScanning ? 'active' : ''}`}>
                {isScanning ? '⚡ AI đang quét khớp xương...' : '⏸️ Đã ghim số đo'}
              </span>
            </div>
          )}

          {/* Guided Scanning Progress HUD overlay */}
          {scanStatus === 'scanning' && (
            <div className="camera-scanning-hud">
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                <div className="scanning-pulse-circle"></div>
                <strong>AI đang khóa khớp xương & phân tích: {scanProgress}%</strong>
              </div>
              <div className="scanning-progress-bar-bg">
                <div className="scanning-progress-bar-fill" style={{ width: `${scanProgress}%` }}></div>
              </div>
            </div>
          )}

          {/* Success Guided Scanning overlay */}
          {scanStatus === 'success' && (
            <div className="camera-success-overlay">
              <div className="success-icon">✓</div>
              <h3>Quét {view === 'front' ? 'Mặt Trước' : 'Mặt Nghiêng'} Thành Công!</h3>
              <p>
                {view === 'front' 
                  ? "Đã ghi nhận số đo mặt trước. Vui lòng quay nghiêng người và bấm nút dưới để quét độ sâu." 
                  : "Đã hoàn thành toàn bộ đo đạc nhân trắc học cơ thể."
                }
              </p>
              <div className="success-actions">
                {view === 'front' ? (
                  <button
                    type="button"
                    className="view-change-cta-btn"
                    onClick={() => {
                      onViewChange('side');
                    }}
                  >
                    👉 Chuyển Sang Mặt Nghiêng
                  </button>
                ) : (
                  <button
                    type="button"
                    className="view-change-cta-btn finish"
                    onClick={() => {
                      setIsMaximized(false);
                      setTimeout(() => {
                        const el = document.querySelector('.result-panel-card');
                        if (el) {
                          el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                          el.classList.add('pulse-highlight');
                          setTimeout(() => {
                            el.classList.remove('pulse-highlight');
                          }, 3000);
                        }
                      }, 120);
                    }}
                  >
                    🎉 Xem Báo Cáo Chi Tiết
                  </button>
                )}
                <button
                  type="button"
                  className="rescan-btn"
                  onClick={() => {
                    setScanProgress(0);
                    setScanStatus('idle');
                    setIsScanning(true);
                  }}
                >
                  Quét Lại (Rescan)
                </button>
              </div>
            </div>
          )}

          {/* Giant HUD Overlay for distant viewing */}
          {hasMediaBackground && measurements && recommendation && (
            isHudOpen ? (
              <div className="ai-hud-overlay">
                <button
                  type="button"
                  className="hud-close-btn"
                  onClick={() => setIsHudOpen(false)}
                  title="Ẩn hiển thị số đo trên camera"
                >
                  ✕
                </button>
                <div className="hud-metric">
                  <span className="hud-lbl">CHIỀU CAO</span>
                  <span className="hud-val">{measurements.height.toFixed(1)}<small>cm</small> <span style={{ fontSize: '0.6em', opacity: 0.9, marginLeft: '0.2rem' }}>({formatHeightMeters(measurements.height)})</span></span>
                </div>
                <div className="hud-metric">
                  <span className="hud-lbl">VÒNG NGỰC</span>
                  <span className="hud-val">{measurements.chestCircumference.toFixed(1)}<small>cm</small></span>
                </div>
                <div className="hud-metric">
                  <span className="hud-lbl">VÒNG EO</span>
                  <span className="hud-val">{measurements.waistCircumference.toFixed(1)}<small>cm</small></span>
                </div>
                <div className="hud-metric highlight">
                  <span className="hud-lbl">GỢI Ý SIZE</span>
                  <span className="hud-val size">{recommendation.size}</span>
                </div>
              </div>
            ) : (
              <button
                type="button"
                className="hud-toggle-pill-btn"
                onClick={() => setIsHudOpen(true)}
                title="Hiện chỉ số đo trên camera"
              >
                📊 Hiện số đo
              </button>
            )
          )}
        </div>

        {isMaximized ? (
          <div className="maximized-sidebar">
            <div className="maximized-dashboard">
              <div className="dashboard-section-header">
                <h3>📊 Kết Quả Đo Nhân Trắc Học (AI)</h3>
              </div>
              <div className="maximized-metrics-grid">
                <div className="max-metric-card">
                  <span className="lbl">Chiều cao</span>
                  <span className="val">{measurements?.height.toFixed(1)} <small>cm</small></span>
                </div>
                {view === 'front' ? (
                  <>
                    <div className="max-metric-card">
                      <span className="lbl">Vòng ngực</span>
                      <span className="val">{measurements?.chestCircumference.toFixed(1)} <small>cm</small></span>
                    </div>
                    <div className="max-metric-card">
                      <span className="lbl">Vòng eo</span>
                      <span className="val">{measurements?.waistCircumference.toFixed(1)} <small>cm</small></span>
                    </div>
                    <div className="max-metric-card">
                      <span className="lbl">Vòng mông</span>
                      <span className="val">{measurements?.hipCircumference.toFixed(1)} <small>cm</small></span>
                    </div>
                    <div className="max-metric-card">
                      <span className="lbl">Rộng vai</span>
                      <span className="val">{measurements?.shoulderWidth.toFixed(1)} <small>cm</small></span>
                    </div>
                    <div className="max-metric-card">
                      <span className="lbl">Dài tay</span>
                      <span className="val">{measurements?.armLength.toFixed(1)} <small>cm</small></span>
                    </div>
                    <div className="max-metric-card">
                      <span className="lbl">Dài chân</span>
                      <span className="val">{measurements?.legLength.toFixed(1)} <small>cm</small></span>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="max-metric-card">
                      <span className="lbl">Độ sâu Ngực</span>
                      <span className="val">{(measurements?.chestDepth || 0).toFixed(1)} <small>cm</small></span>
                    </div>
                    <div className="max-metric-card">
                      <span className="lbl">Độ sâu Eo</span>
                      <span className="val">{(measurements?.waistDepth || 0).toFixed(1)} <small>cm</small></span>
                    </div>
                    <div className="max-metric-card">
                      <span className="lbl">Độ sâu Mông</span>
                      <span className="val">{(measurements?.hipDepth || 0).toFixed(1)} <small>cm</small></span>
                    </div>
                  </>
                )}
                <div className="max-metric-card highlight">
                  <span className="lbl">Gợi ý Size</span>
                  <span className="val size">{recommendation?.size}</span>
                </div>
              </div>
            </div>

            {inputSource === 'webcam' && (
              <div className="max-accordion-card">
                <button
                  type="button"
                  className="accordion-header"
                  onClick={() => setShowInlineGuide(!showInlineGuide)}
                >
                  <span>📖 Hướng Dẫn Căn Chỉnh Camera</span>
                  <span>{showInlineGuide ? '▲' : '▼'}</span>
                </button>
                {showInlineGuide && (
                  <div className="accordion-content">
                    {scanRange === 'half' ? (
                      <p>Di chuyển đứng gần sao cho <strong>Đỉnh đầu</strong> và <strong>Hông</strong> khớp với vạch giới hạn màu xanh trên camera.</p>
                    ) : (
                      <p>Di chuyển đứng lùi xa sao cho <strong>Đỉnh đầu</strong> và <strong>Gót chân</strong> khớp với vạch giới hạn màu xanh trên camera.</p>
                    )}
                    <p style={{ marginTop: '0.5rem', fontSize: '0.68rem', color: '#94a3b8' }}>
                      💡 <strong>Mẹo:</strong> AI sẽ tự động ghim và lưu số đo khi bạn đứng yên ổn định trong 4 giây.
                    </p>
                  </div>
                )}
              </div>
            )}

            {warning && (
              <div className="anatomical-warning-inline">
                <span>⚠️ {warning}</span>
              </div>
            )}
            <div className="canvas-helper-text" style={{ color: '#94a3b8', border: 'none', background: 'transparent' }}>
              <RefreshCw size={12} className="spin-hover" />
              <span>Kéo thả các chấm đỏ để căn chỉnh mốc giải phẫu.</span>
            </div>
          </div>
        ) : (
          <div className="canvas-footer">
            {inputSource === 'webcam' && (
              <div className="webcam-instruction-card">
                <div className="instruction-icon">🎯</div>
                <div className="instruction-body">
                  <strong>Hướng dẫn căn chỉnh camera:</strong>
                  {scanRange === 'half' ? (
                    <p>Di chuyển đứng gần sao cho <strong>Đỉnh đầu</strong> và <strong>Hông</strong> khớp với vạch giới hạn màu xanh trên camera.</p>
                  ) : (
                    <p>Di chuyển đứng lùi xa sao cho <strong>Đỉnh đầu</strong> và <strong>Gót chân</strong> khớp với vạch giới hạn màu xanh trên camera.</p>
                  )}
                </div>
              </div>
            )}

            {inputSource === 'webcam' && (
              <div className="webcam-tilt-guide-card">
                <button
                  type="button"
                  className="tilt-guide-header"
                  onClick={() => setShowTiltTips(!showTiltTips)}
                >
                  <span>💡 Mẹo đặt Camera Laptop & Đứng Đo Chuẩn</span>
                  <span className="tilt-guide-arrow">{showTiltTips ? '▲' : '▼'}</span>
                </button>
                {showTiltTips && (
                  <div className="tilt-guide-content">
                    <div className="tilt-step">
                      <strong>1. Độ nghiêng màn hình:</strong> Gập màn hình laptop ở góc khoảng 95°-100° (nghiêng nhẹ ra sau), đặt máy trên bàn cao 70cm - 90cm.
                    </div>
                    <div className="tilt-step">
                      <strong>2. Khoảng cách đứng:</strong>
                      <ul>
                        <li><em>Chế độ Toàn thân:</em> Đứng lùi xa 2.2m - 2.5m, đảm bảo thấy rõ cả đầu và gót chân.</li>
                        <li><em>Chế độ Nửa người:</em> Đứng gần 1.0m - 1.2m (hoặc ngồi thẳng), chỉ cần thấy rõ từ đầu đến hông.</li>
                      </ul>
                    </div>
                    <div className="tilt-step">
                      <strong>3. Điện thoại di động:</strong> Nếu phòng hẹp hoặc webcam quá mờ, bấm <strong>"Dùng Điện Thoại"</strong> ở góc trái, quét QR để mở camera điện thoại góc rộng tiện lợi hơn rất nhiều!
                    </div>
                  </div>
                )}
              </div>
            )}

            {warning && (
              <div className="anatomical-warning-inline">
                <span>⚠️ {warning}</span>
              </div>
            )}
            <div className="canvas-helper-text">
              <RefreshCw size={12} className="spin-hover" />
              <span>Kéo thả các chấm đỏ để căn chỉnh chính xác mốc giải phẫu. Vuốt/kéo trên khung để xoay Mannequin 3D.</span>
            </div>
          </div>
        )}
      </div>

      <input
        type="file"
        ref={fileInputRef}
        onChange={onImageUpload}
        accept="image/*"
        style={{ display: 'none' }}
      />
      
      <input
        type="file"
        ref={fileInputVideoRef}
        onChange={handleVideoUpload}
        accept="video/*"
        style={{ display: 'none' }}
      />
    </div>
  );
};
