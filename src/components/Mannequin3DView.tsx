import React, { useMemo } from 'react';
import type { Landmark, Gender, BodyMeasurements } from '../types';

const getLimbSilhouettePath = (
  limbPoints: { x: number; y: number }[][],
  dx2d: number,
  dy2d: number
): string => {
  const nx = -dy2d;
  const ny = dx2d;
  const leftSide: { x: number; y: number }[] = [];
  const rightSide: { x: number; y: number }[] = [];

  limbPoints.forEach((ring) => {
    let minDot = Infinity;
    let maxDot = -Infinity;
    let minPt = ring[0];
    let maxPt = ring[0];

    ring.forEach((pt) => {
      const dot = pt.x * nx + pt.y * ny;
      if (dot < minDot) {
        minDot = dot;
        minPt = pt;
      }
      if (dot > maxDot) {
        maxDot = dot;
        maxPt = pt;
      }
    });

    leftSide.push(minPt);
    rightSide.push(maxPt);
  });

  const pathParts: string[] = [];
  pathParts.push(`M ${leftSide[0].x} ${leftSide[0].y}`);
  for (let i = 1; i < leftSide.length; i++) {
    pathParts.push(`L ${leftSide[i].x} ${leftSide[i].y}`);
  }
  for (let i = rightSide.length - 1; i >= 0; i--) {
    pathParts.push(`L ${rightSide[i].x} ${rightSide[i].y}`);
  }
  pathParts.push('Z');
  return pathParts.join(' ');
};

const relaxLabelY = (
  items: { y: number; originalIdx: number }[],
  minGap: number = 36,
  minY: number = 40,
  maxY: number = 610
): number[] => {
  const sorted = [...items].sort((a, b) => a.y - b.y);
  const relaxed = sorted.map(item => ({ ...item, displayY: item.y }));
  
  for (let iter = 0; iter < 100; iter++) {
    let moved = false;
    for (let i = 0; i < relaxed.length - 1; i++) {
      const a = relaxed[i];
      const b = relaxed[i + 1];
      const diff = b.displayY - a.displayY;
      if (diff < minGap) {
        const overlap = minGap - diff;
        const shift = overlap / 2;
        a.displayY = Math.max(minY, a.displayY - shift);
        b.displayY = Math.min(maxY, b.displayY + shift);
        moved = true;
      }
    }
    if (!moved) break;
  }
  
  const result: number[] = new Array(items.length);
  relaxed.forEach(r => {
    result[r.originalIdx] = r.displayY;
  });
  return result;
};

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
  measurements?: BodyMeasurements;
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
  scanRange = 'full',
  measurements
}) => {

  const uniqueId = useMemo(() => Math.random().toString(36).substring(2, 9), []);

  const projected3DData = useMemo(() => {
    const rad = (rotationAngle * Math.PI) / 180;
    const cosA = Math.cos(rad);
    const sinA = Math.sin(rad);

    const project = (x3d: number, y3d: number, z3d: number) => {
      const rotatedX = x3d * cosA - z3d * sinA;
      const rotatedZ = x3d * sinA + z3d * cosA;
      return { x: 200 + rotatedX, y: y3d, z: rotatedZ };
    };

    // Joint landmarks search
    const nasionF = landmarks.find(l => l.id === 'nasion') || { x: 200, y: 75 };
    const lShoulderVal = landmarks.find(l => l.id === 'left_shoulder') || { x: 165, y: 125 };
    const rShoulderVal = landmarks.find(l => l.id === 'right_shoulder') || { x: 235, y: 125 };
    const lElbowVal = landmarks.find(l => l.id === 'left_elbow') || { x: 155, y: 220 };
    const rElbowVal = landmarks.find(l => l.id === 'right_elbow') || { x: 245, y: 220 };
    const lWristVal = landmarks.find(l => l.id === 'left_wrist') || { x: 145, y: 310 };
    const rWristVal = landmarks.find(l => l.id === 'right_wrist') || { x: 255, y: 310 };
    const lHipVal = landmarks.find(l => l.id === 'left_hip') || { x: 175, y: 300 };
    const rHipVal = landmarks.find(l => l.id === 'right_hip') || { x: 225, y: 300 };
    const lKneeVal = landmarks.find(l => l.id === 'left_knee') || { x: 175, y: 460 };
    const rKneeVal = landmarks.find(l => l.id === 'right_knee') || { x: 225, y: 460 };
    const lAnkleVal = landmarks.find(l => l.id === 'left_ankle') || { x: 175, y: 610 };
    const rAnkleVal = landmarks.find(l => l.id === 'right_ankle') || { x: 225, y: 610 };

    const bodyHeight = rAnkleVal.y - nasionF.y;
    const shoulderWidth = Math.abs(rShoulderVal.x - lShoulderVal.x) || 70;
    const hipWidth = Math.abs(rHipVal.x - lHipVal.x) || 50;

    const lShoulder3D = { x: lShoulderVal.x - 200, y: lShoulderVal.y, z: 0 };
    const rShoulder3D = { x: rShoulderVal.x - 200, y: rShoulderVal.y, z: 0 };
    const lElbow3D = { x: lElbowVal.x - 200, y: lElbowVal.y, z: 0 };
    const rElbow3D = { x: rElbowVal.x - 200, y: rElbowVal.y, z: 0 };
    const lWrist3D = { x: lWristVal.x - 200, y: lWristVal.y, z: 0 };
    const rWrist3D = { x: rWristVal.x - 200, y: rWristVal.y, z: 0 };
    const lHip3D = { x: lHipVal.x - 200, y: lHipVal.y, z: 0 };
    const rHip3D = { x: rHipVal.x - 200, y: rHipVal.y, z: 0 };
    const lKnee3D = { x: lKneeVal.x - 200, y: lKneeVal.y, z: 0 };
    const rKnee3D = { x: rKneeVal.x - 200, y: rKneeVal.y, z: 0 };
    const lAnkle3D = { x: lAnkleVal.x - 200, y: lAnkleVal.y, z: 0 };
    const rAnkle3D = { x: rAnkleVal.x - 200, y: rAnkleVal.y, z: 0 };

    // Hands and feet directions & endpoints
    const lh_dx = lWrist3D.x - lElbow3D.x;
    const lh_dy = lWrist3D.y - lElbow3D.y;
    const lh_dz = lWrist3D.z - lElbow3D.z;
    const lh_len = Math.sqrt(lh_dx * lh_dx + lh_dy * lh_dy + lh_dz * lh_dz) || 1;
    const lHand3D = {
      x: lWrist3D.x + (lh_dx / lh_len) * 18,
      y: lWrist3D.y + (lh_dy / lh_len) * 18,
      z: lWrist3D.z + (lh_dz / lh_len) * 18
    };

    const rh_dx = rWrist3D.x - rElbow3D.x;
    const rh_dy = rWrist3D.y - rElbow3D.y;
    const rh_dz = rWrist3D.z - rElbow3D.z;
    const rh_len = Math.sqrt(rh_dx * rh_dx + rh_dy * rh_dy + rh_dz * rh_dz) || 1;
    const rHand3D = {
      x: rWrist3D.x + (rh_dx / rh_len) * 18,
      y: rWrist3D.y + (rh_dy / rh_len) * 18,
      z: rWrist3D.z + (rh_dz / rh_len) * 18
    };

    const lFoot3D = { x: lAnkle3D.x, y: lAnkle3D.y + 6, z: lAnkle3D.z + 18 };
    const rFoot3D = { x: rAnkle3D.x, y: rAnkle3D.y + 6, z: rAnkle3D.z + 18 };

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
      shoulder: lShoulderVal.y,
      chest: nasionF.y + bodyHeight * 0.20,
      waist: nasionF.y + bodyHeight * 0.30,
      hips: lHipVal.y,
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

    // Generate 32 Interpolated Rings for Torso
    const numTorsoRings = 32;
    const interpolatedRings: { id: string; y: number; w: number; dUnscaled: number }[] = [];
    const yStart = heights.neck;
    const yEnd = heights.thighs;

    for (let i = 0; i < numTorsoRings; i++) {
      const t = i / (numTorsoRings - 1);
      const y = yStart + t * (yEnd - yStart);

      let rA = ringsList[0];
      let rB = ringsList[ringsList.length - 1];
      for (let j = 0; j < ringsList.length - 1; j++) {
        if (y >= ringsList[j].y && y <= ringsList[j + 1].y) {
          rA = ringsList[j];
          rB = ringsList[j + 1];
          break;
        }
      }

      let tRing = 0;
      if (rB.y !== rA.y) {
        tRing = (y - rA.y) / (rB.y - rA.y);
      }

      const tSmooth = (1 - Math.cos(tRing * Math.PI)) / 2;
      const w = rA.w + (rB.w - rA.w) * tSmooth;
      const dUnscaled = rA.dUnscaled + (rB.dUnscaled - rA.dUnscaled) * tSmooth;

      let ringId = 'torso';
      if (y < heights.shoulder) ringId = 'neck';
      else if (y < heights.chest) ringId = 'chest';
      else if (y < heights.waist) ringId = 'waist';
      else if (y < heights.hips) ringId = 'hips';
      else ringId = 'thighs';

      interpolatedRings.push({
        id: `${ringId}_${i}`,
        y,
        w,
        dUnscaled
      });
    }

    let unscaledTorsoVolume = 0;
    for (let i = 0; i < interpolatedRings.length - 1; i++) {
      const r1 = interpolatedRings[i];
      const r2 = interpolatedRings[i + 1];

      const h_cm = (r2.y - r1.y) * scaleFactor;
      const a1_cm = (r1.w * scaleFactor) / 2;
      const b1_cm = (r1.dUnscaled * scaleFactor) / 2;
      const a2_cm = (r2.w * scaleFactor) / 2;
      const b2_cm = (r2.dUnscaled * scaleFactor) / 2;

      const vFrustum = (h_cm * Math.PI / 3) * (a1_cm * b1_cm + a2_cm * b2_cm + (a1_cm * b2_cm + a2_cm * b1_cm) / 2);
      unscaledTorsoVolume += vFrustum;
    }

    const k = Math.max(0.3, Math.min(3.0, targetTorsoVolumeCm3 / unscaledTorsoVolume));

    const finalizedRings = interpolatedRings.map(r => ({
      id: r.id,
      y: r.y,
      w: r.w,
      d: r.dUnscaled * k
    }));

    const meshLines: { x1: number; y1: number; z1: number; x2: number; y2: number; z2: number; type: 'ring' | 'vertical' }[] = [];
    const numPointsPerRing = 16;
    const ringsPoints2D: { x: number; y: number; z: number }[][] = [];

    finalizedRings.forEach((ring) => {
      const ringPoints: { x: number; y: number; z: number }[] = [];
      const radiusX = ring.w / 2;
      const radiusZ = ring.d / 2;

      for (let i = 0; i < numPointsPerRing; i++) {
        const phi = (i * 2 * Math.PI) / numPointsPerRing;
        let x3d = radiusX * Math.cos(phi);
        let z3d = radiusZ * Math.sin(phi);

        if (gender === 'female' && ring.id.includes('chest') && z3d > 0) {
          const distanceToChest = Math.abs(ring.y - heights.chest);
          const chestSpan = heights.waist - heights.shoulder;
          const chestFactor = Math.max(0, 1 - distanceToChest / (chestSpan * 0.4));
          const breastBulge = 0.32 * chestFactor;
          z3d = z3d * (1.0 + breastBulge * Math.sin(phi));
        }

        if (gender === 'male' && ring.id.includes('chest') && z3d > 0) {
          const distanceToChest = Math.abs(ring.y - heights.chest);
          const chestSpan = heights.waist - heights.shoulder;
          const chestFactor = Math.max(0, 1 - distanceToChest / (chestSpan * 0.4));
          const breastBulge = 0.12 * chestFactor;
          z3d = z3d * (1.0 + breastBulge * Math.sin(phi));
        }

        if (ring.id.includes('hips') || ring.id.includes('thighs') || ring.id.includes('waist')) {
          if (z3d < 0) {
            const distanceToHips = Math.abs(ring.y - heights.hips);
            const hipSpan = heights.thighs - heights.waist;
            const hipFactor = Math.max(0, 1 - distanceToHips / (hipSpan * 0.5));
            const buttockBulge = gender === 'female' ? 0.25 * hipFactor : 0.12 * hipFactor;
            z3d = z3d * (1.0 + buttockBulge * Math.abs(Math.sin(phi)));
          }
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
          z1: ringPoints[i].z,
          x2: ringPoints[next].x,
          y2: ringPoints[next].y,
          z2: ringPoints[next].z,
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
          z1: ringA[i].z,
          x2: ringB[i].x,
          y2: ringB[i].y,
          z2: ringB[i].z,
          type: 'vertical'
        });
      }
    }

    const numSphereRings = 8;
    const numPointsPerSphereRing = 16;
    const sphereRingsPoints2D: { x: number; y: number; z: number }[][] = [];

    for (let j = 0; j <= numSphereRings + 1; j++) {
      const theta = (j * Math.PI) / (numSphereRings + 1);
      const r = headRadius * Math.sin(theta);
      const ringY = headCenterY + headRadius * Math.cos(theta);

      const sphereRingPoints: { x: number; y: number; z: number }[] = [];
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
            z1: currentRing[i].z,
            x2: currentRing[next].x,
            y2: currentRing[next].y,
            z2: currentRing[next].z,
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
            z1: currentRing[i].z,
            x2: nextRing[i].x,
            y2: nextRing[i].y,
            z2: nextRing[i].z,
            type: 'vertical'
          });
        }
      }
    }

    // Connect chin ring of head to top ring of neck/torso
    if (sphereRingsPoints2D.length > 0 && ringsPoints2D.length > 0) {
      const chinRing = sphereRingsPoints2D[0];
      const neckRing = ringsPoints2D[0];
      for (let i = 0; i < numPointsPerRing; i++) {
        meshLines.push({
          x1: chinRing[i].x,
          y1: chinRing[i].y,
          z1: chinRing[i].z,
          x2: neckRing[i].x,
          y2: neckRing[i].y,
          z2: neckRing[i].z,
          type: 'vertical'
        });
      }
    }

    const limbsData: { id: string; points: { x: number; y: number; z: number }[][]; dx: number; dy: number }[] = [];
    const limbWeightFactor = Math.max(0.75, Math.min(1.5, Math.sqrt(weight / 55.0)));

    const addLimbSegment = (
      id: string,
      pStart: { x: number; y: number; z: number },
      pEnd: { x: number; y: number; z: number },
      rStart: number,
      rEnd: number,
      numRings: number,
      numPoints: number
    ) => {
      const limbRings: { x: number; y: number; z: number }[][] = [];

      const dx = pEnd.x - pStart.x;
      const dy = pEnd.y - pStart.y;
      const dz = pEnd.z - pStart.z;
      const len = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1;
      const ux = dx / len;
      const uy = dy / len;
      const uz = dz / len;

      let tx = 1, ty = 0, tz = 0;
      if (Math.abs(ux) > 0.9) {
        tx = 0;
        ty = 1;
      }
      let vx = uy * tz - uz * ty;
      let vy = uz * tx - ux * tz;
      let vz = ux * ty - uy * tx;
      const vLen = Math.sqrt(vx * vx + vy * vy + vz * vz) || 1;
      vx /= vLen;
      vy /= vLen;
      vz /= vLen;

      const wx = uy * vz - uz * vy;
      const wy = uz * vx - ux * vz;
      const wz = ux * vy - uy * vx;

      for (let s = 0; s <= numRings; s++) {
        const t = s / numRings;
        const cx = pStart.x + dx * t;
        const cy = pStart.y + dy * t;
        const cz = pStart.z + dz * t;
        
        let r = rStart + (rEnd - rStart) * t;

        if (id.includes('calf')) {
          const calfBulge = hipWidth * 0.032 * limbWeightFactor;
          r += calfBulge * Math.sin(Math.pow(t, 0.6) * Math.PI);
        } else if (id.includes('thigh')) {
          const thighBulge = hipWidth * 0.018 * limbWeightFactor;
          r += thighBulge * Math.sin(t * Math.PI);
        }

        let r_v = r;
        let r_w = r;
        let cy_adjusted = cy;

        if (id.includes('foot')) {
          r_v = r * (1.0 - t * 0.62);
          r_w = r * (1.0 + t * 0.35);
          cy_adjusted = cy + (rStart * 0.35 * t);
        }

        const ringPoints: { x: number; y: number; z: number }[] = [];
        for (let i = 0; i < numPoints; i++) {
          const phi = (i * 2 * Math.PI) / numPoints;
          const cosP = Math.cos(phi);
          const sinP = Math.sin(phi);

          const xOffset = r_v * cosP * vx + r_w * sinP * wx;
          const yOffset = r_v * cosP * vy + r_w * sinP * wy;
          const zOffset = r_v * cosP * vz + r_w * sinP * wz;

          const x3d = cx + xOffset;
          const y3d = cy_adjusted + yOffset;
          const z3d = cz + zOffset;

          const pt2d = project(x3d, y3d, z3d);
          ringPoints.push(pt2d);
        }
        limbRings.push(ringPoints);

        for (let i = 0; i < numPoints; i++) {
          const next = (i + 1) % numPoints;
          meshLines.push({
            x1: ringPoints[i].x,
            y1: ringPoints[i].y,
            z1: ringPoints[i].z,
            x2: ringPoints[next].x,
            y2: ringPoints[next].y,
            z2: ringPoints[next].z,
            type: 'ring'
          });
        }
      }

      for (let s = 0; s < numRings; s++) {
        const ringA = limbRings[s];
        const ringB = limbRings[s + 1];
        for (let i = 0; i < numPoints; i++) {
          meshLines.push({
            x1: ringA[i].x,
            y1: ringA[i].y,
            z1: ringA[i].z,
            x2: ringB[i].x,
            y2: ringB[i].y,
            z2: ringB[i].z,
            type: 'vertical'
          });
        }
      }

      const start2d = project(pStart.x, pStart.y, pStart.z);
      const end2d = project(pEnd.x, pEnd.y, pEnd.z);
      const dx2d = end2d.x - start2d.x;
      const dy2d = end2d.y - start2d.y;

      limbsData.push({
        id,
        points: limbRings,
        dx: dx2d || 1,
        dy: dy2d || 0
      });
    };

    addLimbSegment('l_upper_arm', lShoulder3D, lElbow3D, shoulderWidth * 0.065 * limbWeightFactor, shoulderWidth * 0.052 * limbWeightFactor, 8, 12);
    addLimbSegment('l_lower_arm', lElbow3D, lWrist3D, shoulderWidth * 0.052 * limbWeightFactor, shoulderWidth * 0.038 * limbWeightFactor, 8, 12);
    addLimbSegment('l_hand', lWrist3D, lHand3D, shoulderWidth * 0.038 * limbWeightFactor, 1.8, 4, 12);

    addLimbSegment('r_upper_arm', rShoulder3D, rElbow3D, shoulderWidth * 0.065 * limbWeightFactor, shoulderWidth * 0.052 * limbWeightFactor, 8, 12);
    addLimbSegment('r_lower_arm', rElbow3D, rWrist3D, shoulderWidth * 0.052 * limbWeightFactor, shoulderWidth * 0.038 * limbWeightFactor, 8, 12);
    addLimbSegment('r_hand', rWrist3D, rHand3D, shoulderWidth * 0.038 * limbWeightFactor, 1.8, 4, 12);

    addLimbSegment('l_thigh', lHip3D, lKnee3D, hipWidth * 0.19 * limbWeightFactor, hipWidth * 0.14 * limbWeightFactor, 10, 12);
    addLimbSegment('l_calf', lKnee3D, lAnkle3D, hipWidth * 0.14 * limbWeightFactor, hipWidth * 0.09 * limbWeightFactor, 10, 12);
    addLimbSegment('l_foot', lAnkle3D, lFoot3D, hipWidth * 0.09 * limbWeightFactor, 3.5, 4, 12);

    addLimbSegment('r_thigh', rHip3D, rKnee3D, hipWidth * 0.19 * limbWeightFactor, hipWidth * 0.14 * limbWeightFactor, 10, 12);
    addLimbSegment('r_calf', rKnee3D, rAnkle3D, hipWidth * 0.14 * limbWeightFactor, hipWidth * 0.09 * limbWeightFactor, 10, 12);
    addLimbSegment('r_foot', rAnkle3D, rFoot3D, hipWidth * 0.09 * limbWeightFactor, 3.5, 4, 12);

    const hudPoints = {
      neck: project(-widths.neck / 2, heights.neck, 0),
      chest: project(-widths.chest / 2, heights.chest, 0),
      waistLower: project(-widths.waist * 1.03 / 2, heights.waist + (heights.hips - heights.waist) * 0.4, 0),
      thighLeft: project((lHipVal.x + lKneeVal.x) / 2 - 200 - (hipWidth * 0.17 * limbWeightFactor) / 2, (lHipVal.y + lKneeVal.y) / 2, 0),
      calfLeft: project((lKneeVal.x + lAnkleVal.x) / 2 - 200 - (hipWidth * 0.12 * limbWeightFactor) / 2, (lKneeVal.y + lAnkleVal.y) / 2, 0),
      
      shoulder: project(widths.shoulder / 2, heights.shoulder, 0),
      waistUpper: project(widths.waist / 2, heights.waist, 0),
      hips: project(widths.hips / 2, heights.hips, 0),
      armRight: project((rShoulderVal.x + rElbowVal.x + rWristVal.x) / 3 - 200 + 10, (rShoulderVal.y + rElbowVal.y + rWristVal.y) / 3, 0),
      legRight: project((rHipVal.x + rKneeVal.x + rAnkleVal.x) / 3 - 200 + 12, (rHipVal.y + rKneeVal.y + rAnkleVal.y) / 3, 0),
    };

    return {
      meshLines,
      ringsPoints2D,
      headCenterY,
      headRadius,
      limbsData,
      hudPoints,
      heights,
      widths,
      nasionY: nasionF.y,
      bodyHeight
    };
  }, [rotationAngle, landmarks, gender, weight, scaleFactor]);

  const projected3DMesh = projected3DData.meshLines;

  const renderSilhouette = () => {
    const { ringsPoints2D, headCenterY, headRadius, limbsData, heights, widths } = projected3DData;

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

    const leftSide: { x: number; y: number }[] = [];
    const rightSide: { x: number; y: number }[] = [];

    ringsPoints2D.forEach(ring => {
      const { left, right } = getOuterPoints(ring);
      leftSide.push(left);
      rightSide.push(right);
    });

    // Find knees and ankles for leg taper
    const lKnee = landmarks.find(l => l.id === 'left_knee') || landmarks.find(l => l.id === 'knee') || { x: 185, y: 460 };
    const rKnee = landmarks.find(l => l.id === 'right_knee') || landmarks.find(l => l.id === 'knee') || { x: 215, y: 460 };
    const lAnkle = landmarks.find(l => l.id === 'left_ankle') || landmarks.find(l => l.id === 'ankle') || { x: 185, y: 610 };
    const rAnkle = landmarks.find(l => l.id === 'right_ankle') || landmarks.find(l => l.id === 'ankle') || { x: 215, y: 610 };

    const strokeId = `body3dStroke_${uniqueId}`;
    const heatGradId = `bodyHeatGrad_${uniqueId}`;
    const skinGradId = `skinGrad_${uniqueId}`;
    const limbGradId = `limbGrad_${uniqueId}`;
    const faceGradId = `faceGrad_${uniqueId}`;

    let fillUrl = `url(#${skinGradId})`;
    let strokeColor = '#22d3ee';
    let strokeWidth = '1.8';
    let opacity = 1.0;
    let limbFill = `url(#${limbGradId})`;
    let headFill = `url(#${faceGradId})`;
    let useGlowFilter = true;

    if (meshStyle === 'heatmap') {
      fillUrl = `url(#${heatGradId})`;
      strokeColor = 'rgba(255, 255, 255, 0.25)';
      strokeWidth = '1.0';
      limbFill = `url(#${heatGradId})`;
      headFill = `url(#${heatGradId})`;
      useGlowFilter = false;
    } else if (meshStyle === 'neon') {
      fillUrl = 'rgba(15, 23, 42, 0.75)';
      strokeColor = '#06b6d4';
      strokeWidth = '2.2';
      limbFill = 'rgba(15, 23, 42, 0.75)';
      headFill = 'rgba(15, 23, 42, 0.75)';
      useGlowFilter = true;
    }

    // Torso path construction using the 32 interpolated rings
    const pathParts = [];
    pathParts.push(`M ${leftSide[0].x} ${leftSide[0].y}`);
    for (let i = 1; i < leftSide.length; i++) {
      pathParts.push(`L ${leftSide[i].x} ${leftSide[i].y}`);
    }

    const isLegVisible = scanRange === 'full';

    if (isLegVisible) {
      // Left leg outer -> bottom -> inner
      pathParts.push(`L ${lKnee.x - 12} ${lKnee.y}`);
      pathParts.push(`L ${lAnkle.x - 8} ${lAnkle.y}`);
      pathParts.push(`L ${lAnkle.x - 8} ${lAnkle.y + 6}`);
      pathParts.push(`L ${lAnkle.x + 10} ${lAnkle.y + 6}`);
      pathParts.push(`L ${lAnkle.x + 8} ${lAnkle.y}`);
      pathParts.push(`L ${lKnee.x + 10} ${lKnee.y}`);
      pathParts.push(`L 200 ${leftSide[leftSide.length - 1].y + 15}`); // Crotch area
      
      // Right leg inner -> bottom -> outer
      pathParts.push(`L ${rKnee.x - 10} ${rKnee.y}`);
      pathParts.push(`L ${rAnkle.x - 8} ${rAnkle.y}`);
      pathParts.push(`L ${rAnkle.x - 10} ${rAnkle.y + 6}`);
      pathParts.push(`L ${rAnkle.x + 8} ${rAnkle.y + 6}`);
      pathParts.push(`L ${rAnkle.x + 8} ${rAnkle.y}`);
      pathParts.push(`L ${rKnee.x + 12} ${rKnee.y}`);
      pathParts.push(`L ${rightSide[rightSide.length - 1].x} ${rightSide[rightSide.length - 1].y}`);
    } else {
      // Half body rounded crotch bottom
      pathParts.push(`C ${leftSide[leftSide.length - 1].x} ${leftSide[leftSide.length - 1].y + 22}, ${rightSide[rightSide.length - 1].x} ${rightSide[rightSide.length - 1].y + 22}, ${rightSide[rightSide.length - 1].x} ${rightSide[rightSide.length - 1].y}`);
    }

    for (let i = rightSide.length - 1; i >= 0; i--) {
      pathParts.push(`L ${rightSide[i].x} ${rightSide[i].y}`);
    }
    pathParts.push('Z');

    const bodyPathD = pathParts.join(' ');

    const limbPaths: React.ReactNode[] = [];
    if (limbsData) {
      limbsData.forEach((limb) => {
        const isLegLimb = ['l_thigh', 'l_calf', 'l_foot', 'r_thigh', 'r_calf', 'r_foot'].includes(limb.id);
        if (isLegLimb && !isLegVisible) {
          return;
        }

        const pathD = getLimbSilhouettePath(limb.points, limb.dx, limb.dy);
        limbPaths.push(
          <path
            key={`silhouette-${limb.id}`}
            d={pathD}
            fill={limbFill}
            stroke={meshStyle === 'solid' ? '#22d3ee' : strokeColor}
            strokeWidth={meshStyle === 'solid' ? '1.5' : strokeWidth}
            filter={useGlowFilter ? 'url(#neonGlow)' : undefined}
          />
        );
      });
    }

    const shadowGrad = `shadowGrad_${uniqueId}`;
    const neckGrad = `neckGrad_${uniqueId}`;

    return (
      <g style={{ opacity, transition: 'opacity 0.25s ease' }}>
        <defs>
          <radialGradient id={skinGradId} cx="50%" cy="40%" r="70%">
            <stop offset="0%" stopColor="rgba(34, 211, 238, 0.2)" />
            <stop offset="60%" stopColor="rgba(14, 116, 144, 0.45)" />
            <stop offset="100%" stopColor="rgba(15, 23, 42, 0.9)" />
          </radialGradient>
          <radialGradient id={limbGradId} cx="50%" cy="40%" r="70%">
            <stop offset="0%" stopColor="rgba(34, 211, 238, 0.16)" />
            <stop offset="60%" stopColor="rgba(14, 116, 144, 0.38)" />
            <stop offset="100%" stopColor="rgba(15, 23, 42, 0.9)" />
          </radialGradient>
          <radialGradient id={faceGradId} cx="50%" cy="40%" r="65%">
            <stop offset="0%" stopColor="rgba(34, 211, 238, 0.25)" />
            <stop offset="60%" stopColor="rgba(14, 116, 144, 0.45)" />
            <stop offset="100%" stopColor="rgba(15, 23, 42, 0.92)" />
          </radialGradient>
          <linearGradient id={shadowGrad} x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="rgba(6, 182, 212, 0.2)" />
            <stop offset="50%" stopColor="rgba(15, 23, 42, 0.0)" />
            <stop offset="100%" stopColor="rgba(6, 182, 212, 0.2)" />
          </linearGradient>
          <linearGradient id={neckGrad} x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="rgba(14, 116, 144, 0.6)" />
            <stop offset="50%" stopColor="rgba(34, 211, 238, 0.3)" />
            <stop offset="100%" stopColor="rgba(14, 116, 144, 0.6)" />
          </linearGradient>
          <linearGradient id={strokeId} x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#22d3ee" />
            <stop offset="100%" stopColor="#0891b2" />
          </linearGradient>
          <filter id="neonGlow" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="3" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* Head base sphere */}
        <ellipse
          cx={200}
          cy={headCenterY}
          rx={headRadius * 0.88}
          ry={headRadius}
          fill={headFill}
          stroke={meshStyle === 'solid' ? '#22d3ee' : strokeColor}
          strokeWidth={meshStyle === 'solid' ? '1.8' : strokeWidth}
          filter={useGlowFilter ? 'url(#neonGlow)' : undefined}
        />

        {/* ===== NECK ===== */}
        {meshStyle === 'solid' && (
          <>
            {/* Solid neck fill */}
            <path
              d={`M ${leftSide[0].x} ${leftSide[0].y} L ${200 - (rightSide[0].x - leftSide[0].x) * 0.45} ${headCenterY + headRadius * 0.85} L ${200 + (rightSide[0].x - leftSide[0].x) * 0.45} ${headCenterY + headRadius * 0.85} L ${rightSide[0].x} ${rightSide[0].y} Z`}
              fill={`url(#${neckGrad})`}
            />
            {/* Neck left line */}
            <line
              x1={leftSide[0].x} y1={leftSide[0].y}
              x2={200 - (rightSide[0].x - leftSide[0].x) * 0.45}
              y2={headCenterY + headRadius * 0.85}
              stroke="#22d3ee" strokeWidth="1.2"
              filter={useGlowFilter ? 'url(#neonGlow)' : undefined}
            />
            {/* Neck right line */}
            <line
              x1={rightSide[0].x} y1={rightSide[0].y}
              x2={200 + (rightSide[0].x - leftSide[0].x) * 0.45}
              y2={headCenterY + headRadius * 0.85}
              stroke="#22d3ee" strokeWidth="1.2"
              filter={useGlowFilter ? 'url(#neonGlow)' : undefined}
            />
          </>
        )}
        {meshStyle !== 'solid' && (
          <path
            d={`M ${leftSide[0].x} ${leftSide[0].y} L ${200 - (rightSide[0].x - leftSide[0].x) * 0.45} ${headCenterY + headRadius * 0.85} L ${200 + (rightSide[0].x - leftSide[0].x) * 0.45} ${headCenterY + headRadius * 0.85} L ${rightSide[0].x} ${rightSide[0].y} Z`}
            fill={fillUrl}
            stroke={strokeColor}
            strokeWidth={strokeWidth}
            filter={useGlowFilter ? 'url(#neonGlow)' : undefined}
          />
        )}

        {/* ===== TORSO & LEGS ===== */}
        <path
          d={bodyPathD}
          fill={fillUrl}
          stroke={meshStyle === 'solid' ? '#22d3ee' : strokeColor}
          strokeWidth={meshStyle === 'solid' ? '1.8' : strokeWidth}
          filter={useGlowFilter ? 'url(#neonGlow)' : undefined}
        />

        {/* Side shadow overlay for 3D depth */}
        {meshStyle === 'solid' && (
          <path
            d={bodyPathD}
            fill={`url(#${shadowGrad})`}
            stroke="none"
            style={{ mixBlendMode: 'screen', opacity: 0.35 }}
          />
        )}

        {/* ===== LIMB SILHOUETTES ===== */}
        {limbPaths}
        
        {/* ===== ANATOMICAL DETAILS (Solid mode) ===== */}
        {meshStyle === 'solid' && (
          <>
            {/* Center sternum line */}
            <path
              d={`M 200 ${leftSide[0].y} L 200 ${heights.chest + (heights.waist - heights.chest) * 0.4}`}
              stroke="rgba(34, 211, 238, 0.25)"
              strokeWidth="1.2"
              strokeDasharray="3,5"
            />

            {/* Female breasts shading */}
            {gender === 'female' && (
              <>
                {/* Left breast highlight */}
                <path
                  d={`M ${200 - 12} ${projected3DData.hudPoints.chest.y + 4} Q ${leftSide[10].x + 12} ${projected3DData.hudPoints.chest.y + 14} ${200 - 2} ${projected3DData.hudPoints.chest.y + 19}`}
                  fill="none"
                  stroke="rgba(34, 211, 238, 0.4)"
                  strokeWidth="2.8"
                />
                <path
                  d={`M ${200 - 14} ${projected3DData.hudPoints.chest.y + 6} Q ${leftSide[10].x + 12} ${projected3DData.hudPoints.chest.y + 16} ${200 - 2} ${projected3DData.hudPoints.chest.y + 22}`}
                  fill="none"
                  stroke="rgba(6, 182, 212, 0.3)"
                  strokeWidth="3"
                />
                {/* Right breast highlight */}
                <path
                  d={`M ${200 + 12} ${projected3DData.hudPoints.chest.y + 4} Q ${rightSide[10].x - 12} ${projected3DData.hudPoints.chest.y + 14} ${200 + 2} ${projected3DData.hudPoints.chest.y + 19}`}
                  fill="none"
                  stroke="rgba(34, 211, 238, 0.4)"
                  strokeWidth="2.8"
                />
                <path
                  d={`M ${200 + 14} ${projected3DData.hudPoints.chest.y + 6} Q ${rightSide[10].x - 12} ${projected3DData.hudPoints.chest.y + 16} ${200 + 2} ${projected3DData.hudPoints.chest.y + 22}`}
                  fill="none"
                  stroke="rgba(6, 182, 212, 0.3)"
                  strokeWidth="3"
                />
                {/* Belly button */}
                <circle cx={200} cy={heights.waist - (heights.waist - heights.chest) * 0.15}
                  r="2.5" fill="none" stroke="rgba(6, 182, 212, 0.3)" strokeWidth="1.2" />
              </>
            )}
            
            {/* Male chest/pecs shading */}
            {gender === 'male' && (
              <>
                <path
                  d={`M ${leftSide[10].x + 14} ${projected3DData.hudPoints.chest.y + 4} L ${200 - 5} ${projected3DData.hudPoints.chest.y + 13} L ${200 - 5} ${projected3DData.hudPoints.chest.y + 15} L ${leftSide[10].x + 17} ${projected3DData.hudPoints.chest.y + 6}`}
                  fill="rgba(6, 182, 212, 0.15)"
                />
                <path
                  d={`M ${rightSide[10].x - 14} ${projected3DData.hudPoints.chest.y + 4} L ${200 + 5} ${projected3DData.hudPoints.chest.y + 13} L ${200 + 5} ${projected3DData.hudPoints.chest.y + 15} L ${rightSide[10].x - 17} ${projected3DData.hudPoints.chest.y + 6}`}
                  fill="rgba(6, 182, 212, 0.15)"
                />
                {/* Abs lines (male) */}
                {[0.1, 0.3, 0.55].map((t, i) => {
                  const y = heights.chest + (heights.waist - heights.chest) * t;
                  const w = widths.chest * 0.25;
                  return (
                    <g key={`abs-${i}`}>
                      <path d={`M ${200 - w} ${y} Q ${200 - w * 0.4} ${y + 3} ${200} ${y}`}
                        fill="none" stroke="rgba(6, 182, 212, 0.25)" strokeWidth="1.5" />
                      <path d={`M ${200} ${y} Q ${200 + w * 0.4} ${y + 3} ${200 + w} ${y}`}
                        fill="none" stroke="rgba(6, 182, 212, 0.25)" strokeWidth="1.5" />
                    </g>
                  );
                })}
                {/* Belly button (male) */}
                <circle cx={200} cy={heights.waist - (heights.waist - heights.chest) * 0.08}
                  r="2" fill="none" stroke="rgba(6, 182, 212, 0.3)" strokeWidth="1.1" />
              </>
            )}
            
            {/* Waist contour shadow */}
            <path
              d={`M ${leftSide[10].x + 7} ${projected3DData.hudPoints.chest.y + 10} Q ${leftSide[16].x + 8} ${projected3DData.hudPoints.waistUpper.y} ${leftSide[22].x + 6} ${projected3DData.hudPoints.hips.y}`}
              fill="none"
              stroke="rgba(6, 182, 212, 0.2)"
              strokeWidth="5"
            />
            <path
              d={`M ${rightSide[10].x - 7} ${projected3DData.hudPoints.chest.y + 10} Q ${rightSide[16].x - 8} ${projected3DData.hudPoints.waistUpper.y} ${rightSide[22].x - 6} ${projected3DData.hudPoints.hips.y}`}
              fill="none"
              stroke="rgba(6, 182, 212, 0.2)"
              strokeWidth="5"
            />

            {/* Collarbone / clavicle lines */}
            <path
              d={`M ${200 - widths.neck / 2 - 2} ${heights.neck + 4} Q ${200 - widths.shoulder * 0.35} ${heights.shoulder - 5} ${200 - widths.shoulder * 0.48} ${heights.shoulder + 2}`}
              fill="none"
              stroke="rgba(34, 211, 238, 0.3)"
              strokeWidth="1.8"
              strokeLinecap="round"
            />
            <path
              d={`M ${200 + widths.neck / 2 + 2} ${heights.neck + 4} Q ${200 + widths.shoulder * 0.35} ${heights.shoulder - 5} ${200 + widths.shoulder * 0.48} ${heights.shoulder + 2}`}
              fill="none"
              stroke="rgba(34, 211, 238, 0.3)"
              strokeWidth="1.8"
              strokeLinecap="round"
            />

            {/* Knee caps (solid realistic detail) */}
            {isLegVisible && (
              <>
                <ellipse cx={lKnee.x} cy={lKnee.y} rx={8} ry={6}
                  fill="rgba(34, 211, 238, 0.15)" stroke="rgba(6, 182, 212, 0.35)" strokeWidth="0.8" />
                <ellipse cx={rKnee.x} cy={rKnee.y} rx={8} ry={6}
                  fill="rgba(34, 211, 238, 0.15)" stroke="rgba(6, 182, 212, 0.35)" strokeWidth="0.8" />
              </>
            )}

            {/* Hologram Laser Scan Line */}
            <line
              x1="5"
              y1="0"
              x2="395"
              y2="0"
              stroke="#22d3ee"
              strokeWidth="2.5"
              filter="url(#neonGlow)"
              className="laser-beam"
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
        {/* Metallic 3D Mannequin Shading Gradient (for neon/heatmap modes) */}
        <radialGradient id={gradId} cx="200" cy="280" r="320" fx="200" fy="150" gradientUnits="userSpaceOnUse">
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
 
        <radialGradient id="backlightGlow" cx="50%" cy="45%" r="60%">
          <stop offset="0%" stopColor="rgba(6, 182, 212, 0.15)" />
          <stop offset="60%" stopColor="rgba(14, 116, 144, 0.04)" />
          <stop offset="100%" stopColor="rgba(9, 13, 22, 0.0)" />
        </radialGradient>
 
        {/* Scientific thermal heatmap gradient */}
        <linearGradient id={heatGradId} x1="0" y1="50" x2="0" y2="650" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#00d2ff" />
          <stop offset="12%" stopColor="#00f5a0" />
          <stop offset="22%" stopColor="#eab308" />
          <stop offset="35%" stopColor="#ea580c" />
          <stop offset="48%" stopColor="#ef4444" />
          <stop offset="58%" stopColor="#ea580c" />
          <stop offset="70%" stopColor="#eab308" />
          <stop offset="85%" stopColor="#22c55e" />
          <stop offset="100%" stopColor="#00d2ff" />
        </linearGradient>
 
        <pattern id={gridId} width="20" height="20" patternUnits="userSpaceOnUse">
          <path d="M 20 0 L 0 0 0 20" fill="none" stroke="rgba(148, 163, 184, 0.03)" strokeWidth="1" />
        </pattern>
      </defs>
 
      <rect width="400" height="650" fill={`url(#${gridId})`} />
      <rect width="400" height="650" fill="url(#backlightGlow)" />
 
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
 
          // Apply Z-depth shading
          const zAvg = (line.z1 + line.z2) / 2;
          const maxZ = 60; // approximate max depth
          const normalizedZ = Math.max(-1, Math.min(1, zAvg / maxZ));
          const zFactor = (normalizedZ + 1) / 2; // 0 to 1
          
          // Base opacity based on line type - in solid mode make mesh subtle
          const baseOpacity = line.type === 'ring' 
            ? (meshStyle === 'solid' ? 0.12 : 0.85)
            : (meshStyle === 'solid' ? 0.06 : 0.45);
          const lineOpacity = baseOpacity * (0.28 + 0.72 * zFactor);
 
          const customStyle: React.CSSProperties = {
            opacity: lineOpacity,
            stroke: meshStyle === 'solid' ? 'rgba(34, 211, 238, 0.35)' : undefined
          };
          if (strokeColor) {
            customStyle.stroke = strokeColor;
            customStyle.strokeWidth = line.type === 'ring' ? '1.3px' : '0.7px';
          }
 
          return (
            <line
              key={`mesh-comp-${idx}`}
              x1={line.x1}
              y1={line.y1}
              x2={line.x2}
              y2={line.y2}
              className={`mesh-line ${line.type}`}
              style={customStyle}
            />
          );
        })}
      </g>
 
      {/* Direct 3D HUD Measurements Labels */}
      {measurements && projected3DData.hudPoints && (() => {
        const leftLabels = [
          { label: 'CỔ', value: (measurements.chestCircumference * (gender === 'female' ? 0.38 : 0.41)).toFixed(1) + " cm", pt: projected3DData.hudPoints.neck },
          { label: 'NGỰC', value: measurements.chestCircumference.toFixed(1) + " cm", pt: projected3DData.hudPoints.chest },
          { label: 'EO DƯỚI', value: (measurements.waistCircumference * 1.05).toFixed(1) + " cm", pt: projected3DData.hudPoints.waistLower },
          { label: 'ĐÙI PHẢI', value: (measurements.hipCircumference * (gender === 'female' ? 0.58 : 0.55)).toFixed(1) + " cm", pt: projected3DData.hudPoints.thighLeft },
          { label: 'BẮP CHÂN PHẢI', value: (measurements.hipCircumference * 0.38).toFixed(1) + " cm", pt: projected3DData.hudPoints.calfLeft },
        ];

        const rightLabels = [
          { label: 'RỘNG VAI', value: measurements.shoulderWidth.toFixed(1) + " cm", pt: projected3DData.hudPoints.shoulder },
          { label: 'EO TRÊN', value: (measurements.waistCircumference * 0.96).toFixed(1) + " cm", pt: projected3DData.hudPoints.waistUpper },
          { label: 'MÔNG', value: measurements.hipCircumference.toFixed(1) + " cm", pt: projected3DData.hudPoints.hips },
          { label: 'DÀI TAY', value: measurements.armLength.toFixed(1) + " cm", pt: projected3DData.hudPoints.armRight },
          { label: 'DÀI CHÂN', value: measurements.legLength.toFixed(1) + " cm", pt: projected3DData.hudPoints.legRight },
        ];

        const leftY = relaxLabelY(leftLabels.map((item, idx) => ({ y: item.pt.y, originalIdx: idx })), 36, 40, 610);
        const rightY = relaxLabelY(rightLabels.map((item, idx) => ({ y: item.pt.y, originalIdx: idx })), 36, 40, 610);
        
        return (
          <g className="hud-labels-group" style={{ pointerEvents: 'none' }}>
            {/* Left Labels */}
            {leftLabels.map((item, idx) => {
              const displayY = leftY[idx];
              return (
                <g key={`hud-l-comp-${idx}`} className="hud-label-group">
                  <line
                    x1={85}
                    y1={displayY}
                    x2={item.pt.x}
                    y2={item.pt.y}
                    className="hud-pointer-line left"
                  />
                  <circle
                    cx={item.pt.x}
                    cy={item.pt.y}
                    className="hud-pointer-dot left"
                  />
                  <rect
                    x={3}
                    y={displayY - 12}
                    width={82}
                    height={24}
                    rx={6}
                    ry={6}
                    fill="rgba(15, 23, 42, 0.85)"
                    stroke="rgba(6, 182, 212, 0.25)"
                    strokeWidth="1"
                  />
                  <text
                    x={80}
                    y={displayY - 2}
                    textAnchor="end"
                    className="hud-label-text left"
                    style={{ fill: '#22d3ee', fontSize: '8px', fontWeight: 700 }}
                  >
                    {item.label}
                  </text>
                  <text
                    x={80}
                    y={displayY + 8}
                    textAnchor="end"
                    className="hud-label-value left"
                    style={{ fill: '#06b6d4', fontSize: '10px', fontWeight: 800 }}
                  >
                    {item.value}
                  </text>
                </g>
              );
            })}

            {/* Right Labels */}
            {rightLabels.map((item, idx) => {
              const displayY = rightY[idx];
              return (
                <g key={`hud-r-comp-${idx}`} className="hud-label-group">
                  <line
                    x1={315}
                    y1={displayY}
                    x2={item.pt.x}
                    y2={item.pt.y}
                    className="hud-pointer-line right"
                  />
                  <circle
                    cx={item.pt.x}
                    cy={item.pt.y}
                    className="hud-pointer-dot right"
                  />
                  <rect
                    x={315}
                    y={displayY - 12}
                    width={82}
                    height={24}
                    rx={6}
                    ry={6}
                    fill="rgba(15, 23, 42, 0.85)"
                    stroke="rgba(251, 191, 36, 0.25)"
                    strokeWidth="1"
                  />
                  <text
                    x={320}
                    y={displayY - 2}
                    textAnchor="start"
                    className="hud-label-text right"
                    style={{ fill: '#f59e0b', fontSize: '8px', fontWeight: 700 }}
                  >
                    {item.label}
                  </text>
                  <text
                    x={320}
                    y={displayY + 8}
                    textAnchor="start"
                    className="hud-label-value right"
                    style={{ fill: '#fbbf24', fontSize: '10px', fontWeight: 800 }}
                  >
                    {item.value}
                  </text>
                </g>
              );
            })}
          </g>
        );
      })()}
    </svg>
  );
};
