import React, { useState, useEffect } from 'react';
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
  const [weightInputVal, setWeightInputVal] = useState<string>(input.weight.toString());
  const [refPixelsInputVal, setRefPixelsInputVal] = useState<string>(referencePixels.toString());

  useEffect(() => {
    setWeightInputVal(input.weight.toString());
  }, [input.weight]);

  useEffect(() => {
    setRefPixelsInputVal(referencePixels.toString());
  }, [referencePixels]);

  const handleGenderSelect = (gender: Gender) => {
    onChange({ ...input, gender });
  };

  const handleWeightSliderChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const weight = Number(e.target.value);
    onChange({ ...input, weight });
  };

  const handleWeightTextInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setWeightInputVal(val);
    
    const parsed = parseFloat(val);
    if (!isNaN(parsed) && parsed >= 2 && parsed <= 300) {
      onChange({ ...input, weight: parsed });
    }
  };

  const handleWeightTextInputBlur = () => {
    const parsed = parseFloat(weightInputVal);
    if (isNaN(parsed)) {
      setWeightInputVal(input.weight.toString());
    } else if (parsed < 2) {
      onChange({ ...input, weight: 2 });
      setWeightInputVal("2");
    } else if (parsed > 300) {
      onChange({ ...input, weight: 300 });
      setWeightInputVal("300");
    } else {
      setWeightInputVal(input.weight.toString());
    }
  };

  const handleCalibrationChange = (type: CalibrationType) => {
    onChange({ ...input, calibrationType: type });
  };

  const handleRefPixelsSliderChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onReferencePixelsChange(Number(e.target.value));
  };

  const handleRefPixelsTextInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setRefPixelsInputVal(val);
    
    const parsed = parseInt(val, 10);
    if (!isNaN(parsed) && parsed >= 30 && parsed <= 500) {
      onReferencePixelsChange(parsed);
    }
  };

  const handleRefPixelsTextInputBlur = () => {
    const parsed = parseInt(refPixelsInputVal, 10);
    if (isNaN(parsed)) {
      setRefPixelsInputVal(referencePixels.toString());
    } else if (parsed < 30) {
      onReferencePixelsChange(30);
      setRefPixelsInputVal("30");
    } else if (parsed > 500) {
      onReferencePixelsChange(500);
      setRefPixelsInputVal("500");
    } else {
      setRefPixelsInputVal(referencePixels.toString());
    }
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
          <div className="slider-container" style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
            <input
              type="range"
              min="2"
              max="250"
              step="1"
              value={input.weight}
              onChange={handleWeightSliderChange}
              className="weight-slider"
              list="weight-ticks"
            />
            <datalist id="weight-ticks">
              <option value="2"></option>
              <option value="50"></option>
              <option value="100"></option>
              <option value="150"></option>
              <option value="200"></option>
              <option value="250"></option>
            </datalist>
            <div className="slider-ticks-labels">
              <span>2kg</span>
              <span>50kg</span>
              <span>100kg</span>
              <span>150kg</span>
              <span>200kg</span>
              <span>250kg</span>
            </div>
          </div>
          <div className="weight-number-box">
            <input
              type="text"
              value={weightInputVal}
              onChange={handleWeightTextInputChange}
              onBlur={handleWeightTextInputBlur}
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
          <div className="slider-container" style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
            <input
              type="range"
              min="30"
              max="300"
              value={referencePixels}
              onChange={handleRefPixelsSliderChange}
              className="weight-slider"
              list="pixels-ticks"
            />
            <datalist id="pixels-ticks">
              <option value="30"></option>
              <option value="100"></option>
              <option value="200"></option>
              <option value="300"></option>
            </datalist>
            <div className="slider-ticks-labels">
              <span>30px</span>
              <span>100px</span>
              <span>200px</span>
              <span>300px</span>
            </div>
          </div>
          <div className="weight-number-box">
            <input
              type="text"
              value={refPixelsInputVal}
              onChange={handleRefPixelsTextInputChange}
              onBlur={handleRefPixelsTextInputBlur}
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
