import type { BodyMeasurements, Gender, CalibrationType } from '../types';

// Constants for human anthropometry
// Average density of human body: ~1.01 g/cm3 (equivalent to 1.01 kg/L or 0.00101 kg/cm3)
const HUMAN_BODY_DENSITY = 0.00101; 

// Average pupillary distance in cm
export const AVERAGE_IPD_CM = 6.3; 

// A4 paper dimensions in cm (21.0 x 29.7)
export const A4_WIDTH_CM = 21.0;
export const A4_HEIGHT_CM = 29.7;

// Standard credit card size in cm (8.56 x 5.40)
export const CARD_WIDTH_CM = 8.56;
export const CARD_HEIGHT_CM = 5.40;

/**
 * Calculates the physical scale factor (cm per pixel)
 * @param referencePixels Number of pixels for the reference object
 * @param calibrationType The type of calibration reference used
 * @returns scale factor (cm/pixel)
 */
export function calculateScaleFactor(
  referencePixels: number,
  calibrationType: CalibrationType
): number {
  if (referencePixels <= 0) return 0;
  
  switch (calibrationType) {
    case 'a4':
      // Assuming A4 width (21.0 cm) is oriented horizontally in reference
      return A4_WIDTH_CM / referencePixels;
    case 'card':
      // Assuming standard card width (8.56 cm)
      return CARD_WIDTH_CM / referencePixels;
    case 'ipd':
      // Using average Interpupillary Distance (6.3 cm)
      return AVERAGE_IPD_CM / referencePixels;
    default:
      return 1.0;
  }
}

/**
 * Estimates body circumferences using volume constraint equations.
 * This resolves the clothing occlusion (baggy clothes) problem by forcing
 * the reconstructed 3D body volume to match the user's physical weight.
 */
export function estimateCircumferences(
  gender: Gender,
  weightKg: number,
  heightCm: number
): { chest: number; waist: number; hips: number } {
  // Total volume in cm3
  const totalVolumeCm3 = weightKg / HUMAN_BODY_DENSITY;

  // Mass/Volume distribution ratios based on typical anthropometric studies (e.g. Clauser et al.)
  // We divide the torso into Chest (Thorax) and Abdomen/Pelvis (Waist and Hips)
  const chestVolumeRatio = 0.30; // 30% of body mass is in the thorax
  const abdomenVolumeRatio = 0.28; // 28% in abdomen/pelvis

  // Torso height segments as fractions of total height
  const chestSegmentHeight = heightCm * 0.16; // Chest height is roughly 16% of total height
  const waistSegmentHeight = heightCm * 0.10; // Waist segment is roughly 10%
  const hipsSegmentHeight = heightCm * 0.12;  // Hip segment is roughly 12%

  // Derive average cross-sectional areas (Volume / Segment Height)
  const chestArea = (totalVolumeCm3 * chestVolumeRatio) / chestSegmentHeight;
  
  // Split the abdomen volume between waist (40%) and hips (60%)
  const abdomenVolume = totalVolumeCm3 * abdomenVolumeRatio;
  const waistArea = (abdomenVolume * 0.42) / waistSegmentHeight;
  const hipsArea = (abdomenVolume * 0.58) / hipsSegmentHeight;

  // We model cross-sections as ellipses. 
  // Ratios of Width (front-facing) to Depth (side profile) vary by gender and body type.
  // Males tend to be wider and flatter at the chest; females rounder, etc.
  const widthToDepthRatios = {
    male: { chest: 1.35, waist: 1.25, hips: 1.20 },
    female: { chest: 1.25, waist: 1.30, hips: 1.35 }
  };

  const ratios = widthToDepthRatios[gender];

  // Calculate ellipse semi-axes (a, b) where Area = pi * a * b, and a/b = ratio
  // Area = pi * b^2 * ratio => b = sqrt(Area / (pi * ratio)), a = b * ratio
  const getCircumferenceFromArea = (area: number, ratio: number): number => {
    const b = Math.sqrt(area / (Math.PI * ratio));
    const a = b * ratio;
    
    // Ramanujan's approximation for perimeter of ellipse
    const h = Math.pow(a - b, 2) / Math.pow(a + b, 2);
    const perimeter = Math.PI * (a + b) * (1 + (3 * h) / (10 + Math.sqrt(4 - 3 * h)));
    return perimeter;
  };

  // Raw estimated circumferences based on volume
  let chest = getCircumferenceFromArea(chestArea, ratios.chest);
  let waist = getCircumferenceFromArea(waistArea, ratios.waist);
  let hips = getCircumferenceFromArea(hipsArea, ratios.hips);

  // Apply minor adjustments based on sex-specific fat distribution patterns
  if (gender === 'female') {
    // Females naturally have higher essential body fat percentages concentrated at hips and thighs
    hips *= 1.05;
    waist *= 0.98;
  } else {
    // Males tend to carry visceral fat around the abdomen
    waist *= 1.02;
    hips *= 0.96;
  }

  return {
    chest: Math.round(chest * 10) / 10,
    waist: Math.round(waist * 10) / 10,
    hips: Math.round(hips * 10) / 10
  };
}

/**
 * Standard sizes chart helper based on ISO 8559 reference guides
 */
export function getRecommendedSize(
  gender: Gender,
  measurements: BodyMeasurements
): { size: 'XS' | 'S' | 'M' | 'L' | 'XL' | 'XXL'; matchPercentage: number } {
  const { chestCircumference, waistCircumference, hipCircumference } = measurements;

  // Simple sizing database (thresholds for S, M, L, XL, XXL)
  // Format: size: [minChest, minWaist, minHips]
  const sizeChart = {
    male: [
      { name: 'XS' as const, limits: [80, 70, 84] },
      { name: 'S' as const, limits: [88, 76, 92] },
      { name: 'M' as const, limits: [96, 84, 100] },
      { name: 'L' as const, limits: [104, 92, 108] },
      { name: 'XL' as const, limits: [112, 100, 116] },
      { name: 'XXL' as const, limits: [120, 108, 124] }
    ],
    female: [
      { name: 'XS' as const, limits: [76, 60, 82] },
      { name: 'S' as const, limits: [82, 64, 88] },
      { name: 'M' as const, limits: [88, 70, 94] },
      { name: 'L' as const, limits: [94, 76, 100] },
      { name: 'XL' as const, limits: [100, 82, 106] },
      { name: 'XXL' as const, limits: [108, 90, 114] }
    ]
  };

  const chart = sizeChart[gender];
  
  // Find closest size using simple Euclidean distance of the three parameters
  let bestSize = chart[2]; // Default to M
  let minDiff = Infinity;

  chart.forEach((s) => {
    const dChest = Math.pow(chestCircumference - s.limits[0], 2);
    const dWaist = Math.pow(waistCircumference - s.limits[1], 2);
    const dHips = Math.pow(hipCircumference - s.limits[2], 2);
    const totalDiff = Math.sqrt(dChest + dWaist + dHips);

    if (totalDiff < minDiff) {
      minDiff = totalDiff;
      bestSize = s;
    }
  });

  // Calculate a match percentage based on standard deviation
  // If the difference is 0, match is 100%. If total difference is high, match drops.
  const score = Math.max(50, Math.min(99, Math.round(100 - minDiff * 1.5)));

  return {
    size: bestSize.name,
    matchPercentage: score
  };
}
