import React, { useState, useMemo } from 'react';
import type { UserInput, Landmark, BodyMeasurements, SizeRecommendation } from './types';
import { InputForm } from './components/InputForm';
import { BodyCanvas } from './components/BodyCanvas';
import { ResultPanel } from './components/ResultPanel';
import { estimateCircumferences, getRecommendedSize, calculateScaleFactor } from './utils/anthropometry';
import { Info, Activity } from 'lucide-react';

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
  const [input, setInput] = useState<UserInput>({
    gender: 'female',
    weight: 54,
    calibrationType: 'a4'
  });

  const [referencePixels, setReferencePixels] = useState<number>(120); // Default scale pixels
  const [landmarksFront, setLandmarksFront] = useState<Landmark[]>(initialFrontLandmarks);
  const [landmarksSide, setLandmarksSide] = useState<Landmark[]>(initialSideLandmarks);
  const [view, setView] = useState<'front' | 'side'>('front');

  const [uploadedImageFront, setUploadedImageFront] = useState<string | null>(null);
  const [uploadedImageSide, setUploadedImageSide] = useState<string | null>(null);

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
    return calculateScaleFactor(referencePixels, input.calibrationType);
  }, [referencePixels, input.calibrationType]);

  // Human Anthropometric Computations
  const measurements = useMemo<BodyMeasurements>(() => {
    // 2. Extract keypoints
    const nasionF = landmarksFront.find(l => l.id === 'nasion')!;
    const lShoulder = landmarksFront.find(l => l.id === 'left_shoulder')!;
    const rShoulder = landmarksFront.find(l => l.id === 'right_shoulder')!;
    const lElbow = landmarksFront.find(l => l.id === 'left_elbow')!;
    const lWrist = landmarksFront.find(l => l.id === 'left_wrist')!;
    const rElbow = landmarksFront.find(l => l.id === 'right_elbow')!;
    const rWrist = landmarksFront.find(l => l.id === 'right_wrist')!;
    const lHip = landmarksFront.find(l => l.id === 'left_hip')!;
    const rHip = landmarksFront.find(l => l.id === 'right_hip')!;
    const lKnee = landmarksFront.find(l => l.id === 'left_knee')!;
    const rKnee = landmarksFront.find(l => l.id === 'right_knee')!;
    const lAnkle = landmarksFront.find(l => l.id === 'left_ankle')!;
    const rAnkle = landmarksFront.find(l => l.id === 'right_ankle')!;

    const dist = (p1: Landmark, p2: Landmark) =>
      Math.sqrt(Math.pow(p1.x - p2.x, 2) + Math.pow(p1.y - p2.y, 2));

    // Height calculation (From nasion to midpoint of ankles)
    const midAnkleY = (lAnkle.y + rAnkle.y) / 2;
    const heightPixels = midAnkleY - nasionF.y;
    // Anatomical height = Gốc mũi đến sàn + 9.5cm (độ rộng trung bình sọ đầu từ gốc mũi lên đỉnh đầu)
    const height = Math.max(100, Math.min(220, heightPixels * scale + 9.5));

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
    const shoulderS = landmarksSide.find(l => l.id === 'shoulder')!;
    const chestDepthPt = landmarksSide.find(l => l.id === 'chest_depth')!;
    const hipS = landmarksSide.find(l => l.id === 'hip')!;
    const buttockDepthPt = landmarksSide.find(l => l.id === 'buttock_depth')!;

    // Horizontal depth in pixels
    const chestDepthCm = Math.abs(chestDepthPt.x - shoulderS.x) * scale;
    const hipDepthCm = Math.abs(hipS.x - buttockDepthPt.x) * scale;

    // Expected depth ratios based on heights
    const expectedChestDepth = height * 0.12; 
    const expectedHipDepth = height * 0.14; 

    // Scale adjustments
    const chestDepthFactor = expectedChestDepth > 0 ? chestDepthCm / expectedChestDepth : 1;
    const hipDepthFactor = expectedHipDepth > 0 ? hipDepthCm / expectedHipDepth : 1;

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
      chestDepth: chestDepthCm,
      waistDepth,
      hipDepth: hipDepthCm
    };
  }, [input, referencePixels, landmarksFront, landmarksSide, scale]);

  // Sizing recommendations
  const recommendation = useMemo<SizeRecommendation>(() => {
    const sizeData = getRecommendedSize(input.gender, measurements);
    
    // Fit detail analysis based on standard deviations
    const evaluateFit = (current: number, base: number) => {
      const diff = current - base;
      if (diff > 4) return 'loose' as const;
      if (diff < -3) return 'tight' as const;
      return 'fit' as const;
    };

    // Reference base chest/waist/hip mapping
    const baseLimits = input.gender === 'male' 
      ? { chest: 96, waist: 84, hips: 100 } // Size M male
      : { chest: 88, waist: 70, hips: 94 };  // Size M female

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
    
    if (height < 125 || height > 215) {
      return "Chiều cao bất thường (Yêu cầu: 125cm - 215cm). Vui lòng kéo chỉnh lại điểm Gốc Mũi hoặc Cổ Chân.";
    }
    if (shoulderWidth < 26 || shoulderWidth > 60) {
      return "Chiều rộng vai bất thường (Yêu cầu: 26cm - 60cm). Vui lòng kéo chỉnh lại khớp Vai Trái/Phải.";
    }
    if (armLength < 35 || armLength > 95) {
      return "Chiều dài tay bất thường (Yêu cầu: 35cm - 95cm). Vui lòng kéo chỉnh lại các khớp Khuỷu/Cổ tay.";
    }
    if (legLength < 45 || legLength > 115) {
      return "Chiều dài chân bất thường (Yêu cầu: 45cm - 115cm). Vui lòng kéo chỉnh lại các khớp Hông/Gối/Cổ chân.";
    }
    return null;
  }, [measurements]);

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
      </header>

      {/* Main layout */}
      <main className="main-content">
        <div className="left-column">
          {/* Scientific summary banner */}
          <div className="scientific-banner">
            <Info size={16} className="text-primary" />
            <p>
              <strong>Cơ chế lai:</strong> Sử dụng tỷ lệ <strong>Nasion (Gốc mũi)</strong> hạ vuông góc để triệt nhiễu tóc phồng, kết hợp **Khóa Thể Tích** bằng Cân nặng và Giới tính để triệt tiêu ảnh hưởng của quần áo rộng.
            </p>
          </div>

          <InputForm
            input={input}
            onChange={setInput}
            referencePixels={referencePixels}
            onReferencePixelsChange={setReferencePixels}
          />
        </div>

        <div className="center-column">
          <BodyCanvas
            gender={input.gender}
            weight={input.weight}
            scaleFactor={scale}
            landmarks={view === 'front' ? landmarksFront : landmarksSide}
            onLandmarkChange={handleLandmarkChange}
            view={view}
            onViewChange={setView}
            uploadedImage={view === 'front' ? uploadedImageFront : uploadedImageSide}
            onImageUpload={handleImageUpload}
            warning={anatomicalWarning}
          />
        </div>

        <div className="right-column">
          <ResultPanel
            measurements={measurements}
            recommendation={recommendation}
            onPrint={handlePrint}
            view={view}
          />
        </div>
      </main>

      {/* Footer */}
      <footer className="app-footer">
        <p>© 2026 FashionFit AI Project. Xây dựng bởi Sinh viên Nghiên cứu Khoa học & Kỹ thuật May mặc.</p>
      </footer>
    </div>
  );
}

export default App;
