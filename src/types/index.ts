export type Gender = 'male' | 'female';

export type CalibrationType = 'a4' | 'card' | 'ipd';

export interface UserInput {
  gender: Gender;
  weight: number; // in kg
  calibrationType: CalibrationType;
  customHeight?: number; // optional, for manual height calibration override
}

export interface BodyMeasurements {
  height: number;         // cm
  shoulderWidth: number;  // cm
  armLength: number;      // cm
  legLength: number;      // cm
  chestCircumference: number; // cm
  waistCircumference: number; // cm
  hipCircumference: number;   // cm
}

export interface Landmark {
  id: string;
  name: string;
  x: number; // normalized 0-1 or pixel coordinate
  y: number;
  label: string;
}

export interface SizeRecommendation {
  size: 'XS' | 'S' | 'M' | 'L' | 'XL' | 'XXL';
  matchPercentage: number;
  details: {
    chest: 'tight' | 'fit' | 'loose';
    waist: 'tight' | 'fit' | 'loose';
    hips: 'tight' | 'fit' | 'loose';
  };
}
