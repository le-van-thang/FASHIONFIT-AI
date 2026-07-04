import React, { useMemo, useEffect, useRef } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls, useGLTF, PerspectiveCamera, Html } from '@react-three/drei';
import { EffectComposer, Bloom } from '@react-three/postprocessing';
import * as THREE from 'three';
import type { Landmark, Gender, BodyMeasurements } from '../types';

// Custom Shader Material for Heatmap Mode (ColorMetric Shader)
const HeatmapShaderMaterial = {
  uniforms: {
    colorBottom: { value: new THREE.Color('#0055ff') }, // Ocean Blue
    colorTop: { value: new THREE.Color('#ffb703') },    // Yellow/Orange
    minY: { value: -1.0 },
    maxY: { value: 1.0 }
  },
  vertexShader: `
    varying vec3 vPosition;
    void main() {
      vPosition = position;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    uniform vec3 colorBottom;
    uniform vec3 colorTop;
    uniform float minY;
    uniform float maxY;
    varying vec3 vPosition;

    void main() {
      // Normalize Y position between minY and maxY
      float h = clamp((vPosition.y - minY) / (maxY - minY), 0.0, 1.0);
      
      // Smooth interpolation between bottom (Blue) and top (Yellow/Orange)
      float mixFactor = smoothstep(0.0, 1.0, h);
      vec3 finalColor = mix(colorBottom, colorTop, mixFactor);
      
      // Semi-transparent hologram overlay style
      gl_FragColor = vec4(finalColor, 0.85);
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
      bounds: { min: box.min.y, max: box.max.y },
      centerOffset: offset
    };
  }, [scene, path]);

  // Create materials for Sci-Fi Hologram style (Ocean Blue + Cyan Neon grid)
  const solidMaterial = useMemo(() => {
    return new THREE.MeshBasicMaterial({
      color: new THREE.Color('#021430'), // Deep translucent ocean navy blue
      transparent: true,
      opacity: 0.75,
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
        colorBottom: { value: new THREE.Color('#0055ff') }, // Ocean Blue
        colorTop: { value: new THREE.Color('#ffb703') },    // Yellow/Orange
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
          child.material = heatmapMaterial;
        } else {
          child.material = solidMaterial;
        }
      }
    });

    // 2. Traverse wireframe overlay scene
    wireframeScene.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        if (viewMode === 'heatmap') {
          child.material = heatmapMaterial;
        } else {
          child.material = neonMaterial;
        }
      }
    });
  }, [scene, wireframeScene, viewMode, solidMaterial, neonMaterial, heatmapMaterial]);

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
    
    return [weightFactor * 0.95, heightScale * 0.95, weightFactor * 0.95] as [number, number, number];
  }, [gender, weight, measurements]);

  // Derived measurement values
  const neckVal = measurements?.chestCircumference ? (measurements.chestCircumference * (gender === 'female' ? 0.38 : 0.41)).toFixed(1) : '36.0';
  const shoulderVal = measurements?.shoulderWidth ? measurements.shoulderWidth.toFixed(1) : '44.0';
  const chestVal = measurements?.chestCircumference ? measurements.chestCircumference.toFixed(1) : '90.0';
  const waistVal = measurements?.waistCircumference ? measurements.waistCircumference.toFixed(1) : '70.0';
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
          onClick={(e) => {
            e.stopPropagation();
            if (e.point && onClickModel) {
              onClickModel(e.point);
            }
          }}
        />

        {/* Grid overlay wireframe centered (hidden in heatmap mode) */}
        {viewMode !== 'heatmap' && (
          <primitive object={wireframeScene} />
        )}

        {/* Dynamic HTML HUD overlays positioned relative to approximate body coordinates */}
        {measurements && showLabels && (
          <>
            {/* Cổ (Neck) - Left side anchor, card points INWARD (right), width: 16px */}
            <Html position={neckPos} style={{ pointerEvents: 'none' }} zIndexRange={[1, 5]}>
              <div style={{
                display: 'flex',
                alignItems: 'center',
                transform: 'translateY(-50%)',
                fontFamily: 'system-ui, -apple-system, sans-serif'
              }}>
                <div style={{
                  width: '16px',
                  height: '1px',
                  background: 'rgba(0, 245, 255, 0.65)',
                  position: 'relative',
                  flexShrink: 0
                }}>
                  <div style={{
                    width: '4px',
                    height: '4px',
                    background: '#00f5ff',
                    borderRadius: '50%',
                    position: 'absolute',
                    left: 0,
                    top: '-2.5px',
                    boxShadow: '0 0 6px #00f5ff'
                  }} />
                </div>
                <div style={{
                  background: 'rgba(9, 13, 22, 0.88)',
                  border: '1px solid rgba(0, 245, 255, 0.45)',
                  borderRadius: '4px',
                  padding: '2px 5px',
                  whiteSpace: 'nowrap',
                  color: '#00f5ff',
                  fontSize: '9px',
                  fontWeight: 700,
                  boxShadow: '0 0 10px rgba(0, 245, 255, 0.25)'
                }}>
                  CỔ: <span style={{ color: '#fff' }}>{neckVal} cm</span>
                </div>
              </div>
            </Html>

            {/* Rộng vai (Shoulder Width) - Right side anchor, card points INWARD (left), width: 16px */}
            <Html position={shoulderPos} style={{ pointerEvents: 'none' }} zIndexRange={[1, 5]}>
              <div style={{
                display: 'flex',
                alignItems: 'center',
                flexDirection: 'row-reverse',
                transform: 'translate(-100%, -50%)',
                fontFamily: 'system-ui, -apple-system, sans-serif'
              }}>
                <div style={{
                  width: '16px',
                  height: '1px',
                  background: 'rgba(0, 245, 255, 0.65)',
                  position: 'relative',
                  flexShrink: 0
                }}>
                  <div style={{
                    width: '4px',
                    height: '4px',
                    background: '#00f5ff',
                    borderRadius: '50%',
                    position: 'absolute',
                    right: 0,
                    top: '-2.5px',
                    boxShadow: '0 0 6px #00f5ff'
                  }} />
                </div>
                <div style={{
                  background: 'rgba(9, 13, 22, 0.88)',
                  border: '1px solid rgba(0, 245, 255, 0.45)',
                  borderRadius: '4px',
                  padding: '2px 5px',
                  whiteSpace: 'nowrap',
                  color: '#00f5ff',
                  fontSize: '9px',
                  fontWeight: 700,
                  boxShadow: '0 0 10px rgba(0, 245, 255, 0.25)'
                }}>
                  VAI: <span style={{ color: '#fff' }}>{shoulderVal} cm</span>
                </div>
              </div>
            </Html>

            {/* Ngực (Chest) - Right side anchor, card points INWARD (left), width: 28px */}
            <Html position={chestPos} style={{ pointerEvents: 'none' }} zIndexRange={[1, 5]}>
              <div style={{
                display: 'flex',
                alignItems: 'center',
                flexDirection: 'row-reverse',
                transform: 'translate(-100%, -50%)',
                fontFamily: 'system-ui, -apple-system, sans-serif'
              }}>
                <div style={{
                  width: '28px',
                  height: '1px',
                  background: 'rgba(0, 245, 255, 0.65)',
                  position: 'relative',
                  flexShrink: 0
                }}>
                  <div style={{
                    width: '4px',
                    height: '4px',
                    background: '#00f5ff',
                    borderRadius: '50%',
                    position: 'absolute',
                    right: 0,
                    top: '-2.5px',
                    boxShadow: '0 0 6px #00f5ff'
                  }} />
                </div>
                <div style={{
                  background: 'rgba(9, 13, 22, 0.88)',
                  border: '1px solid rgba(0, 245, 255, 0.45)',
                  borderRadius: '4px',
                  padding: '2px 5px',
                  whiteSpace: 'nowrap',
                  color: '#00f5ff',
                  fontSize: '9px',
                  fontWeight: 700,
                  boxShadow: '0 0 10px rgba(0, 245, 255, 0.25)'
                }}>
                  NGỰC: <span style={{ color: '#fff' }}>{chestVal} cm</span>
                </div>
              </div>
            </Html>

            {/* Dài tay (Arm Length) - Right side anchor, card points INWARD (left), width: 18px */}
            <Html position={armPos} style={{ pointerEvents: 'none' }} zIndexRange={[1, 5]}>
              <div style={{
                display: 'flex',
                alignItems: 'center',
                flexDirection: 'row-reverse',
                transform: 'translate(-100%, -50%)',
                fontFamily: 'system-ui, -apple-system, sans-serif'
              }}>
                <div style={{
                  width: '18px',
                  height: '1px',
                  background: 'rgba(0, 245, 255, 0.65)',
                  position: 'relative',
                  flexShrink: 0
                }}>
                  <div style={{
                    width: '4px',
                    height: '4px',
                    background: '#00f5ff',
                    borderRadius: '50%',
                    position: 'absolute',
                    right: 0,
                    top: '-2.5px',
                    boxShadow: '0 0 6px #00f5ff'
                  }} />
                </div>
                <div style={{
                  background: 'rgba(9, 13, 22, 0.88)',
                  border: '1px solid rgba(0, 245, 255, 0.45)',
                  borderRadius: '4px',
                  padding: '2px 5px',
                  whiteSpace: 'nowrap',
                  color: '#00f5ff',
                  fontSize: '9px',
                  fontWeight: 700,
                  boxShadow: '0 0 10px rgba(0, 245, 255, 0.25)'
                }}>
                  DÀI TAY: <span style={{ color: '#fff' }}>{armVal} cm</span>
                </div>
              </div>
            </Html>

            {/* Eo (Waist) - Left side anchor, card points INWARD (right), width: 24px */}
            <Html position={waistPos} style={{ pointerEvents: 'none' }} zIndexRange={[1, 5]}>
              <div style={{
                display: 'flex',
                alignItems: 'center',
                transform: 'translateY(-50%)',
                fontFamily: 'system-ui, -apple-system, sans-serif'
              }}>
                <div style={{
                  width: '24px',
                  height: '1px',
                  background: 'rgba(0, 245, 255, 0.65)',
                  position: 'relative',
                  flexShrink: 0
                }}>
                  <div style={{
                    width: '4px',
                    height: '4px',
                    background: '#00f5ff',
                    borderRadius: '50%',
                    position: 'absolute',
                    left: 0,
                    top: '-2.5px',
                    boxShadow: '0 0 6px #00f5ff'
                  }} />
                </div>
                <div style={{
                  background: 'rgba(9, 13, 22, 0.88)',
                  border: '1px solid rgba(0, 245, 255, 0.45)',
                  borderRadius: '4px',
                  padding: '2px 5px',
                  whiteSpace: 'nowrap',
                  color: '#00f5ff',
                  fontSize: '9px',
                  fontWeight: 700,
                  boxShadow: '0 0 10px rgba(0, 245, 255, 0.25)'
                }}>
                  EO: <span style={{ color: '#fff' }}>{waistVal} cm</span>
                </div>
              </div>
            </Html>

            {/* Mông (Hips) - Right side anchor, card points INWARD (left), width: 28px */}
            <Html position={hipsPos} style={{ pointerEvents: 'none' }} zIndexRange={[1, 5]}>
              <div style={{
                display: 'flex',
                alignItems: 'center',
                flexDirection: 'row-reverse',
                transform: 'translate(-100%, -50%)',
                fontFamily: 'system-ui, -apple-system, sans-serif'
              }}>
                <div style={{
                  width: '28px',
                  height: '1px',
                  background: 'rgba(0, 245, 255, 0.65)',
                  position: 'relative',
                  flexShrink: 0
                }}>
                  <div style={{
                    width: '4px',
                    height: '4px',
                    background: '#00f5ff',
                    borderRadius: '50%',
                    position: 'absolute',
                    right: 0,
                    top: '-2.5px',
                    boxShadow: '0 0 6px #00f5ff'
                  }} />
                </div>
                <div style={{
                  background: 'rgba(9, 13, 22, 0.88)',
                  border: '1px solid rgba(0, 245, 255, 0.45)',
                  borderRadius: '4px',
                  padding: '2px 5px',
                  whiteSpace: 'nowrap',
                  color: '#00f5ff',
                  fontSize: '9px',
                  fontWeight: 700,
                  boxShadow: '0 0 10px rgba(0, 245, 255, 0.25)'
                }}>
                  MÔNG: <span style={{ color: '#fff' }}>{hipsVal} cm</span>
                </div>
              </div>
            </Html>

            {/* Đùi phải (Right Thigh) - Left side anchor, card points INWARD (right), width: 16px */}
            <Html position={thighPos} style={{ pointerEvents: 'none' }} zIndexRange={[1, 5]}>
              <div style={{
                display: 'flex',
                alignItems: 'center',
                transform: 'translateY(-50%)',
                fontFamily: 'system-ui, -apple-system, sans-serif'
              }}>
                <div style={{
                  width: '16px',
                  height: '1px',
                  background: 'rgba(0, 245, 255, 0.65)',
                  position: 'relative',
                  flexShrink: 0
                }}>
                  <div style={{
                    width: '4px',
                    height: '4px',
                    background: '#00f5ff',
                    borderRadius: '50%',
                    position: 'absolute',
                    left: 0,
                    top: '-2.5px',
                    boxShadow: '0 0 6px #00f5ff'
                  }} />
                </div>
                <div style={{
                  background: 'rgba(9, 13, 22, 0.88)',
                  border: '1px solid rgba(0, 245, 255, 0.45)',
                  borderRadius: '4px',
                  padding: '2px 5px',
                  whiteSpace: 'nowrap',
                  color: '#00f5ff',
                  fontSize: '9px',
                  fontWeight: 700,
                  boxShadow: '0 0 10px rgba(0, 245, 255, 0.25)'
                }}>
                  ĐÙI PHẢI: <span style={{ color: '#fff' }}>{thighVal} cm</span>
                </div>
              </div>
            </Html>

            {/* Bắp chân phải (Right Calf) - Left side anchor, card points INWARD (right), width: 24px */}
            <Html position={calfPos} style={{ pointerEvents: 'none' }} zIndexRange={[1, 5]}>
              <div style={{
                display: 'flex',
                alignItems: 'center',
                transform: 'translateY(-50%)',
                fontFamily: 'system-ui, -apple-system, sans-serif'
              }}>
                <div style={{
                  width: '24px',
                  height: '1px',
                  background: 'rgba(0, 245, 255, 0.65)',
                  position: 'relative',
                  flexShrink: 0
                }}>
                  <div style={{
                    width: '4px',
                    height: '4px',
                    background: '#00f5ff',
                    borderRadius: '50%',
                    position: 'absolute',
                    left: 0,
                    top: '-2.5px',
                    boxShadow: '0 0 6px #00f5ff'
                  }} />
                </div>
                <div style={{
                  background: 'rgba(9, 13, 22, 0.88)',
                  border: '1px solid rgba(0, 245, 255, 0.45)',
                  borderRadius: '4px',
                  padding: '2px 5px',
                  whiteSpace: 'nowrap',
                  color: '#00f5ff',
                  fontSize: '9px',
                  fontWeight: 700,
                  boxShadow: '0 0 10px rgba(0, 245, 255, 0.25)'
                }}>
                  BẮP CHÂN: <span style={{ color: '#fff' }}>{calfVal} cm</span>
                </div>
              </div>
            </Html>

            {/* Dài chân (Leg Length) - Right side anchor, card points INWARD (left), width: 16px */}
            <Html position={legPos} style={{ pointerEvents: 'none' }} zIndexRange={[1, 5]}>
              <div style={{
                display: 'flex',
                alignItems: 'center',
                flexDirection: 'row-reverse',
                transform: 'translate(-100%, -50%)',
                fontFamily: 'system-ui, -apple-system, sans-serif'
              }}>
                <div style={{
                  width: '16px',
                  height: '1px',
                  background: 'rgba(0, 245, 255, 0.65)',
                  position: 'relative',
                  flexShrink: 0
                }}>
                  <div style={{
                    width: '4px',
                    height: '4px',
                    background: '#00f5ff',
                    borderRadius: '50%',
                    position: 'absolute',
                    right: 0,
                    top: '-2.5px',
                    boxShadow: '0 0 6px #00f5ff'
                  }} />
                </div>
                <div style={{
                  background: 'rgba(9, 13, 22, 0.88)',
                  border: '1px solid rgba(0, 245, 255, 0.45)',
                  borderRadius: '4px',
                  padding: '2px 5px',
                  whiteSpace: 'nowrap',
                  color: '#00f5ff',
                  fontSize: '9px',
                  fontWeight: 700,
                  boxShadow: '0 0 10px rgba(0, 245, 255, 0.25)'
                }}>
                  DÀI CHÂN: <span style={{ color: '#fff' }}>{legVal} cm</span>
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
  gender: Gender;
}> = ({ targetPoint, controlsRef, interactive, gender }) => {
  const { camera } = useThree();
  useFrame(() => {
    if (interactive) {
      if (controlsRef.current && targetPoint.current) {
        controlsRef.current.target.lerp(targetPoint.current, 0.12);
        controlsRef.current.update();
      }
    } else {
      // Locked level front/side view, matching SVG templates exactly
      camera.position.set(0, -0.14, 4.7);
      camera.lookAt(0, -0.14, 0);
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
        
        <CameraController targetPoint={targetPoint} controlsRef={controlsRef} interactive={interactive} gender={gender} />

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
