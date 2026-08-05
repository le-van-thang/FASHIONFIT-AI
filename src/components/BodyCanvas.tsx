import React, { useState, useRef, useEffect } from 'react';
import type { Landmark, Gender, BodyMeasurements, SizeRecommendation } from '../types';
import { RefreshCw, Maximize2, Minimize2, Camera, CameraOff, Upload, Trash2, Sun, Moon, Sparkles } from 'lucide-react';
import { Mannequin3DView } from './Mannequin3DView';




/*
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
*/



interface BodyCanvasProps {
  gender: Gender;
  weight: number;
  scaleFactor: number;
  landmarks: Landmark[];
  onLandmarkChange: (id: string, x: number, y: number) => void;
  onLandmarksBatchChange?: (landmarks: Landmark[]) => void;
  onResetLandmarks?: () => void;
  onResetModel?: () => void;
  view: 'front' | 'side';
  onViewChange: (view: 'front' | 'side') => void;
  uploadedImage: string | null;
  onImageUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onClearImage?: () => void;
  warning: string | null;
  measurements?: BodyMeasurements;
  recommendation?: SizeRecommendation;
  inputSource: 'mannequin' | 'image' | 'webcam' | 'video';
  onInputSourceChange: (source: 'mannequin' | 'image' | 'webcam' | 'video') => void;
  scanRange?: 'full' | 'half';
  isScanned?: boolean;
  onScanComplete?: (source: string) => void;
  onResetScan?: () => void;
}

export const BodyCanvas: React.FC<BodyCanvasProps> = ({
  gender,
  weight,
  scaleFactor,
  landmarks,
  onLandmarkChange,
  onLandmarksBatchChange,
  onResetLandmarks,
  onResetModel,
  view,
  onViewChange,
  uploadedImage,
  onImageUpload,
  onClearImage,
  warning,
  measurements,
  recommendation,
  inputSource,
  onInputSourceChange,
  scanRange = 'full',
  isScanned = true,
  onScanComplete,
  onResetScan
}) => {
  const containerRef = useRef<SVGSVGElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const fileInputVideoRef = useRef<HTMLInputElement | null>(null);
  const [activePointId, setActivePointId] = useState<string | null>(null);
  const [hoveredPointId, setHoveredPointId] = useState<string | null>(null);
  const [showImageGuidance, setShowImageGuidance] = useState<boolean>(true);
  
  // 3D rotation angle in degrees
  const [rotationAngle, setRotationAngle] = useState<number>(0);
  const [cameraResetCounter, setCameraResetCounter] = useState<number>(0);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('user');
  const [videoDeviceCount, setVideoDeviceCount] = useState<number>(1);
  const [isPoseValid, setIsPoseValid] = useState<boolean>(true);
  const [poseWarning, setPoseWarning] = useState<string | null>(null);
  const [cameraErrorMsg, setCameraErrorMsg] = useState<string | null>(null);
  const [showSnapshotModal, setShowSnapshotModal] = useState<boolean>(false);
  const isPoseValidRef = useRef<boolean>(true);

  // Synchronize 3D model rotation angle with active view tab ('front' -> 0°, 'side' -> 90°)
  useEffect(() => {
    setRotationAngle(view === 'side' ? 90 : 0);
  }, [view]);

  // Detect number of camera devices available on system
  useEffect(() => {
    if (navigator.mediaDevices && navigator.mediaDevices.enumerateDevices) {
      navigator.mediaDevices.enumerateDevices().then(devices => {
        const videoDevs = devices.filter(d => d.kind === 'videoinput');
        setVideoDeviceCount(videoDevs.length || 1);
      }).catch(() => {
        setVideoDeviceCount(1);
      });
    }
  }, []);

  const updatePoseState = (valid: boolean, warningMsg: string | null = null) => {
    isPoseValidRef.current = valid;
    setIsPoseValid(valid);
    setPoseWarning(warningMsg);
  };

  // Handle countdown ticks and beep audio feedback
  useEffect(() => {
    if (countdown === null) return;
    if (countdown === 0) {
      if (inputSource === 'webcam' && !isPoseValidRef.current) {
        setCountdown(null);
        setIsScanning(false);
        setScanStatus('idle');
        setScanProgress(0);
        alert("⚠️ THÔNG BÁO TỪ THỆ THỐNG AI FASHIONFIT:\n\nPhát hiện tư thế KHÔNG HỢP LỆ (Đang nằm hoặc cúi đầu trước camera)!\n\nVui lòng đứng thẳng toàn thân trước camera để AI kích hoạt tính năng quét số đo.");
        return;
      }
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


  const [isScanning, setIsScanning] = useState<boolean>(false);
  const [isModelLoading, setIsModelLoading] = useState<boolean>(false);
  const [uploadedVideo, setUploadedVideo] = useState<string | null>(null);
  const [showPip3D, setShowPip3D] = useState<boolean>(false);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const cameraInstanceRef = useRef<any>(null);
  const poseInstanceRef = useRef<any>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const prevLandmarksMapRef = useRef<Record<string, { x: number; y: number }>>({});

  // Ref to store the latest values of props/states to avoid stale closures in MediaPipe callbacks
  const trackingParamsRef = useRef({
    view,
    landmarks,
    onLandmarkChange,
    onLandmarksBatchChange,
    inputSource,
    scanRange
  });

  useEffect(() => {
    trackingParamsRef.current = {
      view,
      landmarks,
      onLandmarkChange,
      onLandmarksBatchChange,
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
    if (!results.poseLandmarks) {
      if (trackingParamsRef.current.inputSource === 'webcam') {
        setIsPoseValid(false);
        setPoseWarning("Không tìm thấy cơ thể trong camera");
      }
      return;
    }
    const mp = results.poseLandmarks;
    const { view, landmarks, onLandmarkChange, inputSource, scanRange } = trackingParamsRef.current;

    // Validate standing posture for webcam
    if (inputSource === 'webcam') {
      const nose = mp[0];
      const lShoulder = mp[11];
      const rShoulder = mp[12];

      const lShoulderVis = lShoulder?.visibility ?? 0;
      const rShoulderVis = rShoulder?.visibility ?? 0;

      // 1. Check if upper body / shoulders are visible with confidence
      if (lShoulderVis < 0.4 && rShoulderVis < 0.4) {
        updatePoseState(false, "Vui lòng đứng lùi xa khoảng 2.2m để camera thấy rõ vai & toàn thân");
        return;
      }

      // 2. Check if user is lying down or tilted horizontally
      if (lShoulder && rShoulder) {
        const dx = Math.abs(lShoulder.x - rShoulder.x);
        const dy = Math.abs(lShoulder.y - rShoulder.y);
        if (dy > dx * 1.1) {
          updatePoseState(false, "Phát hiện tư thế nằm! Vui lòng đứng thẳng trước camera");
          return;
        }
      }

      // 3. Check if nose is below shoulder level (lying down facing camera)
      if (nose && lShoulder && rShoulder) {
        const avgShoulderY = (lShoulder.y + rShoulder.y) / 2;
        if (nose.y > avgShoulderY) {
          updatePoseState(false, "Đang nằm hoặc cúi đầu! Vui lòng đứng thẳng");
          return;
        }
      }

      // Valid standing posture detected
      updatePoseState(true, null);
    } else {
      updatePoseState(true, null);
    }

    // Helper function for 1:1 video landmark alignment without aspect-ratio crop distortion
    const mapMediaPipePoint = (rawX: number, rawY: number) => {
      const normX = inputSource === 'webcam' ? (1 - rawX) : rawX;
      const normY = rawY;

      const vid = videoRef.current;
      if (inputSource === 'webcam' && vid && vid.videoWidth > 0 && vid.videoHeight > 0) {
        // Clamp normalized coordinates to [0.02, 0.98] to prevent runaway dot drifting off-screen
        const clampedX = Math.max(0.02, Math.min(0.98, normX));
        const clampedY = Math.max(0.02, Math.min(0.98, normY));

        return {
          x: Math.round(clampedX * 400),
          y: Math.round(clampedY * 650)
        };
      }

      return {
        x: Math.round(normX * 400),
        y: Math.round(normY * 650)
      };
    };

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
          const jointVis = mp[mpIndex].visibility ?? 1;
          if (inputSource === 'webcam' && jointVis < 0.35) {
            return l;
          }

          let rawX = mp[mpIndex].x;
          let rawY = mp[mpIndex].y;

          if (l.id === 'nasion' && mp[1] && mp[4]) {
            // Anatomical Nasion: Anchor to eye bridge so head tilt never shifts point down to mouth
            rawX = (mp[0].x * 0.4 + mp[1].x * 0.3 + mp[4].x * 0.3);
            rawY = (mp[0].y * 0.25 + mp[1].y * 0.375 + mp[4].y * 0.375);
          } else if (l.id === 'left_shoulder' || l.id === 'right_shoulder') {
            // Align shoulder landmark right on top shoulder ridge
            rawY = mp[mpIndex].y - 0.015;
          }

          const pt = mapMediaPipePoint(rawX, rawY);
          
          // Exponential Moving Average (EMA) filter for 60FPS smooth tracking without lag or jitter
          const prevPt = prevLandmarksMapRef.current[l.id];
          const alpha = 0.72; // Ultra-responsive tracking weight
          const smoothedX = prevPt ? Math.round(alpha * pt.x + (1 - alpha) * prevPt.x) : pt.x;
          const smoothedY = prevPt ? Math.round(alpha * pt.y + (1 - alpha) * prevPt.y) : pt.y;

          prevLandmarksMapRef.current[l.id] = { x: smoothedX, y: smoothedY };
          return { ...l, x: smoothedX, y: smoothedY, visibility: jointVis };
        }
        return { ...l, visibility: 0 };
      });

      const { onLandmarksBatchChange } = trackingParamsRef.current;
      if (onLandmarksBatchChange) {
        onLandmarksBatchChange(newLandmarks);
      } else {
        newLandmarks.forEach(l => {
          if (l.id.includes('knee') || l.id.includes('ankle')) {
            if (scanRange === 'half') return;
          }
          onLandmarkChange(l.id, l.x, l.y);
        });
      }
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
          const pt = mapMediaPipePoint(mpPt.x, mpPt.y);
          const prevPt = prevLandmarksMapRef.current[l.id];
          const alpha = 0.72;
          const smoothedX = prevPt ? Math.round(alpha * pt.x + (1 - alpha) * prevPt.x) : pt.x;
          const smoothedY = prevPt ? Math.round(alpha * pt.y + (1 - alpha) * prevPt.y) : pt.y;
          prevLandmarksMapRef.current[l.id] = { x: smoothedX, y: smoothedY };
          return { ...l, x: smoothedX, y: smoothedY };
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

      const { onLandmarksBatchChange } = trackingParamsRef.current;
      if (onLandmarksBatchChange) {
        onLandmarksBatchChange(newLandmarks);
      } else {
        newLandmarks.forEach(l => {
          if (l.id === 'knee' || l.id === 'ankle') {
            if (scanRange === 'half') return;
          }
          onLandmarkChange(l.id, l.x, l.y);
        });
      }
    }
  };

  const startWebcam = async (overrideMode?: 'user' | 'environment') => {
    const targetMode = overrideMode || facingMode;
    setIsModelLoading(true);
    try {
      await loadMediaPipeScripts();
      stopWebcam();

      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: targetMode }
        });
      } catch (modeErr) {
        console.warn(`Camera mode '${targetMode}' not supported, falling back to default camera:`, modeErr);
        setFacingMode('user');
        stream = await navigator.mediaDevices.getUserMedia({
          video: { width: { ideal: 1280 }, height: { ideal: 720 } }
        });
      }

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
          modelComplexity: 0,
          smoothLandmarks: true,
          enableSegmentation: false,
          minDetectionConfidence: 0.4,
          minTrackingConfidence: 0.4
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
      setCameraErrorMsg(null);
      setIsScanning(false); // Wait for user to click scan button to start countdown
    } catch (err: any) {
      console.error("Camera error:", err);
      setIsWebcamActive(false); // Show clean camera permission placeholder overlay with retry button
      if (err?.name === 'NotReadableError' || err?.name === 'TrackStartError') {
        setCameraErrorMsg("⚠️ Camera đang được sử dụng bởi ứng dụng khác (Chrome / Zoom / Zalo). Vui lòng đóng tab Chrome hoặc ứng dụng đang chiếm webcam rồi bấm 'Kích Hoạt Lại'.");
      } else if (err?.name === 'NotAllowedError' || err?.name === 'PermissionDeniedError') {
        setCameraErrorMsg("🚫 Quyền Camera bị từ chối trên Microsoft Edge. Bấm vào biểu tượng 🔒 hoặc 📹 trên thanh địa chỉ Edge, chọn 'Allow' (Cho phép) rồi bấm 'Kích Hoạt Lại'.");
      } else {
        setCameraErrorMsg("⚠️ Không thể kết nối với Webcam. Vui lòng kiểm tra thiết bị và bấm 'Kích Hoạt Lại'.");
      }
    } finally {
      setIsModelLoading(false);
    }
  };

  const toggleFacingMode = () => {
    const nextMode = facingMode === 'user' ? 'environment' : 'user';
    setFacingMode(nextMode);
    startWebcam(nextMode);
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
    // Note: we do NOT auto-open file dialog here — user presses the button manually
  }, [inputSource]);

  // Automatic pose detection on uploaded image
  useEffect(() => {
    if (inputSource === 'image' && uploadedImage) {
      const runImagePoseDetection = async () => {
        setIsModelLoading(true);
        try {
          await loadMediaPipeScripts();
          
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

          const img = new Image();
          img.crossOrigin = "anonymous";
          img.onload = async () => {
            try {
              await poseInstanceRef.current.send({ image: img });
            } catch (err) {
              console.error("Error sending image to MediaPipe Pose:", err);
            } finally {
              setIsModelLoading(false);
            }
          };
          img.src = uploadedImage;
        } catch (err) {
          console.error("Failed to run image pose detection:", err);
          setIsModelLoading(false);
        }
      };

      runImagePoseDetection();
    }
  }, [uploadedImage, inputSource]);

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

  const [isRotating, setIsRotating] = useState<boolean>(false);
  const [meshStyle, setMeshStyle] = useState<'solid' | 'neon' | 'heatmap'>('solid');
  const [isWebcamActive, setIsWebcamActive] = useState<boolean>(false);
  const [showTiltTips, setShowTiltTips] = useState<boolean>(false);
  const [lightingMode, setLightingMode] = useState<'auto' | 'bright' | 'dark' | 'normal'>('auto');
  const [showLightingMenu, setShowLightingMenu] = useState<boolean>(false);

  // Real-time Adaptive Lighting & Anti-Overexposure / Anti-Underexposed Filter
  const getVideoFilterStyle = () => {
    switch (lightingMode) {
      case 'auto':
        return 'contrast(1.22) brightness(1.05) saturate(1.04)';
      case 'bright':
        // Anti-Overexposure: Dìm ánh sáng chói lóa (brightness 0.78), tăng tương phản viền bờ vai & eo (contrast 1.35)
        return 'contrast(1.35) brightness(0.78) saturate(0.90)';
      case 'dark':
        // Anti-Dark: Bù sáng mạnh (brightness 1.20), tăng nổi bật khung hình thể (contrast 1.25)
        return 'contrast(1.25) brightness(1.20) saturate(1.08)';
      case 'normal':
      default:
        return 'none';
    }
  };

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
        // Pause scan progress if webcam pose is invalid (e.g. user is lying down or out of frame)
        if (inputSource === 'webcam' && !isPoseValidRef.current) {
          return;
        }

        setScanProgress(prev => {
          if (prev >= 100) {
            clearInterval(interval!);
            setIsScanning(false);
            setScanStatus('success');
            playAudioBeep('double');
            if (onScanComplete) {
              onScanComplete(inputSource);
            }
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
  }, [isScanning, isPoseValid, inputSource]);

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
    const lines: React.ReactNode[] = [];
    let idx = 0;

    const drawLine = (p1: (Landmark & { visibility?: number }) | { x: number; y: number; visibility?: number } | undefined, p2: (Landmark & { visibility?: number }) | { x: number; y: number; visibility?: number } | undefined) => {
      if (!p1 || !p2) return;
      if (inputSource === 'webcam') {
        const vis1 = p1.visibility ?? 1;
        const vis2 = p2.visibility ?? 1;
        if (vis1 < 0.45 || vis2 < 0.45) return;
      }
      lines.push(
        <line
          key={`bone-${idx++}`}
          x1={p1.x}
          y1={p1.y}
          x2={p2.x}
          y2={p2.y}
          className="skeletal-line"
        />
      );
    };

    if (view === 'front') {
      const nasion = landmarks.find(l => l.id === 'nasion');
      const lShoulder = landmarks.find(l => l.id === 'left_shoulder');
      const rShoulder = landmarks.find(l => l.id === 'right_shoulder');
      const lElbow = landmarks.find(l => l.id === 'left_elbow');
      const rElbow = landmarks.find(l => l.id === 'right_elbow');
      const lWrist = landmarks.find(l => l.id === 'left_wrist');
      const rWrist = landmarks.find(l => l.id === 'right_wrist');
      const lHip = landmarks.find(l => l.id === 'left_hip');
      const rHip = landmarks.find(l => l.id === 'right_hip');
      const lKnee = landmarks.find(l => l.id === 'left_knee');
      const rKnee = landmarks.find(l => l.id === 'right_knee');
      const lAnkle = landmarks.find(l => l.id === 'left_ankle');
      const rAnkle = landmarks.find(l => l.id === 'right_ankle');

      // Midpoints for spine
      let midShoulder: { x: number; y: number } | undefined = undefined;
      if (lShoulder && rShoulder) {
        midShoulder = { x: (lShoulder.x + rShoulder.x) / 2, y: (lShoulder.y + rShoulder.y) / 2 };
      }
      let midHip: { x: number; y: number } | undefined = undefined;
      if (lHip && rHip) {
        midHip = { x: (lHip.x + rHip.x) / 2, y: (lHip.y + rHip.y) / 2 };
      }

      // 1. Central line from nose (nasion) to feet
      drawLine(nasion, midShoulder);
      drawLine(midShoulder, midHip);

      // 2. Shoulder line
      drawLine(lShoulder, rShoulder);

      // 3. Pelvis line
      drawLine(lHip, rHip);

      // 4. Arms
      drawLine(lShoulder, lElbow);
      drawLine(lElbow, lWrist);
      drawLine(rShoulder, rElbow);
      drawLine(rElbow, rWrist);

      // 5. Legs (if full range or mannequin)
      if (scanRange === 'full' || inputSource === 'mannequin') {
        drawLine(lHip, lKnee);
        drawLine(lKnee, lAnkle);
        drawLine(rHip, rKnee);
        drawLine(rKnee, rAnkle);
        // Connect midHip split to hips
        drawLine(midHip, lHip);
        drawLine(midHip, rHip);
      }
    } else {
      // Side view: just connect in a single chain
      const nasion = landmarks.find(l => l.id === 'nasion');
      const shoulder = landmarks.find(l => l.id === 'shoulder');
      const elbow = landmarks.find(l => l.id === 'elbow');
      const wrist = landmarks.find(l => l.id === 'wrist');
      const hip = landmarks.find(l => l.id === 'hip');
      const knee = landmarks.find(l => l.id === 'knee');
      const ankle = landmarks.find(l => l.id === 'ankle');
      const chestDepth = landmarks.find(l => l.id === 'chest_depth');
      const buttockDepth = landmarks.find(l => l.id === 'buttock_depth');

      drawLine(nasion, shoulder);
      drawLine(shoulder, elbow);
      drawLine(elbow, wrist);
      drawLine(shoulder, hip);
      drawLine(hip, chestDepth);
      drawLine(hip, buttockDepth);

      if (scanRange === 'full' || inputSource === 'mannequin') {
        drawLine(hip, knee);
        drawLine(knee, ankle);
      }
    }

    return lines;
  };

  /*
  // Generate 3D Wireframe Mannequin mesh points and project them to 2D
  const _projected3DData = useMemo(() => {
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
  */


  const hasMediaBackground = 
    (inputSource === 'image') || 
    (inputSource === 'webcam' && isWebcamActive) || 
    (inputSource === 'video' && !!uploadedVideo);

  return (
    <>
      <div className={isMaximized ? "canvas-wrapper maximized" : "canvas-main-horizontal-layout"}>
      {/* Main Canvas Card wrapper */}
      <div className={isMaximized ? "" : "canvas-wrapper"} style={isMaximized ? {} : { margin: 0 }}>
        <div className="canvas-header" style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem', marginBottom: '0.5rem' }}>
          {/* ROW 1: Source select tabs - 100% FULL WIDTH */}
          <div className="source-select-tabs" style={{ margin: 0, width: '100%' }}>
            <button
              type="button"
              className={`source-tab ${inputSource === 'mannequin' ? 'active' : ''}`}
              onClick={() => onInputSourceChange('mannequin')}
            >
              Mô hình 3D
            </button>
            <button
              type="button"
              className={`source-tab ${inputSource === 'image' ? 'active' : ''}`}
              onClick={() => onInputSourceChange('image')}
            >
              Ảnh mẫu
            </button>
            <button
              type="button"
              className={`source-tab ${inputSource === 'webcam' ? 'active' : ''}`}
              onClick={() => onInputSourceChange('webcam')}
            >
              Webcam AI
            </button>
            <button
              type="button"
              className={`source-tab ${inputSource === 'video' ? 'active' : ''}`}
              onClick={() => onInputSourceChange('video')}
            >
              Video AI
            </button>
          </div>

          {/* ROW 2: View toggle tabs (Left) & Control Action Buttons (Right) */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '0.35rem',
            width: '100%'
          }}>
            {/* View toggle tabs (Mặt trước / Mặt nghiêng) */}
            <div className="view-toggle-tabs" style={{ margin: 0, flexShrink: 0 }}>
              <button
                type="button"
                className={`tab-btn ${view === 'front' ? 'active' : ''}`}
                style={{ padding: '0.22rem 0.55rem', fontSize: '0.68rem' }}
                onClick={() => {
                  setRotationAngle(0);
                  onViewChange('front');
                }}
              >
                Mặt trước
              </button>
              <button
                type="button"
                className={`tab-btn ${view === 'side' ? 'active' : ''}`}
                style={{ padding: '0.22rem 0.55rem', fontSize: '0.68rem' }}
                onClick={() => {
                  setRotationAngle(90);
                  onViewChange('side');
                }}
              >
                Mặt nghiêng
              </button>
            </div>

            {/* Action buttons (Tải ảnh, Reset số đo, Reset mốc, 3D Mini) */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.2rem', flexShrink: 0, flexWrap: 'nowrap' }}>
              {/* Image upload / clear buttons */}
              {inputSource === 'image' && (
                <>
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    title="Tải lên ảnh mẫu"
                    style={{
                      display: 'flex', alignItems: 'center', gap: '0.2rem',
                      background: 'rgba(6, 182, 212, 0.1)', border: '1px solid rgba(6, 182, 212, 0.35)',
                      borderRadius: 'var(--radius-sm)', padding: '0.22rem 0.45rem', fontSize: '0.68rem', fontWeight: 600,
                      color: '#0284c7', cursor: 'pointer', whiteSpace: 'nowrap'
                    }}
                  >
                    <Upload size={11} />
                    <span>{uploadedImage ? 'Đổi ảnh' : 'Chọn ảnh'}</span>
                  </button>
                  {uploadedImage && onClearImage && (
                    <button
                      type="button"
                      onClick={onClearImage}
                      title="Xóa ảnh"
                      style={{
                        display: 'flex', alignItems: 'center', gap: '0.2rem',
                        background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.35)',
                        borderRadius: 'var(--radius-sm)', padding: '0.22rem 0.4rem', fontSize: '0.68rem', fontWeight: 600,
                        color: '#dc2626', cursor: 'pointer', whiteSpace: 'nowrap'
                      }}
                    >
                      <Trash2 size={11} />
                    </button>
                  )}
                </>
              )}

              {/* Video upload / clear buttons */}
              {inputSource === 'video' && (
                <>
                  <button
                    type="button"
                    onClick={() => fileInputVideoRef.current?.click()}
                    title="Tải lên video"
                    style={{
                      display: 'flex', alignItems: 'center', gap: '0.2rem',
                      background: 'rgba(168, 85, 247, 0.1)', border: '1px solid rgba(168, 85, 247, 0.35)',
                      borderRadius: 'var(--radius-sm)', padding: '0.22rem 0.45rem', fontSize: '0.68rem', fontWeight: 600,
                      color: '#9333ea', cursor: 'pointer', whiteSpace: 'nowrap'
                    }}
                  >
                    <Upload size={11} />
                    <span>{uploadedVideo ? 'Đổi video' : 'Chọn video'}</span>
                  </button>
                  {uploadedVideo && (
                    <button
                      type="button"
                      onClick={() => { setUploadedVideo(null); setIsScanning(false); }}
                      title="Xóa video"
                      style={{
                        display: 'flex', alignItems: 'center', gap: '0.2rem',
                        background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.35)',
                        borderRadius: 'var(--radius-sm)', padding: '0.22rem 0.4rem', fontSize: '0.68rem', fontWeight: 600,
                        color: '#dc2626', cursor: 'pointer', whiteSpace: 'nowrap'
                      }}
                    >
                      <Trash2 size={11} />
                    </button>
                  )}
                </>
              )}

              {/* Reset model (3D Mode) */}
              {inputSource === 'mannequin' && (
                <button
                  type="button"
                  onClick={() => {
                    setCameraResetCounter(c => c + 1);
                    if (onResetModel) onResetModel();
                  }}
                  title="Đặt lại mô hình 3D"
                  style={{
                    display: 'flex', alignItems: 'center', gap: '0.2rem',
                    background: '#ffffff', border: '1px solid #cbd5e1',
                    borderRadius: 'var(--radius-sm)', padding: '0.22rem 0.45rem',
                    fontSize: '0.68rem', fontWeight: 600, color: '#0284c7',
                    cursor: 'pointer', whiteSpace: 'nowrap'
                  }}
                >
                  <RefreshCw size={11} />
                  <span>Reset 3D</span>
                </button>
              )}

              {/* Reset scan & landmarks (Image / Webcam / Video Modes) */}
              {inputSource !== 'mannequin' && (
                <>
                  {onResetScan && (
                    <button
                      type="button"
                      onClick={onResetScan}
                      title="Đặt lại số đo"
                      style={{
                        display: 'flex', alignItems: 'center', gap: '0.2rem',
                        background: '#ffffff', border: '1px solid #fca5a5',
                        borderRadius: 'var(--radius-sm)', padding: '0.22rem 0.45rem',
                        fontSize: '0.68rem', fontWeight: 600, color: '#dc2626',
                        cursor: 'pointer', whiteSpace: 'nowrap'
                      }}
                    >
                      <RefreshCw size={11} />
                      <span>Reset đo</span>
                    </button>
                  )}
                  {onResetLandmarks && (
                    <button
                      type="button"
                      onClick={onResetLandmarks}
                      title="Đặt lại các chấm mốc"
                      style={{
                        display: 'flex', alignItems: 'center', gap: '0.2rem',
                        background: '#ffffff', border: '1px solid #7dd3fc',
                        borderRadius: 'var(--radius-sm)', padding: '0.22rem 0.45rem',
                        fontSize: '0.68rem', fontWeight: 600, color: '#0284c7',
                        cursor: 'pointer', whiteSpace: 'nowrap'
                      }}
                    >
                      <RefreshCw size={11} />
                      <span>Reset chấm</span>
                    </button>
                  )}
                  {hasMediaBackground && (
                    <button
                      type="button"
                      onClick={() => setShowPip3D(!showPip3D)}
                      title="Ẩn/Hiện mô hình 3D mini"
                      style={{
                        display: 'flex', alignItems: 'center', gap: '0.2rem',
                        background: showPip3D ? '#e0f2fe' : '#ffffff',
                        border: showPip3D ? '1px solid #38bdf8' : '1px solid #cbd5e1',
                        borderRadius: 'var(--radius-sm)', padding: '0.22rem 0.45rem',
                        fontSize: '0.68rem', fontWeight: 600,
                        color: showPip3D ? '#0284c7' : '#475569',
                        cursor: 'pointer', whiteSpace: 'nowrap'
                      }}
                    >
                      <span>{showPip3D ? '👁️ Ẩn 3D' : '👁️ 3D Mini'}</span>
                    </button>
                  )}
                </>
              )}
            </div>
          </div>
        </div>

        <div className="canvas-container">
          <div className="media-viewport">
          {/* Top-Right Badge: Sleek 3D WebGL Status Pill */}
          {inputSource === 'mannequin' && (
            <div style={{
              position: 'absolute',
              top: '12px',
              right: '12px',
              zIndex: 60,
              background: 'rgba(15, 23, 42, 0.75)',
              backdropFilter: 'blur(8px)',
              WebkitBackdropFilter: 'blur(8px)',
              border: '1px solid rgba(34, 211, 238, 0.3)',
              borderRadius: '9999px',
              padding: '4px 12px',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              fontSize: '0.62rem',
              color: '#22d3ee',
              fontWeight: 600,
              boxShadow: '0 4px 12px rgba(0, 0, 0, 0.3)',
              letterSpacing: '0.3px',
              pointerEvents: 'none'
            }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#22c55e', boxShadow: '0 0 6px #22c55e' }}></span>
                WebGL 2.0
              </span>
              <span style={{ color: 'rgba(255, 255, 255, 0.25)' }}>•</span>
              <span>⚡ 60 FPS</span>
              <span style={{ color: 'rgba(255, 255, 255, 0.25)' }}>•</span>
              <span>📐 15.4K Mesh</span>
            </div>
          )}

          {/* Bottom-Left: Heatmap Color Spectrum Legend Bar (Only shown when meshStyle === 'heatmap') */}
          {inputSource === 'mannequin' && meshStyle === 'heatmap' && (
            <div style={{
              position: 'absolute',
              bottom: '12px',
              left: '12px',
              zIndex: 60,
              background: 'rgba(15, 23, 42, 0.85)',
              backdropFilter: 'blur(8px)',
              WebkitBackdropFilter: 'blur(8px)',
              border: '1px solid rgba(255, 255, 255, 0.15)',
              borderRadius: 'var(--radius-md)',
              padding: '6px 12px',
              display: 'flex',
              flexDirection: 'column',
              gap: '4px',
              boxShadow: '0 8px 20px rgba(0, 0, 0, 0.4)',
              maxWidth: '300px',
              pointerEvents: 'none'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.55rem', color: '#94a3b8', fontWeight: 600 }}>
                <span>BẢN ĐỒ PHÂN BỔ THỂ TÍCH & MỠ</span>
                <span style={{ color: '#38bdf8' }}>AI HEATMAP</span>
              </div>
              {/* Horizontal Color Bar Gradient */}
              <div style={{
                height: '6px',
                width: '100%',
                borderRadius: '3px',
                background: 'linear-gradient(to right, #00bfff 0%, #22c55e 35%, #eab308 65%, #ef4444 100%)',
                boxShadow: '0 0 8px rgba(0, 0, 0, 0.5)'
              }} />
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.52rem', color: '#cbd5e1', fontWeight: 500, gap: '4px', marginTop: '1px' }}>
                <span>🟦 Xanh Cyan: Thon gọn</span>
                <span>🟩 Vừa vặn</span>
                <span>🟨 Ôm phom</span>
                <span>🟥 Đỏ: Tập trung mỡ/cơ lớn</span>
              </div>
            </div>
          )}

          {/* Bottom-Left: Optional Picture-in-Picture (PiP) Mini 3D Model Window */}
          {inputSource !== 'mannequin' && hasMediaBackground && showPip3D && (
            <div style={{
              position: 'absolute',
              bottom: '12px',
              left: '12px',
              zIndex: 60,
              width: '125px',
              height: '185px',
              background: 'rgba(15, 23, 42, 0.92)',
              backdropFilter: 'blur(8px)',
              WebkitBackdropFilter: 'blur(8px)',
              borderRadius: 'var(--radius-md)',
              border: '1px solid rgba(34, 211, 238, 0.45)',
              boxShadow: '0 8px 24px rgba(0, 0, 0, 0.6)',
              overflow: 'hidden',
              display: 'flex',
              flexDirection: 'column'
            }}>
              <div style={{
                fontSize: '0.50rem',
                fontWeight: 700,
                color: '#22d3ee',
                padding: '4px 6px',
                background: 'rgba(34, 211, 238, 0.12)',
                borderBottom: '1px solid rgba(34, 211, 238, 0.2)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                letterSpacing: '0.4px',
                whiteSpace: 'nowrap'
              }}>
                <span>MÔ HÌNH 3D LIVE</span>
                <button
                  type="button"
                  onClick={() => setShowPip3D(false)}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: '#94a3b8',
                    cursor: 'pointer',
                    fontSize: '0.65rem',
                    padding: '0 2px',
                    lineHeight: 1
                  }}
                  title="Đóng cửa sở 3D Mini"
                >
                  ✕
                </button>
              </div>
              <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
                <Mannequin3DView
                  gender={gender}
                  weight={weight}
                  scaleFactor={scaleFactor}
                  landmarks={landmarks}
                  rotationAngle={rotationAngle}
                  meshStyle={meshStyle}
                  width={125}
                  height={160}
                  scanRange={scanRange}
                  measurements={measurements}
                  cameraResetCounter={cameraResetCounter}
                  showLabels={false}
                  interactive={false}
                />
              </div>
            </div>
          )}
          {/* Top-Right: Sleek Ultra-Compact Camera Action Bar */}
          {inputSource === 'webcam' && isWebcamActive && (
            <div style={{
              position: 'absolute',
              top: '8px',
              right: '8px',
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              zIndex: 70
            }}>
              {/* Lighting Mode Micro-Pill Selector */}
              <div style={{ position: 'relative' }}>
                <button
                  type="button"
                  onClick={() => setShowLightingMenu(!showLightingMenu)}
                  title="Chọn chế độ xử lý ánh sáng AI (Auto / Chống chói sáng / Khử tối)"
                  style={{
                    background: 
                      lightingMode === 'auto' ? 'rgba(234, 179, 8, 0.25)' :
                      lightingMode === 'bright' ? 'rgba(56, 189, 248, 0.28)' :
                      lightingMode === 'dark' ? 'rgba(245, 158, 11, 0.28)' : 'rgba(15, 23, 42, 0.85)',
                    border: 
                      lightingMode === 'auto' ? '1px solid rgba(234, 179, 8, 0.65)' :
                      lightingMode === 'bright' ? '1px solid rgba(56, 189, 248, 0.65)' :
                      lightingMode === 'dark' ? '1px solid rgba(245, 158, 11, 0.65)' : '1px solid rgba(255, 255, 255, 0.25)',
                    borderRadius: '12px',
                    color: 
                      lightingMode === 'auto' ? '#fde047' :
                      lightingMode === 'bright' ? '#38bdf8' :
                      lightingMode === 'dark' ? '#fbbf24' : '#cbd5e1',
                    padding: '0.22rem 0.45rem',
                    fontSize: '0.6rem',
                    fontWeight: 700,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '3px',
                    backdropFilter: 'blur(8px)',
                    boxShadow: '0 2px 8px rgba(0,0,0,0.4)',
                    whiteSpace: 'nowrap'
                  }}
                >
                  {lightingMode === 'auto' && <Sparkles size={11} />}
                  {lightingMode === 'bright' && <Sun size={11} />}
                  {lightingMode === 'dark' && <Moon size={11} />}
                  {lightingMode === 'normal' && <Sun size={11} />}
                  <span>
                    {lightingMode === 'auto' && "Auto ▾"}
                    {lightingMode === 'bright' && "Chống Lóa ▾"}
                    {lightingMode === 'dark' && "Khử Tối ▾"}
                    {lightingMode === 'normal' && "Gốc ▾"}
                  </span>
                </button>

                {/* Lighting Options Dropdown */}
                {showLightingMenu && (
                  <div style={{
                    position: 'absolute',
                    top: '28px',
                    right: 0,
                    width: '185px',
                    background: 'rgba(15, 23, 42, 0.98)',
                    border: '1px solid rgba(56, 189, 248, 0.45)',
                    borderRadius: '10px',
                    padding: '0.35rem',
                    boxShadow: '0 8px 24px rgba(0,0,0,0.7)',
                    backdropFilter: 'blur(12px)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '2px',
                    zIndex: 100
                  }}>
                    <div style={{ fontSize: '0.55rem', fontWeight: 700, color: '#94a3b8', padding: '2px 4px', letterSpacing: '0.5px' }}>
                      CHỌN LỌC ÁNH SÁNG AI:
                    </div>
                    
                    <button
                      type="button"
                      onClick={() => { setLightingMode('auto'); setShowLightingMenu(false); }}
                      style={{
                        background: lightingMode === 'auto' ? 'rgba(234, 179, 8, 0.2)' : 'transparent',
                        border: 'none',
                        borderRadius: '6px',
                        color: lightingMode === 'auto' ? '#fde047' : '#e2e8f0',
                        padding: '0.3rem 0.45rem',
                        fontSize: '0.62rem',
                        fontWeight: 600,
                        textAlign: 'left',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between'
                      }}
                    >
                      <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <Sparkles size={11} style={{ color: '#fde047' }} /> Auto AI (Thích ứng)
                      </span>
                      {lightingMode === 'auto' && <span style={{ color: '#22c55e', fontWeight: 800 }}>✓</span>}
                    </button>

                    <button
                      type="button"
                      onClick={() => { setLightingMode('bright'); setShowLightingMenu(false); }}
                      style={{
                        background: lightingMode === 'bright' ? 'rgba(56, 189, 248, 0.2)' : 'transparent',
                        border: 'none',
                        borderRadius: '6px',
                        color: lightingMode === 'bright' ? '#38bdf8' : '#e2e8f0',
                        padding: '0.3rem 0.45rem',
                        fontSize: '0.62rem',
                        fontWeight: 600,
                        textAlign: 'left',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between'
                      }}
                    >
                      <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <Sun size={11} style={{ color: '#38bdf8' }} /> Chống Lóa (Phòng sáng)
                      </span>
                      {lightingMode === 'bright' && <span style={{ color: '#22c55e', fontWeight: 800 }}>✓</span>}
                    </button>

                    <button
                      type="button"
                      onClick={() => { setLightingMode('dark'); setShowLightingMenu(false); }}
                      style={{
                        background: lightingMode === 'dark' ? 'rgba(245, 158, 11, 0.2)' : 'transparent',
                        border: 'none',
                        borderRadius: '6px',
                        color: lightingMode === 'dark' ? '#fbbf24' : '#e2e8f0',
                        padding: '0.3rem 0.45rem',
                        fontSize: '0.62rem',
                        fontWeight: 600,
                        textAlign: 'left',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between'
                      }}
                    >
                      <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <Moon size={11} style={{ color: '#fbbf24' }} /> Khử Tối AI (Phòng tối)
                      </span>
                      {lightingMode === 'dark' && <span style={{ color: '#22c55e', fontWeight: 800 }}>✓</span>}
                    </button>

                    <button
                      type="button"
                      onClick={() => { setLightingMode('normal'); setShowLightingMenu(false); }}
                      style={{
                        background: lightingMode === 'normal' ? 'rgba(255, 255, 255, 0.1)' : 'transparent',
                        border: 'none',
                        borderRadius: '6px',
                        color: lightingMode === 'normal' ? '#ffffff' : '#94a3b8',
                        padding: '0.3rem 0.45rem',
                        fontSize: '0.62rem',
                        fontWeight: 600,
                        textAlign: 'left',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between'
                      }}
                    >
                      <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <Sun size={11} style={{ color: '#94a3b8' }} /> Camera Gốc (Tắt AI)
                      </span>
                      {lightingMode === 'normal' && <span style={{ color: '#22c55e', fontWeight: 800 }}>✓</span>}
                    </button>
                  </div>
                )}
              </div>

              {/* Camera Flip Micro Button */}
              <button
                type="button"
                onClick={toggleFacingMode}
                title={`Lật camera (Đang dùng: ${facingMode === 'user' ? 'Trước' : 'Sau'})`}
                style={{
                  background: 'rgba(15, 23, 42, 0.85)',
                  border: '1px solid rgba(34, 211, 238, 0.45)',
                  borderRadius: '12px',
                  color: '#22d3ee',
                  padding: '0.22rem 0.4rem',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  backdropFilter: 'blur(8px)',
                  boxShadow: '0 2px 8px rgba(0,0,0,0.4)'
                }}
              >
                <RefreshCw size={11} />
              </button>

              {/* Maximize Micro Button */}
              {hasMediaBackground && (
                <button
                  type="button"
                  onClick={() => setIsMaximized(!isMaximized)}
                  title={isMaximized ? "Thu nhỏ camera" : "Phóng to camera toàn màn hình"}
                  style={{
                    background: 'rgba(15, 23, 42, 0.85)',
                    border: '1px solid rgba(255, 255, 255, 0.25)',
                    borderRadius: '12px',
                    color: '#fff',
                    padding: '0.22rem 0.4rem',
                    cursor: 'pointer',
                    display: 'flex',
                    boxShadow: '0 2px 8px rgba(0,0,0,0.4)'
                  }}
                >
                  {isMaximized ? <Minimize2 size={11} /> : <Maximize2 size={11} />}
                </button>
              )}
            </div>
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
                filter: getVideoFilterStyle(),
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
              <h3 style={{ fontSize: '1.15rem', fontWeight: 700, marginBottom: '0.5rem', color: cameraErrorMsg ? '#f87171' : '#f8fafc' }}>
                {cameraErrorMsg ? 'Chưa Thể Mở Camera' : 'Webcam AI Chưa Khởi Động'}
              </h3>
              <p style={{ fontSize: '0.78rem', color: cameraErrorMsg ? '#cbd5e1' : '#94a3b8', maxWidth: '320px', lineHeight: 1.5, marginBottom: '1.5rem' }}>
                {cameraErrorMsg || 'Bấm nút bên dưới để cấp quyền camera và bắt đầu phân tích hình thể 3D thời gian thực.'}
              </p>
              <button
                type="button"
                onClick={() => startWebcam()}
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

          {inputSource === 'image' && (
            <img
              src={uploadedImage || (
                gender === 'male'
                  ? (view === 'front' ? '/sample_mannequin_male_front.png' : '/sample_mannequin_male_side.png')
                  : (view === 'front' ? '/sample_mannequin_female_front.png' : '/sample_mannequin_female_side.png')
              )}
              className="background-media uploaded-image-view"
              alt="Uploaded mannequin source"
            />
          )}

          {(inputSource === 'mannequin' ||
            (inputSource === 'video' && !uploadedVideo)) && (
            <Mannequin3DView
              gender={gender}
              weight={inputSource === 'mannequin' ? weight : (gender === 'male' ? 75 : 55)}
              scaleFactor={scaleFactor}
              landmarks={landmarks}
              rotationAngle={rotationAngle}
              view={view}
              meshStyle={meshStyle}
              width={width}
              height={height}
              scanRange={scanRange}
              measurements={measurements}
              cameraResetCounter={cameraResetCounter}
              showLabels={true}
              interactive={true}
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
              {/* Hologram Laser Scan Line */}
              <line
                x1="5"
                y1="0"
                x2="395"
                y2="0"
                stroke="#22d3ee"
                strokeWidth="2.0"
                filter="url(#neonGlow)"
                className="laser-beam"
              />

              {/* Render connecting bone lines & interactive landmarks live on media background */}
              {hasMediaBackground && (
                <>
                  {getBones()}
                  {landmarks.map((point) => {
                    const isLowerJoint = ['left_knee', 'right_knee', 'left_ankle', 'right_ankle', 'knee', 'ankle'].includes(point.id);
                    if (isLowerJoint && scanRange === 'half') {
                      return null;
                    }
                    const vis = (point as any).visibility ?? 1;
                    if (inputSource === 'webcam' && vis < 0.45) {
                      return null; // Do not render joint dot when occluded/outside frame!
                    }

                    return (
                      <g key={point.id} className="landmark-group">
                        {/* Glowing outer HUD pulse target ring */}
                        <circle
                          cx={point.x}
                          cy={point.y}
                          r={activePointId === point.id ? 10 : 8}
                          className="landmark-pulse"
                          style={{
                            fill: 'none',
                            stroke: activePointId === point.id ? '#22d3ee' : '#0891b2',
                            strokeWidth: 1.2,
                            pointerEvents: 'none'
                          }}
                        />
                        <circle
                          cx={point.x}
                          cy={point.y}
                          r={activePointId === point.id ? 6 : 4.5}
                          onMouseDown={() => handleMouseDown(point.id)}
                          onTouchStart={(e) => {
                            e.stopPropagation();
                            handleMouseDown(point.id);
                          }}
                          onMouseEnter={() => setHoveredPointId(point.id)}
                          onMouseLeave={() => setHoveredPointId(null)}
                          className={`landmark-dot ${activePointId === point.id ? 'dragging' : ''}`}
                        />
                        
                        {/* Premium glassmorphic neon tooltip badge on hover/drag */}
                        {(hoveredPointId === point.id || activePointId === point.id) && (
                          <g transform={`translate(${point.x}, ${point.y - 18})`} style={{ pointerEvents: 'none' }}>
                            <rect
                              x={-60}
                              y={-9}
                              width={120}
                              height={18}
                              rx={4}
                              fill="rgba(9, 13, 22, 0.94)"
                              stroke="#00f5ff"
                              strokeWidth="1.2"
                              style={{ filter: 'drop-shadow(0 0 8px rgba(0, 245, 255, 0.6))' }}
                            />
                            <text
                              x={0}
                              y={0}
                              textAnchor="middle"
                              dominantBaseline="central"
                              fontSize="9px"
                              fontWeight="bold"
                              fill="#ffffff"
                            >
                              {point.label}
                            </text>
                          </g>
                        )}
                      </g>
                    );
                  })}
                </>
              )}

              {/* Floating Measurements Labels on Photo/Video/Webcam View (Only when scanned or scanning) */}
              {measurements && hasMediaBackground && (inputSource !== 'webcam' || isScanned || scanStatus === 'success') && (() => {
                const nasion = landmarks.find(l => l.id === 'nasion');
                const lShoulder = landmarks.find(l => l.id === 'left_shoulder');
                const rShoulder = landmarks.find(l => l.id === 'right_shoulder');
                const lWrist = landmarks.find(l => l.id === 'left_wrist');
                const lHip = landmarks.find(l => l.id === 'left_hip');
                const rHip = landmarks.find(l => l.id === 'right_hip');
                const rKnee = landmarks.find(l => l.id === 'right_knee');
                const rAnkle = landmarks.find(l => l.id === 'right_ankle');
                const lAnkle = landmarks.find(l => l.id === 'left_ankle');

                const shoulder = landmarks.find(l => l.id === 'shoulder');
                const hip = landmarks.find(l => l.id === 'hip');
                const chestDepth = landmarks.find(l => l.id === 'chest_depth');
                const buttockDepth = landmarks.find(l => l.id === 'buttock_depth');

                // Derived measurement values
                const neckVal = measurements.neckCircumference.toFixed(1);
                const shoulderVal = measurements.shoulderWidth.toFixed(1);
                const chestVal = measurements.chestCircumference.toFixed(1);
                const waistVal = measurements.waistCircumference.toFixed(1);
                const hipsVal = measurements.hipCircumference.toFixed(1);
                const armVal = measurements.armLength.toFixed(1);
                const legVal = measurements.legLength.toFixed(1);
                const thighVal = measurements.thighCircumference.toFixed(1);
                const calfVal = measurements.calfCircumference.toFixed(1);
                const ankleVal = measurements.ankleCircumference.toFixed(1);

                const items: {
                  side: 'left' | 'right';
                  cardX: number;
                  cardY: number;
                  anchor: { x: number; y: number } | undefined;
                  text: string;
                  isFlipped: boolean;
                }[] = [];

                const addItem = (side: 'left' | 'right', cardY: number, anchor: { x: number; y: number } | undefined, text: string) => {
                  if (!anchor) return;
                  const cardX = side === 'left' ? 90 : 310;
                  const isFlipped = false;

                  items.push({ side, cardX, cardY, anchor, text, isFlipped });
                };

                if (view === 'front') {
                  // Midpoints
                  const midShoulder = lShoulder && rShoulder ? { x: (lShoulder.x + rShoulder.x) / 2, y: (lShoulder.y + rShoulder.y) / 2 } : undefined;
                  const midHip = lHip && rHip ? { x: (lHip.x + rHip.x) / 2, y: (lHip.y + rHip.y) / 2 } : undefined;
                  const neckAnchor = nasion && midShoulder ? { x: nasion.x * 0.3 + midShoulder.x * 0.7, y: nasion.y * 0.3 + midShoulder.y * 0.7 } : undefined;
                  const chestAnchor = lShoulder && rShoulder && lHip ? { x: (lShoulder.x + rShoulder.x) / 2, y: lShoulder.y + (lHip.y - lShoulder.y) * 0.35 } : undefined;
                  const waistAnchor = lShoulder && lHip && rHip ? { x: (lHip.x + rHip.x) / 2, y: lShoulder.y + (lHip.y - lShoulder.y) * 0.75 } : undefined;
                  const thighAnchor = rHip && rKnee ? { x: (rHip.x + rKnee.x) / 2, y: (rHip.y + rKnee.y) / 2 } : undefined;
                  const calfAnchor = rKnee && rAnkle ? { x: (rKnee.x + rAnkle.x) / 2, y: (rKnee.y + rAnkle.y) / 2 } : undefined;
                  const ankleAnchor = lAnkle;

                  addItem('left', 90, neckAnchor, `Cổ: ${neckVal} cm`);
                  addItem('left', 180, chestAnchor, `Ngực: ${chestVal} cm`);
                  addItem('left', 280, waistAnchor, `Eo: ${waistVal} cm`);
                  addItem('left', 460, thighAnchor, `Đùi phải: ${thighVal} cm`);
                  addItem('left', 560, calfAnchor, `Bắp chân: ${calfVal} cm`);

                  addItem('right', 120, rShoulder, `Vai: ${shoulderVal} cm`);
                  addItem('right', 220, lWrist, `Dài tay: ${armVal} cm`);
                  addItem('right', 360, midHip, `Mông: ${hipsVal} cm`);
                  addItem('right', 510, midHip, `Dài chân: ${legVal} cm`);
                  addItem('right', 600, ankleAnchor, `Cổ chân: ${ankleVal} cm`);
                } else {
                  // Side view
                  const waistDepthY = shoulder && hip ? shoulder.y + (hip.y - shoulder.y) * 0.75 : undefined;
                  const waistDepthAnchor = hip && waistDepthY ? { x: hip.x, y: waistDepthY } : undefined;

                  addItem('left', 360, buttockDepth, `Sâu mông: ${(measurements.hipDepth || 0).toFixed(1)} cm`);
                  addItem('right', 220, chestDepth, `Sâu ngực: ${(measurements.chestDepth || 0).toFixed(1)} cm`);
                  addItem('right', 290, waistDepthAnchor, `Sâu eo: ${(measurements.waistDepth || 0).toFixed(1)} cm`);
                }

                return items.map((item, idx) => {
                  if (!item.anchor) return null;
                  const anchorDx = item.anchor.x - item.cardX;
                  const anchorDy = item.anchor.y - item.cardY;
                  const boxOnLeft = (item.side === 'left' && !item.isFlipped) || (item.side === 'right' && item.isFlipped);

                  return (
                    <g key={`lbl2d-${idx}`} transform={`translate(${item.cardX}, ${item.cardY})`} style={{ pointerEvents: 'none' }}>
                      {/* Connection Line to anatomical landmark */}
                      <line
                        x1={0}
                        y1={0}
                        x2={anchorDx}
                        y2={anchorDy}
                        style={{
                          stroke: 'rgba(34, 211, 238, 0.65)',
                          strokeWidth: 1.0,
                          strokeDasharray: '2,2'
                        }}
                      />
                      {/* Card Label */}
                      <g>
                        <rect
                          x={boxOnLeft ? -80 : 0}
                          y={-9}
                          width={80}
                          height={18}
                          rx={4}
                          fill="rgba(9, 13, 22, 0.88)"
                          stroke="rgba(0, 245, 255, 0.45)"
                          strokeWidth="1"
                          style={{ filter: 'drop-shadow(0 0 6px rgba(0, 245, 255, 0.15))' }}
                        />
                        <text
                          x={boxOnLeft ? -40 : 40}
                          y={0}
                          textAnchor="middle"
                          dominantBaseline="central"
                          fontSize="9px"
                          fontWeight="bold"
                          fill="#00f5ff"
                        >
                          {item.text}
                        </text>
                      </g>
                    </g>
                  );
                });
              })()}
            </svg>
          )}

          {/* Top Camera Status & Pose Validation Bar */}
          {inputSource === 'webcam' && isWebcamActive && !isModelLoading && scanStatus !== 'scanning' && (
            <div style={{
              position: 'absolute',
              top: '12px',
              left: '12px',
              right: '160px', // Leave ample space for top right camera control buttons
              zIndex: 55,
              pointerEvents: 'none',
              display: 'flex',
              alignItems: 'center',
              gap: '6px'
            }}>
              {!isPoseValid ? (
                <div style={{
                  background: 'rgba(239, 68, 68, 0.92)',
                  color: '#fff',
                  padding: '0.3rem 0.65rem',
                  borderRadius: '20px',
                  fontSize: '0.62rem',
                  fontWeight: 700,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                  boxShadow: '0 4px 12px rgba(239, 68, 68, 0.4)',
                  backdropFilter: 'blur(6px)',
                  letterSpacing: '0.3px',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis'
                }}>
                  <span>⚠️</span>
                  <span>{poseWarning || "Hãy đứng thẳng trước camera"}</span>
                </div>
              ) : (
                <div style={{
                  background: 'rgba(15, 23, 42, 0.82)',
                  border: '1px solid rgba(34, 211, 238, 0.35)',
                  color: '#22d3ee',
                  padding: '0.25rem 0.6rem',
                  borderRadius: '20px',
                  fontSize: '0.62rem',
                  fontWeight: 700,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '5px',
                  backdropFilter: 'blur(6px)',
                  whiteSpace: 'nowrap'
                }}>
                  <span style={{ display: 'inline-block', width: '6px', height: '6px', borderRadius: '50%', background: '#22c55e', boxShadow: '0 0 6px #22c55e' }} />
                  <span>LIVE AI TRACKING</span>
                </div>
              )}
            </div>
          )}

          {/* Futuristic Laser Beam animation during active scanning */}
          {inputSource === 'webcam' && isScanning && (
            <div className="webcam-scanner-laser-line" />
          )}

          {/* Compact Non-Blocking Scanning Progress HUD overlay */}
          {scanStatus === 'scanning' && (
            <div className="camera-scanning-hud" style={{
              position: 'absolute',
              top: '12px',
              left: '12px',
              right: '160px',
              background: 'rgba(9, 13, 22, 0.88)',
              backdropFilter: 'blur(8px)',
              border: '1px solid rgba(0, 245, 255, 0.4)',
              borderRadius: 'var(--radius-md)',
              padding: '0.5rem 0.75rem',
              zIndex: 55,
              boxShadow: '0 8px 24px rgba(0,0,0,0.5)'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.45rem', width: '100%', marginBottom: '0.25rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                  <div className="scanning-pulse-circle"></div>
                  <strong style={{ color: '#00f5ff', letterSpacing: '0.5px', fontSize: '0.72rem' }}>
                    {view === 'front' ? 'QUÉT MẶT TRƯỚC' : 'QUÉT MẶT NGHIÊNG'} ({scanProgress}%)
                  </strong>
                </div>
                <span style={{ fontSize: '0.58rem', color: '#94a3b8', background: 'rgba(255,255,255,0.08)', padding: '0.1rem 0.4rem', borderRadius: '10px' }}>
                  {!isPoseValid ? 'PAUSED' : 'SCANNING'}
                </span>
              </div>
              <div className="scanning-progress-bar-bg" style={{ width: '100%', height: '4px', background: 'rgba(255,255,255,0.1)', borderRadius: '2px', overflow: 'hidden' }}>
                <div className="scanning-progress-bar-fill" style={{ width: `${scanProgress}%`, height: '100%', background: 'linear-gradient(90deg, #0055ff, #00f5ff)', boxShadow: '0 0 10px #00f5ff' }}></div>
              </div>
              <p style={{ margin: '0.35rem 0 0 0', fontSize: '0.66rem', color: '#cbd5e1', fontStyle: 'italic', textAlign: 'center' }}>
                {!isPoseValid 
                  ? '⚠️ Vui lòng đứng thẳng trước camera...'
                  : (scanProgress < 35 ? '🔍 AI đang định vị 14 mốc khớp xương...' : (scanProgress < 70 ? '⚡ Đang đo chu vi Ngực, Eo, Hông...' : '📐 Đang tính chiều dài chân & cổ chân...'))
                }
              </p>
            </div>
          )}

          {/* Success Guided Scanning overlay */}
          {scanStatus === 'success' && (
            <div className="camera-success-overlay">
              <div className="success-icon">✓</div>
              <h3>
                {view === 'front' ? '🎉 BƯỚC 1: QUÉT MẶT TRƯỚC THÀNH CÔNG!' : '🏆 HOÀN THÀNH TOÀN BỘ ĐO ĐẠC HÌNH THỂ 3D!'}
              </h3>
              <p>
                {view === 'front' 
                  ? "Đã ghi nhận số đo mặt trước. Vui lòng quay nghiêng người 90° để đo độ sâu Ngực - Eo - Mông." 
                  : "Hệ thống đã phân tích toàn bộ số đo 2D/3D & dựng mô hình nhân trắc học hoàn chỉnh."
                }
              </p>
              <div className="success-actions">
                {view === 'front' ? (
                  <button
                    type="button"
                    className="view-change-cta-btn"
                    onClick={() => {
                      onViewChange('side');
                      setScanProgress(0);
                      setScanStatus('idle');
                      setCountdown(3);
                    }}
                  >
                    👉 TIẾP TỤC BƯỚC 2: QUÉT MẶT NGHIÊNG
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
                    🎉 XEM MÔ HÌNH 3D & BÁO CÁO CHI TIẾT
                  </button>
                )}
                <button
                  type="button"
                  className="rescan-btn"
                  onClick={() => setShowSnapshotModal(true)}
                  style={{ background: 'rgba(34, 211, 238, 0.15)', borderColor: '#22d3ee', color: '#22d3ee' }}
                >
                  📷 Xem Ảnh Quét AI ({view === 'front' ? 'Mặt Trước' : 'Mặt Nghiêng'})
                </button>
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

          {/* Compact Non-Blocking Bottom Start Controls (Webcam active, scan idle, not scanning/counting down) */}
          {inputSource === 'webcam' && isWebcamActive && scanStatus === 'idle' && !isScanning && countdown === null && (
            <div style={{
              position: 'absolute',
              bottom: '12px',
              left: '12px',
              right: '12px',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 50,
              pointerEvents: 'none'
            }}>
              <div style={{
                background: 'rgba(9, 13, 22, 0.82)',
                backdropFilter: 'blur(8px)',
                WebkitBackdropFilter: 'blur(8px)',
                border: '1px solid rgba(0, 245, 255, 0.35)',
                borderRadius: '30px',
                padding: '0.4rem 1.25rem',
                display: 'flex',
                alignItems: 'center',
                gap: '0.75rem',
                boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
                pointerEvents: 'auto'
              }}>
                <span style={{ fontSize: '0.68rem', fontWeight: 700, color: '#00f5ff', letterSpacing: '0.5px' }}>
                  {view === 'front' ? '📍 BƯỚC 1/2: MẶT TRƯỚC' : '📍 BƯỚC 2/2: MẶT NGHIÊNG'}
                </span>
                <button
                  type="button"
                  onClick={() => setCountdown(5)}
                  style={{
                    background: 'linear-gradient(135deg, #0055ff, #00f5ff)',
                    border: 'none',
                    borderRadius: '20px',
                    color: '#fff',
                    padding: '0.45rem 1.1rem',
                    fontSize: '0.78rem',
                    fontWeight: 800,
                    cursor: 'pointer',
                    boxShadow: '0 0 15px rgba(0, 245, 255, 0.4)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.4rem',
                    transition: 'all 0.2s ease',
                    textTransform: 'uppercase'
                  }}
                  onMouseEnter={e => {
                    e.currentTarget.style.transform = 'scale(1.04)';
                    e.currentTarget.style.boxShadow = '0 0 25px rgba(0, 245, 255, 0.65)';
                  }}
                  onMouseLeave={e => {
                    e.currentTarget.style.transform = 'scale(1)';
                    e.currentTarget.style.boxShadow = '0 0 15px rgba(0, 245, 255, 0.4)';
                  }}
                >
                  ⚡ BẮT ĐẦU QUÉT AI (5S)
                </button>
              </div>
            </div>
          )}

          {/* Compact Non-Blocking Countdown Timer Badge (Camera stays 100% UNBLURRED and fully visible) */}
          {countdown !== null && (
            <div style={{
              position: 'absolute',
              top: '14px',
              left: '50%',
              transform: 'translateX(-50%)',
              background: 'rgba(9, 13, 22, 0.85)',
              backdropFilter: 'blur(8px)',
              WebkitBackdropFilter: 'blur(8px)',
              border: '1px solid rgba(0, 245, 255, 0.5)',
              borderRadius: '30px',
              padding: '0.4rem 1.1rem',
              display: 'flex',
              alignItems: 'center',
              gap: '0.65rem',
              zIndex: 100,
              boxShadow: '0 8px 24px rgba(0,0,0,0.6)',
              pointerEvents: 'none'
            }}>
              <div style={{
                width: '32px',
                height: '32px',
                borderRadius: '50%',
                background: 'linear-gradient(135deg, #0055ff, #00f5ff)',
                boxShadow: '0 0 12px rgba(0, 245, 255, 0.6)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '1.15rem',
                fontWeight: 800,
                color: '#fff'
              }}>
                {countdown}
              </div>
              <span style={{ fontSize: '0.75rem', letterSpacing: '0.5px', color: '#fff', fontWeight: 700, whiteSpace: 'nowrap' }}>
                ⏱️ Chuẩn bị đứng thẳng trước camera ({countdown}s)...
              </span>
            </div>
          )}

          {/* Floating Image Calibration Guidance Tooltip (ONLY for uploaded image mode) */}
          {inputSource === 'image' && showImageGuidance && (
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
              fontFamily: 'system-ui, sans-serif'
            }}>
              <button
                type="button"
                onClick={() => setShowImageGuidance(false)}
                style={{
                  position: 'absolute',
                  top: '6px',
                  right: '8px',
                  background: 'transparent',
                  border: 'none',
                  color: '#94a3b8',
                  fontSize: '0.85rem',
                  cursor: 'pointer',
                  padding: '0.2rem',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  transition: 'color 0.15s ease'
                }}
                onMouseEnter={e => (e.currentTarget.style.color = '#f8fafc')}
                onMouseLeave={e => (e.currentTarget.style.color = '#94a3b8')}
              >
                ✕
              </button>
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
              <div style={{ width: '100%', marginBottom: '0.35rem' }}>
                <button
                  type="button"
                  onClick={() => setShowTiltTips(!showTiltTips)}
                  style={{
                    width: '100%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    background: 'rgba(37, 99, 235, 0.06)',
                    border: '1px solid rgba(37, 99, 235, 0.25)',
                    borderRadius: 'var(--radius-sm)',
                    padding: '0.4rem 0.75rem',
                    fontSize: '0.72rem',
                    fontWeight: 600,
                    color: '#2563eb',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease'
                  }}
                >
                  <span style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                    <span>❓</span> Hướng dẫn & Mẹo căn chỉnh camera
                  </span>
                  <span style={{ fontSize: '0.65rem', color: '#64748b' }}>{showTiltTips ? '▲ Thu gọn' : '▼ Mở rộng'}</span>
                </button>

                {showTiltTips && (
                  <div style={{
                    marginTop: '0.35rem',
                    background: '#f8fafc',
                    border: '1px solid var(--border-color)',
                    borderRadius: 'var(--radius-md)',
                    padding: '0.7rem 0.8rem',
                    fontSize: '0.71rem',
                    color: '#334155',
                    lineHeight: 1.5,
                    boxShadow: 'var(--shadow-sm)'
                  }}>
                    <p style={{ margin: '0 0 0.35rem 0' }}>
                      🎯 <strong>Căn chỉnh thân người:</strong> {scanRange === 'half' ? 'Đứng gần (1m - 1.2m) sao cho Đỉnh đầu và Hông nằm trọn trong camera.' : 'Đứng lùi xa (2.2m - 2.5m) sao cho Đỉnh đầu và Gót chân nằm trọn trong camera.'}
                    </p>
                    <p style={{ margin: '0 0 0.35rem 0' }}>
                      📐 <strong>Góc nghiêng màn hình:</strong> Gập màn hình laptop nhẹ ra sau (góc 95°-100°), đặt máy cao khoảng 70cm - 90cm.
                    </p>
                    <p style={{ margin: 0 }}>
                      📱 <strong>Mẹo dùng Điện thoại:</strong> Bấm nút <strong>"Dùng Điện Thoại"</strong> ở góc trái để mở camera điện thoại góc rộng tiện lợi hơn.
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
            <div className="canvas-helper-text">
              <RefreshCw size={12} className="spin-hover" />
              <span>Kéo thả các chấm đỏ để căn chỉnh mốc giải phẫu.</span>
            </div>
          </div>
        </div>
      </div>
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
      {/* Snapshot Review Modal */}
      {showSnapshotModal && (
        <div 
          className="calib-modal-overlay" 
          onClick={() => setShowSnapshotModal(false)}
          style={{ zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(9, 13, 22, 0.9)' }}
        >
          <div 
            className="calib-modal" 
            onClick={e => e.stopPropagation()}
            style={{ maxWidth: '540px', width: '92%', background: '#0f172a', border: '1px solid rgba(0, 245, 255, 0.4)', borderRadius: '16px', padding: '1.25rem' }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem', borderBottom: '1px solid rgba(255, 255, 255, 0.1)', paddingBottom: '0.75rem' }}>
              <h3 style={{ fontSize: '1.05rem', fontWeight: 800, color: '#00f5ff', margin: 0, display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                📷 Kiểm Tra Khung Xương AI Đã Quét ({view === 'front' ? 'Mặt Trước' : 'Mặt Nghiêng'})
              </h3>
              <button 
                onClick={() => setShowSnapshotModal(false)}
                style={{ background: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer', fontSize: '1.2rem' }}
              >
                ✕
              </button>
            </div>

            <div style={{ position: 'relative', width: '100%', aspectRatio: '400 / 650', borderRadius: '12px', overflow: 'hidden', border: '1px solid rgba(255, 255, 255, 0.2)', background: '#020617' }}>
              {inputSource === 'image' && uploadedImage && (
                <img src={uploadedImage} alt="Snapshot review" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              )}
              {inputSource === 'webcam' && (
                <div style={{ position: 'relative', width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#090d16', color: '#38bdf8' }}>
                  <p style={{ textAlign: 'center', padding: '1rem', fontSize: '0.85rem' }}>
                    ✅ AI đã kiểm tra định vị thành công 14 mốc giải phẫu trên cơ thể bạn!
                  </p>
                </div>
              )}
              <svg viewBox="0 0 400 650" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }}>
                {getBones()}
                {landmarks.map((point) => (
                  <g key={`rev-${point.id}`}>
                    <circle cx={point.x} cy={point.y} r="8" fill="none" stroke="#00f5ff" strokeWidth="1.5" />
                    <circle cx={point.x} cy={point.y} r="4" fill="#00f5ff" />
                    <text x={point.x} y={point.y - 12} textAnchor="middle" fontSize="9px" fontWeight="bold" fill="#ffffff">
                      {point.label}
                    </text>
                  </g>
                ))}
              </svg>
            </div>

            <div style={{ marginTop: '1rem', display: 'flex', justifyContent: 'flex-end' }}>
              <button
                type="button"
                onClick={() => setShowSnapshotModal(false)}
                style={{ background: 'linear-gradient(135deg, #0055ff, #00f5ff)', border: 'none', borderRadius: '20px', color: '#fff', padding: '0.5rem 1.25rem', fontSize: '0.82rem', fontWeight: 700, cursor: 'pointer' }}
              >
                Đóng & Tiếp Tục
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
