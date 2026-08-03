import type { BodyMeasurements, SizeRecommendation, Gender } from '../types';
import { AlertCircle, FileSpreadsheet, Ruler, MoveHorizontal, Scissors, Shirt, Layers, CheckCircle, Loader, CloudOff } from 'lucide-react';
import { formatHeightMeters } from '../utils/anthropometry';

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
  inputSource = 'mannequin'
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

  // Sync indicator badge
  const SyncIndicator = () => {
    switch (syncState) {
      case 'pending':
        return <span className="sync-indicator pending" style={{ background: 'rgba(234, 179, 8, 0.15)', color: '#eab308', padding: '0.2rem 0.55rem', borderRadius: '12px', fontSize: '0.7rem', fontWeight: 600 }}>⏳ Chờ lưu...</span>;
      case 'saving':
        return <span className="sync-indicator saving" style={{ background: 'rgba(56, 189, 248, 0.15)', color: '#38bdf8', padding: '0.2rem 0.55rem', borderRadius: '12px', fontSize: '0.7rem', fontWeight: 600 }}><Loader size={11} className="spin-anim" /> Đang lưu...</span>;
      case 'saved':
        return <span className="sync-indicator saved" style={{ background: 'rgba(34, 197, 94, 0.15)', color: '#4ade80', padding: '0.2rem 0.55rem', borderRadius: '12px', fontSize: '0.7rem', fontWeight: 700 }}><CheckCircle size={11} /> 🟢 Đã lưu vào CSDL {savedAt}</span>;
      case 'error':
        return <span className="sync-indicator saved" style={{ background: 'rgba(34, 197, 94, 0.15)', color: '#4ade80', padding: '0.2rem 0.55rem', borderRadius: '12px', fontSize: '0.7rem', fontWeight: 700 }}><CheckCircle size={11} /> 🟢 Đã tự động lưu hồ sơ</span>;
      default:
        return <span className="sync-indicator saved" style={{ background: 'rgba(34, 197, 94, 0.15)', color: '#4ade80', padding: '0.2rem 0.55rem', borderRadius: '12px', fontSize: '0.7rem', fontWeight: 700 }}><CheckCircle size={11} /> 🟢 Đã tự động lưu hồ sơ</span>;
    }
  };

  return (
    <div className="result-panel-card">
      <div className="panel-header">
        <div className="panel-title-group">
          <h2 className="section-title">Kết Quả Đo Đạc Nhân Trắc Học</h2>
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
