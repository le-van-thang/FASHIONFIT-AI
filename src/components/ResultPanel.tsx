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
  sizeSystem
}) => {

  const measurementItems = view === 'front' ? [
    { label: 'Chiều cao thực tế', value: `${measurements.height.toFixed(1)} cm (${formatHeightMeters(measurements.height)})`, unit: '', desc: 'Đo từ gốc mũi, triệt tiêu tóc phồng', icon: Ruler, fullWidth: true },
    { label: 'Rộng vai', value: measurements.shoulderWidth, unit: 'cm', desc: 'Chiều ngang qua các điểm Acromion', icon: MoveHorizontal, fullWidth: false },
    { label: 'Dài tay', value: measurements.armLength, unit: 'cm', desc: 'Đo từ vai đến xương cổ tay', icon: Scissors, fullWidth: false },
    { label: 'Dài chân (Inseam)', value: measurements.legLength, unit: 'cm', desc: 'Đo từ hông dọc xuống mắt cá', icon: Layers, fullWidth: false },
    { label: 'Chu vi Vòng ngực', value: measurements.chestCircumference, unit: 'cm', desc: 'Đo qua điểm ngực lớn nhất', icon: Shirt, fullWidth: false },
    { label: 'Chu vi Vòng eo', value: measurements.waistCircumference, unit: 'cm', desc: 'Đo quanh điểm eo thắt nhỏ nhất', icon: Shirt, fullWidth: false },
    { label: 'Chu vi Vòng mông', value: measurements.hipCircumference, unit: 'cm', desc: 'Đo quanh điểm mông lớn nhất', icon: Shirt, fullWidth: false },
    { label: 'Chu vi Vòng cổ', value: measurements.neckCircumference, unit: 'cm', desc: 'Đo quanh vòng cổ tại gốc cổ', icon: Shirt, fullWidth: false },
    { label: 'Chu vi Vòng đùi', value: measurements.thighCircumference, unit: 'cm', desc: 'Đo quanh vòng đùi tại vị trí lớn nhất', icon: Layers, fullWidth: false },
    { label: 'Chu vi Vòng bắp chân', value: measurements.calfCircumference, unit: 'cm', desc: 'Đo quanh bắp chân tại vị trí lớn nhất', icon: Layers, fullWidth: false },
    { label: 'Chu vi Vòng cổ chân', value: measurements.ankleCircumference, unit: 'cm', desc: 'Chu vi cổ chân tại khớp mắt cá', icon: Layers, fullWidth: true }
  ] : [
    { label: 'Chiều cao thực tế', value: `${measurements.height.toFixed(1)} cm (${formatHeightMeters(measurements.height)})`, unit: '', desc: 'Đo từ gốc mũi, triệt tiêu tóc phồng', icon: Ruler, fullWidth: true },
    { label: 'Độ sâu Ngực (Bust Depth)', value: measurements.chestDepth || 0, unit: 'cm', desc: 'Đo khoảng cách ngang từ khớp vai qua đỉnh ngực', icon: Layers, fullWidth: false },
    { label: 'Độ sâu Eo (Waist Depth)', value: measurements.waistDepth || 0, unit: 'cm', desc: 'Đo khoảng cách ngang từ cột sống qua bụng', icon: Layers, fullWidth: false },
    { label: 'Độ sâu Mông (Hips Depth)', value: measurements.hipDepth || 0, unit: 'cm', desc: 'Đo khoảng cách ngang từ khớp hông qua đỉnh mông', icon: Layers, fullWidth: true }
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

  // Small sync indicator (not a button)
  const SyncIndicator = () => {
    switch (syncState) {
      case 'pending':
        return <span className="sync-indicator pending">Chờ lưu...</span>;
      case 'saving':
        return <span className="sync-indicator saving"><Loader size={11} className="spin-anim" /> Đang lưu</span>;
      case 'saved':
        return <span className="sync-indicator saved"><CheckCircle size={11} /> Đã lưu {savedAt}</span>;
      case 'error':
        return <span className="sync-indicator error"><CloudOff size={11} /> Lỗi kết nối</span>;
      default:
        return null;
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
                  {typeof item.value === 'number' ? item.value.toFixed(1) : item.value}
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
        <div className="size-header">
          <span className="box-title">Gợi ý cỡ thương mại ({sizeSystem === 'vietnam' ? 'Hệ Việt Nam - Savani' : 'Hệ Quốc Tế - US/EU'})</span>
          <div className="size-badge-wrapper">
            <span className="size-badge">{recommendation.size}</span>
            <span className="match-pct">Độ tin cậy: {recommendation.matchPercentage}%</span>
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
