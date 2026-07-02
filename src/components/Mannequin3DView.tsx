import React, { useMemo, useEffect, useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, Center, useGLTF, PerspectiveCamera, Html } from '@react-three/drei';
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
}

const Model: React.FC<ModelProps> = ({ path, viewMode, gender, weight, measurements, rotationAngle = 0, onClickModel }) => {
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
      const baseRotationY = (rotationAngle * Math.PI) / 180;
      meshRef.current.rotation.y = baseRotationY + Math.sin(state.clock.getElapsedTime() * 0.3) * 0.12;
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
  const chestVal = measurements?.chestCircumference ? measurements.chestCircumference.toFixed(1) : '90.0';
  const waistVal = measurements?.waistCircumference ? measurements.waistCircumference.toFixed(1) : '70.0';
  const hipsVal = measurements?.hipCircumference ? measurements.hipCircumference.toFixed(1) : '95.0';
  const legVal = measurements?.legLength ? measurements.legLength.toFixed(1) : '80.0';

  // Gender-specific optimized anatomical anchor coordinates (relative to feet Y = 0 origin inside the group)
  const chestPos = useMemo(() => [gender === 'female' ? 0.14 : 0.16, gender === 'female' ? 1.20 : 1.40, 0] as [number, number, number], [gender]);
  const waistPos = useMemo(() => [gender === 'female' ? -0.12 : -0.14, gender === 'female' ? 0.98 : 1.15, 0] as [number, number, number], [gender]);
  const hipsPos  = useMemo(() => [gender === 'female' ? 0.17 : 0.18, gender === 'female' ? 0.80 : 0.95, 0] as [number, number, number], [gender]);
  const legPos   = useMemo(() => [gender === 'female' ? -0.11 : -0.12, gender === 'female' ? 0.72 : 0.85, 0] as [number, number, number], [gender]);

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
        {measurements && (
          <>
            {/* Ngực (Chest) - Right side anchor, card points INWARD (left) */}
            <Html position={chestPos} style={{ pointerEvents: 'none' }}>
              <div style={{
                display: 'flex',
                alignItems: 'center',
                flexDirection: 'row-reverse',
                transform: 'translate(-100%, -50%)',
                fontFamily: 'system-ui, -apple-system, sans-serif'
              }}>
                {/* Pointing Line */}
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
                {/* Measurement Info Card */}
                <div style={{
                  background: 'rgba(9, 13, 22, 0.88)',
                  border: '1px solid rgba(0, 245, 255, 0.45)',
                  borderRadius: '4px',
                  padding: '3px 6px',
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

            {/* Eo (Waist) - Left side anchor, card points INWARD (right) */}
            <Html position={waistPos} style={{ pointerEvents: 'none' }}>
              <div style={{
                display: 'flex',
                alignItems: 'center',
                transform: 'translateY(-50%)',
                fontFamily: 'system-ui, -apple-system, sans-serif'
              }}>
                {/* Pointing Line */}
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
                    left: 0,
                    top: '-2.5px',
                    boxShadow: '0 0 6px #00f5ff'
                  }} />
                </div>
                {/* Measurement Info Card */}
                <div style={{
                  background: 'rgba(9, 13, 22, 0.88)',
                  border: '1px solid rgba(0, 245, 255, 0.45)',
                  borderRadius: '4px',
                  padding: '3px 6px',
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

            {/* Mông (Hips) - Right side anchor, card points INWARD (left) */}
            <Html position={hipsPos} style={{ pointerEvents: 'none' }}>
              <div style={{
                display: 'flex',
                alignItems: 'center',
                flexDirection: 'row-reverse',
                transform: 'translate(-100%, -50%)',
                fontFamily: 'system-ui, -apple-system, sans-serif'
              }}>
                {/* Pointing Line */}
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
                {/* Measurement Info Card */}
                <div style={{
                  background: 'rgba(9, 13, 22, 0.88)',
                  border: '1px solid rgba(0, 245, 255, 0.45)',
                  borderRadius: '4px',
                  padding: '3px 6px',
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

            {/* Dài chân (Leg Length) - Left side anchor, card points INWARD (right) */}
            <Html position={legPos} style={{ pointerEvents: 'none' }}>
              <div style={{
                display: 'flex',
                alignItems: 'center',
                transform: 'translateY(-50%)',
                fontFamily: 'system-ui, -apple-system, sans-serif'
              }}>
                {/* Pointing Line */}
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
                    left: 0,
                    top: '-2.5px',
                    boxShadow: '0 0 6px #00f5ff'
                  }} />
                </div>
                {/* Measurement Info Card */}
                <div style={{
                  background: 'rgba(9, 13, 22, 0.88)',
                  border: '1px solid rgba(0, 245, 255, 0.45)',
                  borderRadius: '4px',
                  padding: '3px 6px',
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
}> = ({ targetPoint, controlsRef }) => {
  useFrame(() => {
    if (controlsRef.current && targetPoint.current) {
      controlsRef.current.target.lerp(targetPoint.current, 0.12);
      controlsRef.current.update();
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
}

export const Mannequin3DView: React.FC<Mannequin3DViewProps> = ({
  gender,
  weight,
  meshStyle = 'solid',
  width,
  height,
  measurements,
  rotationAngle = 0,
  scanRange = 'full',
  cameraResetCounter = 0
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

  // Derived measurement values for HTML overlay
  const chestVal = measurements?.chestCircumference ? measurements.chestCircumference.toFixed(1) : null;
  const waistVal = measurements?.waistCircumference ? measurements.waistCircumference.toFixed(1) : null;
  const hipsVal  = measurements?.hipCircumference   ? measurements.hipCircumference.toFixed(1)   : null;
  const legVal   = measurements?.legLength           ? measurements.legLength.toFixed(1)           : null;

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
        
        <CameraController targetPoint={targetPoint} controlsRef={controlsRef} />

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
              />
            </ModelErrorBoundary>
          </React.Suspense>
          <HologramScannerBeam />
        </group>

        {/* Orbit Controls */}
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
