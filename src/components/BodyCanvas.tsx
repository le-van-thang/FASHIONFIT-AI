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

  // Human body silhouette vectors - Styled as premium semi-transparent digital scans
  const renderSilhouette = () => {
    if (uploadedImage) return null;

    return (
      <>
        <defs>
          <linearGradient id="bodyGrad" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="rgba(59, 130, 246, 0.18)" />
            <stop offset="50%" stopColor="rgba(99, 102, 241, 0.08)" />
            <stop offset="100%" stopColor="rgba(236, 72, 153, 0.03)" />
          </linearGradient>
          <linearGradient id="bodyStroke" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="rgba(59, 130, 246, 0.5)" />
            <stop offset="50%" stopColor="rgba(99, 102, 241, 0.3)" />
            <stop offset="100%" stopColor="rgba(236, 72, 153, 0.2)" />
          </linearGradient>
          
          {/* Subtle grid pattern for scientific feel */}
          <pattern id="grid" width="20" height="20" patternUnits="userSpaceOnUse">
            <path d="M 20 0 L 0 0 0 20" fill="none" stroke="rgba(148, 163, 184, 0.05)" strokeWidth="1" />
          </pattern>
        </defs>

        {/* Grid Background */}
        <rect width={width} height={height} fill="url(#grid)" />

        {view === 'front' ? (
          gender === 'male' ? (
            // Proportional Athletic Male Front Path
            <path
              d="M 200 45 C 212 45, 216 70, 216 82 C 216 90, 204 98, 200 98 C 196 98, 184 90, 184 82 C 184 70, 188 45, 200 45 Z
                 M 200 98 C 205 98, 215 106, 228 116 C 255 136, 266 148, 270 185 C 274 220, 268 255, 262 290 C 258 310, 253 320, 248 335 C 242 355, 242 390, 242 450 C 242 510, 245 560, 240 595 C 238 610, 232 615, 222 615 C 212 615, 208 605, 206 575 C 204 545, 202 480, 200 470 C 198 480, 196 545, 194 575 C 192 605, 188 615, 178 615 C 168 615, 162 610, 160 595 C 155 560, 158 510, 158 450 C 158 390, 158 355, 152 335 C 147 320, 142 310, 138 290 C 132 255, 126 220, 130 185 C 134 148, 145 136, 172 116 C 185 106, 195 98, 200 98 Z"
              fill="url(#bodyGrad)"
              stroke="url(#bodyStroke)"
              strokeWidth="1.5"
            />
          ) : (
            // Proportional Hourglass Female Front Path
            <path
              d="M 200 48 C 210 48, 214 70, 214 82 C 214 90, 204 96, 200 96 C 196 96, 186 90, 186 82 C 186 70, 190 48, 200 48 Z
                 M 200 96 C 204 96, 211 104, 222 114 C 245 132, 258 145, 262 178 C 266 210, 256 242, 248 275 C 242 295, 248 312, 250 335 C 252 358, 242 395, 240 450 C 238 505, 241 555, 236 585 C 233 600, 227 605, 220 605 C 212 605, 209 595, 207 565 C 205 535, 202 480, 200 470 C 198 470, 195 535, 193 565 C 191 595, 188 605, 180 605 C 173 605, 167 600, 164 585 C 159 555, 162 505, 160 450 C 158 395, 148 358, 150 335 C 152 312, 158 295, 152 275 C 144 242, 134 210, 138 178 C 142 132, 155 132, 178 114 C 189 104, 196 96, 200 96 Z"
              fill="url(#bodyGrad)"
              stroke="url(#bodyStroke)"
              strokeWidth="1.5"
            />
          )
        ) : (
          gender === 'male' ? (
            // Proportional Male Side Path
            <path
              d="M 195 45 C 208 45, 212 70, 210 82 C 208 90, 198 98, 195 98 C 186 98, 182 85, 182 76 C 182 62, 186 45, 195 45 Z
                 M 195 98 C 199 100, 208 108, 215 120 C 230 140, 233 172, 230 210 C 226 242, 218 270, 221 308 C 224 340, 228 362, 224 410 C 220 455, 224 512, 216 565 C 214 580, 207 585, 198 585 C 190 585, 186 575, 186 550 C 186 525, 182 450, 178 410 C 174 362, 176 325, 173 298 C 170 270, 163 232, 168 195 C 173 158, 180 120, 195 98 Z"
              fill="url(#bodyGrad)"
              stroke="url(#bodyStroke)"
              strokeWidth="1.5"
            />
          ) : (
            // Proportional Hourglass Female Side Path
            <path
              d="M 195 48 C 206 48, 210 70, 208 82 C 206 90, 197 96, 195 96 C 187 96, 183 83, 183 74 C 183 60, 187 48, 195 48 Z
                 M 195 96 C 198 98, 206 106, 212 118 C 226 136, 231 168, 226 200 C 220 228, 209 255, 218 292 C 225 320, 222 348, 217 398 C 212 445, 216 505, 210 558 C 208 572, 201 578, 193 578 C 185 578, 181 568, 181 545 C 181 522, 176 448, 173 398 C 170 348, 172 318, 168 290 C 164 262, 158 225, 162 192 C 166 160, 174 120, 195 96 Z"
              fill="url(#bodyGrad)"
              stroke="url(#bodyStroke)"
              strokeWidth="1.5"
            />
          )
        )}
      </>
    );
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
          {landmarks.map((point) => {
            // Smart layout text offsets to prevent overlapping labels
            const getTextOffset = (id: string) => {
              if (id.includes('left')) return { dx: -12, dy: 4, anchor: 'end' as const };
              if (id.includes('right')) return { dx: 12, dy: 4, anchor: 'start' as const };
              if (id === 'nasion') return { dx: 0, dy: -12, anchor: 'middle' as const };
              if (id === 'chest_depth') return { dx: 12, dy: 4, anchor: 'start' as const };
              if (id === 'buttock_depth') return { dx: -12, dy: 4, anchor: 'end' as const };
              return { dx: 12, dy: 4, anchor: 'start' as const };
            };
            const offset = getTextOffset(point.id);

            return (
              <g key={point.id} className="landmark-group">
                <circle
                  cx={point.x}
                  cy={point.y}
                  r={activePointId === point.id ? 8 : 6}
                  onMouseDown={() => handleMouseDown(point.id)}
                  className={`landmark-dot ${activePointId === point.id ? 'dragging' : ''}`}
                />
                <text
                  x={point.x + offset.dx}
                  y={point.y + offset.dy}
                  textAnchor={offset.anchor}
                  className="landmark-text"
                >
                  {point.label}
                </text>
              </g>
            );
          })}
        </svg>

        <div className="canvas-helper-text">
          <RefreshCw size={12} className="spin-hover" />
          <span>Kéo thả các chấm đỏ để căn chỉnh chính xác mốc giải phẫu</span>
        </div>
      </div>
    </div>
  );
};
