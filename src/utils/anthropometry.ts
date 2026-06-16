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

// Average nasion to hip midpoint distance as a ratio of total physical height
export const AVERAGE_NASION_TO_HIP_RATIO = 0.37;

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

  // Cap the minimum height for volume segment calculations to prevent runway circumference values for extremely short inputs (dwarfs)
  const effHeightCm = Math.max(130, heightCm);

  // Torso height segments as fractions of total height
  const chestSegmentHeight = effHeightCm * 0.16; // Chest height is roughly 16% of total height
  const waistSegmentHeight = effHeightCm * 0.10; // Waist segment is roughly 10%
  const hipsSegmentHeight = effHeightCm * 0.12;  // Hip segment is roughly 12%

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
    waist *= 0.98;
    // Hips is typically 22cm larger than waist in standard female charts
    hips = waist + 22.0;
  } else {
    // Males tend to carry visceral fat around the abdomen
    waist *= 1.02;
    // Hips is typically 18cm larger than waist in standard male charts
    hips = waist + 18.0;
  }

  return {
    chest: Math.round(chest * 10) / 10,
    waist: Math.round(waist * 10) / 10,
    hips: Math.round(hips * 10) / 10
  };
}

function getHeightSizeIndex(gender: Gender, heightCm: number, system: 'vietnam' | 'international'): number {
  if (system === 'vietnam') {
    if (gender === 'male') {
      if (heightCm < 160) return 0; // XS
      if (heightCm < 164.5) return 1; // S
      if (heightCm < 169.5) return 2; // M
      if (heightCm < 173.5) return 3; // L
      if (heightCm < 176.5) return 4; // XL
      return 5; // XXL
    } else {
      if (heightCm < 148) return 0; // XS
      if (heightCm < 152.25) return 1; // S
      if (heightCm < 154.75) return 2; // M
      if (heightCm < 157.25) return 3; // L
      if (heightCm < 160.75) return 4; // XL
      return 5; // XXL
    }
  } else {
    if (gender === 'male') {
      if (heightCm < 165) return 0; // XS
      if (heightCm < 172.0) return 1; // S
      if (heightCm < 178.0) return 2; // M
      if (heightCm < 184.0) return 3; // L
      if (heightCm < 190.0) return 4; // XL
      return 5; // XXL
    } else {
      if (heightCm < 155) return 0; // XS
      if (heightCm < 162.0) return 1; // S
      if (heightCm < 168.0) return 2; // M
      if (heightCm < 174.0) return 3; // L
      if (heightCm < 180.0) return 4; // XL
      return 5; // XXL
    }
  }
}

function getWeightSizeIndex(gender: Gender, weightKg: number, system: 'vietnam' | 'international'): number {
  if (system === 'vietnam') {
    if (gender === 'male') {
      if (weightKg < 55) return 0; // XS
      if (weightKg < 60.0) return 1; // S
      if (weightKg < 65.5) return 2; // M
      if (weightKg < 70.5) return 3; // L
      if (weightKg < 76.5) return 4; // XL
      return 5; // XXL
    } else {
      if (weightKg < 38) return 0; // XS
      if (weightKg < 42.5) return 1; // S
      if (weightKg < 47.0) return 2; // M
      if (weightKg < 52.25) return 3; // L
      if (weightKg < 58.25) return 4; // XL
      return 5; // XXL
    }
  } else {
    if (gender === 'male') {
      if (weightKg < 58) return 0; // XS
      if (weightKg < 67.0) return 1; // S
      if (weightKg < 77.0) return 2; // M
      if (weightKg < 87.0) return 3; // L
      if (weightKg < 97.0) return 4; // XL
      return 5; // XXL
    } else {
      if (weightKg < 46) return 0; // XS
      if (weightKg < 54.0) return 1; // S
      if (weightKg < 63.0) return 2; // M
      if (weightKg < 73.0) return 3; // L
      if (weightKg < 83.0) return 4; // XL
      return 5; // XXL
    }
  }
}

export const sizeCharts = {
  vietnam: {
    male: [
      { name: 'XS' as const, limits: [82, 66, 86] },
      { name: 'S' as const, limits: [88, 70, 90] },
      { name: 'M' as const, limits: [92, 74, 94] },
      { name: 'L' as const, limits: [96, 78, 98] },
      { name: 'XL' as const, limits: [100, 82, 102] },
      { name: 'XXL' as const, limits: [104, 86, 106] }
    ],
    female: [
      { name: 'XS' as const, limits: [78, 62, 84] },
      { name: 'S' as const, limits: [82, 66, 88] },
      { name: 'M' as const, limits: [86, 70, 92] },
      { name: 'L' as const, limits: [90, 74, 96] },
      { name: 'XL' as const, limits: [94, 78, 100] },
      { name: 'XXL' as const, limits: [98, 82, 104] }
    ]
  },
  international: {
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
  }
};

/**
 * Gets chest, waist, and hips limits for a specific size name
 */
export function getSizeLimits(
  gender: Gender,
  sizeName: 'XS' | 'S' | 'M' | 'L' | 'XL' | 'XXL',
  sizeSystem: 'vietnam' | 'international' = 'vietnam'
): { chest: number; waist: number; hips: number } {
  const chart = sizeCharts[sizeSystem][gender];
  const sizeObj = chart.find(s => s.name === sizeName) || chart[2];
  return {
    chest: sizeObj.limits[0],
    waist: sizeObj.limits[1],
    hips: sizeObj.limits[2]
  };
}

/**
 * Standard sizes chart helper based on ISO 8559 reference guides and height-weight tables
 */
export function getRecommendedSize(
  gender: Gender,
  measurements: BodyMeasurements,
  sizeSystem: 'vietnam' | 'international' = 'vietnam',
  weightKg?: number
): { size: 'XS' | 'S' | 'M' | 'L' | 'XL' | 'XXL'; matchPercentage: number } {
  const { chestCircumference, waistCircumference, hipCircumference, height } = measurements;
  const chart = sizeCharts[sizeSystem][gender];
  
  // 1. Circumference-based size match using Euclidean distance
  let circSizeIndex = 2; // Default to M
  let minDiff = Infinity;

  chart.forEach((s, idx) => {
    const dChest = Math.pow(chestCircumference - s.limits[0], 2);
    const dWaist = Math.pow(waistCircumference - s.limits[1], 2);
    const dHips = Math.pow(hipCircumference - s.limits[2], 2);
    const totalDiff = Math.sqrt(dChest + dWaist + dHips);

    if (totalDiff < minDiff) {
      minDiff = totalDiff;
      circSizeIndex = idx;
    }
  });

  // 2. Height-based size index
  const heightSizeIndex = getHeightSizeIndex(gender, height, sizeSystem);

  // 3. Weight-based size index (fallback to average weight if not provided)
  const finalWeight = weightKg || (gender === 'female' ? (height - 105) * 0.95 : (height - 100) * 0.9);
  const weightSizeIndex = getWeightSizeIndex(gender, finalWeight, sizeSystem);

  // 4. Combine constraints safely:
  // - Calculate a balanced size index by averaging height index, weight index, and circumference index.
  let finalIndex = Math.round((heightSizeIndex + weightSizeIndex + circSizeIndex) / 3);
  
  // - Length constraints: clothing size shouldn't be too short or too long for their height.
  // Constrain finalIndex to be within [heightSizeIndex - 1, heightSizeIndex + 2]
  const minIndex = Math.max(0, heightSizeIndex - 1);
  const maxIndex = Math.min(chart.length - 1, heightSizeIndex + 2);
  finalIndex = Math.max(minIndex, Math.min(finalIndex, maxIndex));

  const bestSize = chart[finalIndex];

  // 5. Recompute the match percentage based on the final recommended size limits
  const dChest = Math.pow(chestCircumference - bestSize.limits[0], 2);
  const dWaist = Math.pow(waistCircumference - bestSize.limits[1], 2);
  const dHips = Math.pow(hipCircumference - bestSize.limits[2], 2);
  const finalDiff = Math.sqrt(dChest + dWaist + dHips);
  const score = Math.max(50, Math.min(99, Math.round(100 - finalDiff * 1.5)));

  return {
    size: bestSize.name,
    matchPercentage: score
  };
}

/**
 * Formats a height in centimeters to a meter-centimeter representation (e.g. 175.3 -> "1m75", 92 -> "0m92")
 */
export function formatHeightMeters(cm: number): string {
  if (isNaN(cm) || cm <= 0) return '';
  const meters = Math.floor(cm / 100);
  const remainder = Math.round(cm % 100);
  const remainderStr = remainder < 10 ? `0${remainder}` : `${remainder}`;
  return `${meters}m${remainderStr}`;
}
