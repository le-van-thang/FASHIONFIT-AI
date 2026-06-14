import React, { useState, useEffect } from 'react';
import type { Gender, CalibrationType, UserInput } from '../types';
import { User, Scale, Eye, FileText, CreditCard, Info, X, Camera, Ruler, ArrowRight, CheckCircle, Shirt } from 'lucide-react';
import { formatHeightMeters } from '../utils/anthropometry';

interface InputFormProps {
  input: UserInput;
  onChange: (input: UserInput) => void;
  referencePixels: number;
  onReferencePixelsChange: (pixels: number) => void;
  inputSource: 'mannequin' | 'image' | 'webcam' | 'video';
}

export const InputForm: React.FC<InputFormProps> = ({
  input,
  onChange,
  referencePixels,
  onReferencePixelsChange,
  inputSource
}) => {
  const [weightInputVal, setWeightInputVal] = useState<string>(input.weight.toString());
  const [refPixelsInputVal, setRefPixelsInputVal] = useState<string>(referencePixels.toString());
  const [heightInputVal, setHeightInputVal] = useState<string>((input.customHeight || 165).toString());
  const [showCalibGuide, setShowCalibGuide] = useState(false);

  useEffect(() => {
    setWeightInputVal(input.weight.toString());
  }, [input.weight]);

  useEffect(() => {
    setRefPixelsInputVal(referencePixels.toString());
  }, [referencePixels]);

  useEffect(() => {
    setHeightInputVal((input.customHeight || 165).toString());
  }, [input.customHeight]);

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
  const handleHeightTextInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setHeightInputVal(val);
    const parsed = parseFloat(val);
    if (!isNaN(parsed) && parsed >= 50 && parsed <= 250) {
      onChange({ ...input, customHeight: parsed });
    }
  };

  const handleHeightTextInputBlur = () => {
    const parsed = parseFloat(heightInputVal);
    const currentHeight = input.customHeight || 165;
    if (isNaN(parsed)) {
      setHeightInputVal(currentHeight.toString());
    } else if (parsed < 50) {
      onChange({ ...input, customHeight: 50 });
      setHeightInputVal("50");
    } else if (parsed > 250) {
      onChange({ ...input, customHeight: 250 });
      setHeightInputVal("250");
    } else {
      setHeightInputVal(parsed.toString());
    }
  };
  // Percent calculation for floating tooltips
  const weightPercent = ((input.weight - 2) / (250 - 2)) * 100;
  const pixelsPercent = ((referencePixels - 30) / (300 - 30)) * 100;

  const calibNames: Record<CalibrationType, { name: string; real: string }> = {
    a4: { name: 'Giấy A4', real: '21.0 cm' },
    card: { name: 'Thẻ ngân hàng', real: '8.56 cm' },
    ipd: { name: 'Khoảng cách mắt', real: '6.3 cm' },
    height: { name: 'Tự nhập chiều cao', real: '165 cm' },
  };

  return (
    <>
      {/* Calibration Guide Modal */}
      {showCalibGuide && (
        <div className="calib-modal-overlay" onClick={() => setShowCalibGuide(false)}>
          <div className="calib-modal" onClick={e => e.stopPropagation()}>
            <div className="calib-modal-header">
              <div className="calib-modal-title-group">
                <Ruler size={18} className="calib-modal-icon" />
                <h3 className="calib-modal-title">Hướng Dẫn Hiệu Chuẩn Tỷ Lệ Ảnh</h3>
              </div>
              <button className="calib-modal-close" onClick={() => setShowCalibGuide(false)}>
                <X size={18} />
              </button>
            </div>

            <div className="calib-modal-body">
              {/* Why section */}
              <div className="guide-why-box">
                <strong>🤔 Tại sao cần hiệu chuẩn?</strong>
                <p>
                  Hệ thống không biết bạn đứng cách máy ảnh bao xa. Ảnh chụp từ gần sẽ làm mọi thứ trông to hơn, ảnh chụp từ xa trông nhỏ hơn. Để chuyển đổi chính xác <strong>pixel → cm</strong>, bạn cần đặt một vật có kích thước thật đã biết cạnh người khi chụp.
                </p>
              </div>

              {/* Steps */}
              <div className="guide-steps">
                <div className="guide-step">
                  <div className="guide-step-num">1</div>
                  <div className="guide-step-content">
                    <div className="guide-step-title">
                      <Camera size={15} /> Chuẩn bị và chụp ảnh
                    </div>
                    <p>Hãy cầm ngang một tờ giấy A4 (hoặc Thẻ ngân hàng) và ép sát vào bụng hoặc đùi của bạn. Đảm bảo tờ giấy không bị giơ ra quá xa về phía camera. Việc này giúp AI có một <strong>'cây thước'</strong> chuẩn để quy đổi chính xác kích thước cơ thể bạn từ ảnh ra số đo thực tế.</p>
                    <div className="guide-ref-options">
                      <div className="guide-ref-item">
                        <FileText size={16} />
                        <div>
                          <strong>Giấy A4</strong>
                          <span>Ngang 21.0 cm — dễ tìm, chính xác cao</span>
                        </div>
                      </div>
                      <div className="guide-ref-item">
                        <CreditCard size={16} />
                        <div>
                          <strong>Thẻ ngân hàng / CCCD</strong>
                          <span>Ngang 8.56 cm — gọn, tiện khi không có A4</span>
                        </div>
                      </div>
                      <div className="guide-ref-item">
                        <Eye size={16} />
                        <div>
                          <strong>Khoảng cách mắt (IPD)</strong>
                          <span>~6.3 cm — dùng khi không có vật cạnh người</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="guide-step">
                  <div className="guide-step-num">2</div>
                  <div className="guide-step-content">
                    <div className="guide-step-title">
                      <ArrowRight size={15} /> Chọn loại vật tham chiếu
                    </div>
                    <p>Sau khi chụp xong, chọn đúng loại vật bạn đã đặt trong ảnh (Giấy A4, Thẻ ngân hàng, hoặc Khoảng cách mắt).</p>
                  </div>
                </div>

                <div className="guide-step">
                  <div className="guide-step-num">3</div>
                  <div className="guide-step-content">
                    <div className="guide-step-title">
                      <Ruler size={15} /> Đo độ rộng vật trên ảnh (pixel)
                    </div>
                    <p>Kéo thanh trượt <strong>"Kích thước vật tham chiếu"</strong> cho đến khi giá trị pixel khớp với chiều rộng thực tế của vật trong ảnh. Bạn có thể dùng phần mềm xem ảnh (Paint, Preview...) để đo số pixel của vật đó.</p>
                    <div className="guide-formula-box">
                      <span className="guide-formula">Tỷ lệ</span>
                      <span className="guide-formula-eq"> = </span>
                      <span className="guide-formula-frac">
                        <span>{calibNames[input.calibrationType].real}</span>
                        <span className="guide-formula-line"></span>
                        <span>{referencePixels} px (bạn đang đặt)</span>
                      </span>
                      <span className="guide-formula-eq"> = </span>
                      <span className="guide-formula-result">
                        {(parseFloat(calibNames[input.calibrationType].real) / referencePixels).toFixed(4)} cm/px
                      </span>
                    </div>
                  </div>
                </div>

                <div className="guide-step">
                  <div className="guide-step-num">4</div>
                  <div className="guide-step-content">
                    <div className="guide-step-title">
                      <CheckCircle size={15} /> Hệ thống tự tính toán
                    </div>
                    <p>Sau khi có tỷ lệ cm/px, hệ thống nhân mọi khoảng cách pixel đo được trên ảnh với tỷ lệ này để ra số đo thực tế bằng cm. Không cần làm thêm gì!</p>
                  </div>
                </div>
              </div>

              {/* Tip */}
              <div className="guide-tip-box">
                <span>💡</span>
                <div>
                  <strong>Mẹo nhanh:</strong> Nếu bạn chỉ muốn thử nghiệm và không có ảnh thật, cứ để mặc định <strong>Giấy A4 / 120 px</strong>. Hệ thống sẽ dùng tỷ lệ ước lượng trung bình để cho kết quả tham khảo.
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* User Guide Banner */}
      {inputSource === 'mannequin' ? (
        <div className="user-guide-banner mannequin">
          <span className="banner-icon">💡</span>
          <div className="banner-content">
            <strong>Chế độ Mô hình 3D (Mannequin)</strong>
            <p>Kéo chọn Giới tính, Cân nặng và Chiều cao ở bên dưới. Mô hình 3D bên phải sẽ tự động hiển thị số đo và gợi ý size phù hợp.</p>
          </div>
        </div>
      ) : (
        <div className="user-guide-banner photo">
          <span className="banner-icon">📸</span>
          <div className="banner-content">
            <strong>Chế độ Đo qua Ảnh chụp</strong>
            <p>Tải ảnh chính diện đứng thẳng từ đầu đến chân. Nếu không có thước đo A4/ATM, chọn <strong>"Tự nhập chiều cao"</strong> bên dưới rồi kéo thanh chiều cao cho khớp thực tế để đo chính xác nhất.</p>
          </div>
        </div>
      )}

      <div className="input-form-card">
        <div className="form-card-header">
          <h2 className="section-title">Thông Số Nhân Trắc Học</h2>
          <div className="form-card-note">
            <Info size={13} />
            <span>Tỷ lệ <strong>Nasion</strong> + khóa thể tích theo cân nặng/giới tính để loại nhiễu từ quần áo rộng</span>
          </div>
        </div>

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

        {/* Sizing System Selection */}
        <div className="form-group">
          <label className="form-label">
            <Shirt size={16} />
            <span>Hệ thống phân cỡ (Sizing System)</span>
          </label>
          <div className="gender-toggle-wrapper">
            <button
              type="button"
              className={`gender-btn male ${input.sizeSystem === 'vietnam' ? 'active' : ''}`}
              onClick={() => onChange({ ...input, sizeSystem: 'vietnam' })}
            >
              Size Việt Nam (Savani)
            </button>
            <button
              type="button"
              className={`gender-btn female ${input.sizeSystem === 'international' ? 'active' : ''}`}
              onClick={() => onChange({ ...input, sizeSystem: 'international' })}
            >
              Size Quốc Tế (US/EU)
            </button>
          </div>
        </div>

        {/* Weight Selection */}
        <div className="form-group">
          <div className="form-group-header">
            <label className="form-label">
              <Scale size={16} />
              <span>Cân nặng thực tế (Volume constraint)</span>
            </label>
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
          <div className="slider-wrapper">
            <div className="slider-tooltip" style={{ left: `${weightPercent}%` }}>
              {input.weight} kg
            </div>
            <input
              type="range"
              min="2"
              max="250"
              step="1"
              value={input.weight}
              onChange={handleWeightSliderChange}
              className="weight-slider"
            />
            <div className="slider-ticks-container">
              <span className="slider-tick-label" style={{ left: '19.35%' }}>50kg</span>
              <span className="slider-tick-label" style={{ left: '39.52%' }}>100kg</span>
              <span className="slider-tick-label" style={{ left: '59.68%' }}>150kg</span>
              <span className="slider-tick-label" style={{ left: '79.84%' }}>200kg</span>
              <span className="slider-tick-label" style={{ left: '100%', transform: 'translateX(-100%)' }}>250kg</span>
            </div>
          </div>
          <p className="field-hint">
            * Dùng để tính toán thể tích thực cơ thể và triệt tiêu vải thừa của quần áo thụng.
          </p>
        </div>

        {/* Calibration Reference Selection */}
        {inputSource !== 'mannequin' && (
          <div className="form-group">
            <div className="form-group-header">
              <label className="form-label">
                <Eye size={16} />
                <span>Phương thức hiệu chuẩn</span>
              </label>
              <button
                type="button"
                className="calib-help-btn"
                onClick={() => setShowCalibGuide(true)}
                title="Xem hướng dẫn hiệu chuẩn"
              >
                <Info size={14} />
                Hướng dẫn
              </button>
            </div>
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

              <button
                type="button"
                className={`calib-card ${input.calibrationType === 'height' ? 'active' : ''}`}
                onClick={() => handleCalibrationChange('height')}
                style={{ gridColumn: 'span 3' }}
              >
                <Ruler size={20} />
                <div className="calib-info">
                  <span className="calib-name">Tự nhập chiều cao (Khuyên dùng cho Webcam)</span>
                  <span className="calib-desc">Tự hiệu chuẩn mà không cần chụp cả chân</span>
                </div>
              </button>
            </div>
          </div>
        )}

        {/* Reference object size control OR Custom height control */}
        {inputSource === 'mannequin' || input.calibrationType === 'height' ? (
          <div className="form-group">
            <div className="form-group-header">
              <label className="form-label">
                <Ruler size={16} />
                <span>Chiều cao thực tế của bạn</span>
              </label>
              <div className="weight-number-box">
                <input
                  type="text"
                  value={heightInputVal}
                  onChange={handleHeightTextInputChange}
                  onBlur={handleHeightTextInputBlur}
                  className="weight-input"
                />
                <span className="unit">cm</span>
              </div>
            </div>
            <div className="slider-wrapper">
              <div className="slider-tooltip" style={{ left: `${(((input.customHeight || 165) - 50) / (220 - 50)) * 100}%` }}>
                {input.customHeight || 165} cm ({formatHeightMeters(input.customHeight || 165)})
              </div>
              <input
                type="range"
                min="50"
                max="220"
                value={input.customHeight || 165}
                onChange={(e) => onChange({ ...input, customHeight: Number(e.target.value) })}
                className="weight-slider"
              />
              <div className="slider-ticks-container">
                <span className="slider-tick-label" style={{ left: '0%' }}>50cm</span>
                <span className="slider-tick-label" style={{ left: '50%', transform: 'translateX(-50%)' }}>135cm</span>
                <span className="slider-tick-label" style={{ left: '100%', transform: 'translateX(-100%)' }}>220cm</span>
              </div>
            </div>
            <p className="field-hint">
              {inputSource === 'mannequin'
                ? '* Dùng để thay đổi chiều cao của mô hình 3D Mannequin nhằm ước lượng số đo.'
                : '* Hệ thống dùng chiều cao này làm gốc hiệu chuẩn. Cổ chân (ở đáy ảnh) được coi là sàn đất.'
              }
            </p>
          </div>
        ) : (
          <div className="form-group">
            <div className="form-group-header">
              <label className="form-label">
                <span>Kích thước vật tham chiếu trên ảnh</span>
              </label>
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
            <div className="slider-wrapper">
              <div className="slider-tooltip" style={{ left: `${pixelsPercent}%` }}>
                {referencePixels} px
              </div>
              <input
                type="range"
                min="30"
                max="300"
                value={referencePixels}
                onChange={handleRefPixelsSliderChange}
                className="weight-slider"
              />
              <div className="slider-ticks-container">
                <span className="slider-tick-label" style={{ left: '25.93%' }}>100px</span>
                <span className="slider-tick-label" style={{ left: '62.96%' }}>200px</span>
                <span className="slider-tick-label" style={{ left: '100%', transform: 'translateX(-100%)' }}>300px</span>
              </div>
            </div>
            <p className="field-hint">
              {input.calibrationType === 'a4' && 'Chiều rộng của tờ giấy A4 màu trắng dán ngang hông.'}
              {input.calibrationType === 'card' && 'Chiều rộng của thẻ ATM đặt ngang cơ thể.'}
              {input.calibrationType === 'ipd' && 'Khoảng cách giữa hai đồng tử của mắt trên ảnh chụp.'}
            </p>
          </div>
        )}
      </div>
    </>
  );
};
