import React, { useMemo, useEffect, useRef } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls, useGLTF, PerspectiveCamera, Html } from '@react-three/drei';
import { EffectComposer, Bloom } from '@react-three/postprocessing';
import * as THREE from 'three';
import type { Landmark, Gender, BodyMeasurements } from '../types';

// Custom Shader Material for Heatmap Mode (Anatomical Pressure / Fit Tension Map)
const HeatmapShaderMaterial = {
  uniforms: {
    minY: { value: -1.0 },
    maxY: { value: 1.0 }
  },
  vertexShader: `
    varying vec3 vWorldPosition;
    void main() {
      // Calculate world coordinates of the vertex so gradient aligns across sub-meshes
      vWorldPosition = (modelMatrix * vec4(position, 1.0)).xyz;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    uniform float minY;
    uniform float maxY;
    varying vec3 vWorldPosition;

    void main() {
      // Normalize world Y position between minY and maxY bounds of the entire model
      float h = clamp((vWorldPosition.y - minY) / (maxY - minY), 0.0, 1.0);
      
      // Define multi-stop thermal tension map colors
      vec3 colorBlue = vec3(0.01, 0.22, 0.98);   // Blue: Loose fit / low contact
      vec3 colorCyan = vec3(0.00, 0.96, 1.00);   // Cyan: Semi-loose
      vec3 colorYellow = vec3(1.00, 0.78, 0.00); // Yellow: Medium contact / soft drape
      vec3 colorRed = vec3(0.95, 0.08, 0.08);    // Red: Tight fit / high pressure (chest/shoulders/hip curves)
      
      vec3 finalColor;
      
      if (h < 0.15) {
        // Feet: Cool blue
        finalColor = colorBlue;
      } else if (h < 0.32) {
        // Calves/Legs: Blue to Cyan (low tension)
        finalColor = mix(colorBlue, colorCyan, (h - 0.15) / 0.17);
      } else if (h < 0.48) {
        // Thighs to Hips/Glutes: Cyan to Red (high tension fit zone)
        finalColor = mix(colorCyan, colorRed, (h - 0.32) / 0.16);
      } else if (h < 0.60) {
        // Waist/Stomach: Red back to Yellow (looser drape zone)
        finalColor = mix(colorRed, colorYellow, (h - 0.48) / 0.12);
      } else if (h < 0.78) {
        // Chest/Bust and Shoulders: Yellow to Red (high tension drape zone)
        finalColor = mix(colorYellow, colorRed, (h - 0.60) / 0.18);
      } else if (h < 0.86) {
        // Neck: Red back to Blue (very quick cool down)
        finalColor = mix(colorRed, colorBlue, (h - 0.78) / 0.08);
      } else {
        // Head: Cool blue (zero garment contact)
        finalColor = colorBlue;
      }
      
      gl_FragColor = vec4(finalColor, 0.82);
    }
  `
};

interface ModelProps {
  path: string;
  viewMode: 'solid' | 'neon' | 'heatmap';
  gender: Gender;
  weight: number;
  measurements?: BodyMeasurements;
  rotationAngle?: number;
  onClickModel?: (point: THREE.Vector3) => void;
  showLabels?: boolean;
}

const Model: React.FC<ModelProps> = ({ path, viewMode, gender, weight, measurements, rotationAngle = 0, onClickModel, showLabels = true }) => {
  const { scene } = useGLTF(path);
  
  // Clone the scene to render the neon wireframe grid overlay on top of the solid body
  const wireframeScene = useMemo(() => {
    return scene.clone();
  }, [scene]);

  // Calculate bounding box of the scene to find vertical bounds and center offset dynamically
  const { bounds, centerOffset } = useMemo(() => {
    const box = new THREE.Box3().setFromObject(scene);
    const size = new THREE.Vector3();
    box.getSize(size);
    
    const center = new THREE.Vector3();
    box.getCenter(center);
    
    // Offset to center the model geometry precisely at origin [0, 0, 0] on all axes
    const offset = new THREE.Vector3(-center.x, -center.y, -center.z);
    
    console.log(`[MODEL DEBUG] path="${path}" size=${JSON.stringify(size)} min=${JSON.stringify(box.min)} max=${JSON.stringify(box.max)} offset=${JSON.stringify(offset)}`);
    return {
      bounds: { min: -size.y / 2, max: size.y / 2 },
      centerOffset: offset
    };
  }, [scene, path]);

  // Create materials for Sci-Fi Hologram style (Ocean Blue + Cyan Neon grid)
  const solidMaterial = useMemo(() => {
    return new THREE.MeshBasicMaterial({
      color: new THREE.Color('#0ea5e9'), // Brighter glowing cyber sky blue
      transparent: true,
      opacity: 0.55,
      side: THREE.DoubleSide,
      depthWrite: true
    });
  }, []);

  const neonMaterial = useMemo(() => {
    return new THREE.MeshBasicMaterial({
      wireframe: true,
      color: new THREE.Color('#00f5ff'), // Bright glowing electric cyan neon grid
      transparent: true,
      opacity: 0.85,
      side: THREE.DoubleSide,
      depthWrite: false
    });
  }, []);

  const heatmapMaterial = useMemo(() => {
    return new THREE.ShaderMaterial({
      uniforms: {
        minY: { value: bounds.min },
        maxY: { value: bounds.max }
      },
      vertexShader: HeatmapShaderMaterial.vertexShader,
      fragmentShader: HeatmapShaderMaterial.fragmentShader,
      transparent: true,
      depthWrite: true,
      side: THREE.DoubleSide
    });
  }, [bounds]);

  // Apply materials dynamically to both base body and wireframe scene
  useEffect(() => {
    // 1. Traverse base body scene
    scene.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        if (viewMode === 'heatmap') {
          child.visible = true;
          child.material = heatmapMaterial;
        } else if (viewMode === 'solid') {
          child.visible = true;
          child.material = solidMaterial;
        } else {
          // 'neon' mode: hide base solid body!
          child.visible = false;
        }
      }
    });

    // 2. Traverse wireframe overlay scene
    wireframeScene.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        if (viewMode === 'heatmap') {
          child.visible = false;
        } else if (viewMode === 'solid') {
          child.visible = false;
        } else {
          // 'neon' mode: show neon grid!
          child.visible = true;
          child.material = neonMaterial;
        }
      }
    });
  }, [scene, wireframeScene, viewMode, solidMaterial, neonMaterial, heatmapMaterial]);

  // Dynamic Y-scale adjustment for heatmap based on heightScale
  useEffect(() => {
    if (heatmapMaterial && heatmapMaterial.uniforms) {
      const heightVal = measurements?.height || 165;
      const heightScale = (heightVal / 165) * 0.72;
      heatmapMaterial.uniforms.minY.value = bounds.min * heightScale;
      heatmapMaterial.uniforms.maxY.value = bounds.max * heightScale;
    }
  }, [heatmapMaterial, bounds, measurements?.height]);

  // Apply Y-rotation (supporting front/side view angle and breathing rotation effect)
  const meshRef = useRef<THREE.Group>(null);
  useFrame((state) => {
    if (meshRef.current) {
      const genderOffset = gender === 'female' ? Math.PI : 0;
      const baseRotationY = (rotationAngle * Math.PI) / 180;
      meshRef.current.rotation.y = genderOffset + baseRotationY + Math.sin(state.clock.getElapsedTime() * 0.3) * 0.12;
    }
  });

  // Scale model height by height factor (cm), and width/depth by weight
  const scale = useMemo(() => {
    const baseWeight = gender === 'female' ? 52 : 65;
    const weightFactor = Math.max(0.75, Math.min(1.45, weight / baseWeight));
    
    // Scale height based on physical height in cm (relative to baseline 165cm)
    const heightVal = measurements?.height || 165;
    const heightScale = heightVal / 165;
    
    return [weightFactor * 0.72, heightScale * 0.72, weightFactor * 0.72] as [number, number, number];
  }, [gender, weight, measurements]);

  // Derived measurement values
  const neckVal = measurements?.chestCircumference ? (measurements.chestCircumference * (gender === 'female' ? 0.38 : 0.41)).toFixed(1) : '36.0';
  const shoulderVal = measurements?.shoulderWidth ? measurements.shoulderWidth.toFixed(1) : '44.0';
  const chestVal = measurements?.chestCircumference ? measurements.chestCircumference.toFixed(1) : '90.0';
  const hipsVal = measurements?.hipCircumference ? measurements.hipCircumference.toFixed(1) : '95.0';
  const armVal = measurements?.armLength ? measurements.armLength.toFixed(1) : '60.0';
  const legVal = measurements?.legLength ? measurements.legLength.toFixed(1) : '80.0';
  const thighVal = measurements?.hipCircumference ? (measurements.hipCircumference * (gender === 'female' ? 0.58 : 0.55)).toFixed(1) : '55.0';
  const calfVal = measurements?.hipCircumference ? (measurements.hipCircumference * 0.38).toFixed(1) : '36.0';

  // Gender-specific optimized anatomical anchor coordinates (relative to feet Y = 0 origin inside the group)
  const neckPos     = useMemo(() => [gender === 'female' ? -0.07 : -0.08, gender === 'female' ? 1.38 : 1.60, 0] as [number, number, number], [gender]);
  const shoulderPos = useMemo(() => [gender === 'female' ? 0.18 : 0.22, gender === 'female' ? 1.30 : 1.50, 0] as [number, number, number], [gender]);
  const chestPos    = useMemo(() => [gender === 'female' ? 0.14 : 0.16, gender === 'female' ? 1.20 : 1.40, 0] as [number, number, number], [gender]);
  const waistPos    = useMemo(() => [gender === 'female' ? -0.12 : -0.14, gender === 'female' ? 0.98 : 1.15, 0] as [number, number, number], [gender]);
  const hipsPos     = useMemo(() => [gender === 'female' ? 0.17 : 0.18, gender === 'female' ? 0.80 : 0.95, 0] as [number, number, number], [gender]);
  const armPos      = useMemo(() => [gender === 'female' ? 0.24 : 0.28, gender === 'female' ? 1.10 : 1.28, 0] as [number, number, number], [gender]);
  const legPos      = useMemo(() => [gender === 'female' ? 0.11 : 0.12, gender === 'female' ? 0.72 : 0.85, 0] as [number, number, number], [gender]);
  const thighPos    = useMemo(() => [gender === 'female' ? -0.13 : -0.15, gender === 'female' ? 0.62 : 0.75, 0] as [number, number, number], [gender]);
  const calfPos     = useMemo(() => [gender === 'female' ? -0.11 : -0.13, gender === 'female' ? 0.38 : 0.46, 0] as [number, number, number], [gender]);
  const waistUpperPos = useMemo(() => [gender === 'female' ? 0.12 : 0.14, gender === 'female' ? 1.05 : 1.22, 0] as [number, number, number], [gender]);

  const jointDots = useMemo(() => [
    { id: 'nasion', label: 'Góc Mũi', pos: [0, gender === 'female' ? 1.48 : 1.70, 0.08] },
    { id: 'l_shoulder', label: 'Vai Trái', pos: [gender === 'female' ? -0.18 : -0.22, gender === 'female' ? 1.30 : 1.50, 0] },
    { id: 'r_shoulder', label: 'Vai Phải', pos: [gender === 'female' ? 0.18 : 0.22, gender === 'female' ? 1.30 : 1.50, 0] },
    { id: 'l_elbow', label: 'Khuỷu Trái', pos: [gender === 'female' ? -0.26 : -0.32, gender === 'female' ? 1.05 : 1.20, 0] },
    { id: 'r_elbow', label: 'Khuỷu Phải', pos: [gender === 'female' ? 0.26 : 0.32, gender === 'female' ? 1.05 : 1.20, 0] },
    { id: 'l_wrist', label: 'Cổ Trái', pos: [gender === 'female' ? -0.32 : -0.38, gender === 'female' ? 0.80 : 0.92, 0] },
    { id: 'r_wrist', label: 'Cổ Phải', pos: [gender === 'female' ? 0.32 : 0.38, gender === 'female' ? 0.80 : 0.92, 0] },
    { id: 'l_hip', label: 'Hông Trái', pos: [gender === 'female' ? -0.13 : -0.16, gender === 'female' ? 0.80 : 0.95, 0] },
    { id: 'r_hip', label: 'Hông Phải', pos: [gender === 'female' ? 0.13 : 0.16, gender === 'female' ? 0.80 : 0.95, 0] },
    { id: 'l_knee', label: 'Gối Trái', pos: [gender === 'female' ? -0.12 : -0.14, gender === 'female' ? 0.48 : 0.58, 0] },
    { id: 'r_knee', label: 'Gối Phải', pos: [gender === 'female' ? 0.12 : 0.14, gender === 'female' ? 0.48 : 0.58, 0] },
    { id: 'l_ankle', label: 'Cổ Chân Trái', pos: [gender === 'female' ? -0.10 : -0.12, gender === 'female' ? 0.15 : 0.18, 0] },
    { id: 'r_ankle', label: 'Cổ Chân Phải', pos: [gender === 'female' ? 0.10 : 0.12, gender === 'female' ? 0.15 : 0.18, 0] },
  ], [gender]);

  // Apply default rotation to primitive scene contents
  useEffect(() => {
    if (scene) scene.rotation.set(0, 0, 0);
    if (wireframeScene) wireframeScene.rotation.set(0, 0, 0);
  }, [scene, wireframeScene]);

  return (
    <group ref={meshRef} scale={scale}>
      <group position={[centerOffset.x, centerOffset.y, centerOffset.z]}>
        {/* Base solid translucent body */}
        <primitive 
          object={scene} 
          onClick={(e: any) => {
            e.stopPropagation();
            if (e.point && onClickModel) {
              onClickModel(e.point);
            }
          }}
        />

        {/* Grid overlay wireframe centered */}
        {viewMode === 'neon' && (
          <primitive object={wireframeScene} />
        )}

        {/* Dynamic HTML HUD overlays positioned relative to approximate body coordinates */}
        {measurements && showLabels && (
          <>
            {/* 13 skeletal joint dots from Image 1 */}
            {jointDots.map((joint) => (
              <Html key={joint.id} position={joint.pos as [number, number, number]} style={{ pointerEvents: 'none' }} zIndexRange={[1, 4]}>
                <div style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  transform: 'translate(-50%, -50%)',
                  fontFamily: 'system-ui, -apple-system, sans-serif'
                }}>
                  <div style={{
                    width: '10px',
                    height: '10px',
                    border: '1px solid rgba(34, 211, 238, 0.85)',
                    borderRadius: '50%',
                    position: 'absolute',
                    animation: 'jointPulse 2.0s infinite ease-in-out',
                    pointerEvents: 'none'
                  }} />
                  <div style={{
                    width: '5px',
                    height: '5px',
                    background: '#ffffff',
                    border: '1px solid #22d3ee',
                    borderRadius: '50%',
                    boxShadow: '0 0 8px #22d3ee',
                    zIndex: 2
                  }} />
                  <div style={{
                    marginTop: '4px',
                    background: 'rgba(15, 23, 42, 0.75)',
                    border: '1.2px solid rgba(6, 182, 212, 0.4)',
                    borderRadius: '3px',
                    padding: '1.5px 3.5px',
                    whiteSpace: 'nowrap',
                    color: '#e2e8f0',
                    fontSize: '6.5px',
                    fontWeight: 600,
                    letterSpacing: '0.02em',
                    boxShadow: '0 2px 4px rgba(0, 0, 0, 0.3)'
                  }}>
                    {joint.label}
                  </div>
                </div>
              </Html>
            ))}

            {/* LEFT SIDE LABELS */}

            {/* Cổ (Neck) */}
            <Html position={neckPos} style={{ pointerEvents: 'none' }} zIndexRange={[1, 5]}>
              <div style={{
                position: 'relative',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'flex-end',
                width: '0px',
                height: '0px',
                fontFamily: 'system-ui, -apple-system, sans-serif'
              }}>
                <svg width="80" height="2" style={{ position: 'absolute', right: '0px', top: '0px', overflow: 'visible', pointerEvents: 'none' }}>
                  <line x1="0" y1="1" x2="80" y2="1" stroke="rgba(6, 182, 212, 0.6)" strokeWidth="1.2" strokeDasharray="3,3" />
                </svg>
                <div style={{ width: '6px', height: '6px', background: '#22d3ee', borderRadius: '50%', boxShadow: '0 0 8px #22d3ee', position: 'absolute', left: '-3px', top: '-3px', zIndex: 10 }} />
                <div style={{ width: '14px', height: '14px', border: '1.2px solid rgba(34, 211, 238, 0.8)', borderRadius: '50%', position: 'absolute', left: '-7px', top: '-7px', animation: 'jointPulse 2.0s infinite ease-in-out', pointerEvents: 'none' }} />
                <div style={{
                  position: 'absolute',
                  right: '80px',
                  transform: 'translateY(-50%)',
                  background: 'rgba(15, 23, 42, 0.85)',
                  border: '1.2px solid rgba(6, 182, 212, 0.45)',
                  borderRadius: '5px',
                  padding: '5px 9px',
                  whiteSpace: 'nowrap',
                  boxShadow: '0 4px 12px rgba(0, 0, 0, 0.35)',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'flex-end',
                  gap: '1px',
                  pointerEvents: 'auto'
                }}>
                  <span style={{ fontSize: '7.5px', fontWeight: 700, color: '#22d3ee', letterSpacing: '0.04em' }}>cổ</span>
                  <span style={{ fontSize: '10.5px', fontWeight: 800, color: '#ffffff' }}>{neckVal} cm</span>
                </div>
              </div>
            </Html>

            {/* Ngực (Chest) */}
            <Html position={chestPos} style={{ pointerEvents: 'none' }} zIndexRange={[1, 5]}>
              <div style={{
                position: 'relative',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'flex-end',
                width: '0px',
                height: '0px',
                fontFamily: 'system-ui, -apple-system, sans-serif'
              }}>
                <svg width="80" height="2" style={{ position: 'absolute', right: '0px', top: '0px', overflow: 'visible', pointerEvents: 'none' }}>
                  <line x1="0" y1="1" x2="80" y2="1" stroke="rgba(6, 182, 212, 0.6)" strokeWidth="1.2" strokeDasharray="3,3" />
                </svg>
                <div style={{ width: '6px', height: '6px', background: '#22d3ee', borderRadius: '50%', boxShadow: '0 0 8px #22d3ee', position: 'absolute', left: '-3px', top: '-3px', zIndex: 10 }} />
                <div style={{ width: '14px', height: '14px', border: '1.2px solid rgba(34, 211, 238, 0.8)', borderRadius: '50%', position: 'absolute', left: '-7px', top: '-7px', animation: 'jointPulse 2.0s infinite ease-in-out', pointerEvents: 'none' }} />
                <div style={{
                  position: 'absolute',
                  right: '80px',
                  transform: 'translateY(-50%)',
                  background: 'rgba(15, 23, 42, 0.85)',
                  border: '1.2px solid rgba(6, 182, 212, 0.45)',
                  borderRadius: '5px',
                  padding: '5px 9px',
                  whiteSpace: 'nowrap',
                  boxShadow: '0 4px 12px rgba(0, 0, 0, 0.35)',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'flex-end',
                  gap: '1px',
                  pointerEvents: 'auto'
                }}>
                  <span style={{ fontSize: '7.5px', fontWeight: 700, color: '#22d3ee', letterSpacing: '0.04em' }}>NGỰC</span>
                  <span style={{ fontSize: '10.5px', fontWeight: 800, color: '#ffffff' }}>{chestVal} cm</span>
                </div>
              </div>
            </Html>

            {/* Eo dưới (Lower Waist) */}
            <Html position={waistPos} style={{ pointerEvents: 'none' }} zIndexRange={[1, 5]}>
              <div style={{
                position: 'relative',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'flex-end',
                width: '0px',
                height: '0px',
                fontFamily: 'system-ui, -apple-system, sans-serif'
              }}>
                <svg width="80" height="2" style={{ position: 'absolute', right: '0px', top: '0px', overflow: 'visible', pointerEvents: 'none' }}>
                  <line x1="0" y1="1" x2="80" y2="1" stroke="rgba(6, 182, 212, 0.6)" strokeWidth="1.2" strokeDasharray="3,3" />
                </svg>
                <div style={{ width: '6px', height: '6px', background: '#22d3ee', borderRadius: '50%', boxShadow: '0 0 8px #22d3ee', position: 'absolute', left: '-3px', top: '-3px', zIndex: 10 }} />
                <div style={{ width: '14px', height: '14px', border: '1.2px solid rgba(34, 211, 238, 0.8)', borderRadius: '50%', position: 'absolute', left: '-7px', top: '-7px', animation: 'jointPulse 2.0s infinite ease-in-out', pointerEvents: 'none' }} />
                <div style={{
                  position: 'absolute',
                  right: '80px',
                  transform: 'translateY(-50%)',
                  background: 'rgba(15, 23, 42, 0.85)',
                  border: '1.2px solid rgba(6, 182, 212, 0.45)',
                  borderRadius: '5px',
                  padding: '5px 9px',
                  whiteSpace: 'nowrap',
                  boxShadow: '0 4px 12px rgba(0, 0, 0, 0.35)',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'flex-end',
                  gap: '1px',
                  pointerEvents: 'auto'
                }}>
                  <span style={{ fontSize: '7.5px', fontWeight: 700, color: '#22d3ee', letterSpacing: '0.04em' }}>EO DƯỚI</span>
                  <span style={{ fontSize: '10.5px', fontWeight: 800, color: '#ffffff' }}>{(measurements?.waistCircumference ? (measurements.waistCircumference * 1.05).toFixed(1) : '73.5')} cm</span>
                </div>
              </div>
            </Html>

            {/* Đùi phải (Right Thigh) */}
            <Html position={thighPos} style={{ pointerEvents: 'none' }} zIndexRange={[1, 5]}>
              <div style={{
                position: 'relative',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'flex-end',
                width: '0px',
                height: '0px',
                fontFamily: 'system-ui, -apple-system, sans-serif'
              }}>
                <svg width="80" height="2" style={{ position: 'absolute', right: '0px', top: '0px', overflow: 'visible', pointerEvents: 'none' }}>
                  <line x1="0" y1="1" x2="80" y2="1" stroke="rgba(6, 182, 212, 0.6)" strokeWidth="1.2" strokeDasharray="3,3" />
                </svg>
                <div style={{ width: '6px', height: '6px', background: '#22d3ee', borderRadius: '50%', boxShadow: '0 0 8px #22d3ee', position: 'absolute', left: '-3px', top: '-3px', zIndex: 10 }} />
                <div style={{ width: '14px', height: '14px', border: '1.2px solid rgba(34, 211, 238, 0.8)', borderRadius: '50%', position: 'absolute', left: '-7px', top: '-7px', animation: 'jointPulse 2.0s infinite ease-in-out', pointerEvents: 'none' }} />
                <div style={{
                  position: 'absolute',
                  right: '80px',
                  transform: 'translateY(-50%)',
                  background: 'rgba(15, 23, 42, 0.85)',
                  border: '1.2px solid rgba(6, 182, 212, 0.45)',
                  borderRadius: '5px',
                  padding: '5px 9px',
                  whiteSpace: 'nowrap',
                  boxShadow: '0 4px 12px rgba(0, 0, 0, 0.35)',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'flex-end',
                  gap: '1px',
                  pointerEvents: 'auto'
                }}>
                  <span style={{ fontSize: '7.5px', fontWeight: 700, color: '#22d3ee', letterSpacing: '0.04em' }}>ĐÙI PHẢI</span>
                  <span style={{ fontSize: '10.5px', fontWeight: 800, color: '#ffffff' }}>{thighVal} cm</span>
                </div>
              </div>
            </Html>

            {/* Bắp chân phải (Right Calf) */}
            <Html position={calfPos} style={{ pointerEvents: 'none' }} zIndexRange={[1, 5]}>
              <div style={{
                position: 'relative',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'flex-end',
                width: '0px',
                height: '0px',
                fontFamily: 'system-ui, -apple-system, sans-serif'
              }}>
                <svg width="80" height="2" style={{ position: 'absolute', right: '0px', top: '0px', overflow: 'visible', pointerEvents: 'none' }}>
                  <line x1="0" y1="1" x2="80" y2="1" stroke="rgba(6, 182, 212, 0.6)" strokeWidth="1.2" strokeDasharray="3,3" />
                </svg>
                <div style={{ width: '6px', height: '6px', background: '#22d3ee', borderRadius: '50%', boxShadow: '0 0 8px #22d3ee', position: 'absolute', left: '-3px', top: '-3px', zIndex: 10 }} />
                <div style={{ width: '14px', height: '14px', border: '1.2px solid rgba(34, 211, 238, 0.8)', borderRadius: '50%', position: 'absolute', left: '-7px', top: '-7px', animation: 'jointPulse 2.0s infinite ease-in-out', pointerEvents: 'none' }} />
                <div style={{
                  position: 'absolute',
                  right: '80px',
                  transform: 'translateY(-50%)',
                  background: 'rgba(15, 23, 42, 0.85)',
                  border: '1.2px solid rgba(6, 182, 212, 0.45)',
                  borderRadius: '5px',
                  padding: '5px 9px',
                  whiteSpace: 'nowrap',
                  boxShadow: '0 4px 12px rgba(0, 0, 0, 0.35)',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'flex-end',
                  gap: '1px',
                  pointerEvents: 'auto'
                }}>
                  <span style={{ fontSize: '7.5px', fontWeight: 700, color: '#22d3ee', letterSpacing: '0.04em' }}>BẮP CHÂN PHẢI</span>
                  <span style={{ fontSize: '10.5px', fontWeight: 800, color: '#ffffff' }}>{calfVal} cm</span>
                </div>
              </div>
            </Html>

            {/* RIGHT SIDE LABELS */}

            {/* Rộng vai (Shoulder Width) */}
            <Html position={shoulderPos} style={{ pointerEvents: 'none' }} zIndexRange={[1, 5]}>
              <div style={{
                position: 'relative',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'flex-start',
                width: '0px',
                height: '0px',
                fontFamily: 'system-ui, -apple-system, sans-serif'
              }}>
                <svg width="80" height="2" style={{ position: 'absolute', left: '0px', top: '0px', overflow: 'visible', pointerEvents: 'none' }}>
                  <line x1="0" y1="1" x2="80" y2="1" stroke="rgba(245, 158, 11, 0.6)" strokeWidth="1.2" strokeDasharray="3,3" />
                </svg>
                <div style={{ width: '6px', height: '6px', background: '#fbbf24', borderRadius: '50%', boxShadow: '0 0 8px #fbbf24', position: 'absolute', left: '-3px', top: '-3px', zIndex: 10 }} />
                <div style={{ width: '14px', height: '14px', border: '1.2px solid rgba(251, 191, 36, 0.8)', borderRadius: '50%', position: 'absolute', left: '-7px', top: '-7px', animation: 'jointPulse 2.0s infinite ease-in-out', pointerEvents: 'none' }} />
                <div style={{
                  position: 'absolute',
                  left: '80px',
                  transform: 'translateY(-50%)',
                  background: 'rgba(15, 23, 42, 0.85)',
                  border: '1.2px solid rgba(245, 158, 11, 0.45)',
                  borderRadius: '5px',
                  padding: '5px 9px',
                  whiteSpace: 'nowrap',
                  boxShadow: '0 4px 12px rgba(0, 0, 0, 0.35)',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'flex-start',
                  gap: '1px',
                  pointerEvents: 'auto'
                }}>
                  <span style={{ fontSize: '7.5px', fontWeight: 700, color: '#f59e0b', letterSpacing: '0.04em' }}>RỘNG VAI</span>
                  <span style={{ fontSize: '10.5px', fontWeight: 800, color: '#ffffff' }}>{shoulderVal} cm</span>
                </div>
              </div>
            </Html>

            {/* Eo trên (Upper Waist) */}
            <Html position={waistUpperPos} style={{ pointerEvents: 'none' }} zIndexRange={[1, 5]}>
              <div style={{
                position: 'relative',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'flex-start',
                width: '0px',
                height: '0px',
                fontFamily: 'system-ui, -apple-system, sans-serif'
              }}>
                <svg width="80" height="2" style={{ position: 'absolute', left: '0px', top: '0px', overflow: 'visible', pointerEvents: 'none' }}>
                  <line x1="0" y1="1" x2="80" y2="1" stroke="rgba(245, 158, 11, 0.6)" strokeWidth="1.2" strokeDasharray="3,3" />
                </svg>
                <div style={{ width: '6px', height: '6px', background: '#fbbf24', borderRadius: '50%', boxShadow: '0 0 8px #fbbf24', position: 'absolute', left: '-3px', top: '-3px', zIndex: 10 }} />
                <div style={{ width: '14px', height: '14px', border: '1.2px solid rgba(251, 191, 36, 0.8)', borderRadius: '50%', position: 'absolute', left: '-7px', top: '-7px', animation: 'jointPulse 2.0s infinite ease-in-out', pointerEvents: 'none' }} />
                <div style={{
                  position: 'absolute',
                  left: '80px',
                  transform: 'translateY(-50%)',
                  background: 'rgba(15, 23, 42, 0.85)',
                  border: '1.2px solid rgba(245, 158, 11, 0.45)',
                  borderRadius: '5px',
                  padding: '5px 9px',
                  whiteSpace: 'nowrap',
                  boxShadow: '0 4px 12px rgba(0, 0, 0, 0.35)',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'flex-start',
                  gap: '1px',
                  pointerEvents: 'auto'
                }}>
                  <span style={{ fontSize: '7.5px', fontWeight: 700, color: '#f59e0b', letterSpacing: '0.04em' }}>EO TRÊN</span>
                  <span style={{ fontSize: '10.5px', fontWeight: 800, color: '#ffffff' }}>{(measurements?.waistCircumference ? (measurements.waistCircumference * 0.96).toFixed(1) : '67.2')} cm</span>
                </div>
              </div>
            </Html>

            {/* Dài tay (Arm Length) */}
            <Html position={armPos} style={{ pointerEvents: 'none' }} zIndexRange={[1, 5]}>
              <div style={{
                position: 'relative',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'flex-start',
                width: '0px',
                height: '0px',
                fontFamily: 'system-ui, -apple-system, sans-serif'
              }}>
                <svg width="80" height="2" style={{ position: 'absolute', left: '0px', top: '0px', overflow: 'visible', pointerEvents: 'none' }}>
                  <line x1="0" y1="1" x2="80" y2="1" stroke="rgba(245, 158, 11, 0.6)" strokeWidth="1.2" strokeDasharray="3,3" />
                </svg>
                <div style={{ width: '6px', height: '6px', background: '#fbbf24', borderRadius: '50%', boxShadow: '0 0 8px #fbbf24', position: 'absolute', left: '-3px', top: '-3px', zIndex: 10 }} />
                <div style={{ width: '14px', height: '14px', border: '1.2px solid rgba(251, 191, 36, 0.8)', borderRadius: '50%', position: 'absolute', left: '-7px', top: '-7px', animation: 'jointPulse 2.0s infinite ease-in-out', pointerEvents: 'none' }} />
                <div style={{
                  position: 'absolute',
                  left: '80px',
                  transform: 'translateY(-50%)',
                  background: 'rgba(15, 23, 42, 0.85)',
                  border: '1.2px solid rgba(245, 158, 11, 0.45)',
                  borderRadius: '5px',
                  padding: '5px 9px',
                  whiteSpace: 'nowrap',
                  boxShadow: '0 4px 12px rgba(0, 0, 0, 0.35)',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'flex-start',
                  gap: '1px',
                  pointerEvents: 'auto'
                }}>
                  <span style={{ fontSize: '7.5px', fontWeight: 700, color: '#f59e0b', letterSpacing: '0.04em' }}>DÀI TAY</span>
                  <span style={{ fontSize: '10.5px', fontWeight: 800, color: '#ffffff' }}>{armVal} cm</span>
                </div>
              </div>
            </Html>

            {/* Mông (Hips) */}
            <Html position={hipsPos} style={{ pointerEvents: 'none' }} zIndexRange={[1, 5]}>
              <div style={{
                position: 'relative',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'flex-start',
                width: '0px',
                height: '0px',
                fontFamily: 'system-ui, -apple-system, sans-serif'
              }}>
                <svg width="80" height="2" style={{ position: 'absolute', left: '0px', top: '0px', overflow: 'visible', pointerEvents: 'none' }}>
                  <line x1="0" y1="1" x2="80" y2="1" stroke="rgba(245, 158, 11, 0.6)" strokeWidth="1.2" strokeDasharray="3,3" />
                </svg>
                <div style={{ width: '6px', height: '6px', background: '#fbbf24', borderRadius: '50%', boxShadow: '0 0 8px #fbbf24', position: 'absolute', left: '-3px', top: '-3px', zIndex: 10 }} />
                <div style={{ width: '14px', height: '14px', border: '1.2px solid rgba(251, 191, 36, 0.8)', borderRadius: '50%', position: 'absolute', left: '-7px', top: '-7px', animation: 'jointPulse 2.0s infinite ease-in-out', pointerEvents: 'none' }} />
                <div style={{
                  position: 'absolute',
                  left: '80px',
                  transform: 'translateY(-50%)',
                  background: 'rgba(15, 23, 42, 0.85)',
                  border: '1.2px solid rgba(245, 158, 11, 0.45)',
                  borderRadius: '5px',
                  padding: '5px 9px',
                  whiteSpace: 'nowrap',
                  boxShadow: '0 4px 12px rgba(0, 0, 0, 0.35)',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'flex-start',
                  gap: '1px',
                  pointerEvents: 'auto'
                }}>
                  <span style={{ fontSize: '7.5px', fontWeight: 700, color: '#f59e0b', letterSpacing: '0.04em' }}>MÔNG</span>
                  <span style={{ fontSize: '10.5px', fontWeight: 800, color: '#ffffff' }}>{hipsVal} cm</span>
                </div>
              </div>
            </Html>

            {/* Dài chân (Leg Length) */}
            <Html position={legPos} style={{ pointerEvents: 'none' }} zIndexRange={[1, 5]}>
              <div style={{
                position: 'relative',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'flex-start',
                width: '0px',
                height: '0px',
                fontFamily: 'system-ui, -apple-system, sans-serif'
              }}>
                <svg width="80" height="2" style={{ position: 'absolute', left: '0px', top: '0px', overflow: 'visible', pointerEvents: 'none' }}>
                  <line x1="0" y1="1" x2="80" y2="1" stroke="rgba(245, 158, 11, 0.6)" strokeWidth="1.2" strokeDasharray="3,3" />
                </svg>
                <div style={{ width: '6px', height: '6px', background: '#fbbf24', borderRadius: '50%', boxShadow: '0 0 8px #fbbf24', position: 'absolute', left: '-3px', top: '-3px', zIndex: 10 }} />
                <div style={{ width: '14px', height: '14px', border: '1.2px solid rgba(251, 191, 36, 0.8)', borderRadius: '50%', position: 'absolute', left: '-7px', top: '-7px', animation: 'jointPulse 2.0s infinite ease-in-out', pointerEvents: 'none' }} />
                <div style={{
                  position: 'absolute',
                  left: '80px',
                  transform: 'translateY(-50%)',
                  background: 'rgba(15, 23, 42, 0.85)',
                  border: '1.2px solid rgba(245, 158, 11, 0.45)',
                  borderRadius: '5px',
                  padding: '5px 9px',
                  whiteSpace: 'nowrap',
                  boxShadow: '0 4px 12px rgba(0, 0, 0, 0.35)',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'flex-start',
                  gap: '1px',
                  pointerEvents: 'auto'
                }}>
                  <span style={{ fontSize: '7.5px', fontWeight: 700, color: '#f59e0b', letterSpacing: '0.04em' }}>DÀI CHÂN</span>
                  <span style={{ fontSize: '10.5px', fontWeight: 800, color: '#ffffff' }}>{legVal} cm</span>
                </div>
              </div>
            </Html>
          </>
        )}
      </group>
    </group>
  );
};

// Custom scanner laser effect overlay plane
const HologramScannerBeam: React.FC = () => {
  const meshRef = useRef<THREE.Mesh>(null);
  
  useFrame((state) => {
    if (meshRef.current) {
      meshRef.current.position.y = Math.sin(state.clock.getElapsedTime() * 1.5) * 1.3;
    }
  });

  return (
    <mesh ref={meshRef} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]}>
      <planeGeometry args={[3, 3]} />
      <meshBasicMaterial 
        color="#00ffff" 
        transparent 
        opacity={0.12} 
        side={THREE.DoubleSide}
        depthWrite={false}
      />
    </mesh>
  );
};

// Model Loader Error Boundary for graceful fallback to female base model
class ModelErrorBoundary extends React.Component<any, { hasError: boolean }> {
  constructor(props: any) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: any, errorInfo: any) {
    console.error('[ModelErrorBoundary] error:', error, errorInfo);
  }

  componentDidUpdate(prevProps: any) {
    if (prevProps.path !== this.props.path) {
      if (this.state.hasError) {
        this.setState({ hasError: false });
      }
    }
  }

  render() {
    if (this.state.hasError) {
      return (
        <Model 
          path={this.props.fallbackPath} 
          viewMode={this.props.viewMode} 
          gender="female"
          weight={this.props.weight}
          measurements={this.props.measurements} 
          rotationAngle={this.props.rotationAngle}
          onClickModel={this.props.onClickModel}
        />
      );
    }
    return React.Children.map(this.props.children, child => {
      if (React.isValidElement(child)) {
        return React.cloneElement(child, { onClickModel: this.props.onClickModel } as any);
      }
      return child;
    });
  }
}

// Camera controller helper for smooth click-to-focus target animation
const CameraController: React.FC<{
  targetPoint: React.RefObject<THREE.Vector3>;
  controlsRef: React.RefObject<any>;
  interactive: boolean;
}> = ({ targetPoint, controlsRef, interactive }) => {
  const { camera } = useThree();
  useFrame(() => {
    if (interactive) {
      if (controlsRef.current && targetPoint.current) {
        controlsRef.current.target.lerp(targetPoint.current, 0.12);
        controlsRef.current.update();
      }
    } else {
      // Locked level front/side view, matching SVG templates exactly
      camera.position.set(0, -0.07, 4.05);
      camera.lookAt(0, -0.07, 0);
    }
  });
  return null;
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
  cameraResetCounter?: number;
  showLabels?: boolean;
  interactive?: boolean;
}

export const Mannequin3DView: React.FC<Mannequin3DViewProps> = ({
  gender,
  weight,
  meshStyle = 'solid',
  measurements,
  rotationAngle = 0,
  cameraResetCounter = 0,
  showLabels = true,
  interactive = true
}) => {
  const modelPath = gender === 'male' ? '/models/low_poly_male_base_-_slender.glb' : '/models/female_base_mesh.glb';
  const fallbackPath = '/models/female_base_mesh.glb';

  // Refs for camera focus target interpolation (default slightly lower at Y = -0.15 to shift model up)
  const controlsRef = useRef<any>(null);
  const targetPoint = useRef(new THREE.Vector3(0, -0.15, 0));

  // Reset camera view when counter changes
  useEffect(() => {
    if (cameraResetCounter > 0) {
      if (controlsRef.current) {
        controlsRef.current.reset();
        controlsRef.current.target.set(0, -0.15, 0);
      }
      targetPoint.current.set(0, -0.15, 0);
    }
  }, [cameraResetCounter]);

  const handleClickModel = (point: THREE.Vector3) => {
    targetPoint.current.copy(point);
  };

  return (
    <div 
      style={{ 
        width: '100%', 
        height: '100%', 
        position: 'relative', 
        backgroundColor: '#090d16',
        borderRadius: 'var(--radius-md)',
        overflow: 'visible',
        border: '1px solid rgba(0, 85, 255, 0.15)'
      }}
    >
      <style>{`
        @keyframes jointPulse {
          0% { transform: scale(0.65); opacity: 1; }
          50% { transform: scale(1.35); opacity: 0.35; }
          100% { transform: scale(0.65); opacity: 1; }
        }
      `}</style>
      {/* 3D WebGL Canvas */}
      <Canvas
        style={{ width: '100%', height: '100%' }}
        gl={{ antialias: true, alpha: false }}
        onPointerMissed={() => {
          targetPoint.current.set(0, -0.15, 0);
        }}
      >
        <color attach="background" args={['#090d16']} />
        
        {/* Camera */}
        <PerspectiveCamera makeDefault position={[0, 0, 5.6]} fov={36} />
        
        <CameraController targetPoint={targetPoint} controlsRef={controlsRef} interactive={interactive} />

        {/* Futuristic Grid and Lighting */}
        <gridHelper args={[10, 20, '#0055ff', '#1e293b']} position={[0, -1.05, 0]} />
        <ambientLight intensity={0.4} />
        <directionalLight position={[10, 10, 5]} intensity={0.8} />
        <directionalLight position={[-10, -10, -5]} intensity={0.3} />

        <group>
          <React.Suspense fallback={null}>
            <ModelErrorBoundary
              fallbackPath={fallbackPath}
              viewMode={meshStyle}
              gender={gender}
              weight={weight}
              measurements={measurements}
              rotationAngle={rotationAngle}
              onClickModel={handleClickModel}
            >
              <Model 
                path={modelPath} 
                viewMode={meshStyle} 
                gender={gender} 
                weight={weight} 
                measurements={measurements}
                rotationAngle={rotationAngle}
                onClickModel={handleClickModel}
                showLabels={showLabels}
              />
            </ModelErrorBoundary>
          </React.Suspense>
          <HologramScannerBeam />
        </group>

        {/* Orbit Controls */}
        {interactive && (
          <OrbitControls 
            ref={controlsRef}
            target={[0, -0.15, 0]}
            enablePan={false}
            minDistance={2.5}
            maxDistance={8.0}
            minPolarAngle={Math.PI / 4}
            maxPolarAngle={Math.PI / 2 + 0.1}
            autoRotate={false}
          />
        )}

        {/* Bloom Glow */}
        <EffectComposer>
          <Bloom intensity={0.5} luminanceThreshold={0.2} luminanceSmoothing={0.9} />
        </EffectComposer>
      </Canvas>
    </div>
  );
};

// Preload models for immediate display
useGLTF.preload('/models/female_base_mesh.glb');
useGLTF.preload('/models/low_poly_male_base_-_slender.glb');
