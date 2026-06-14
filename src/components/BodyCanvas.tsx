import React, { useState, useRef, useEffect } from 'react';
import type { Landmark, Gender } from '../types';
import { Camera, RefreshCw } from 'lucide-react';

interface BodyCanvasProps {
  gender: Gender;
  landmarks: Landmark[];
  onLandmarkChange: (id: string, x: number, y: number) => void;
  view: 'front' | 'side';
  onViewChange: (view: 'front' | 'side') => void;
  uploadedImage: string | null;
  onImageUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
}

export const BodyCanvas: React.FC<BodyCanvasProps> = ({
  gender,
  landmarks,
  onLandmarkChange,
  view,
  onViewChange,
  uploadedImage,
  onImageUpload
}) => {
  const containerRef = useRef<SVGSVGElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [activePointId, setActivePointId] = useState<string | null>(null);

  // SVG dimensions
  const width = 400;
  const height = 650;

  // Handle drag mechanics
  const handleMouseDown = (pointId: string) => {
    setActivePointId(pointId);
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!activePointId || !containerRef.current) return;

      const rect = containerRef.current.getBoundingClientRect();
      // Calculate coordinates relative to SVG aspect ratio
      const rawX = e.clientX - rect.left;
      const rawY = e.clientY - rect.top;
      
      const x = Math.max(0, Math.min(width, (rawX / rect.width) * width));
      const y = Math.max(0, Math.min(height, (rawY / rect.height) * height));

      onLandmarkChange(activePointId, Math.round(x), Math.round(y));
    };

    const handleMouseUp = () => {
      setActivePointId(null);
    };

    if (activePointId) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    }

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [activePointId, onLandmarkChange]);

  // Generate bone paths between landmarks
  const getBones = () => {
    const connections: [string, string][] = [];
    
    if (view === 'front') {
      connections.push(
        ['nasion', 'left_shoulder'],
        ['nasion', 'right_shoulder'],
        ['left_shoulder', 'right_shoulder'],
        ['left_shoulder', 'left_elbow'],
        ['left_elbow', 'left_wrist'],
        ['right_shoulder', 'right_elbow'],
        ['right_elbow', 'right_wrist'],
        ['left_shoulder', 'left_hip'],
        ['right_shoulder', 'right_hip'],
        ['left_hip', 'right_hip'],
        ['left_hip', 'left_knee'],
        ['left_knee', 'left_ankle'],
        ['right_hip', 'right_knee'],
        ['right_knee', 'right_ankle']
      );
    } else {
      // Side connections
      connections.push(
        ['nasion', 'shoulder'],
        ['shoulder', 'elbow'],
        ['elbow', 'wrist'],
        ['shoulder', 'hip'],
        ['hip', 'knee'],
        ['knee', 'ankle'],
        ['hip', 'chest_depth'],
        ['hip', 'buttock_depth']
      );
    }

    return connections.map(([startId, endId], index) => {
      const start = landmarks.find(l => l.id === startId);
      const end = landmarks.find(l => l.id === endId);
      if (!start || !end) return null;
      return (
        <line
          key={`bone-${index}`}
          x1={start.x}
          y1={start.y}
          x2={end.x}
          y2={end.y}
          className="skeletal-line"
        />
      );
    });
  };

  // Human body silhouette vectors to make layout look premium when no photo is uploaded
  const renderSilhouette = () => {
    if (uploadedImage) return null;

    if (view === 'front') {
      if (gender === 'male') {
        // Standardized proportional front male path
        return (
          <path
            d="M 200 40 C 215 40, 220 70, 220 85 C 220 95, 205 105, 200 105 C 195 105, 180 95, 180 85 C 180 70, 185 40, 200 40 Z
               M 200 105 C 205 105, 215 115, 230 125 C 260 145, 275 160, 280 200 C 285 240, 280 280, 275 320 C 272 340, 265 350, 260 365 C 255 380, 245 420, 245 480 C 245 540, 250 580, 245 610 C 242 625, 235 630, 225 630 C 215 630, 212 620, 210 590 C 208 560, 204 490, 200 480 C 196 490, 192 560, 190 590 C 188 620, 185 630, 175 630 C 165 630, 158 625, 155 610 C 150 580, 155 540, 155 480 C 155 420, 145 380, 140 365 C 135 350, 128 340, 125 320 C 120 280, 115 240, 120 200 C 125 160, 140 145, 170 125 C 185 115, 195 105, 200 105 Z"
            className="body-silhouette"
          />
        );
      } else {
        // Standardized proportional front female path (hourglass shape)
        return (
          <path
            d="M 200 45 C 213 45, 218 72, 218 85 C 218 94, 204 102, 200 102 C 196 102, 182 94, 182 85 C 182 72, 187 45, 200 45 Z
               M 200 102 C 204 102, 212 112, 225 122 C 250 140, 265 155, 270 190 C 275 225, 265 260, 255 295 C 248 315, 258 335, 260 360 C 262 385, 245 425, 243 480 C 241 535, 245 575, 240 605 C 237 620, 230 625, 222 625 C 214 625, 211 615, 209 585 C 207 555, 203 490, 200 480 C 197 490, 193 555, 191 585 C 189 615, 186 625, 178 625 C 170 625, 163 620, 160 605 C 155 575, 159 535, 157 480 C 155 425, 138 385, 140 360 C 142 335, 152 315, 145 295 C 135 260, 125 225, 130 190 C 135 155, 150 140, 175 122 C 188 112, 196 102, 200 102 Z"
            className="body-silhouette"
          />
        );
      }
    } else {
      // Side profiles
      if (gender === 'male') {
        return (
          <path
            d="M 195 40 C 210 40, 215 70, 212 85 C 210 95, 198 105, 195 105 C 185 105, 180 90, 180 80 C 180 65, 185 40, 195 40 Z
               M 195 105 C 200 107, 210 115, 218 128 C 235 150, 238 185, 235 225 C 230 260, 222 290, 225 330 C 228 365, 232 390, 228 440 C 224 490, 228 550, 220 605 C 218 620, 210 625, 200 625 C 192 625, 188 615, 188 590 C 188 565, 184 485, 180 440 C 176 390, 178 350, 175 320 C 172 290, 165 250, 170 210 C 175 170, 180 130, 195 105 Z"
            className="body-silhouette"
          />
        );
      } else {
        return (
          <path
            d="M 195 45 C 208 45, 213 72, 210 85 C 208 94, 197 102, 195 102 C 186 102, 182 88, 182 78 C 182 63, 187 45, 195 45 Z
               M 195 102 C 199 104, 208 112, 215 125 C 232 145, 238 180, 232 215 C 225 245, 212 275, 224 315 C 232 345, 228 375, 223 430 C 218 480, 222 545, 215 600 C 213 615, 206 620, 197 620 C 189 620, 185 610, 185 585 C 185 560, 180 480, 177 430 C 174 380, 176 345, 172 315 C 168 285, 162 245, 166 210 C 170 175, 178 128, 195 102 Z"
            className="body-silhouette"
          />
        );
      }
    }
  };

  return (
    <div className="canvas-wrapper">
      <div className="canvas-header">
        <div className="tab-buttons">
          <button
            type="button"
            className={`tab-btn ${view === 'front' ? 'active' : ''}`}
            onClick={() => onViewChange('front')}
          >
            Mặt trước (Front)
          </button>
          <button
            type="button"
            className={`tab-btn ${view === 'side' ? 'active' : ''}`}
            onClick={() => onViewChange('side')}
          >
            Mặt nghiêng (Side)
          </button>
        </div>
        
        <button
          type="button"
          className="upload-trigger-btn"
          onClick={() => fileInputRef.current?.click()}
        >
          <Camera size={16} />
          <span>{uploadedImage ? 'Thay ảnh' : 'Tải ảnh lên'}</span>
        </button>
        <input
          type="file"
          ref={fileInputRef}
          onChange={onImageUpload}
          accept="image/*"
          style={{ display: 'none' }}
        />
      </div>

      <div className="canvas-container">
        {/* SVG Editor for landmarks and silhouette */}
        <svg
          ref={containerRef}
          viewBox={`0 0 ${width} ${height}`}
          className="landmark-svg"
        >
          {/* Background image if uploaded */}
          {uploadedImage && (
            <image
              href={uploadedImage}
              width={width}
              height={height}
              preserveAspectRatio="xMidYMid slice"
            />
          )}

          {/* Fallback silhouette if no image */}
          {renderSilhouette()}

          {/* Render connecting bone lines */}
          {getBones()}

          {/* Render interactive landmarks */}
          {landmarks.map((point) => (
            <g key={point.id} className="landmark-group">
              <circle
                cx={point.x}
                cy={point.y}
                r={activePointId === point.id ? 8 : 6}
                onMouseDown={() => handleMouseDown(point.id)}
                className={`landmark-dot ${activePointId === point.id ? 'dragging' : ''}`}
              />
              <text
                x={point.x}
                y={point.y - 10}
                className="landmark-text"
              >
                {point.label}
              </text>
            </g>
          ))}
        </svg>

        <div className="canvas-helper-text">
          <RefreshCw size={12} className="spin-hover" />
          <span>Kéo thả các chấm đỏ để căn chỉnh chính xác mốc giải phẫu</span>
        </div>
      </div>
    </div>
  );
};
