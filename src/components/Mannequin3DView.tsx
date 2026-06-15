import React, { useMemo } from 'react';
import type { Landmark, Gender } from '../types';

interface Mannequin3DViewProps {
  gender: Gender;
  weight: number;
  scaleFactor: number;
  landmarks: Landmark[];
  rotationAngle: number;
  meshStyle?: 'solid' | 'neon' | 'heatmap';
  width?: number;
  height?: number;
  scanRange?: 'full' | 'half';
}

export const Mannequin3DView: React.FC<Mannequin3DViewProps> = ({
  gender,
  weight,
  scaleFactor,
  landmarks,
  rotationAngle,
  meshStyle = 'solid',
  width = 400,
  height = 650,
  scanRange = 'full'
}) => {

  const uniqueId = useMemo(() => Math.random().toString(36).substring(2, 9), []);

  const projected3DData = useMemo(() => {
    const rad = (rotationAngle * Math.PI) / 180;
    const cosA = Math.cos(rad);
    const sinA = Math.sin(rad);

    const project = (x3d: number, y3d: number, z3d: number) => {
      const rotatedX = x3d * cosA - z3d * sinA;
      return { x: 200 + rotatedX, y: y3d };
    };

    const nasionF = landmarks.find(l => l.id === 'nasion') || { x: 200, y: 75 };
    const lShoulder = landmarks.find(l => l.id === 'left_shoulder') || { x: 165, y: 125 };
    const rShoulder = landmarks.find(l => l.id === 'right_shoulder') || { x: 235, y: 125 };
    const lHip = landmarks.find(l => l.id === 'left_hip') || { x: 175, y: 300 };
    const rHip = landmarks.find(l => l.id === 'right_hip') || { x: 225, y: 300 };
    const rAnkle = landmarks.find(l => l.id === 'right_ankle') || { x: 225, y: 610 };

    const bodyHeight = rAnkle.y - nasionF.y;
    const shoulderWidth = Math.abs(rShoulder.x - lShoulder.x);
    const hipWidth = Math.abs(rHip.x - lHip.x);

    const HUMAN_BODY_DENSITY = 0.00101; 
    const targetVolumeCm3 = weight / HUMAN_BODY_DENSITY;

    const heightCm = bodyHeight * scaleFactor;
    const headRatio = Math.max(0.07, Math.min(0.15, 0.15 - (heightCm - 50) * (0.08 / 120)));
    const headRadius = bodyHeight * headRatio;
    const headCenterY = nasionF.y - headRadius * 0.3;
    const headRadiusCm = headRadius * scaleFactor;
    const headVolumeCm3 = (4 / 3) * Math.PI * Math.pow(headRadiusCm, 3);
    const targetTorsoVolumeCm3 = Math.max(0.1 * targetVolumeCm3, targetVolumeCm3 - headVolumeCm3);

    const baseDepthRatio = gender === 'female' 
      ? { neck: 0.80, shoulder: 0.45, chest: 0.85, waist: 0.70, hips: 0.90, thighs: 0.85 } 
      : { neck: 0.85, shoulder: 0.50, chest: 0.70, waist: 0.88, hips: 0.75, thighs: 0.70 };

    const widths = {
      neck: shoulderWidth * 0.22,
      shoulder: shoulderWidth,
      chest: shoulderWidth * 0.82,
      waist: hipWidth * 0.80,
      hips: hipWidth,
      thighs: hipWidth * 0.88
    };

    const heights = {
      neck: nasionF.y + bodyHeight * 0.08,
      shoulder: lShoulder.y,
      chest: nasionF.y + bodyHeight * 0.20,
      waist: nasionF.y + bodyHeight * 0.30,
      hips: lHip.y,
      thighs: nasionF.y + bodyHeight * 0.55
    };

    const unscaledDepths = {
      neck: widths.neck * baseDepthRatio.neck,
      shoulder: widths.shoulder * baseDepthRatio.shoulder,
      chest: widths.chest * baseDepthRatio.chest,
      waist: widths.waist * baseDepthRatio.waist,
      hips: widths.hips * baseDepthRatio.hips,
      thighs: widths.thighs * baseDepthRatio.thighs
    };

    const ringsList = [
      { id: 'neck', y: heights.neck, w: widths.neck, dUnscaled: unscaledDepths.neck },
      { id: 'shoulder', y: heights.shoulder, w: widths.shoulder, dUnscaled: unscaledDepths.shoulder },
      { id: 'chest', y: heights.chest, w: widths.chest, dUnscaled: unscaledDepths.chest },
      { id: 'waist', y: heights.waist, w: widths.waist, dUnscaled: unscaledDepths.waist },
      { id: 'hips', y: heights.hips, w: widths.hips, dUnscaled: unscaledDepths.hips },
      { id: 'thighs', y: heights.thighs, w: widths.thighs, dUnscaled: unscaledDepths.thighs }
    ];

    let unscaledTorsoVolume = 0;
    for (let i = 0; i < ringsList.length - 1; i++) {
      const r1 = ringsList[i];
      const r2 = ringsList[i + 1];

      const h_cm = (r2.y - r1.y) * scaleFactor;
      const a1_cm = (r1.w * scaleFactor) / 2;
      const b1_cm = (r1.dUnscaled * scaleFactor) / 2;
      const a2_cm = (r2.w * scaleFactor) / 2;
      const b2_cm = (r2.dUnscaled * scaleFactor) / 2;

      const vFrustum = (h_cm * Math.PI / 3) * (a1_cm * b1_cm + a2_cm * b2_cm + (a1_cm * b2_cm + a2_cm * b1_cm) / 2);
      unscaledTorsoVolume += vFrustum;
    }

    const k = Math.max(0.3, Math.min(3.0, targetTorsoVolumeCm3 / unscaledTorsoVolume));

    const finalizedRings = ringsList.map(r => ({
      id: r.id,
      y: r.y,
      w: r.w,
      d: r.dUnscaled * k
    }));

    const meshLines: { x1: number; y1: number; x2: number; y2: number; type: 'ring' | 'vertical' }[] = [];
    const numPointsPerRing = 16;
    const ringsPoints2D: { x: number; y: number }[][] = [];

    finalizedRings.forEach((ring) => {
      const ringPoints: { x: number; y: number }[] = [];
      const radiusX = ring.w / 2;
      const radiusZ = ring.d / 2;

      for (let i = 0; i < numPointsPerRing; i++) {
        const phi = (i * 2 * Math.PI) / numPointsPerRing;
        let x3d = radiusX * Math.cos(phi);
        let z3d = radiusZ * Math.sin(phi);

        if (gender === 'female' && ring.id === 'chest' && z3d > 0) {
          z3d = z3d * (1.0 + 0.3 * Math.sin(phi));
        }

        const pt2d = project(x3d, ring.y, z3d);
        ringPoints.push(pt2d);
      }
      ringsPoints2D.push(ringPoints);

      for (let i = 0; i < numPointsPerRing; i++) {
        const next = (i + 1) % numPointsPerRing;
        meshLines.push({
          x1: ringPoints[i].x,
          y1: ringPoints[i].y,
          x2: ringPoints[next].x,
          y2: ringPoints[next].y,
          type: 'ring'
        });
      }
    });

    for (let r = 0; r < ringsPoints2D.length - 1; r++) {
      const ringA = ringsPoints2D[r];
      const ringB = ringsPoints2D[r + 1];
      for (let i = 0; i < numPointsPerRing; i++) {
        meshLines.push({
          x1: ringA[i].x,
          y1: ringA[i].y,
          x2: ringB[i].x,
          y2: ringB[i].y,
          type: 'vertical'
        });
      }
    }

    const numSphereRings = 4;
    const numPointsPerSphereRing = 12;
    const sphereRingsPoints2D: { x: number; y: number }[][] = [];

    for (let j = 0; j <= numSphereRings + 1; j++) {
      const theta = (j * Math.PI) / (numSphereRings + 1);
      const r = headRadius * Math.sin(theta);
      const ringY = headCenterY + headRadius * Math.cos(theta);

      const sphereRingPoints: { x: number; y: number }[] = [];
      for (let i = 0; i < numPointsPerSphereRing; i++) {
        const phi = (i * 2 * Math.PI) / numPointsPerSphereRing;
        const x3d = r * Math.cos(phi);
        const z3d = r * Math.sin(phi);

        const pt2d = project(x3d, ringY, z3d);
        sphereRingPoints.push(pt2d);
      }
      sphereRingsPoints2D.push(sphereRingPoints);
    }

    for (let j = 0; j < sphereRingsPoints2D.length; j++) {
      const currentRing = sphereRingsPoints2D[j];

      if (j > 0 && j <= numSphereRings) {
        for (let i = 0; i < numPointsPerSphereRing; i++) {
          const next = (i + 1) % numPointsPerSphereRing;
          meshLines.push({
            x1: currentRing[i].x,
            y1: currentRing[i].y,
            x2: currentRing[next].x,
            y2: currentRing[next].y,
            type: 'ring'
          });
        }
      }

      if (j < sphereRingsPoints2D.length - 1) {
        const nextRing = sphereRingsPoints2D[j + 1];
        for (let i = 0; i < numPointsPerSphereRing; i++) {
          meshLines.push({
            x1: currentRing[i].x,
            y1: currentRing[i].y,
            x2: nextRing[i].x,
            y2: nextRing[i].y,
            type: 'vertical'
          });
        }
      }
    }

    return {
      meshLines,
      ringsPoints2D,
      headCenterY,
      headRadius
    };
  }, [rotationAngle, landmarks, gender, weight, scaleFactor]);

  const projected3DMesh = projected3DData.meshLines;

  const renderSilhouette = () => {
    const { ringsPoints2D, headCenterY, headRadius } = projected3DData;

    if (ringsPoints2D.length < 6) return null;

    const getOuterPoints = (ringPoints: { x: number; y: number }[]) => {
      let left = ringPoints[0];
      let right = ringPoints[0];
      ringPoints.forEach(pt => {
        if (pt.x < left.x) left = pt;
        if (pt.x > right.x) right = pt;
      });
      return { left, right };
    };

    const pNeck = getOuterPoints(ringsPoints2D[0]);
    const pShoulder = getOuterPoints(ringsPoints2D[1]);
    const pChest = getOuterPoints(ringsPoints2D[2]);
    const pWaist = getOuterPoints(ringsPoints2D[3]);
    const pHips = getOuterPoints(ringsPoints2D[4]);
    const pThighs = getOuterPoints(ringsPoints2D[5]);

    // Find knees and ankles for leg taper
    const lKnee = landmarks.find(l => l.id === 'left_knee') || landmarks.find(l => l.id === 'knee') || { x: 185, y: 460 };
    const rKnee = landmarks.find(l => l.id === 'right_knee') || landmarks.find(l => l.id === 'knee') || { x: 215, y: 460 };
    const lAnkle = landmarks.find(l => l.id === 'left_ankle') || landmarks.find(l => l.id === 'ankle') || { x: 185, y: 610 };
    const rAnkle = landmarks.find(l => l.id === 'right_ankle') || landmarks.find(l => l.id === 'ankle') || { x: 215, y: 610 };

    const gradId = `body3dGrad_${uniqueId}`;
    const strokeId = `body3dStroke_${uniqueId}`;
    const heatGradId = `bodyHeatGrad_${uniqueId}`;

    let fillUrl = `url(#${gradId})`;
    let strokeColor = `url(#${strokeId})`;
    let strokeWidth = '1.5';
    let opacity = 1.0;

    if (meshStyle === 'heatmap') {
      fillUrl = `url(#${heatGradId})`;
      strokeColor = 'rgba(255, 255, 255, 0.2)';
    } else if (meshStyle === 'neon') {
      fillUrl = 'rgba(15, 23, 42, 0.7)';
      strokeColor = '#06b6d4';
      strokeWidth = '2';
    }

    // Torso path construction
    const pathParts = [];
    pathParts.push(`M ${pNeck.left.x} ${pNeck.left.y}`);
    
    // Shoulder Left
    pathParts.push(`C ${pNeck.left.x - 4} ${(pNeck.left.y + pShoulder.left.y)/2}, ${pShoulder.left.x} ${pShoulder.left.y - 12}, ${pShoulder.left.x} ${pShoulder.left.y}`);
    
    // Chest Left
    pathParts.push(`C ${pShoulder.left.x} ${pShoulder.left.y + 12}, ${pChest.left.x - 4} ${pChest.left.y - 12}, ${pChest.left.x} ${pChest.left.y}`);
    
    // Waist Left (smooth curve inward)
    pathParts.push(`C ${pChest.left.x + 3} ${pChest.left.y + 18}, ${pWaist.left.x + 2} ${pWaist.left.y - 18}, ${pWaist.left.x} ${pWaist.left.y}`);
    
    // Hips Left (smooth curve outward)
    pathParts.push(`C ${pWaist.left.x - 2} ${pWaist.left.y + 18}, ${pHips.left.x - 6} ${pHips.left.y - 18}, ${pHips.left.x} ${pHips.left.y}`);
    
    // Thighs Left
    pathParts.push(`C ${pHips.left.x + 2} ${pHips.left.y + 18}, ${pThighs.left.x - 4} ${pThighs.left.y - 8}, ${pThighs.left.x} ${pThighs.left.y}`);

    if (scanRange === 'full') {
      // Left leg outer -> bottom -> inner
      pathParts.push(`L ${lKnee.x - 12} ${lKnee.y}`);
      pathParts.push(`L ${lAnkle.x - 8} ${lAnkle.y}`);
      pathParts.push(`L ${lAnkle.x + 8} ${lAnkle.y}`);
      pathParts.push(`L ${lKnee.x + 10} ${lKnee.y}`);
      pathParts.push(`L 200 ${pThighs.left.y + 20}`); // Crotch area
      
      // Right leg inner -> bottom -> outer
      pathParts.push(`L ${rKnee.x - 10} ${rKnee.y}`);
      pathParts.push(`L ${rAnkle.x - 8} ${rAnkle.y}`);
      pathParts.push(`L ${rAnkle.x + 8} ${rAnkle.y}`);
      pathParts.push(`L ${rKnee.x + 12} ${rKnee.y}`);
      pathParts.push(`L ${pThighs.right.x} ${pThighs.right.y}`);
    } else {
      // Half body rounded crotch bottom
      pathParts.push(`C ${pThighs.left.x} ${pThighs.left.y + 22}, ${pThighs.right.x} ${pThighs.right.y + 22}, ${pThighs.right.x} ${pThighs.right.y}`);
    }

    // Thighs Right to Hips Right
    pathParts.push(`C ${pThighs.right.x - 2} ${pThighs.right.y - 8}, ${pHips.right.x + 2} ${pHips.right.y + 18}, ${pHips.right.x} ${pHips.right.y}`);
    
    // Waist Right
    pathParts.push(`C ${pHips.right.x - 6} ${pHips.right.y - 18}, ${pWaist.right.x - 2} ${pWaist.right.y + 18}, ${pWaist.right.x} ${pWaist.right.y}`);
    
    // Chest Right
    pathParts.push(`C ${pWaist.right.x + 2} ${pWaist.right.y - 18}, ${pChest.right.x - 3} ${pChest.right.y + 18}, ${pChest.right.x} ${pChest.right.y}`);
    
    // Shoulder Right
    pathParts.push(`C ${pChest.right.x + 4} ${pChest.right.y - 12}, ${pShoulder.right.x} ${pShoulder.right.y + 12}, ${pShoulder.right.x} ${pShoulder.right.y}`);
    
    // Neck Right
    pathParts.push(`C ${pShoulder.right.x} ${pShoulder.right.y - 12}, ${pNeck.right.x + 4} ${(pNeck.right.y + pShoulder.right.y)/2}, ${pNeck.right.x} ${pNeck.right.y}`);
    
    // Close to Neck Left
    pathParts.push(`L ${pNeck.left.x} ${pNeck.left.y}`);

    const bodyPathD = pathParts.join(' ');

    return (
      <g style={{ opacity, transition: 'opacity 0.25s ease' }}>
        {/* Head Sphere */}
        <circle
          cx={200}
          cy={headCenterY}
          r={headRadius}
          fill={fillUrl}
          stroke={strokeColor}
          strokeWidth={strokeWidth}
        />
        {/* Torso & Legs */}
        <path
          d={bodyPathD}
          fill={fillUrl}
          stroke={strokeColor}
          strokeWidth={strokeWidth}
        />
        
        {/* Anatomical Shading for 3D realism (pecs/breasts, abs, waist shadow) */}
        {meshStyle === 'solid' && (
          <>
            {/* Center line highlight */}
            <path
              d={`M 200 ${pNeck.left.y} L 200 ${pThighs.left.y}`}
              stroke="rgba(255, 255, 255, 0.2)"
              strokeWidth="1.5"
              strokeDasharray="2,4"
            />
            {/* Female breasts shading */}
            {gender === 'female' && (
              <>
                {/* Left Breast curve */}
                <path
                  d={`M ${200 - 15} ${pChest.left.y + 5} Q ${pChest.left.x + 15} ${pChest.left.y + 15} ${200 - 3} ${pChest.left.y + 20}`}
                  fill="none"
                  stroke="rgba(255, 255, 255, 0.25)"
                  strokeWidth="2.5"
                />
                <path
                  d={`M ${200 - 15} ${pChest.left.y + 7} Q ${pChest.left.x + 15} ${pChest.left.y + 17} ${200 - 3} ${pChest.left.y + 22}`}
                  fill="none"
                  stroke="rgba(15, 23, 42, 0.35)"
                  strokeWidth="3.5"
                />
                {/* Right Breast curve */}
                <path
                  d={`M ${200 + 15} ${pChest.right.y + 5} Q ${pChest.right.x - 15} ${pChest.right.y + 15} ${200 + 3} ${pChest.right.y + 20}`}
                  fill="none"
                  stroke="rgba(255, 255, 255, 0.25)"
                  strokeWidth="2.5"
                />
                <path
                  d={`M ${200 + 15} ${pChest.right.y + 7} Q ${pChest.right.x - 15} ${pChest.right.y + 17} ${200 + 3} ${pChest.right.y + 22}`}
                  fill="none"
                  stroke="rgba(15, 23, 42, 0.35)"
                  strokeWidth="3.5"
                />
              </>
            )}
            
            {/* Male chest/pecs shading */}
            {gender === 'male' && (
              <>
                <path
                  d={`M ${pChest.left.x + 15} ${pChest.left.y + 5} L ${200 - 5} ${pChest.left.y + 12} L ${200 - 5} ${pChest.left.y + 14} L ${pChest.left.x + 18} ${pChest.left.y + 7}`}
                  fill="rgba(15, 23, 42, 0.25)"
                />
                <path
                  d={`M ${pChest.right.x - 15} ${pChest.right.y + 5} L ${200 + 5} ${pChest.right.y + 12} L ${200 + 5} ${pChest.right.y + 14} L ${pChest.right.x - 18} ${pChest.right.y + 7}`}
                  fill="rgba(15, 23, 42, 0.25)"
                />
              </>
            )}
            
            {/* Waist shading (curved shadows on the side to emphasize thinness/abdominal shape) */}
            <path
              d={`M ${pChest.left.x + 8} ${pChest.left.y + 10} Q ${pWaist.left.x + 10} ${pWaist.left.y} ${pHips.left.x + 8} ${pHips.left.y}`}
              fill="none"
              stroke="rgba(15, 23, 42, 0.15)"
              strokeWidth="4"
            />
            <path
              d={`M ${pChest.right.x - 8} ${pChest.right.y + 10} Q ${pWaist.right.x - 10} ${pWaist.right.y} ${pHips.right.x - 8} ${pHips.right.y}`}
              fill="none"
              stroke="rgba(15, 23, 42, 0.15)"
              strokeWidth="4"
            />
          </>
        )}
      </g>
    );
  };

  const gradId = `body3dGrad_${uniqueId}`;
  const strokeId = `body3dStroke_${uniqueId}`;
  const heatGradId = `bodyHeatGrad_${uniqueId}`;
  const gridId = `gridComp_${uniqueId}`;

  // If meshStyle !== 'solid', we still want to render a faint dark silhouette in the background
  const renderBackgroundSilhouette = () => {
    if (meshStyle === 'solid') return null;
    return <rect width="400" height="650" fill="rgba(15, 23, 42, 0.45)" rx="8" />;
  };

  return (
    <svg
      viewBox="0 0 400 650"
      width={width}
      height={height}
      style={{
        background: 'transparent',
        borderRadius: 'var(--radius-md)',
        border: '1px solid rgba(255, 255, 255, 0.05)'
      }}
    >
      <defs>
        {/* Metallic 3D Mannequin Shading Gradient */}
        <radialGradient id={gradId} cx="50%" cy="30%" r="70%" fx="50%" fy="20%">
          <stop offset="0%" stopColor="#f8fafc" />
          <stop offset="30%" stopColor="#e2e8f0" />
          <stop offset="65%" stopColor="#94a3b8" />
          <stop offset="85%" stopColor="#475569" />
          <stop offset="100%" stopColor="#1e293b" />
        </radialGradient>
        <linearGradient id={strokeId} x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#64748b" />
          <stop offset="100%" stopColor="#334155" />
        </linearGradient>

        {/* Scientific thermal heatmap gradient */}
        <linearGradient id={heatGradId} x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#38bdf8" />  {/* Blue (neck) */}
          <stop offset="25%" stopColor="#22c55e" /> {/* Green (chest) */}
          <stop offset="50%" stopColor="#eab308" /> {/* Yellow (waist) */}
          <stop offset="75%" stopColor="#f97316" /> {/* Orange (hips) */}
          <stop offset="100%" stopColor="#ef4444" /> {/* Red (thighs) */}
        </linearGradient>

        <pattern id={gridId} width="20" height="20" patternUnits="userSpaceOnUse">
          <path d="M 20 0 L 0 0 0 20" fill="none" stroke="rgba(148, 163, 184, 0.03)" strokeWidth="1" />
        </pattern>
      </defs>

      <rect width="400" height="650" fill={`url(#${gridId})`} />

      {renderBackgroundSilhouette()}
      {renderSilhouette()}

      <g className={`mesh-group ${meshStyle}`}>
        {projected3DMesh.map((line, idx) => {
          let strokeColor = undefined;
          if (meshStyle === 'heatmap') {
            const y = (line.y1 + line.y2) / 2;
            if (y < 160) strokeColor = '#38bdf8';
            else if (y < 230) strokeColor = '#f43f5e';
            else if (y < 330) strokeColor = '#fb923c';
            else if (y < 460) strokeColor = '#fbbf24';
            else strokeColor = '#4ade80';
          }

          return (
            <line
              key={`mesh-comp-${idx}`}
              x1={line.x1}
              y1={line.y1}
              x2={line.x2}
              y2={line.y2}
              className={`mesh-line ${line.type}`}
              style={strokeColor ? { stroke: strokeColor, strokeWidth: line.type === 'ring' ? '1.2px' : '0.6px' } : undefined}
            />
          );
        })}
      </g>
    </svg>
  );
};
