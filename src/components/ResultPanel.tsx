import React from 'react';
import type { BodyMeasurements, SizeRecommendation } from '../types';
import { AlertCircle, FileSpreadsheet } from 'lucide-react';

interface ResultPanelProps {
  measurements: BodyMeasurements;
  recommendation: SizeRecommendation;
  onPrint: () => void;
}

export const ResultPanel: React.FC<ResultPanelProps> = ({
  measurements,
  recommendation,
  onPrint
}) => {
  const measurementItems = [
    { label: 'Chiều cao thực tế', value: measurements.height, unit: 'cm', desc: 'Đo từ gốc mũi, triệt tiêu tóc phồng' },
    { label: 'Rộng vai', value: measurements.shoulderWidth, unit: 'cm', desc: 'Chiều ngang qua các điểm Acromion' },
    { label: 'Dài tay', value: measurements.armLength, unit: 'cm', desc: 'Đo từ vai đến xương cổ tay' },
    { label: 'Dài chân (Inseam)', value: measurements.legLength, unit: 'cm', desc: 'Đo từ hông dọc xuống mắt cá' },
    { label: 'Chu vi Vòng ngực', value: measurements.chestCircumference, unit: 'cm', desc: 'Đo qua điểm ngực lớn nhất' },
    { label: 'Chu vi Vòng eo', value: measurements.waistCircumference, unit: 'cm', desc: 'Đo quanh điểm eo thắt nhỏ nhất' },
    { label: 'Chu vi Vòng mông', value: measurements.hipCircumference, unit: 'cm', desc: 'Đo quanh điểm mông lớn nhất' }
  ];

  const getFitLabel = (fit: 'tight' | 'fit' | 'loose') => {
    switch (fit) {
      case 'tight':
        return { text: 'Ôm sát (Tight)', color: 'text-orange' };
      case 'fit':
        return { text: 'Vừa vặn (Regular Fit)', color: 'text-green' };
      case 'loose':
        return { text: 'Rộng rãi (Loose)', color: 'text-blue' };
      default:
        return { text: 'Vừa vặn', color: 'text-green' };
    }
  };

  return (
    <div className="result-panel-card">
      <div className="panel-header">
        <h2 className="section-title">Kết Quả Đo Đạc Nhân Trắc Học</h2>
        <button
          type="button"
          className="print-report-btn"
          onClick={onPrint}
        >
          <FileSpreadsheet size={16} />
          <span>Xuất Báo Cáo</span>
        </button>
      </div>

      <div className="measurements-grid">
        {measurementItems.map((item, index) => (
          <div key={index} className="measure-card">
            <div className="measure-main">
              <span className="measure-label">{item.label}</span>
              <div className="measure-value-group">
                <span className="measure-value">{item.value.toFixed(1)}</span>
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
