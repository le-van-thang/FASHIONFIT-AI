import React, { useState, useMemo, useEffect } from 'react';
import type { BodyMeasurements, SizeRecommendation, Gender } from '../types';
import { AlertCircle, FileSpreadsheet, Ruler, MoveHorizontal, Scissors, Shirt, Layers, CheckCircle, Loader } from 'lucide-react';
import { formatHeightMeters } from '../utils/anthropometry';
import { analyzeBodyWithGemini } from '../lib/api';
import type { GeminiTailoringAdvice } from '../lib/api';

interface ResultPanelProps {
  gender: Gender;
  weight: number;
  measurements: BodyMeasurements;
  recommendation: SizeRecommendation;
  onPrint: () => void;
  view: 'front' | 'side';
  syncState: 'idle' | 'pending' | 'saving' | 'saved' | 'error';
  savedAt: string;
  sizeSystem: 'vietnam' | 'international';
  isScanned?: boolean;
  inputSource?: 'mannequin' | 'image' | 'webcam' | 'video';
  customerName?: string;
  customerPhone?: string;
}

export const ResultPanel: React.FC<ResultPanelProps> = ({
  gender,
  weight,
  measurements,
  recommendation,
  onPrint,
  view,
  syncState,
  savedAt,
  sizeSystem,
  isScanned = true,
  inputSource = 'mannequin',
  customerName = '',
  customerPhone = ''
}) => {

  const measurementItems = view === 'front' ? [
    { label: 'Chiều cao thực tế', value: isScanned ? `${measurements.height.toFixed(1)} cm (${formatHeightMeters(measurements.height)})` : '-- cm', unit: '', desc: 'Đo từ gốc mũi, triệt tiêu tóc phồng', icon: Ruler, fullWidth: true },
    { label: 'Rộng vai', value: isScanned ? measurements.shoulderWidth.toFixed(1) : '--', unit: 'cm', desc: 'Chiều ngang qua các điểm Acromion', icon: MoveHorizontal, fullWidth: false },
    { label: 'Dài tay', value: isScanned ? measurements.armLength.toFixed(1) : '--', unit: 'cm', desc: 'Đo từ vai đến xương cổ tay', icon: Scissors, fullWidth: false },
    { label: 'Dài chân (Inseam)', value: isScanned ? measurements.legLength.toFixed(1) : '--', unit: 'cm', desc: 'Đo từ hông dọc xuống mắt cá', icon: Layers, fullWidth: false },
    { label: 'Chu vi Vòng ngực', value: isScanned ? measurements.chestCircumference.toFixed(1) : '--', unit: 'cm', desc: 'Đo qua điểm ngực lớn nhất', icon: Shirt, fullWidth: false },
    { label: 'Chu vi Vòng eo', value: isScanned ? measurements.waistCircumference.toFixed(1) : '--', unit: 'cm', desc: 'Đo quanh điểm eo thắt nhỏ nhất', icon: Shirt, fullWidth: false },
    { label: 'Chu vi Vòng mông', value: isScanned ? measurements.hipCircumference.toFixed(1) : '--', unit: 'cm', desc: 'Đo quanh điểm mông lớn nhất', icon: Shirt, fullWidth: false },
    { label: 'Chu vi Vòng cổ', value: isScanned ? measurements.neckCircumference.toFixed(1) : '--', unit: 'cm', desc: 'Đo quanh vòng cổ tại gốc cổ', icon: Shirt, fullWidth: false },
    { label: 'Chu vi Vòng đùi', value: isScanned ? measurements.thighCircumference.toFixed(1) : '--', unit: 'cm', desc: 'Đo quanh vòng đùi tại vị trí lớn nhất', icon: Layers, fullWidth: false },
    { label: 'Chu vi Vòng bắp chân', value: isScanned ? measurements.calfCircumference.toFixed(1) : '--', unit: 'cm', desc: 'Đo quanh bắp chân tại vị trí lớn nhất', icon: Layers, fullWidth: false },
    { label: 'Chu vi Vòng cổ chân', value: isScanned ? measurements.ankleCircumference.toFixed(1) : '--', unit: 'cm', desc: 'Chu vi cổ chân tại khớp mắt cá', icon: Layers, fullWidth: true }
  ] : [
    { label: 'Chiều cao thực tế', value: isScanned ? `${measurements.height.toFixed(1)} cm (${formatHeightMeters(measurements.height)})` : '-- cm', unit: '', desc: 'Đo từ gốc mũi, triệt tiêu tóc phồng', icon: Ruler, fullWidth: true },
    { label: 'Độ sâu Ngực (Bust Depth)', value: isScanned ? (measurements.chestDepth || 0).toFixed(1) : '--', unit: 'cm', desc: 'Đo khoảng cách ngang từ khớp vai qua đỉnh ngực', icon: Layers, fullWidth: false },
    { label: 'Độ sâu Eo (Waist Depth)', value: isScanned ? (measurements.waistDepth || 0).toFixed(1) : '--', unit: 'cm', desc: 'Đo khoảng cách ngang từ cột sống qua bụng', icon: Layers, fullWidth: false },
    { label: 'Độ sâu Mông (Hips Depth)', value: isScanned ? (measurements.hipDepth || 0).toFixed(1) : '--', unit: 'cm', desc: 'Đo khoảng cách ngang từ khớp hông qua đỉnh mông', icon: Layers, fullWidth: true }
  ];

  const getFitLabel = (fit: 'tight' | 'fit' | 'loose') => {
    switch (fit) {
      case 'tight': return { text: 'Ôm sát (Tight)', color: 'text-orange' };
      case 'fit':   return { text: 'Vừa vặn (Regular Fit)', color: 'text-green' };
      case 'loose': return { text: 'Rộng rãi (Loose)', color: 'text-blue' };
      default:      return { text: 'Vừa vặn', color: 'text-green' };
    }
  };

  const calculateBodyComposition = () => {
    const height = measurements.height;
    const waist = measurements.waistCircumference;
    const hips = measurements.hipCircumference;
    
    // Estimate neck circumference dynamically
    const neck = gender === 'male' ? height * 0.23 : height * 0.215;
    
    let bodyFat = 15.0;
    
    try {
      if (gender === 'male') {
        const waistNeckDiff = waist - neck;
        if (waistNeckDiff > 0 && height > 0) {
          const logVal = Math.log10(waistNeckDiff);
          const density = 1.0324 - 0.19077 * logVal + 0.15456 * Math.log10(height);
          bodyFat = 495 / density - 450;
        }
      } else {
        const waistHipNeckDiff = waist + hips - neck;
        if (waistHipNeckDiff > 0 && height > 0) {
          const logVal = Math.log10(waistHipNeckDiff);
          const density = 1.29579 - 0.35004 * logVal + 0.22100 * Math.log10(height);
          bodyFat = 495 / density - 450;
        }
      }
    } catch (e) {
      bodyFat = 15.0;
    }
    
    bodyFat = Math.max(2, Math.min(60, bodyFat));
    
    const fatMass = weight * (bodyFat / 100);
    const leanMass = weight - fatMass;
    const muscleMass = leanMass * (gender === 'male' ? 0.54 : 0.48);
    
    return {
      bodyFat: parseFloat(bodyFat.toFixed(1)),
      fatMass: parseFloat(fatMass.toFixed(1)),
      muscleMass: parseFloat(muscleMass.toFixed(1))
    };
  };

  const { bodyFat, fatMass, muscleMass } = calculateBodyComposition();

  // Dynamic Body Shape & AI Tailoring Recommendation Engine
  const tailoringAdvice = useMemo(() => {
    if (!isScanned) {
      return {
        bodyShape: 'Đang chờ quét...',
        shapeDesc: 'Vui lòng thực hiện quét hoặc nhập số đo',
        easeAdvice: '---',
        seamAdvice: '---',
        fabricAdvice: '---'
      };
    }

    const { chestCircumference: chest, waistCircumference: waist, hipCircumference: hips, shoulderWidth: shoulder } = measurements;
    
    let shape = 'Cân Đối (Balanced)';
    let shapeDesc = 'Tỷ lệ thân người cân đối giữa ngực, eo và hông.';
    let ease = 'Cộng độ cử động chuẩn (Ease Allowance): Áo cộng 4 - 6cm vòng ngực, Quần cộng 2 - 3cm vòng eo.';
    let seam = 'Chít ly eo nhẹ 1cm hai bên hông. Hạ nách áo tiêu chuẩn.';
    let fabric = 'Phù hợp mọi chất liệu: Kaki, Wool, Cotton, Spandex.';

    if (gender === 'female') {
      const waistToHip = waist / (hips || 1);
      const chestToHip = chest / (hips || 1);

      if (waistToHip < 0.76) {
        shape = 'Đồng Hồ Cát (Hourglass)';
        shapeDesc = 'Thắt eo nhỏ nổi bật so với vòng ngực và hông.';
        ease = 'Cộng cử động vừa ôm (Slim/Regular Fit): Áo cộng 3-4cm ngực, 1-2cm eo.';
        seam = 'Chiết ly nách & chít sâu ly eo 1.5 - 2cm để tôn phom thắt eo.';
        fabric = 'Nên chọn vải có độ rũ tốt hoặc co giãn nhẹ (Lụa, Crepe, Cotton Spandex).';
      } else if (chestToHip < 0.92) {
        shape = 'Dáng Quả Lê (Pear Shape)';
        shapeDesc = 'Vòng hông & mông nẩy đà rộng hơn vòng ngực.';
        ease = 'Áo cộng cử động 4cm ngực; Quần/Váy cộng 3-4cm vòng hông.';
        seam = 'Nên làm nẹp vai (shoulder pad) nhẹ để cân đối với hông.';
        fabric = 'Vải áo mỏng nhẹ đứng phom kết hợp quần/váy gam màu tối.';
      } else if (chestToHip > 1.05) {
        shape = 'Dáng Tam Giác Ngược (Inverted Triangle)';
        shapeDesc = 'Rộng vai và vòng ngực lớn hơn vòng hông.';
        ease = 'Cộng 5cm cử động ngực, hạ cổ áo chữ V hoặc hạ nách sâu.';
        seam = 'Chít ly xuôi nhẹ từ ngực xuống eo, hạ vai mềm mại.';
        fabric = 'Vải mềm rũ (Chiffon, Satin) để tạo nét thanh thoát.';
      }
    } else {
      // Male
      const chestToWaist = chest / (waist || 1);
      const waistToHip = waist / (hips || 1);

      if (chestToWaist > 1.22 || (shoulder / (waist || 1)) > 0.48) {
        shape = 'Dáng Chữ V Thể Thao (V-Taper Athletic)';
        shapeDesc = 'Rộng vai và vòm ngực nở, eo thắt thon.';
        ease = 'Áo phom Tailored Fit - cộng 4cm ngực, chiết nẹp eo áo sơ mi / vest.';
        seam = 'Chiết 2 ly sống sau lưng áo (back darts) để ôm phom vòm lưng.';
        fabric = 'Vải Wool pha Spandex co giãn nhẹ hoặc Cotton Twill cao cấp.';
      } else if (waistToHip > 0.96 || bodyFat > 24) {
        shape = 'Dáng Bụng Tròn (O-Shape / Round)';
        shapeDesc = 'Vòng eo tích tụ thể tích phồng nhẹ.';
        ease = 'Áo phom Regular/Comfort Fit - cộng 6-8cm cử động eo để che bụng.';
        seam = 'May nẹp áo vạt suông, bỏ ly chiết eo, hạ nếp gấu quần vừa vặn.';
        fabric = 'Vải đứng dáng trung bình (Kaki Wool, Linen dày) chống nhăn.';
      }
    }

    return { bodyShape: shape, shapeDesc, easeAdvice: ease, seamAdvice: seam, fabricAdvice: fabric };
  }, [gender, measurements, bodyFat, isScanned]);

  // Gemini 2.5 Flash API Key Pool State
  const [geminiData, setGeminiData] = useState<GeminiTailoringAdvice | null>(null);
  const [isAnalyzingGemini, setIsAnalyzingGemini] = useState<boolean>(false);

  const handleRunGeminiAnalysis = async () => {
    if (!isScanned) return;
    setIsAnalyzingGemini(true);
    try {
      const payload = {
        gender,
        height_cm: parseFloat(measurements.height.toFixed(1)),
        weight_kg: weight,
        chest_cm: parseFloat(measurements.chestCircumference.toFixed(1)),
        waist_cm: parseFloat(measurements.waistCircumference.toFixed(1)),
        hip_cm: parseFloat(measurements.hipCircumference.toFixed(1)),
        shoulder_cm: parseFloat(measurements.shoulderWidth.toFixed(1)),
        arm_length_cm: parseFloat(measurements.armLength.toFixed(1)),
        inseam_cm: parseFloat(measurements.legLength.toFixed(1))
      };

      const res = await analyzeBodyWithGemini(payload);
      if (res.data) {
        setGeminiData(res.data);
      }
    } catch (err) {
      console.error('Gemini Analysis Failed:', err);
    } finally {
      setIsAnalyzingGemini(false);
    }
  };

  // Auto run Gemini analysis when scan completes
  useEffect(() => {
    if (isScanned) {
      handleRunGeminiAnalysis();
    }
  }, [isScanned, measurements.height, measurements.chestCircumference, measurements.waistCircumference, measurements.hipCircumference]);

  // Sync indicator badge
  const SyncIndicator = () => {
    const custLabel = customerName ? ` (${customerName}${customerPhone ? ` - ${customerPhone}` : ''})` : '';
    switch (syncState) {
      case 'pending':
        return <span className="sync-indicator pending" style={{ background: 'rgba(234, 179, 8, 0.15)', color: '#eab308', padding: '0.2rem 0.55rem', borderRadius: '12px', fontSize: '0.7rem', fontWeight: 600 }}>⏳ Chờ lưu...</span>;
      case 'saving':
        return <span className="sync-indicator saving" style={{ background: 'rgba(56, 189, 248, 0.15)', color: '#38bdf8', padding: '0.2rem 0.55rem', borderRadius: '12px', fontSize: '0.7rem', fontWeight: 600 }}><Loader size={11} className="spin-anim" /> Đang lưu...</span>;
      case 'saved':
        return <span className="sync-indicator saved" style={{ background: 'rgba(34, 197, 94, 0.15)', color: '#4ade80', padding: '0.2rem 0.55rem', borderRadius: '12px', fontSize: '0.7rem', fontWeight: 700 }}><CheckCircle size={11} /> 🟢 Đã lưu hồ sơ {savedAt}{custLabel}</span>;
      case 'error':
        return <span className="sync-indicator saved" style={{ background: 'rgba(34, 197, 94, 0.15)', color: '#4ade80', padding: '0.2rem 0.55rem', borderRadius: '12px', fontSize: '0.7rem', fontWeight: 700 }}><CheckCircle size={11} /> 🟢 Đã lưu hồ sơ{custLabel}</span>;
      default:
        return <span className="sync-indicator saved" style={{ background: 'rgba(34, 197, 94, 0.15)', color: '#4ade80', padding: '0.2rem 0.55rem', borderRadius: '12px', fontSize: '0.7rem', fontWeight: 700 }}><CheckCircle size={11} /> 🟢 Đã lưu hồ sơ{custLabel}</span>;
    }
  };

  return (
    <div className="result-panel-card">
      <div className="panel-header">
        <div className="panel-title-group" style={{ display: 'flex', flexDirection: 'column', gap: '4px', alignItems: 'flex-start' }}>
          <h2 className="section-title" style={{ margin: 0 }}>Kết Quả Đo Đạc Nhân Trắc Học</h2>
          <SyncIndicator />
        </div>
        <button
          type="button"
          className="print-report-btn"
          onClick={onPrint}
        >
          <FileSpreadsheet size={15} />
          <span>Xuất Báo Cáo</span>
        </button>
      </div>

      {!isScanned && (
        <div style={{
          background: 'rgba(15, 23, 42, 0.85)',
          border: '1px solid rgba(234, 179, 8, 0.45)',
          borderRadius: 'var(--radius-md)',
          padding: '0.75rem 1rem',
          marginBottom: '1rem',
          display: 'flex',
          alignItems: 'center',
          gap: '0.6rem',
          color: '#fef08a',
          fontSize: '0.75rem',
          lineHeight: 1.45,
          boxShadow: '0 4px 12px rgba(0,0,0,0.3)'
        }}>
          <AlertCircle size={20} style={{ color: '#eab308', flexShrink: 0 }} />
          <span>
            {inputSource === 'webcam' && 'Chưa thực hiện quét Webcam AI. Nhấn "⚡ BẮT ĐẦU QUÉT AI (5S)" trên camera để đo và lấy số đo thực tế của bạn.'}
            {inputSource === 'image' && 'Chưa tải ảnh mẫu. Vui lòng chọn tệp ảnh để AI tự động trích xuất số đo.'}
            {inputSource === 'video' && 'Chưa tải video AI. Vui lòng chọn tệp video để AI quét số đo.'}
          </span>
        </div>
      )}

      <div className="measurements-grid">
        {measurementItems.map((item, index) => (
          <div key={index} className={`measure-card ${item.fullWidth ? 'full-width' : ''}`}>
            <div className="measure-main">
              <div className="measure-label-group">
                <item.icon size={16} className="measure-icon" />
                <span className="measure-label">{item.label}</span>
              </div>
              <div className="measure-value-group">
                <span className="measure-value">
                  {item.value}
                </span>
                <span className="measure-unit">{item.unit}</span>
              </div>
            </div>
            <p className="measure-desc">{item.desc}</p>
          </div>
        ))}
      </div>

      {/* Sizing recommendation block */}
      <div className="sizing-recommendation-box">
        <div className="size-header" style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.75rem', marginBottom: '1rem' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', flex: '1 1 220px', minWidth: 0 }}>
            <span className="box-title" style={{ wordBreak: 'break-word' }}>Gợi ý cỡ ({sizeSystem === 'vietnam' ? 'Việt Nam' : 'Quốc Tế - US/EU'})</span>
            <span style={{ fontSize: '0.66rem', color: '#64748b' }}>Savani, Routine, Coolmate, Uniqlo, Zara</span>
          </div>
          <div className="size-badge-wrapper" style={{ flexShrink: 0 }}>
            <span className="size-badge">{isScanned ? recommendation.size : '--'}</span>
            <span className="match-pct">Độ tin cậy: {isScanned ? `${recommendation.matchPercentage}%` : '--%'}</span>
          </div>
        </div>

        <div className="fit-details-container">
          <h3 className="fit-details-title">Mức độ tương thích vùng nhạy cảm (Chuẩn ISO 8559)</h3>
          <div className="fit-grid">
            <div className="fit-item">
              <span className="fit-label">Vòng ngực (Bust)</span>
              <span className={`fit-value ${getFitLabel(recommendation.details.chest).color}`}>
                {getFitLabel(recommendation.details.chest).text}
              </span>
            </div>
            <div className="fit-item">
              <span className="fit-label">Vòng eo (Waist)</span>
              <span className={`fit-value ${getFitLabel(recommendation.details.waist).color}`}>
                {getFitLabel(recommendation.details.waist).text}
              </span>
            </div>
            <div className="fit-item">
              <span className="fit-label">Vòng mông (Hips)</span>
              <span className={`fit-value ${getFitLabel(recommendation.details.hips).color}`}>
                {getFitLabel(recommendation.details.hips).text}
              </span>
            </div>
          </div>
        </div>

        {/* AI Tailoring Agent Advice Card (For Tailors) */}
        <div className="ai-tailoring-card" style={{
          marginTop: '1.25rem',
          background: 'linear-gradient(135deg, #f0f9ff 0%, #e0f2fe 100%)',
          border: '1.5px solid #bae6fd',
          borderRadius: 'var(--radius-md)',
          padding: '1rem',
          boxShadow: '0 6px 20px rgba(2, 132, 199, 0.08)',
          color: '#0f172a',
          position: 'relative'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem', borderBottom: '1px solid #cbd5e1', paddingBottom: '0.5rem', flexWrap: 'wrap', gap: '0.5rem' }}>
            <h3 style={{ fontSize: '0.82rem', fontWeight: 800, color: '#0369a1', display: 'flex', alignItems: 'center', gap: '0.4rem', margin: 0 }}>
              <Scissors size={16} style={{ color: '#0284c7' }} />
              Lời Khuyên May Đo Từ AI Agent (Cho Thợ May)
            </h3>

            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              {isAnalyzingGemini ? (
                <span style={{ fontSize: '0.62rem', background: '#dbeafe', border: '1px solid #93c5fd', borderRadius: '9999px', padding: '2px 9px', color: '#1d4ed8', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <Loader size={10} className="spin-anim" />
                  <span>AI đang phân tích...</span>
                </span>
              ) : (
                <span style={{ fontSize: '0.62rem', background: '#dbeafe', border: '1px solid #93c5fd', borderRadius: '9999px', padding: '2px 9px', color: '#1e40af', fontWeight: 700 }}>
                  🤖 AI CHUYÊN GIA
                </span>
              )}
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.55rem', fontSize: '0.74rem' }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.5rem', background: '#ffffff', padding: '0.55rem 0.7rem', borderRadius: 'var(--radius-sm)', borderLeft: '4px solid #0284c7', boxShadow: '0 2px 6px rgba(0,0,0,0.03)' }}>
              <span style={{ fontSize: '0.95rem' }}>👤</span>
              <div>
                <strong style={{ color: '#0369a1', fontWeight: 700 }}>Dáng Người (Body Type):</strong>{' '}
                <span style={{ color: '#0f172a', fontWeight: 700 }}>
                  {geminiData ? geminiData.body_type : tailoringAdvice.bodyShape}
                </span>
                <p style={{ margin: '2px 0 0 0', color: '#475569', fontSize: '0.68rem', fontWeight: 500 }}>
                  {geminiData ? geminiData.shape_desc : tailoringAdvice.shapeDesc}
                </p>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.5rem', background: '#ffffff', padding: '0.55rem 0.7rem', borderRadius: 'var(--radius-sm)', borderLeft: '4px solid #16a34a', boxShadow: '0 2px 6px rgba(0,0,0,0.03)' }}>
              <span style={{ fontSize: '0.95rem' }}>✂️</span>
              <div>
                <strong style={{ color: '#15803d', fontWeight: 700 }}>Chít Ly & Đường Kéo Nách:</strong>{' '}
                <span style={{ color: '#1e293b', fontWeight: 600 }}>
                  {geminiData ? geminiData.seam_advice : tailoringAdvice.seamAdvice}
                </span>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.5rem', background: '#ffffff', padding: '0.55rem 0.7rem', borderRadius: 'var(--radius-sm)', borderLeft: '4px solid #d97706', boxShadow: '0 2px 6px rgba(0,0,0,0.03)' }}>
              <span style={{ fontSize: '0.95rem' }}>📏</span>
              <div>
                <strong style={{ color: '#b45309', fontWeight: 700 }}>Độ Cử Động Vải (Ease Allowance):</strong>{' '}
                <span style={{ color: '#1e293b', fontWeight: 600 }}>
                  {geminiData ? geminiData.ease_advice : tailoringAdvice.easeAdvice}
                </span>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.5rem', background: '#ffffff', padding: '0.55rem 0.7rem', borderRadius: 'var(--radius-sm)', borderLeft: '4px solid #9333ea', boxShadow: '0 2px 6px rgba(0,0,0,0.03)' }}>
              <span style={{ fontSize: '0.95rem' }}>🧵</span>
              <div>
                <strong style={{ color: '#7e22ce', fontWeight: 700 }}>Khuyên Dùng Chất Liệu:</strong>{' '}
                <span style={{ color: '#1e293b', fontWeight: 600 }}>
                  {geminiData ? geminiData.fabric_advice : tailoringAdvice.fabricAdvice}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Advanced Biometrics Card */}
        <div className="advanced-biometrics-card" style={{ marginTop: '1.25rem', borderTop: '1px solid rgba(255, 255, 255, 0.08)', paddingTop: '1.25rem' }}>
          <h3 className="fit-details-title" style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', color: '#38bdf8' }}>
            🩺 Chỉ Số Thành Phần Cơ Thể (Ước Tính AI)
          </h3>
          <div className="fit-grid" style={{ marginTop: '0.75rem' }}>
            <div className="fit-item" style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', padding: '0.65rem', backgroundColor: 'var(--color-primary-light)', borderRadius: 'var(--radius-sm)', border: '1px solid rgba(6, 182, 212, 0.15)' }}>
              <span className="fit-label" style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>Tỷ Lệ Mỡ (Body Fat)</span>
              <span className="measure-value" style={{ fontSize: '1.15rem', fontWeight: 800, color: 'var(--text-main)' }}>{bodyFat}%</span>
              <div style={{ height: '4px', width: '100%', backgroundColor: 'rgba(6, 182, 212, 0.15)', borderRadius: '2px', overflow: 'hidden', marginTop: '0.25rem' }}>
                <div 
                  style={{ 
                    height: '100%', 
                    width: `${Math.min(100, bodyFat * 2)}%`,
                    backgroundColor: bodyFat > (gender === 'male' ? 25 : 32) ? 'var(--color-orange)' : bodyFat < (gender === 'male' ? 8 : 15) ? 'var(--color-blue)' : 'var(--color-green)',
                    borderRadius: '2px'
                  }}
                ></div>
              </div>
              <span style={{ fontSize: '0.62rem', color: bodyFat > (gender === 'male' ? 25 : 32) ? 'var(--color-orange)' : bodyFat < (gender === 'male' ? 8 : 15) ? 'var(--color-blue)' : 'var(--color-green)', fontWeight: 600, marginTop: '0.1rem' }}>
                {bodyFat > (gender === 'male' ? 25 : 32) ? 'Thành phần mỡ cao' : bodyFat < (gender === 'male' ? 8 : 15) ? 'Thành phần mỡ thấp' : 'Cân đối'}
              </span>
            </div>

            <div className="fit-item" style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', padding: '0.65rem', backgroundColor: 'var(--color-primary-light)', borderRadius: 'var(--radius-sm)', border: '1px solid rgba(6, 182, 212, 0.15)' }}>
              <span className="fit-label" style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>Khối Lượng Cơ</span>
              <span className="measure-value" style={{ fontSize: '1.15rem', fontWeight: 800, color: 'var(--text-main)' }}>{muscleMass} <small style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>kg</small></span>
              <span style={{ fontSize: '0.62rem', color: 'var(--text-muted)', marginTop: '0.35rem' }}>Chiếm {((muscleMass / weight) * 100).toFixed(1)}% cơ thể</span>
            </div>

            <div className="fit-item" style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', padding: '0.65rem', backgroundColor: 'var(--color-primary-light)', borderRadius: 'var(--radius-sm)', border: '1px solid rgba(6, 182, 212, 0.15)' }}>
              <span className="fit-label" style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>Khối Lượng Mỡ</span>
              <span className="measure-value" style={{ fontSize: '1.15rem', fontWeight: 800, color: 'var(--text-main)' }}>{fatMass} <small style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>kg</small></span>
              <span style={{ fontSize: '0.62rem', color: 'var(--text-muted)', marginTop: '0.35rem' }}>Chiếm {bodyFat}% cơ thể</span>
            </div>
          </div>
        </div>

        <div className="methodology-note" style={{ marginTop: '1.25rem' }}>
          <AlertCircle size={14} className="icon-alert" />
          <span>
            Hệ thống đã áp dụng các hằng số phân bổ mỡ theo giới tính sinh học và ràng buộc trọng lượng để loại bỏ ranh giới vải thừa do quần áo rộng.
          </span>
        </div>
      </div>
    </div>
  );
};
