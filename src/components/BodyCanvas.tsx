import React, { useState, useRef, useEffect, useMemo } from 'react';
import type { Landmark, Gender, BodyMeasurements, SizeRecommendation } from '../types';
import { RefreshCw, Maximize2, Minimize2, Camera, CameraOff } from 'lucide-react';
import { Mannequin3DView } from './Mannequin3DView';


const getLimbSilhouettePath = (
  limbPoints: { x: number; y: number }[][],
  dx2d: number,
  dy2d: number
): string => {
  const nx = -dy2d;
  const ny = dx2d;
  const leftSide: { x: number; y: number }[] = [];
  const rightSide: { x: number; y: number }[] = [];

  limbPoints.forEach((ring) => {
    let minDot = Infinity;
    let maxDot = -Infinity;
    let minPt = ring[0];
    let maxPt = ring[0];

    ring.forEach((pt) => {
      const dot = pt.x * nx + pt.y * ny;
      if (dot < minDot) {
        minDot = dot;
        minPt = pt;
      }
      if (dot > maxDot) {
        maxDot = dot;
        maxPt = pt;
      }
    });

    leftSide.push(minPt);
    rightSide.push(maxPt);
  });

  const pathParts: string[] = [];
  pathParts.push(`M ${leftSide[0].x} ${leftSide[0].y}`);
  for (let i = 1; i < leftSide.length; i++) {
    pathParts.push(`L ${leftSide[i].x} ${leftSide[i].y}`);
  }
  for (let i = rightSide.length - 1; i >= 0; i--) {
    pathParts.push(`L ${rightSide[i].x} ${rightSide[i].y}`);
  }
  pathParts.push('Z');
  return pathParts.join(' ');
};

const relaxLabelY = (
  items: { y: number; originalIdx: number }[],
  minGap: number = 36,
  minY: number = 40,
  maxY: number = 610
): number[] => {
  const sorted = [...items].sort((a, b) => a.y - b.y);
  const relaxed = sorted.map(item => ({ ...item, displayY: item.y }));
  
  for (let iter = 0; iter < 100; iter++) {
    let moved = false;
    for (let i = 0; i < relaxed.length - 1; i++) {
      const a = relaxed[i];
      const b = relaxed[i + 1];
      const diff = b.displayY - a.displayY;
      if (diff < minGap) {
        const overlap = minGap - diff;
        const shift = overlap / 2;
        a.displayY = Math.max(minY, a.displayY - shift);
        b.displayY = Math.min(maxY, b.displayY + shift);
        moved = true;
      }
    }
    if (!moved) break;
  }
  
  const result: number[] = new Array(items.length);
  relaxed.forEach(r => {
    result[r.originalIdx] = r.displayY;
  });
  return result;
};

const defaultMaleMeasurements = {
  height: 180,
  shoulderWidth: 44.6,
  armLength: 59.5,
  legLength: 98.8,
  chestCircumference: 103.5,
  waistCircumference: 83.0,
  hipCircumference: 101.0,
  chestDepth: 21.6,
  waistDepth: 22.1,
  hipDepth: 25.2
};

const defaultFemaleMeasurements = {
  height: 165,
  shoulderWidth: 38.0,
  armLength: 56.0,
  legLength: 88.0,
  chestCircumference: 88.0,
  waistCircumference: 68.0,
  hipCircumference: 92.0,
  chestDepth: 18.5,
  waistDepth: 19.0,
  hipDepth: 22.0
};

interface BodyCanvasProps {
  gender: Gender;
  weight: number;
  scaleFactor: number;
  landmarks: Landmark[];
  onLandmarkChange: (id: string, x: number, y: number) => void;
  onResetLandmarks?: () => void;
  onResetModel?: () => void;
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
  onResetModel,
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
  const [cameraResetCounter, setCameraResetCounter] = useState<number>(0);
  const [countdown, setCountdown] = useState<number | null>(null);

  // Handle countdown ticks and beep audio feedback
  useEffect(() => {
    if (countdown === null) return;
    if (countdown === 0) {
      setCountdown(null);
      setIsScanning(true);
      playAudioBeep('success'); // High beep to signal scanning start
      return;
    }

    const timer = setTimeout(() => {
      playAudioBeep('countdown'); // Medium beep for tick
      setCountdown(countdown - 1);
    }, 1000);

    return () => clearTimeout(timer);
  }, [countdown]);

  useEffect(() => {
    if (view === 'side') {
      setRotationAngle(90);
    } else {
      setRotationAngle(0);
    }
  }, [view]);

  const uniqueId = useMemo(() => Math.random().toString(36).substring(2, 9), []);
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
      setIsScanning(false); // Wait for user to click scan button to start countdown
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
    } else {
      startWebcam();
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

  const [isMaximized, setIsMaximized] = useState<boolean>(false);
  const [showInlineGuide, setShowInlineGuide] = useState<boolean>(false);
  const [scanProgress, setScanProgress] = useState<number>(0);
  const [scanStatus, setScanStatus] = useState<'idle' | 'scanning' | 'success'>('idle');
  const dragStartRef = useRef<{ x: number; angle: number }>({ x: 0, angle: 0 });

  // Audio Feedback Synthesizer using Web Audio API
  const playAudioBeep = (type: 'success' | 'double' | 'countdown' = 'success') => {
    try {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioContextClass) return;
      const ctx = new AudioContextClass();
      
      if (type === 'countdown') {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(600, ctx.currentTime);
        gain.gain.setValueAtTime(0.06, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.1);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start();
        osc.stop(ctx.currentTime + 0.1);
        return;
      }
      
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
        ['left_hip', 'right_hip']
      );
      if (scanRange === 'full' || inputSource === 'mannequin') {
        connections.push(
          ['left_hip', 'left_knee'],
          ['left_knee', 'left_ankle'],
          ['right_hip', 'right_knee'],
          ['right_knee', 'right_ankle']
        );
      }
    } else {
      connections.push(
        ['nasion', 'shoulder'],
        ['shoulder', 'elbow'],
        ['elbow', 'wrist'],
        ['shoulder', 'hip'],
        ['hip', 'chest_depth'],
        ['hip', 'buttock_depth']
      );
      if (scanRange === 'full' || inputSource === 'mannequin') {
        connections.push(
          ['hip', 'knee'],
          ['knee', 'ankle']
        );
      }
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
      const rotatedZ = x3d * sinA + z3d * cosA;
      // Screen projection centered at X=200
      return { x: 200 + rotatedX, y: y3d, z: rotatedZ };
    };

    const isSide = view === 'side';

    // Joint landmarks search
    const nasionF = landmarks.find(l => l.id === 'nasion') || { x: 200, y: 75 };
    const lShoulderVal = landmarks.find(l => l.id === 'left_shoulder') || { x: 165, y: 125 };
    const rShoulderVal = landmarks.find(l => l.id === 'right_shoulder') || { x: 235, y: 125 };
    const lElbowVal = landmarks.find(l => l.id === 'left_elbow') || { x: 155, y: 220 };
    const rElbowVal = landmarks.find(l => l.id === 'right_elbow') || { x: 245, y: 220 };
    const lWristVal = landmarks.find(l => l.id === 'left_wrist') || { x: 145, y: 310 };
    const rWristVal = landmarks.find(l => l.id === 'right_wrist') || { x: 255, y: 310 };
    const lHipVal = landmarks.find(l => l.id === 'left_hip') || { x: 175, y: 300 };
    const rHipVal = landmarks.find(l => l.id === 'right_hip') || { x: 225, y: 300 };
    const lKneeVal = landmarks.find(l => l.id === 'left_knee') || { x: 175, y: 460 };
    const rKneeVal = landmarks.find(l => l.id === 'right_knee') || { x: 225, y: 460 };
    const lAnkleVal = landmarks.find(l => l.id === 'left_ankle') || { x: 175, y: 610 };
    const rAnkleVal = landmarks.find(l => l.id === 'right_ankle') || { x: 225, y: 610 };

    // For side view specific landmarks
    const sShoulder = landmarks.find(l => l.id === 'shoulder');
    const sElbow = landmarks.find(l => l.id === 'elbow');
    const sWrist = landmarks.find(l => l.id === 'wrist');
    const sHip = landmarks.find(l => l.id === 'hip');
    const sKnee = landmarks.find(l => l.id === 'knee');
    const sAnkle = landmarks.find(l => l.id === 'ankle');

    const activeAnkleY = isSide && sAnkle ? sAnkle.y : rAnkleVal.y;
    const bodyHeight = activeAnkleY - nasionF.y;
    const shoulderWidth = Math.abs(rShoulderVal.x - lShoulderVal.x) || 70;
    const hipWidth = Math.abs(rHipVal.x - lHipVal.x) || 50;

    const lShoulder3D = {
      x: isSide && sShoulder ? sShoulder.x - 200 : lShoulderVal.x - 200,
      y: isSide && sShoulder ? sShoulder.y : lShoulderVal.y,
      z: isSide ? -shoulderWidth / 2 : 0
    };
    const rShoulder3D = {
      x: isSide && sShoulder ? sShoulder.x - 200 : rShoulderVal.x - 200,
      y: isSide && sShoulder ? sShoulder.y : rShoulderVal.y,
      z: isSide ? shoulderWidth / 2 : 0
    };
    const lElbow3D = {
      x: isSide && sElbow ? sElbow.x - 200 : lElbowVal.x - 200,
      y: isSide && sElbow ? sElbow.y : lElbowVal.y,
      z: isSide ? -15 : 0
    };
    const rElbow3D = {
      x: isSide && sElbow ? sElbow.x - 200 : rElbowVal.x - 200,
      y: isSide && sElbow ? sElbow.y : rElbowVal.y,
      z: isSide ? 15 : 0
    };
    const lWrist3D = {
      x: isSide && sWrist ? sWrist.x - 200 : lWristVal.x - 200,
      y: isSide && sWrist ? sWrist.y : lWristVal.y,
      z: isSide ? -15 : 0
    };
    const rWrist3D = {
      x: isSide && sWrist ? sWrist.x - 200 : rWristVal.x - 200,
      y: isSide && sWrist ? sWrist.y : rWristVal.y,
      z: isSide ? 15 : 0
    };
    const lHip3D = {
      x: isSide && sHip ? sHip.x - 200 : lHipVal.x - 200,
      y: isSide && sHip ? sHip.y : lHipVal.y,
      z: isSide ? -hipWidth / 2 : 0
    };
    const rHip3D = {
      x: isSide && sHip ? sHip.x - 200 : rHipVal.x - 200,
      y: isSide && sHip ? sHip.y : rHipVal.y,
      z: isSide ? hipWidth / 2 : 0
    };
    const lKnee3D = {
      x: isSide && sKnee ? sKnee.x - 200 : lKneeVal.x - 200,
      y: isSide && sKnee ? sKnee.y : lKneeVal.y,
      z: isSide ? -12 : 0
    };
    const rKnee3D = {
      x: isSide && sKnee ? sKnee.x - 200 : rKneeVal.x - 200,
      y: isSide && sKnee ? sKnee.y : rKneeVal.y,
      z: isSide ? 12 : 0
    };
    const lAnkle3D = {
      x: isSide && sAnkle ? sAnkle.x - 200 : lAnkleVal.x - 200,
      y: isSide && sAnkle ? sAnkle.y : lAnkleVal.y,
      z: isSide ? -12 : 0
    };
    const rAnkle3D = {
      x: isSide && sAnkle ? sAnkle.x - 200 : rAnkleVal.x - 200,
      y: isSide && sAnkle ? sAnkle.y : rAnkleVal.y,
      z: isSide ? 12 : 0
    };

    // Hands and feet directions & endpoints
    const lh_dx = lWrist3D.x - lElbow3D.x;
    const lh_dy = lWrist3D.y - lElbow3D.y;
    const lh_dz = lWrist3D.z - lElbow3D.z;
    const lh_len = Math.sqrt(lh_dx * lh_dx + lh_dy * lh_dy + lh_dz * lh_dz) || 1;
    const lHand3D = {
      x: lWrist3D.x + (lh_dx / lh_len) * 18,
      y: lWrist3D.y + (lh_dy / lh_len) * 18,
      z: lWrist3D.z + (lh_dz / lh_len) * 18
    };

    const rh_dx = rWrist3D.x - rElbow3D.x;
    const rh_dy = rWrist3D.y - rElbow3D.y;
    const rh_dz = rWrist3D.z - rElbow3D.z;
    const rh_len = Math.sqrt(rh_dx * rh_dx + rh_dy * rh_dy + rh_dz * rh_dz) || 1;
    const rHand3D = {
      x: rWrist3D.x + (rh_dx / rh_len) * 18,
      y: rWrist3D.y + (rh_dy / rh_len) * 18,
      z: rWrist3D.z + (rh_dz / rh_len) * 18
    };

    const lFoot3D = { x: lAnkle3D.x, y: lAnkle3D.y + 6, z: lAnkle3D.z + 18 };
    const rFoot3D = { x: rAnkle3D.x, y: rAnkle3D.y + 6, z: rAnkle3D.z + 18 };

    const HUMAN_BODY_DENSITY = 0.00101; 
    const targetVolumeCm3 = weight / HUMAN_BODY_DENSITY;

    const heightCm = bodyHeight * scaleFactor;
    const headRatio = Math.max(0.07, Math.min(0.15, 0.15 - (heightCm - 50) * (0.08 / 120)));
    const headRadius = bodyHeight * headRatio;
    const headCenterY = nasionF.y - headRadius * 0.3;
    const headRadiusCm = headRadius * scaleFactor;
    const headVolumeCm3 = (4 / 3) * Math.PI * Math.pow(headRadiusCm, 3);
    const targetTorsoVolumeCm3 = Math.max(0.1 * targetVolumeCm3, targetVolumeCm3 - headVolumeCm3);

    const baseDepthRatio = gender === 'female' 
      ? { neck: 0.80, shoulder: 0.45, chest: 0.85, waist: 0.70, hips: 0.90, thighs: 0.85 } 
      : { neck: 0.85, shoulder: 0.50, chest: 0.70, waist: 0.88, hips: 0.75, thighs: 0.70 };

    const widths = {
      neck: shoulderWidth * 0.22,
      shoulder: shoulderWidth,
      chest: shoulderWidth * 0.82,
      waist: hipWidth * 0.80,
      hips: hipWidth,
      thighs: hipWidth * 0.88
    };

    const heights = {
      neck: nasionF.y + bodyHeight * 0.08,
      shoulder: isSide && sShoulder ? sShoulder.y : lShoulderVal.y,
      chest: nasionF.y + bodyHeight * 0.20,
      waist: nasionF.y + bodyHeight * 0.30,
      hips: isSide && sHip ? sHip.y : lHipVal.y,
      thighs: nasionF.y + bodyHeight * 0.55
    };

    const unscaledDepths = {
      neck: widths.neck * baseDepthRatio.neck,
      shoulder: widths.shoulder * baseDepthRatio.shoulder,
      chest: widths.chest * baseDepthRatio.chest,
      waist: widths.waist * baseDepthRatio.waist,
      hips: widths.hips * baseDepthRatio.hips,
      thighs: widths.thighs * baseDepthRatio.thighs
    };

    const ringsList = [
      { id: 'neck', y: heights.neck, w: widths.neck, dUnscaled: unscaledDepths.neck },
      { id: 'shoulder', y: heights.shoulder, w: widths.shoulder, dUnscaled: unscaledDepths.shoulder },
      { id: 'chest', y: heights.chest, w: widths.chest, dUnscaled: unscaledDepths.chest },
      { id: 'waist', y: heights.waist, w: widths.waist, dUnscaled: unscaledDepths.waist },
      { id: 'hips', y: heights.hips, w: widths.hips, dUnscaled: unscaledDepths.hips },
      { id: 'thighs', y: heights.thighs, w: widths.thighs, dUnscaled: unscaledDepths.thighs }
    ];

    // Generate 32 Interpolated Rings for Torso
    const numTorsoRings = 32;
    const interpolatedRings: { id: string; y: number; w: number; dUnscaled: number }[] = [];
    const yStart = heights.neck;
    const yEnd = heights.thighs;

    for (let i = 0; i < numTorsoRings; i++) {
      const t = i / (numTorsoRings - 1);
      const y = yStart + t * (yEnd - yStart);

      let rA = ringsList[0];
      let rB = ringsList[ringsList.length - 1];
      for (let j = 0; j < ringsList.length - 1; j++) {
        if (y >= ringsList[j].y && y <= ringsList[j + 1].y) {
          rA = ringsList[j];
          rB = ringsList[j + 1];
          break;
        }
      }

      let tRing = 0;
      if (rB.y !== rA.y) {
        tRing = (y - rA.y) / (rB.y - rA.y);
      }

      const tSmooth = (1 - Math.cos(tRing * Math.PI)) / 2;
      const w = rA.w + (rB.w - rA.w) * tSmooth;
      const dUnscaled = rA.dUnscaled + (rB.dUnscaled - rA.dUnscaled) * tSmooth;

      let ringId = 'torso';
      if (y < heights.shoulder) ringId = 'neck';
      else if (y < heights.chest) ringId = 'chest';
      else if (y < heights.waist) ringId = 'waist';
      else if (y < heights.hips) ringId = 'hips';
      else ringId = 'thighs';

      interpolatedRings.push({
        id: `${ringId}_${i}`,
        y,
        w,
        dUnscaled
      });
    }

    let unscaledTorsoVolume = 0;
    for (let i = 0; i < interpolatedRings.length - 1; i++) {
      const r1 = interpolatedRings[i];
      const r2 = interpolatedRings[i + 1];

      const h_cm = (r2.y - r1.y) * scaleFactor;
      const a1_cm = (r1.w * scaleFactor) / 2;
      const b1_cm = (r1.dUnscaled * scaleFactor) / 2;
      const a2_cm = (r2.w * scaleFactor) / 2;
      const b2_cm = (r2.dUnscaled * scaleFactor) / 2;

      const vFrustum = (h_cm * Math.PI / 3) * (a1_cm * b1_cm + a2_cm * b2_cm + (a1_cm * b2_cm + a2_cm * b1_cm) / 2);
      unscaledTorsoVolume += vFrustum;
    }

    const k = Math.max(0.3, Math.min(3.0, targetTorsoVolumeCm3 / unscaledTorsoVolume));

    const finalizedRings = interpolatedRings.map(r => ({
      id: r.id,
      y: r.y,
      w: r.w,
      d: r.dUnscaled * k
    }));

    const meshLines: { x1: number; y1: number; z1: number; x2: number; y2: number; z2: number; type: 'ring' | 'vertical' }[] = [];
    const numPointsPerRing = 16;
    const ringsPoints2D: { x: number; y: number; z: number }[][] = [];

    finalizedRings.forEach((ring) => {
      const ringPoints: { x: number; y: number; z: number }[] = [];
      const radiusX = ring.w / 2;
      const radiusZ = ring.d / 2;

      for (let i = 0; i < numPointsPerRing; i++) {
        const phi = (i * 2 * Math.PI) / numPointsPerRing;
        let x3d = radiusX * Math.cos(phi);
        let z3d = radiusZ * Math.sin(phi);

        if (gender === 'female' && ring.id.includes('chest') && z3d > 0) {
          const distanceToChest = Math.abs(ring.y - heights.chest);
          const chestSpan = heights.waist - heights.shoulder;
          const chestFactor = Math.max(0, 1 - distanceToChest / (chestSpan * 0.4));
          const breastBulge = 0.32 * chestFactor;
          z3d = z3d * (1.0 + breastBulge * Math.sin(phi));
        }

        if (gender === 'male' && ring.id.includes('chest') && z3d > 0) {
          const distanceToChest = Math.abs(ring.y - heights.chest);
          const chestSpan = heights.waist - heights.shoulder;
          const chestFactor = Math.max(0, 1 - distanceToChest / (chestSpan * 0.4));
          const breastBulge = 0.12 * chestFactor;
          z3d = z3d * (1.0 + breastBulge * Math.sin(phi));
        }

        if (ring.id.includes('hips') || ring.id.includes('thighs') || ring.id.includes('waist')) {
          if (z3d < 0) {
            const distanceToHips = Math.abs(ring.y - heights.hips);
            const hipSpan = heights.thighs - heights.waist;
            const hipFactor = Math.max(0, 1 - distanceToHips / (hipSpan * 0.5));
            const buttockBulge = gender === 'female' ? 0.25 * hipFactor : 0.12 * hipFactor;
            z3d = z3d * (1.0 + buttockBulge * Math.abs(Math.sin(phi)));
          }
        }

        const pt2d = project(x3d, ring.y, z3d);
        ringPoints.push(pt2d);
      }
      ringsPoints2D.push(ringPoints);

      for (let i = 0; i < numPointsPerRing; i++) {
        const next = (i + 1) % numPointsPerRing;
        meshLines.push({
          x1: ringPoints[i].x,
          y1: ringPoints[i].y,
          z1: ringPoints[i].z,
          x2: ringPoints[next].x,
          y2: ringPoints[next].y,
          z2: ringPoints[next].z,
          type: 'ring'
        });
      }
    });

    for (let r = 0; r < ringsPoints2D.length - 1; r++) {
      const ringA = ringsPoints2D[r];
      const ringB = ringsPoints2D[r + 1];
      for (let i = 0; i < numPointsPerRing; i++) {
        meshLines.push({
          x1: ringA[i].x,
          y1: ringA[i].y,
          z1: ringA[i].z,
          x2: ringB[i].x,
          y2: ringB[i].y,
          z2: ringB[i].z,
          type: 'vertical'
        });
      }
    }

    const numSphereRings = 4;
    const numPointsPerSphereRing = 12;
    const sphereRingsPoints2D: { x: number; y: number; z: number }[][] = [];

    for (let j = 0; j <= numSphereRings + 1; j++) {
      const theta = (j * Math.PI) / (numSphereRings + 1);
      const r = headRadius * Math.sin(theta);
      const ringY = headCenterY + headRadius * Math.cos(theta);

      const sphereRingPoints: { x: number; y: number; z: number }[] = [];
      for (let i = 0; i < numPointsPerSphereRing; i++) {
        const phi = (i * 2 * Math.PI) / numPointsPerSphereRing;
        const x3d = r * Math.cos(phi);
        const z3d = r * Math.sin(phi);

        const pt2d = project(x3d, ringY, z3d);
        sphereRingPoints.push(pt2d);
      }
      sphereRingsPoints2D.push(sphereRingPoints);
    }

    for (let j = 0; j < sphereRingsPoints2D.length; j++) {
      const currentRing = sphereRingsPoints2D[j];

      if (j > 0 && j <= numSphereRings) {
        for (let i = 0; i < numPointsPerSphereRing; i++) {
          const next = (i + 1) % numPointsPerSphereRing;
          meshLines.push({
            x1: currentRing[i].x,
            y1: currentRing[i].y,
            z1: currentRing[i].z,
            x2: currentRing[next].x,
            y2: currentRing[next].y,
            z2: currentRing[next].z,
            type: 'ring'
          });
        }
      }

      if (j < sphereRingsPoints2D.length - 1) {
        const nextRing = sphereRingsPoints2D[j + 1];
        for (let i = 0; i < numPointsPerSphereRing; i++) {
          meshLines.push({
            x1: currentRing[i].x,
            y1: currentRing[i].y,
            z1: currentRing[i].z,
            x2: nextRing[i].x,
            y2: nextRing[i].y,
            z2: nextRing[i].z,
            type: 'vertical'
          });
        }
      }
    }

    const limbsData: { id: string; points: { x: number; y: number; z: number }[][]; dx: number; dy: number }[] = [];
    const limbWeightFactor = Math.max(0.75, Math.min(1.5, Math.sqrt(weight / 55.0)));

    const addLimbSegment = (
      id: string,
      pStart: { x: number; y: number; z: number },
      pEnd: { x: number; y: number; z: number },
      rStart: number,
      rEnd: number,
      numRings: number,
      numPoints: number
    ) => {
      const limbRings: { x: number; y: number; z: number }[][] = [];

      const dx = pEnd.x - pStart.x;
      const dy = pEnd.y - pStart.y;
      const dz = pEnd.z - pStart.z;
      const len = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1;
      const ux = dx / len;
      const uy = dy / len;
      const uz = dz / len;

      let tx = 1, ty = 0, tz = 0;
      if (Math.abs(ux) > 0.9) {
        tx = 0;
        ty = 1;
      }
      let vx = uy * tz - uz * ty;
      let vy = uz * tx - ux * tz;
      let vz = ux * ty - uy * tx;
      const vLen = Math.sqrt(vx * vx + vy * vy + vz * vz) || 1;
      vx /= vLen;
      vy /= vLen;
      vz /= vLen;

      const wx = uy * vz - uz * vy;
      const wy = uz * vx - ux * vz;
      const wz = ux * vy - uy * vx;

      for (let s = 0; s <= numRings; s++) {
        const t = s / numRings;
        const cx = pStart.x + dx * t;
        const cy = pStart.y + dy * t;
        const cz = pStart.z + dz * t;
        
        let r = rStart + (rEnd - rStart) * t;

        if (id.includes('calf')) {
          const calfBulge = hipWidth * 0.032 * limbWeightFactor;
          r += calfBulge * Math.sin(Math.pow(t, 0.6) * Math.PI);
        } else if (id.includes('thigh')) {
          const thighBulge = hipWidth * 0.018 * limbWeightFactor;
          r += thighBulge * Math.sin(t * Math.PI);
        }

        let r_v = r;
        let r_w = r;
        let cy_adjusted = cy;

        if (id.includes('foot')) {
          r_v = r * (1.0 - t * 0.62);
          r_w = r * (1.0 + t * 0.35);
          cy_adjusted = cy + (rStart * 0.35 * t);
        }

        const ringPoints: { x: number; y: number; z: number }[] = [];
        for (let i = 0; i < numPoints; i++) {
          const phi = (i * 2 * Math.PI) / numPoints;
          const cosP = Math.cos(phi);
          const sinP = Math.sin(phi);

          const xOffset = r_v * cosP * vx + r_w * sinP * wx;
          const yOffset = r_v * cosP * vy + r_w * sinP * wy;
          const zOffset = r_v * cosP * vz + r_w * sinP * wz;

          const x3d = cx + xOffset;
          const y3d = cy_adjusted + yOffset;
          const z3d = cz + zOffset;

          const pt2d = project(x3d, y3d, z3d);
          ringPoints.push(pt2d);
        }
        limbRings.push(ringPoints);

        for (let i = 0; i < numPoints; i++) {
          const next = (i + 1) % numPoints;
          meshLines.push({
            x1: ringPoints[i].x,
            y1: ringPoints[i].y,
            z1: ringPoints[i].z,
            x2: ringPoints[next].x,
            y2: ringPoints[next].y,
            z2: ringPoints[next].z,
            type: 'ring'
          });
        }
      }

      for (let s = 0; s < numRings; s++) {
        const ringA = limbRings[s];
        const ringB = limbRings[s + 1];
        for (let i = 0; i < numPoints; i++) {
          meshLines.push({
            x1: ringA[i].x,
            y1: ringA[i].y,
            z1: ringA[i].z,
            x2: ringB[i].x,
            y2: ringB[i].y,
            z2: ringB[i].z,
            type: 'vertical'
          });
        }
      }

      const start2d = project(pStart.x, pStart.y, pStart.z);
      const end2d = project(pEnd.x, pEnd.y, pEnd.z);
      const dx2d = end2d.x - start2d.x;
      const dy2d = end2d.y - start2d.y;

      limbsData.push({
        id,
        points: limbRings,
        dx: dx2d || 1,
        dy: dy2d || 0
      });
    };

    addLimbSegment('l_upper_arm', lShoulder3D, lElbow3D, shoulderWidth * 0.065 * limbWeightFactor, shoulderWidth * 0.052 * limbWeightFactor, 8, 12);
    addLimbSegment('l_lower_arm', lElbow3D, lWrist3D, shoulderWidth * 0.052 * limbWeightFactor, shoulderWidth * 0.038 * limbWeightFactor, 8, 12);
    addLimbSegment('l_hand', lWrist3D, lHand3D, shoulderWidth * 0.038 * limbWeightFactor, 1.8, 4, 12);

    addLimbSegment('r_upper_arm', rShoulder3D, rElbow3D, shoulderWidth * 0.065 * limbWeightFactor, shoulderWidth * 0.052 * limbWeightFactor, 8, 12);
    addLimbSegment('r_lower_arm', rElbow3D, rWrist3D, shoulderWidth * 0.052 * limbWeightFactor, shoulderWidth * 0.038 * limbWeightFactor, 8, 12);
    addLimbSegment('r_hand', rWrist3D, rHand3D, shoulderWidth * 0.038 * limbWeightFactor, 1.8, 4, 12);

    addLimbSegment('l_thigh', lHip3D, lKnee3D, hipWidth * 0.19 * limbWeightFactor, hipWidth * 0.14 * limbWeightFactor, 10, 12);
    addLimbSegment('l_calf', lKnee3D, lAnkle3D, hipWidth * 0.14 * limbWeightFactor, hipWidth * 0.09 * limbWeightFactor, 10, 12);
    addLimbSegment('l_foot', lAnkle3D, lFoot3D, hipWidth * 0.09 * limbWeightFactor, 3.5, 4, 12);

    addLimbSegment('r_thigh', rHip3D, rKnee3D, hipWidth * 0.19 * limbWeightFactor, hipWidth * 0.14 * limbWeightFactor, 10, 12);
    addLimbSegment('r_calf', rKnee3D, rAnkle3D, hipWidth * 0.14 * limbWeightFactor, hipWidth * 0.09 * limbWeightFactor, 10, 12);
    addLimbSegment('r_foot', rAnkle3D, rFoot3D, hipWidth * 0.09 * limbWeightFactor, 3.5, 4, 12);

    const hudPoints = {
      neck: project(-widths.neck / 2, heights.neck, 0),
      chest: project(-widths.chest / 2, heights.chest, 0),
      waistLower: project(-widths.waist * 1.03 / 2, heights.waist + (heights.hips - heights.waist) * 0.4, 0),
      thighLeft: project((lHipVal.x + lKneeVal.x) / 2 - 200 - (hipWidth * 0.17 * limbWeightFactor) / 2, (lHipVal.y + lKneeVal.y) / 2, 0),
      calfLeft: project((lKneeVal.x + lAnkleVal.x) / 2 - 200 - (hipWidth * 0.12 * limbWeightFactor) / 2, (lKneeVal.y + lAnkleVal.y) / 2, 0),
      
      shoulder: project(widths.shoulder / 2, heights.shoulder, 0),
      waistUpper: project(widths.waist / 2, heights.waist, 0),
      hips: project(widths.hips / 2, heights.hips, 0),
      armRight: project((rShoulderVal.x + rElbowVal.x + rWristVal.x) / 3 - 200 + 10, (rShoulderVal.y + rElbowVal.y + rWristVal.y) / 3, 0),
      legRight: project((rHipVal.x + rKneeVal.x + rAnkleVal.x) / 3 - 200 + 12, (rHipVal.y + rKneeVal.y + rAnkleVal.y) / 3, 0),
    };

    return {
      meshLines,
      ringsPoints2D,
      headCenterY,
      headRadius,
      limbsData,
      hudPoints,
      heights,
      widths
    };
  }, [rotationAngle, landmarks, gender, weight, scaleFactor, view]);

  const projected3DMesh = projected3DData.meshLines;
  const renderSilhouette = () => {
    const { ringsPoints2D, headCenterY, headRadius, limbsData, heights } = projected3DData;

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

    const leftSide: { x: number; y: number }[] = [];
    const rightSide: { x: number; y: number }[] = [];

    ringsPoints2D.forEach(ring => {
      const { left, right } = getOuterPoints(ring);
      leftSide.push(left);
      rightSide.push(right);
    });

    const lKnee = landmarks.find(l => l.id === 'left_knee') || landmarks.find(l => l.id === 'knee') || { x: 185, y: 460 };
    const rKnee = landmarks.find(l => l.id === 'right_knee') || landmarks.find(l => l.id === 'knee') || { x: 215, y: 460 };
    const lAnkle = landmarks.find(l => l.id === 'left_ankle') || landmarks.find(l => l.id === 'ankle') || { x: 185, y: 610 };
    const rAnkle = landmarks.find(l => l.id === 'right_ankle') || landmarks.find(l => l.id === 'ankle') || { x: 215, y: 610 };

    const strokeId = `body3dStroke_${uniqueId}`;
    const heatGradId = `bodyHeatGrad_${uniqueId}`;
    const skinGradId = `skinGrad_${uniqueId}`;
    const limbGradId = `limbGrad_${uniqueId}`;
    const faceGradId = `faceGrad_${uniqueId}`;

    let fillUrl = `url(#${skinGradId})`;
    let strokeColor = '#22d3ee';
    let strokeWidth = '1.8';
    let opacity = 1.0;
    let limbFill = `url(#${limbGradId})`;
    let headFill = `url(#${faceGradId})`;
    let useGlowFilter = true;

    if (meshStyle === 'heatmap') {
      fillUrl = `url(#${heatGradId})`;
      strokeColor = 'rgba(255, 255, 255, 0.25)';
      strokeWidth = '1.0';
      limbFill = `url(#${heatGradId})`;
      headFill = `url(#${heatGradId})`;
      useGlowFilter = false;
    } else if (meshStyle === 'neon') {
      fillUrl = 'rgba(15, 23, 42, 0.75)';
      strokeColor = '#06b6d4';
      strokeWidth = '2.2';
      limbFill = 'rgba(15, 23, 42, 0.75)';
      headFill = 'rgba(15, 23, 42, 0.75)';
      useGlowFilter = true;
    } else if (hasMediaBackground) {
      fillUrl = `url(#${skinGradId})`;
      limbFill = `url(#${limbGradId})`;
      headFill = `url(#${faceGradId})`;
      opacity = 0.45;
      useGlowFilter = false;
    }

    const pathParts = [];
    pathParts.push(`M ${leftSide[0].x} ${leftSide[0].y}`);
    for (let i = 1; i < leftSide.length; i++) {
      pathParts.push(`L ${leftSide[i].x} ${leftSide[i].y}`);
    }

    const isLegVisible = scanRange === 'full' || inputSource === 'mannequin';

    if (isLegVisible) {
      pathParts.push(`L ${lKnee.x - 12} ${lKnee.y}`);
      pathParts.push(`L ${lAnkle.x - 8} ${lAnkle.y}`);
      pathParts.push(`L ${lAnkle.x - 8} ${lAnkle.y + 6}`);
      pathParts.push(`L ${lAnkle.x + 10} ${lAnkle.y + 6}`);
      pathParts.push(`L ${lAnkle.x + 8} ${lAnkle.y}`);
      pathParts.push(`L ${lKnee.x + 10} ${lKnee.y}`);
      pathParts.push(`L 200 ${leftSide[leftSide.length - 1].y + 15}`);
      
      pathParts.push(`L ${rKnee.x - 10} ${rKnee.y}`);
      pathParts.push(`L ${rAnkle.x - 8} ${rAnkle.y}`);
      pathParts.push(`L ${rAnkle.x - 10} ${rAnkle.y + 6}`);
      pathParts.push(`L ${rAnkle.x + 8} ${rAnkle.y + 6}`);
      pathParts.push(`L ${rAnkle.x + 8} ${rAnkle.y}`);
      pathParts.push(`L ${rKnee.x + 12} ${rKnee.y}`);
      pathParts.push(`L ${rightSide[rightSide.length - 1].x} ${rightSide[rightSide.length - 1].y}`);
    } else {
      pathParts.push(`C ${leftSide[leftSide.length - 1].x} ${leftSide[leftSide.length - 1].y + 22}, ${rightSide[rightSide.length - 1].x} ${rightSide[rightSide.length - 1].y + 22}, ${rightSide[rightSide.length - 1].x} ${rightSide[rightSide.length - 1].y}`);
    }

    for (let i = rightSide.length - 1; i >= 0; i--) {
      pathParts.push(`L ${rightSide[i].x} ${rightSide[i].y}`);
    }
    pathParts.push('Z');

    const bodyPathD = pathParts.join(' ');

    const limbPaths: React.ReactNode[] = [];
    if (limbsData) {
      limbsData.forEach((limb) => {
        const isLegLimb = ['l_thigh', 'l_calf', 'l_foot', 'r_thigh', 'r_calf', 'r_foot'].includes(limb.id);
        if (isLegLimb && !isLegVisible) return;

        const pathD = getLimbSilhouettePath(limb.points, limb.dx, limb.dy);
        limbPaths.push(
          <path
            key={`silhouette-${limb.id}`}
            d={pathD}
            fill={limbFill}
            stroke={meshStyle === 'solid' ? '#22d3ee' : strokeColor}
            strokeWidth={meshStyle === 'solid' ? '1.5' : strokeWidth}
            filter={useGlowFilter ? 'url(#neonGlow)' : undefined}
          />
        );
      });
    }



    const shadowGrad = `shadowGrad_${uniqueId}`;
    const neckGrad = `neckGrad_${uniqueId}`;

    return (
      <g style={{ opacity, transition: 'opacity 0.25s ease' }}>
        <defs>
          <radialGradient id={skinGradId} cx="50%" cy="40%" r="70%">
            <stop offset="0%" stopColor="rgba(34, 211, 238, 0.2)" />
            <stop offset="60%" stopColor="rgba(14, 116, 144, 0.45)" />
            <stop offset="100%" stopColor="rgba(15, 23, 42, 0.9)" />
          </radialGradient>
          <radialGradient id={limbGradId} cx="50%" cy="40%" r="70%">
            <stop offset="0%" stopColor="rgba(34, 211, 238, 0.16)" />
            <stop offset="60%" stopColor="rgba(14, 116, 144, 0.38)" />
            <stop offset="100%" stopColor="rgba(15, 23, 42, 0.9)" />
          </radialGradient>
          <radialGradient id={faceGradId} cx="50%" cy="40%" r="65%">
            <stop offset="0%" stopColor="rgba(34, 211, 238, 0.25)" />
            <stop offset="60%" stopColor="rgba(14, 116, 144, 0.45)" />
            <stop offset="100%" stopColor="rgba(15, 23, 42, 0.92)" />
          </radialGradient>
          <linearGradient id={shadowGrad} x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="rgba(6, 182, 212, 0.2)" />
            <stop offset="50%" stopColor="rgba(15, 23, 42, 0.0)" />
            <stop offset="100%" stopColor="rgba(6, 182, 212, 0.2)" />
          </linearGradient>
          <linearGradient id={neckGrad} x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="rgba(14, 116, 144, 0.6)" />
            <stop offset="50%" stopColor="rgba(34, 211, 238, 0.3)" />
            <stop offset="100%" stopColor="rgba(14, 116, 144, 0.6)" />
          </linearGradient>
          <linearGradient id={strokeId} x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#22d3ee" />
            <stop offset="100%" stopColor="#0891b2" />
          </linearGradient>
          <filter id="neonGlow" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="3" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <radialGradient id="backlightGlow" cx="50%" cy="45%" r="60%">
            <stop offset="0%" stopColor="rgba(6, 182, 212, 0.15)" />
            <stop offset="60%" stopColor="rgba(14, 116, 144, 0.04)" />
            <stop offset="100%" stopColor="rgba(9, 13, 22, 0.0)" />
          </radialGradient>
          <linearGradient id={heatGradId} x1="0" y1="50" x2="0" y2="650" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#00d2ff" />
            <stop offset="12%" stopColor="#00f5a0" />
            <stop offset="22%" stopColor="#eab308" />
            <stop offset="35%" stopColor="#ea580c" />
            <stop offset="48%" stopColor="#ef4444" />
            <stop offset="58%" stopColor="#ea580c" />
            <stop offset="70%" stopColor="#eab308" />
            <stop offset="85%" stopColor="#22c55e" />
            <stop offset="100%" stopColor="#00d2ff" />
          </linearGradient>
          <pattern id="grid" width="20" height="20" patternUnits="userSpaceOnUse">
            <path d="M 20 0 L 0 0 0 20" fill="none" stroke="rgba(148, 163, 184, 0.05)" strokeWidth="1" />
          </pattern>
        </defs>

        {!hasMediaBackground && (
          <>
            <rect width={width} height={height} fill="url(#grid)" />
            <rect width={width} height={height} fill="url(#backlightGlow)" />
          </>
        )}

        <ellipse
          cx={200}
          cy={headCenterY}
          rx={headRadius * 0.88}
          ry={headRadius}
          fill={headFill}
          stroke={meshStyle === 'solid' ? '#22d3ee' : strokeColor}
          strokeWidth={meshStyle === 'solid' ? '1.8' : strokeWidth}
          filter={useGlowFilter ? 'url(#neonGlow)' : undefined}
        />

        {meshStyle === 'solid' && (
          <>
            <path
              d={`M ${leftSide[0].x} ${leftSide[0].y} L ${200 - (rightSide[0].x - leftSide[0].x) * 0.45} ${headCenterY + headRadius * 0.85} L ${200 + (rightSide[0].x - leftSide[0].x) * 0.45} ${headCenterY + headRadius * 0.85} L ${rightSide[0].x} ${rightSide[0].y} Z`}
              fill={`url(#${neckGrad})`}
            />
            <line
              x1={leftSide[0].x} y1={leftSide[0].y}
              x2={200 - (rightSide[0].x - leftSide[0].x) * 0.45}
              y2={headCenterY + headRadius * 0.85}
              stroke="#22d3ee" strokeWidth="1.2"
              filter={useGlowFilter ? 'url(#neonGlow)' : undefined}
            />
            <line
              x1={rightSide[0].x} y1={rightSide[0].y}
              x2={200 + (rightSide[0].x - leftSide[0].x) * 0.45}
              y2={headCenterY + headRadius * 0.85}
              stroke="#22d3ee" strokeWidth="1.2"
              filter={useGlowFilter ? 'url(#neonGlow)' : undefined}
            />
          </>
        )}
        {meshStyle !== 'solid' && (
          <path
            d={`M ${leftSide[0].x} ${leftSide[0].y} L ${200 - (rightSide[0].x - leftSide[0].x) * 0.45} ${headCenterY + headRadius * 0.85} L ${200 + (rightSide[0].x - leftSide[0].x) * 0.45} ${headCenterY + headRadius * 0.85} L ${rightSide[0].x} ${rightSide[0].y} Z`}
            fill={fillUrl}
            stroke={strokeColor}
            strokeWidth={strokeWidth}
            filter={useGlowFilter ? 'url(#neonGlow)' : undefined}
          />
        )}

        <path
          d={bodyPathD}
          fill={fillUrl}
          stroke={meshStyle === 'solid' ? '#22d3ee' : strokeColor}
          strokeWidth={meshStyle === 'solid' ? '1.8' : strokeWidth}
          filter={useGlowFilter ? 'url(#neonGlow)' : undefined}
        />

        {meshStyle === 'solid' && (
          <path
            d={bodyPathD}
            fill={`url(#${shadowGrad})`}
            stroke="none"
            style={{ mixBlendMode: 'screen', opacity: 0.35 }}
          />
        )}

        {limbPaths}

        {meshStyle === 'solid' && (
          <>
            <path
              d={`M 200 ${leftSide[0].y} L 200 ${heights.chest + (heights.waist - heights.chest) * 0.4}`}
              stroke="rgba(34, 211, 238, 0.25)"
              strokeWidth="1.2"
              strokeDasharray="3,5"
            />

            {gender === 'female' && (
              <>
                <path
                  d={`M ${200 - 12} ${projected3DData.hudPoints.chest.y + 4} Q ${leftSide[10].x + 12} ${projected3DData.hudPoints.chest.y + 14} ${200 - 2} ${projected3DData.hudPoints.chest.y + 19}`}
                  fill="none"
                  stroke="rgba(34, 211, 238, 0.4)"
                  strokeWidth="2.8"
                />
                <path
                  d={`M ${200 - 12} ${projected3DData.hudPoints.chest.y + 5.5} Q ${leftSide[10].x + 12} ${projected3DData.hudPoints.chest.y + 15.5} ${200 - 2} ${projected3DData.hudPoints.chest.y + 20.5}`}
                  fill="none"
                  stroke="rgba(6, 182, 212, 0.3)"
                  strokeWidth="3.8"
                />
                <path
                  d={`M ${200 + 12} ${projected3DData.hudPoints.chest.y + 4} Q ${rightSide[10].x - 12} ${projected3DData.hudPoints.chest.y + 14} ${200 + 2} ${projected3DData.hudPoints.chest.y + 19}`}
                  fill="none"
                  stroke="rgba(34, 211, 238, 0.4)"
                  strokeWidth="2.8"
                />
                <path
                  d={`M ${200 + 12} ${projected3DData.hudPoints.chest.y + 5.5} Q ${rightSide[10].x - 12} ${projected3DData.hudPoints.chest.y + 15.5} ${200 + 2} ${projected3DData.hudPoints.chest.y + 20.5}`}
                  fill="none"
                  stroke="rgba(6, 182, 212, 0.3)"
                  strokeWidth="3.8"
                />
              </>
            )}

            {gender === 'male' && (
              <>
                <path
                  d={`M ${leftSide[8].x + 10} ${projected3DData.hudPoints.chest.y + 3} L ${200 - 8} ${projected3DData.hudPoints.chest.y + 10} L ${200 - 8} ${projected3DData.hudPoints.chest.y + 12} L ${leftSide[8].x + 12} ${projected3DData.hudPoints.chest.y + 5}`}
                  fill="rgba(6, 182, 212, 0.15)"
                />
                <path
                  d={`M ${rightSide[8].x - 10} ${projected3DData.hudPoints.chest.y + 3} L ${200 + 8} ${projected3DData.hudPoints.chest.y + 10} L ${200 + 8} ${projected3DData.hudPoints.chest.y + 12} L ${rightSide[8].x - 12} ${projected3DData.hudPoints.chest.y + 5}`}
                  fill="rgba(6, 182, 212, 0.15)"
                />
              </>
            )}

            <path
              d={`M ${leftSide[12].x + 12} ${heights.chest + (heights.waist - heights.chest) * 0.9} Q ${200 - 15} ${heights.waist} ${200 - 4} ${heights.waist + 3}`}
              fill="none"
              stroke="rgba(6, 182, 212, 0.25)"
              strokeWidth="2"
            />
            <path
              d={`M ${rightSide[12].x - 12} ${heights.chest + (heights.waist - heights.chest) * 0.9} Q ${200 + 15} ${heights.waist} ${200 + 4} ${heights.waist + 3}`}
              fill="none"
              stroke="rgba(6, 182, 212, 0.25)"
              strokeWidth="2"
            />

            <path
              d={`M ${leftSide[16].x + 4} ${heights.waist + 12} Q ${200 - 15} ${heights.waist + 24} ${200 - 3} ${heights.waist + 28}`}
              fill="none"
              stroke="rgba(6, 182, 212, 0.25)"
              strokeWidth="2"
            />
            <path
              d={`M ${rightSide[16].x - 4} ${heights.waist + 12} Q ${200 + 15} ${heights.waist + 24} ${200 + 3} ${heights.waist + 28}`}
              fill="none"
              stroke="rgba(6, 182, 212, 0.25)"
              strokeWidth="2"
            />

            <path
              d={`M ${leftSide[2].x + 6} ${heights.neck + 6} Q 200 ${heights.neck + 15} ${rightSide[2].x - 6} ${heights.neck + 6}`}
              fill="none"
              stroke="rgba(34, 211, 238, 0.3)"
              strokeWidth="1.8"
              strokeLinecap="round"
            />

            {isLegVisible && (
              <>
                <ellipse cx={lKnee.x} cy={lKnee.y} rx={8} ry={6}
                  fill="rgba(34, 211, 238, 0.15)" stroke="rgba(6, 182, 212, 0.35)" strokeWidth="0.8" />
                <ellipse cx={rKnee.x} cy={rKnee.y} rx={8} ry={6}
                  fill="rgba(34, 211, 238, 0.15)" stroke="rgba(6, 182, 212, 0.35)" strokeWidth="0.8" />
              </>
            )}

            {/* Hologram Laser Scan Line */}
            {!hasMediaBackground && (
              <line
                x1="5"
                y1="0"
                x2="395"
                y2="0"
                stroke="#22d3ee"
                strokeWidth="2.5"
                filter="url(#neonGlow)"
                className="laser-beam"
              />
            )}
          </>
        )}
      </g>
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
          {/* Reset button (Reset camera for 3D model, Reset landmarks for 2D inputs) */}
          {inputSource === 'mannequin' ? (
            <button
              type="button"
              onClick={() => {
                setCameraResetCounter(c => c + 1);
                if (onResetModel) {
                  onResetModel();
                }
              }}
              title="Đặt lại toàn bộ số đo mô hình và góc camera về mặc định chuẩn"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.25rem',
                background: 'rgba(6, 182, 212, 0.08)',
                border: '1px solid rgba(6, 182, 212, 0.3)',
                borderRadius: 'var(--radius-sm)',
                padding: '0.3rem 0.55rem',
                fontSize: '0.68rem',
                fontWeight: 600,
                color: '#06b6d4',
                cursor: 'pointer',
                transition: 'all 0.15s ease',
                whiteSpace: 'nowrap',
                flexShrink: 0
              }}
              onMouseEnter={e => (e.currentTarget.style.backgroundColor = 'rgba(6, 182, 212, 0.18)')}
              onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'rgba(6, 182, 212, 0.08)')}
            >
              <RefreshCw size={11} />
              Reset mô hình & camera
            </button>
          ) : (
            onResetLandmarks && (
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
            )
          )}
        </div>
      </div>


      <div className="canvas-container">
        <div className="media-viewport">

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

          {(inputSource === 'mannequin' || 
            (inputSource === 'image' && !uploadedImage) || 
            (inputSource === 'video' && !uploadedVideo)) && (
            <Mannequin3DView
              gender={gender}
              weight={inputSource === 'mannequin' ? weight : (gender === 'male' ? 80 : 55)}
              scaleFactor={scaleFactor}
              landmarks={landmarks}
              rotationAngle={rotationAngle}
              meshStyle={meshStyle}
              width={width}
              height={height}
              scanRange={scanRange}
              measurements={inputSource === 'mannequin' ? measurements : (gender === 'male' ? defaultMaleMeasurements : defaultFemaleMeasurements)}
              cameraResetCounter={cameraResetCounter}
              showLabels={inputSource === 'mannequin'}
              interactive={inputSource === 'mannequin'}
            />
          )}

          {inputSource !== 'mannequin' && (
            <svg
              ref={containerRef}
              viewBox={`0 0 ${width} ${height}`}
              className="landmark-svg"
              onMouseDown={handleCanvasMouseDown}
              onTouchStart={handleCanvasTouchStart}
              style={{ 
                cursor: isRotating ? 'grabbing' : 'grab',
                zIndex: 10,
                background: 'transparent'
              }}
            >
              {/* We render background silhouette only when no media background exists and not using 3D mannequin */}
              {!hasMediaBackground && inputSource !== 'image' && inputSource !== 'video' && renderSilhouette()}

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

                    // Apply Z-depth shading
                    const zAvg = (line.z1 + line.z2) / 2;
                    const maxZ = 60; // approximate max depth
                    const normalizedZ = Math.max(-1, Math.min(1, zAvg / maxZ));
                    const zFactor = (normalizedZ + 1) / 2; // 0 to 1
                    
                    // Base opacity based on line type - in solid mode make mesh subtle
                    const baseOpacity = line.type === 'ring' 
                      ? (meshStyle === 'solid' ? 0.12 : 0.85)
                      : (meshStyle === 'solid' ? 0.06 : 0.45);
                    const lineOpacity = baseOpacity * (0.28 + 0.72 * zFactor);

                    const customStyle: React.CSSProperties = {
                      opacity: lineOpacity,
                      stroke: meshStyle === 'solid' ? 'rgba(34, 211, 238, 0.35)' : undefined
                    };
                    if (strokeColor) {
                      customStyle.stroke = strokeColor;
                      customStyle.strokeWidth = line.type === 'ring' ? '1.3px' : '0.7px';
                    }

                    return (
                      <line
                        key={`mesh-${idx}`}
                        x1={line.x1}
                        y1={line.y1}
                        x2={line.x2}
                        y2={line.y2}
                        className={`mesh-line ${line.type}`}
                        style={customStyle}
                      />
                    );
                  })}
                </g>
              )}

              {/* Direct 3D HUD Measurements Labels (only in Mannequin mode) */}
              {measurements && !hasMediaBackground && projected3DData.hudPoints && (() => {
                const leftLabels = view === 'front' ? [
                  { label: 'CỔ', value: (measurements.chestCircumference * (gender === 'female' ? 0.38 : 0.41)).toFixed(1) + " cm", pt: projected3DData.hudPoints.neck },
                  { label: 'NGỰC', value: measurements.chestCircumference.toFixed(1) + " cm", pt: projected3DData.hudPoints.chest },
                  { label: 'EO DƯỚI', value: (measurements.waistCircumference * 1.05).toFixed(1) + " cm", pt: projected3DData.hudPoints.waistLower },
                  { label: 'ĐÙI PHẢI', value: (measurements.hipCircumference * (gender === 'female' ? 0.58 : 0.55)).toFixed(1) + " cm", pt: projected3DData.hudPoints.thighLeft },
                  { label: 'BẮP CHÂN PHẢI', value: (measurements.hipCircumference * 0.38).toFixed(1) + " cm", pt: projected3DData.hudPoints.calfLeft },
                ] : [
                  { label: 'ĐỘ SÂU NGỰC', value: (measurements.chestDepth || 0).toFixed(1) + " cm", pt: landmarks.find(l => l.id === 'chest_depth') || { x: 232, y: 195 } },
                  { label: 'ĐỘ SÂU MÔNG', value: (measurements.hipDepth || 0).toFixed(1) + " cm", pt: landmarks.find(l => l.id === 'buttock_depth') || { x: 168, y: 305 } }
                ];

                const rightLabels = view === 'front' ? [
                  { label: 'RỘNG VAI', value: measurements.shoulderWidth.toFixed(1) + " cm", pt: projected3DData.hudPoints.shoulder },
                  { label: 'EO TRÊN', value: (measurements.waistCircumference * 0.96).toFixed(1) + " cm", pt: projected3DData.hudPoints.waistUpper },
                  { label: 'MÔNG', value: measurements.hipCircumference.toFixed(1) + " cm", pt: projected3DData.hudPoints.hips },
                  { label: 'DÀI TAY', value: measurements.armLength.toFixed(1) + " cm", pt: projected3DData.hudPoints.armRight },
                  { label: 'DÀI CHÂN', value: measurements.legLength.toFixed(1) + " cm", pt: projected3DData.hudPoints.legRight },
                ] : [
                  { label: 'ĐỘ SÂU EO', value: (measurements.waistDepth || 0).toFixed(1) + " cm", pt: landmarks.find(l => l.id === 'hip') || { x: 200, y: 295 } }
                ];

                const leftY = relaxLabelY(leftLabels.map((item, idx) => ({ y: item.pt.y, originalIdx: idx })), 36, 40, 610);
                const rightY = relaxLabelY(rightLabels.map((item, idx) => ({ y: item.pt.y, originalIdx: idx })), 36, 40, 610);
                
                return (
                  <g className="hud-labels-group" style={{ pointerEvents: 'none' }}>
                    {/* Left Labels */}
                    {leftLabels.map((item, idx) => {
                      const displayY = leftY[idx];
                      return (
                        <g key={`hud-l-comp-${idx}`} className="hud-label-group">
                          <line
                            x1={85}
                            y1={displayY}
                            x2={item.pt.x}
                            y2={item.pt.y}
                            className="hud-pointer-line left"
                          />
                          <circle
                            cx={item.pt.x}
                            cy={item.pt.y}
                            className="hud-pointer-dot left"
                          />
                          <rect
                            x={3}
                            y={displayY - 12}
                            width={82}
                            height={24}
                            rx={6}
                            ry={6}
                            fill="rgba(15, 23, 42, 0.85)"
                            stroke="rgba(6, 182, 212, 0.25)"
                            strokeWidth="1"
                          />
                          <text
                            x={80}
                            y={displayY - 2}
                            textAnchor="end"
                            className="hud-label-text left"
                            style={{ fill: '#22d3ee', fontSize: '8px', fontWeight: 700 }}
                          >
                            {item.label}
                          </text>
                          <text
                            x={80}
                            y={displayY + 8}
                            textAnchor="end"
                            className="hud-label-value left"
                            style={{ fill: '#06b6d4', fontSize: '10px', fontWeight: 800 }}
                          >
                            {item.value}
                          </text>
                        </g>
                      );
                    })}

                    {/* Right Labels */}
                    {rightLabels.map((item, idx) => {
                      const displayY = rightY[idx];
                      return (
                        <g key={`hud-r-comp-${idx}`} className="hud-label-group">
                          <line
                            x1={315}
                            y1={displayY}
                            x2={item.pt.x}
                            y2={item.pt.y}
                            className="hud-pointer-line right"
                          />
                          <circle
                            cx={item.pt.x}
                            cy={item.pt.y}
                            className="hud-pointer-dot right"
                          />
                          <rect
                            x={315}
                            y={displayY - 12}
                            width={82}
                            height={24}
                            rx={6}
                            ry={6}
                            fill="rgba(15, 23, 42, 0.85)"
                            stroke="rgba(251, 191, 36, 0.25)"
                            strokeWidth="1"
                          />
                          <text
                            x={320}
                            y={displayY - 2}
                            textAnchor="start"
                            className="hud-label-text right"
                            style={{ fill: '#f59e0b', fontSize: '8px', fontWeight: 700 }}
                          >
                            {item.label}
                          </text>
                          <text
                            x={320}
                            y={displayY + 8}
                            textAnchor="start"
                            className="hud-label-value right"
                            style={{ fill: '#fbbf24', fontSize: '10px', fontWeight: 800 }}
                          >
                            {item.value}
                          </text>
                        </g>
                      );
                    })}
                  </g>
                );
              })()}

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
          )}

          {/* Floating AI Scanning Controls Overlay */}
          {inputSource === 'webcam' && isWebcamActive && !isModelLoading && (
            <div className="ai-controls-overlay">
              <button
                type="button"
                className={`ai-scan-btn ${isScanning ? 'scanning' : 'paused'}`}
                onClick={() => {
                  if (isScanning) {
                    setIsScanning(false);
                  } else {
                    if (scanStatus === 'success') {
                      setScanProgress(0);
                      setScanStatus('idle');
                    }
                    setCountdown(5);
                  }
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
                    setCountdown(5);
                  }}
                >
                  Quét Lại (Rescan)
                </button>
              </div>
            </div>
          )}

          {/* Start Scan Button Overlay (Webcam active, scan idle, not scanning/counting down) */}
          {inputSource === 'webcam' && isWebcamActive && scanStatus === 'idle' && !isScanning && countdown === null && (
            <div style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              background: 'rgba(0, 0, 0, 0.45)',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 50
            }}>
              <button
                type="button"
                onClick={() => setCountdown(5)}
                style={{
                  background: 'linear-gradient(135deg, #0055ff, #00f5ff)',
                  border: 'none',
                  borderRadius: '50px',
                  color: '#fff',
                  padding: '0.85rem 1.75rem',
                  fontSize: '0.92rem',
                  fontWeight: 700,
                  cursor: 'pointer',
                  boxShadow: '0 0 20px rgba(0, 245, 255, 0.45)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  transition: 'all 0.2s ease',
                  textTransform: 'uppercase',
                  letterSpacing: '1px'
                }}
                onMouseEnter={e => {
                  e.currentTarget.style.transform = 'scale(1.05)';
                  e.currentTarget.style.boxShadow = '0 0 30px rgba(0, 245, 255, 0.65)';
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.transform = 'scale(1)';
                  e.currentTarget.style.boxShadow = '0 0 20px rgba(0, 245, 255, 0.45)';
                }}
              >
                ⏱️ Bắt đầu quét AI (5s)
              </button>
              <p style={{
                marginTop: '1rem',
                color: 'rgba(255, 255, 255, 0.85)',
                fontSize: '0.75rem',
                textAlign: 'center',
                maxWidth: '82%',
                lineHeight: 1.45,
                fontFamily: 'system-ui, sans-serif'
              }}>
                Vui lòng đặt máy cố định, đứng lùi ra xa khoảng 2.2m - 2.5m để camera thu trọn vẹn từ đầu đến chân trước khi đếm ngược kết thúc.
              </p>
            </div>
          )}

          {/* Countdown timer overlay with ticking animation */}
          {countdown !== null && (
            <div style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              background: 'rgba(9, 13, 22, 0.75)',
              backdropFilter: 'blur(4px)',
              WebkitBackdropFilter: 'blur(4px)',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 100,
              color: '#00f5ff',
              fontFamily: 'system-ui, sans-serif'
            }}>
              <div style={{
                width: '90px',
                height: '90px',
                borderRadius: '50%',
                border: '4px solid #00f5ff',
                boxShadow: '0 0 20px rgba(0, 245, 255, 0.4)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '2.8rem',
                fontWeight: 800,
                marginBottom: '1rem'
              }}>
                {countdown}
              </div>
              <span style={{ fontSize: '0.78rem', letterSpacing: '1px', textTransform: 'uppercase', color: '#fff', fontWeight: 600 }}>
                Chuẩn bị tạo dáng đứng...
              </span>
            </div>
          )}

          {/* Floating AI Scanning Guidance Tooltip */}
          {hasMediaBackground && (
            <div style={{
              position: 'absolute',
              bottom: '12px',
              left: '12px',
              right: '12px',
              background: 'rgba(15, 23, 42, 0.95)',
              border: '1px solid rgba(34, 211, 238, 0.45)',
              borderRadius: 'var(--radius-md)',
              padding: '0.6rem 0.85rem',
              display: 'flex',
              flexDirection: 'column',
              gap: '0.25rem',
              zIndex: 40,
              boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.55)',
              backdropFilter: 'blur(8px)',
              WebkitBackdropFilter: 'blur(8px)',
              pointerEvents: 'none',
              fontFamily: 'system-ui, sans-serif'
            }}>
              <span style={{ fontSize: '0.78rem', fontWeight: 700, color: '#22d3ee', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                💡 HƯỚNG DẪN CÂN CHỈNH SỐ ĐO ẢNH CHỤP
              </span>
              <p style={{ fontSize: '0.7rem', color: '#cbd5e1', margin: 0, lineHeight: 1.45 }}>
                1. <strong>Nhấn giữ và kéo các chấm tròn</strong> (Mũi, Vai, Tay, Hông, Gối, Cổ chân...) trên màn hình khớp vào các khớp xương tương ứng của người mẫu trong ảnh.
              </p>
              <p style={{ fontSize: '0.7rem', color: '#cbd5e1', margin: 0, lineHeight: 1.45 }}>
                2. Điền <strong>Chiều cao ước tính</strong> và kéo thanh trượt <strong>Cân nặng thực tế</strong> ở cột bên trái tương ứng với người mẫu để hệ thống tính toán chính xác.
              </p>
            </div>
          )}
        </div>

        {/* Style Controls Rendered Cleanly BELOW the Viewport Box */}
        {(inputSource !== 'webcam' || isWebcamActive) && (
          <div 
            className="mesh-style-controls" 
            style={{ 
              marginTop: '12px', 
              zIndex: 30, 
              display: 'flex', 
              gap: '0.35rem', 
              background: 'rgba(15, 23, 42, 0.85)', 
              backdropFilter: 'blur(8px)',
              WebkitBackdropFilter: 'blur(8px)',
              padding: '0.3rem', 
              borderRadius: '30px', 
              border: '1px solid rgba(255, 255, 255, 0.15)',
              boxShadow: '0 8px 32px rgba(0, 0, 0, 0.36)'
            }}
          >
            <button
              type="button"
              className={`style-btn ${meshStyle === 'solid' ? 'active' : ''}`}
              onClick={() => setMeshStyle('solid')}
              style={{ 
                background: meshStyle === 'solid' ? '#3b82f6' : 'transparent', 
                color: '#fff', 
                border: 'none', 
                padding: '0.35rem 0.8rem', 
                borderRadius: '20px', 
                fontSize: '0.68rem', 
                cursor: 'pointer', 
                fontWeight: 600,
                transition: 'all 0.2s ease'
              }}
            >
              Khối đặc
            </button>
            <button
              type="button"
              className={`style-btn ${meshStyle === 'neon' ? 'active' : ''}`}
              onClick={() => setMeshStyle('neon')}
              style={{ 
                background: meshStyle === 'neon' ? '#3b82f6' : 'transparent', 
                color: '#fff', 
                border: 'none', 
                padding: '0.35rem 0.8rem', 
                borderRadius: '20px', 
                fontSize: '0.68rem', 
                cursor: 'pointer', 
                fontWeight: 600,
                transition: 'all 0.2s ease'
              }}
            >
              Neon
            </button>
            <button
              type="button"
              className={`style-btn ${meshStyle === 'heatmap' ? 'active' : ''}`}
              onClick={() => setMeshStyle('heatmap')}
              style={{ 
                background: meshStyle === 'heatmap' ? '#3b82f6' : 'transparent', 
                color: '#fff', 
                border: 'none', 
                padding: '0.35rem 0.8rem', 
                borderRadius: '20px', 
                fontSize: '0.68rem', 
                cursor: 'pointer', 
                fontWeight: 600,
                transition: 'all 0.2s ease'
              }}
            >
              Nhiệt (AI)
            </button>
          </div>
        )}

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
