import type { Landmark } from '../types/index';
import { getInitialLandmarks } from './anthropometry';

// Helper to dynamically load MediaPipe Pose CDN scripts into window.Pose
export const loadMediaPipeScripts = (): Promise<void> => {
  return new Promise((resolve) => {
    if ((window as any).Pose && (window as any).Camera) {
      resolve();
      return;
    }

    const existingCamera = document.querySelector('script[src*="camera_utils"]');
    const existingPose = document.querySelector('script[src*="pose.js"]');
    if (existingCamera && existingPose) {
      const checkInterval = setInterval(() => {
        if ((window as any).Pose && (window as any).Camera) {
          clearInterval(checkInterval);
          resolve();
        }
      }, 50);
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

// Singleton cache for loaded Pose instance to avoid repeated WASM binary downloads
let cachedPoseInstance: any = null;

const getOrCreatePoseInstance = async () => {
  await loadMediaPipeScripts();
  const Pose = (window as any).Pose;
  if (!Pose) return null;

  if (!cachedPoseInstance) {
    const pose = new Pose({
      locateFile: (file: string) => `https://cdn.jsdelivr.net/npm/@mediapipe/pose/${file}`
    });

    pose.setOptions({
      modelComplexity: 1,
      smoothLandmarks: false,
      enableSegmentation: false,
      minDetectionConfidence: 0.5,
      minTrackingConfidence: 0.5
    });

    if (typeof pose.initialize === 'function') {
      await pose.initialize();
    }
    cachedPoseInstance = pose;
  }
  return cachedPoseInstance;
};

// Robust pose extraction function for any image source (Data URL, Blob, sample image)
export const detectPoseFromImage = async (
  imgSrc: string,
  gender: 'male' | 'female',
  view: 'front' | 'side'
): Promise<Landmark[] | null> => {
  try {
    const pose = await getOrCreatePoseInstance();
    if (!pose) {
      console.warn("[MediaPipe] Pose library unavailable.");
      return null;
    }

    return new Promise((resolve) => {
      let resolved = false;
      const timeoutTimer = setTimeout(() => {
        if (!resolved) {
          resolved = true;
          console.warn("[MediaPipe] Pose detection timed out after 12s.");
          resolve(null);
        }
      }, 12000);

      pose.onResults((results: any) => {
        if (resolved) return;
        clearTimeout(timeoutTimer);
        resolved = true;

        if (!results || !results.poseLandmarks || results.poseLandmarks.length === 0) {
          console.warn("[MediaPipe] No pose landmarks detected in image.");
          resolve(null);
          return;
        }

        const mp = results.poseLandmarks;
        const mapPt = (rx: number, ry: number) => ({
          x: Math.round(rx * 400),
          y: Math.round(ry * 650)
        });

        if (view === 'front') {
          const updated = getInitialLandmarks(gender, 'front').map(l => {
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
          resolve(updated);
        } else {
          const shoulderIdx = (mp[11]?.visibility || 0) >= (mp[12]?.visibility || 0) ? 11 : 12;
          const elbowIdx = shoulderIdx === 11 ? 13 : 14;
          const wristIdx = shoulderIdx === 11 ? 15 : 16;
          const hipIdx = shoulderIdx === 11 ? 23 : 24;
          const kneeIdx = shoulderIdx === 11 ? 25 : 26;
          const ankleIdx = shoulderIdx === 11 ? 27 : 28;

          const updated = getInitialLandmarks(gender, 'side').map(l => {
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
          resolve(updated);
        }
      });

      const img = new Image();
      // Only set crossOrigin for remote HTTP URLs, NEVER for data: or blob: URLs!
      if (!imgSrc.startsWith('data:') && !imgSrc.startsWith('blob:')) {
        img.crossOrigin = "anonymous";
      }

      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth || 400;
        canvas.height = img.naturalHeight || 650;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(img, 0, 0);
          pose.send({ image: canvas }).catch((err: any) => {
            console.error("[MediaPipe] send canvas error:", err);
            if (!resolved) {
              resolved = true;
              clearTimeout(timeoutTimer);
              resolve(null);
            }
          });
        } else {
          if (!resolved) {
            resolved = true;
            clearTimeout(timeoutTimer);
            resolve(null);
          }
        }
      };

      img.onerror = (err) => {
        console.error("[MediaPipe] Image load failed for pose detection:", err);
        if (!resolved) {
          resolved = true;
          clearTimeout(timeoutTimer);
          resolve(null);
        }
      };

      img.src = imgSrc;
    });
  } catch (err) {
    console.error("detectPoseFromImage error:", err);
    return null;
  }
};
