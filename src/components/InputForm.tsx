import React from 'react';
import type { Gender, CalibrationType, UserInput } from '../types';
import { User, Scale, Eye, FileText, CreditCard } from 'lucide-react';

interface InputFormProps {
  input: UserInput;
  onChange: (input: UserInput) => void;
  referencePixels: number;
  onReferencePixelsChange: (pixels: number) => void;
}

export const InputForm: React.FC<InputFormProps> = ({
  input,
  onChange,
  referencePixels,
  onReferencePixelsChange
}) => {
  const handleGenderSelect = (gender: Gender) => {
    onChange({ ...input, gender });
  };

  const handleWeightChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const weight = Number(e.target.value);
    onChange({ ...input, weight });
  };

  const handleCalibrationChange = (type: CalibrationType) => {
    onChange({ ...input, calibrationType: type });
  };

  return (
    <div className="input-form-card">
      <h2 className="section-title">Thông Số Nhân Trắc Học</h2>
      
      {/* Gender Selection */}
      <div className="form-group">
        <label className="form-label">
          <User size={16} />
          <span>Giới tính sinh học (Fat distribution constraint)</span>
        </label>
        <div className="gender-toggle-wrapper">
          <button
            type="button"
            className={`gender-btn male ${input.gender === 'male' ? 'active' : ''}`}
            onClick={() => handleGenderSelect('male')}
          >
            Nam giới (Male)
          </button>
          <button
            type="button"
            className={`gender-btn female ${input.gender === 'female' ? 'active' : ''}`}
            onClick={() => handleGenderSelect('female')}
          >
            Nữ giới (Female)
          </button>
        </div>
      </div>

      {/* Weight Selection */}
      <div className="form-group">
        <label className="form-label">
          <Scale size={16} />
          <span>Cân nặng thực tế (Volume constraint)</span>
        </label>
        <div className="weight-input-wrapper">
          <input
            type="range"
            min="35"
            max="150"
            step="1"
            value={input.weight}
            onChange={handleWeightChange}
            className="weight-slider"
          />
          <div className="weight-number-box">
            <input
              type="number"
              min="35"
              max="150"
              value={input.weight}
              onChange={handleWeightChange}
              className="weight-input"
            />
            <span className="unit">kg</span>
          </div>
        </div>
        <p className="field-hint">
          * Dùng để tính toán thể tích thực cơ thể và triệt tiêu vải thừa của quần áo thụng.
        </p>
      </div>

      {/* Calibration Reference Selection */}
      <div className="form-group">
        <label className="form-label">
          <Eye size={16} />
          <span>Phương thức hiệu chuẩn (Pixel scale conversion)</span>
        </label>
        <div className="calibration-grid">
          <button
            type="button"
            className={`calib-card ${input.calibrationType === 'a4' ? 'active' : ''}`}
            onClick={() => handleCalibrationChange('a4')}
          >
            <FileText size={20} />
            <div className="calib-info">
              <span className="calib-name">Giấy A4 chuẩn</span>
              <span className="calib-desc">Ngang: 21.0 cm</span>
            </div>
          </button>
          
          <button
            type="button"
            className={`calib-card ${input.calibrationType === 'card' ? 'active' : ''}`}
            onClick={() => handleCalibrationChange('card')}
          >
            <CreditCard size={20} />
            <div className="calib-info">
              <span className="calib-name">Thẻ ngân hàng</span>
              <span className="calib-desc">Ngang: 8.56 cm</span>
            </div>
          </button>

          <button
            type="button"
            className={`calib-card ${input.calibrationType === 'ipd' ? 'active' : ''}`}
            onClick={() => handleCalibrationChange('ipd')}
          >
            <Eye size={20} />
            <div className="calib-info">
              <span className="calib-name">Khoảng cách mắt</span>
              <span className="calib-desc">IPD: 6.3 cm</span>
            </div>
          </button>
        </div>
      </div>

      {/* Reference object size control (Simulation of image zoom) */}
      <div className="form-group">
        <label className="form-label">
          <span>Kích thước vật tham chiếu trên ảnh (Pixel)</span>
        </label>
        <div className="weight-input-wrapper">
          <input
            type="range"
            min="30"
            max="300"
            value={referencePixels}
            onChange={(e) => onReferencePixelsChange(Number(e.target.value))}
            className="weight-slider"
          />
          <div className="weight-number-box">
            <input
              type="number"
              min="30"
              max="300"
              value={referencePixels}
              onChange={(e) => onReferencePixelsChange(Number(e.target.value))}
              className="weight-input"
            />
            <span className="unit">px</span>
          </div>
        </div>
        <p className="field-hint">
          {input.calibrationType === 'a4' && 'Chiều rộng của tờ giấy A4 màu trắng dán ngang hông.'}
          {input.calibrationType === 'card' && 'Chiều rộng của thẻ ATM đặt ngang cơ thể.'}
          {input.calibrationType === 'ipd' && 'Khoảng cách giữa hai đồng tử của mắt trên ảnh chụp.'}
        </p>
      </div>
    </div>
  );
};
