import React from 'react';
import type { BodyMeasurements, SizeRecommendation } from '../types';
import { AlertCircle, FileSpreadsheet, Ruler, MoveHorizontal, Scissors, Shirt, Layers, CheckCircle, Loader, CloudOff } from 'lucide-react';
import { formatHeightMeters } from '../utils/anthropometry';

interface ResultPanelProps {
  measurements: BodyMeasurements;
  recommendation: SizeRecommendation;
  onPrint: () => void;
  view: 'front' | 'side';
  syncState: 'idle' | 'pending' | 'saving' | 'saved' | 'error';
  savedAt: string;
}

export const ResultPanel: React.FC<ResultPanelProps> = ({
  measurements,
  recommendation,
  onPrint,
  view,
  syncState,
  savedAt
}) => {

  const measurementItems = view === 'front' ? [
    { label: 'Chiều cao thực tế', value: `${measurements.height.toFixed(1)} cm (${formatHeightMeters(measurements.height)})`, unit: '', desc: 'Đo từ gốc mũi, triệt tiêu tóc phồng', icon: Ruler, fullWidth: true },
    { label: 'Rộng vai', value: measurements.shoulderWidth, unit: 'cm', desc: 'Chiều ngang qua các điểm Acromion', icon: MoveHorizontal, fullWidth: false },
    { label: 'Dài tay', value: measurements.armLength, unit: 'cm', desc: 'Đo từ vai đến xương cổ tay', icon: Scissors, fullWidth: false },
    { label: 'Dài chân (Inseam)', value: measurements.legLength, unit: 'cm', desc: 'Đo từ hông dọc xuống mắt cá', icon: Layers, fullWidth: false },
    { label: 'Chu vi Vòng ngực', value: measurements.chestCircumference, unit: 'cm', desc: 'Đo qua điểm ngực lớn nhất', icon: Shirt, fullWidth: false },
    { label: 'Chu vi Vòng eo', value: measurements.waistCircumference, unit: 'cm', desc: 'Đo quanh điểm eo thắt nhỏ nhất', icon: Shirt, fullWidth: false },
    { label: 'Chu vi Vòng mông', value: measurements.hipCircumference, unit: 'cm', desc: 'Đo quanh điểm mông lớn nhất', icon: Shirt, fullWidth: false }
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
          <span className="box-title">Gợi ý Size trang phục thương mại (S/M/L/XL)</span>
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

        <div className="methodology-note">
          <AlertCircle size={14} className="icon-alert" />
          <span>
            Hệ thống đã áp dụng các hằng số phân bổ mỡ theo giới tính sinh học và ràng buộc trọng lượng để loại bỏ ranh giới vải thừa do quần áo rộng.
          </span>
        </div>
      </div>
    </div>
  );
};
