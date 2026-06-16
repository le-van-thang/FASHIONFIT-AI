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
}

const Model: React.FC<ModelProps> = ({ path, viewMode, gender, weight, measurements }) => {
  const { scene } = useGLTF(path);
  
  // Calculate bounding box of the scene to find vertical bounds dynamically
  const bounds = useMemo(() => {
    const box = new THREE.Box3().setFromObject(scene);
    const min = box.min.y;
    const max = box.max.y;
    return { min, max };
  }, [scene]);

  // Create materials
  const neonMaterial = useMemo(() => {
    return new THREE.MeshBasicMaterial({
      wireframe: true,
      color: new THREE.Color('#0055ff'), // Màu xanh nước biển chuẩn của Zozofit
      transparent: true,
      opacity: 0.85, // Bright neon wireframe
      depthWrite: false,
      side: THREE.DoubleSide
    });
  }, []);

  const solidMaterial = useMemo(() => {
    return new THREE.MeshStandardMaterial({
      color: new THREE.Color('#05162e'), // Deep ocean dark blue
      roughness: 0.4,
      metalness: 0.8,
      transparent: true,
      opacity: 0.9,
      side: THREE.DoubleSide
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

  // Apply materials dynamically depending on viewMode
  useEffect(() => {
    scene.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        if (viewMode === 'neon') {
          child.material = neonMaterial;
        } else if (viewMode === 'solid') {
          child.material = solidMaterial;
        } else {
          child.material = heatmapMaterial;
        }
      }
    });
  }, [scene, viewMode, neonMaterial, solidMaterial, heatmapMaterial]);

  // Slight breathing rotation animation to mimic hologram scanner
  const meshRef = useRef<THREE.Group>(null);
  useFrame((state) => {
    if (meshRef.current) {
      meshRef.current.rotation.y = Math.sin(state.clock.getElapsedTime() * 0.3) * 0.15;
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

  // Reset scene rotation to default (the models are already Y-up standing upright)
  useEffect(() => {
    if (scene) {
      scene.rotation.set(0, 0, 0);
    }
  }, [scene]);

  return (
    <group ref={meshRef} scale={scale}>
      <primitive object={scene} rotation={[0, 0, 0]} />

      {/* Futuristic HTML HUD overlays positioned relative to approximate body coordinates */}
      {measurements && (
        <>
          {/* Ngực (Chest) - Right side */}
          <Html position={[0, 0.25, 0]} center style={{ pointerEvents: 'none' }}>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              width: '180px',
              justifyContent: 'flex-start',
              transform: 'translateX(25px)',
              fontFamily: 'system-ui, -apple-system, sans-serif'
            }}>
              {/* Pointing Line */}
              <div style={{
                width: '50px',
                height: '1px',
                background: 'rgba(0, 85, 255, 0.6)',
                position: 'relative',
                flexShrink: 0
              }}>
                <div style={{
                  width: '4px',
                  height: '4px',
                  background: '#0055ff',
                  borderRadius: '50%',
                  position: 'absolute',
                  left: 0,
                  top: '-2px',
                  boxShadow: '0 0 6px #0055ff'
                }} />
              </div>
              {/* Measurement Info Card */}
              <div style={{
                background: 'rgba(9, 13, 22, 0.85)',
                border: '1px solid rgba(0, 85, 255, 0.4)',
                borderRadius: '4px',
                padding: '4px 8px',
                whiteSpace: 'nowrap',
                color: '#0055ff',
                fontSize: '10px',
                fontWeight: 700,
                boxShadow: '0 0 12px rgba(0, 85, 255, 0.25)'
              }}>
                NGỰC: <span style={{ color: '#fff' }}>{chestVal} cm</span>
              </div>
            </div>
          </Html>

          {/* Eo (Waist) - Left side */}
          <Html position={[0, 0.05, 0]} center style={{ pointerEvents: 'none' }}>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              flexDirection: 'row-reverse',
              width: '180px',
              justifyContent: 'flex-start',
              transform: 'translateX(-205px)',
              fontFamily: 'system-ui, -apple-system, sans-serif'
            }}>
              {/* Pointing Line */}
              <div style={{
                width: '50px',
                height: '1px',
                background: 'rgba(0, 85, 255, 0.6)',
                position: 'relative',
                flexShrink: 0
              }}>
                <div style={{
                  width: '4px',
                  height: '4px',
                  background: '#0055ff',
                  borderRadius: '50%',
                  position: 'absolute',
                  right: 0,
                  top: '-2px',
                  boxShadow: '0 0 6px #0055ff'
                }} />
              </div>
              {/* Measurement Info Card */}
              <div style={{
                background: 'rgba(9, 13, 22, 0.85)',
                border: '1px solid rgba(0, 85, 255, 0.4)',
                borderRadius: '4px',
                padding: '4px 8px',
                whiteSpace: 'nowrap',
                color: '#0055ff',
                fontSize: '10px',
                fontWeight: 700,
                boxShadow: '0 0 12px rgba(0, 85, 255, 0.25)'
              }}>
                EO: <span style={{ color: '#fff' }}>{waistVal} cm</span>
              </div>
            </div>
          </Html>

          {/* Mông (Hips) - Right side */}
          <Html position={[0, -0.15, 0]} center style={{ pointerEvents: 'none' }}>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              width: '180px',
              justifyContent: 'flex-start',
              transform: 'translateX(25px)',
              fontFamily: 'system-ui, -apple-system, sans-serif'
            }}>
              {/* Pointing Line */}
              <div style={{
                width: '50px',
                height: '1px',
                background: 'rgba(0, 85, 255, 0.6)',
                position: 'relative',
                flexShrink: 0
              }}>
                <div style={{
                  width: '4px',
                  height: '4px',
                  background: '#0055ff',
                  borderRadius: '50%',
                  position: 'absolute',
                  left: 0,
                  top: '-2px',
                  boxShadow: '0 0 6px #0055ff'
                }} />
              </div>
              {/* Measurement Info Card */}
              <div style={{
                background: 'rgba(9, 13, 22, 0.85)',
                border: '1px solid rgba(0, 85, 255, 0.4)',
                borderRadius: '4px',
                padding: '4px 8px',
                whiteSpace: 'nowrap',
                color: '#0055ff',
                fontSize: '10px',
                fontWeight: 700,
                boxShadow: '0 0 12px rgba(0, 85, 255, 0.25)'
              }}>
                MÔNG: <span style={{ color: '#fff' }}>{hipsVal} cm</span>
              </div>
            </div>
          </Html>

          {/* Dài chân (Leg Length) - Left side */}
          <Html position={[0, -0.45, 0]} center style={{ pointerEvents: 'none' }}>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              flexDirection: 'row-reverse',
              width: '180px',
              justifyContent: 'flex-start',
              transform: 'translateX(-205px)',
              fontFamily: 'system-ui, -apple-system, sans-serif'
            }}>
              {/* Pointing Line */}
              <div style={{
                width: '50px',
                height: '1px',
                background: 'rgba(0, 85, 255, 0.6)',
                position: 'relative',
                flexShrink: 0
              }}>
                <div style={{
                  width: '4px',
                  height: '4px',
                  background: '#0055ff',
                  borderRadius: '50%',
                  position: 'absolute',
                  right: 0,
                  top: '-2px',
                  boxShadow: '0 0 6px #0055ff'
                }} />
              </div>
              {/* Measurement Info Card */}
              <div style={{
                background: 'rgba(9, 13, 22, 0.85)',
                border: '1px solid rgba(0, 85, 255, 0.4)',
                borderRadius: '4px',
                padding: '4px 8px',
                whiteSpace: 'nowrap',
                color: '#0055ff',
                fontSize: '10px',
                fontWeight: 700,
                boxShadow: '0 0 12px rgba(0, 85, 255, 0.25)'
              }}>
                DÀI CHÂN: <span style={{ color: '#fff' }}>{legVal} cm</span>
              </div>
            </div>
          </Html>
        </>
      )}
    </group>
  );
};

// Custom scanner laser effect overlay plane
const HologramScannerBeam: React.FC = () => {
  const meshRef = useRef<THREE.Mesh>(null);
  
  useFrame((state) => {
    if (meshRef.current) {
      meshRef.current.position.y = Math.sin(state.clock.getElapsedTime() * 1.5) * 1.5;
    }
  });

  return (
    <mesh ref={meshRef} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]}>
      <planeGeometry args={[3, 3]} />
      <meshBasicMaterial 
        color="#0055ff" 
        transparent 
        opacity={0.15} 
        side={THREE.DoubleSide}
        depthWrite={false}
      />
    </mesh>
  );
};

// Model Loader Error Boundary for graceful fallback to female base model
class ModelErrorBoundary extends React.Component<
  {
    fallbackPath: string;
    viewMode: 'solid' | 'neon' | 'heatmap';
    gender: Gender;
    weight: number;
    measurements?: BodyMeasurements;
    children: React.ReactNode;
  },
  { hasError: boolean }
> {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: any) {
    console.warn("Model load failed, falling back to female_base_mesh", error);
  }

  componentDidUpdate(prevProps: any) {
    if (prevProps.fallbackPath !== this.props.fallbackPath || prevProps.gender !== this.props.gender) {
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
        />
      );
    }
    return this.props.children;
  }
}

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
  meshStyle = 'solid',
  width,
  height,
  measurements
}) => {
  const modelPath = gender === 'male' ? '/models/low_poly_male_base_-_slender.glb' : '/models/female_base_mesh.glb';
  const fallbackPath = '/models/female_base_mesh.glb';

  return (
    <div 
      style={{ 
        width: width ? `${width}px` : '100%', 
        height: height ? `${height}px` : '100%', 
        position: 'relative', 
        backgroundColor: '#090d16',
        borderRadius: 'var(--radius-md)',
        overflow: 'hidden',
        border: '1px solid rgba(0, 85, 255, 0.15)'
      }}
    >
      {/* 3D WebGL Canvas */}
      <Canvas
        style={{ width: '100%', height: '100%' }}
        gl={{ antialias: true, alpha: false }}
      >
        <color attach="background" args={['#090d16']} />
        <PerspectiveCamera makeDefault position={[0, 0, 4]} fov={45} />
        
        {/* Futuristic Grid and Lighting */}
        <gridHelper args={[10, 20, '#0055ff', '#1e293b']} position={[0, -1.2, 0]} />
        <ambientLight intensity={0.4} />
        <directionalLight position={[10, 10, 5]} intensity={0.8} />
        <directionalLight position={[-10, -10, -5]} intensity={0.3} />

        <Center>
          <React.Suspense fallback={null}>
            <ModelErrorBoundary
              fallbackPath={fallbackPath}
              viewMode={meshStyle}
              gender={gender}
              weight={weight}
              measurements={measurements}
            >
              <Model 
                path={modelPath} 
                viewMode={meshStyle} 
                gender={gender} 
                weight={weight} 
                measurements={measurements}
              />
            </ModelErrorBoundary>
          </React.Suspense>
          <HologramScannerBeam />
        </Center>

        {/* Orbit Controls to rotate and inspect mannequin */}
        <OrbitControls 
          enablePan={false}
          minDistance={1.8}
          maxDistance={5.0}
          minPolarAngle={Math.PI / 4}
          maxPolarAngle={Math.PI / 2 + 0.1}
          autoRotate={false}
        />

        {/* Postprocessing Bloom Glow Effect */}
        <EffectComposer>
          <Bloom 
            intensity={0.5} 
            luminanceThreshold={0.2} 
            luminanceSmoothing={0.9} 
          />
        </EffectComposer>
      </Canvas>
    </div>
  );
};

// Preload models for immediate display
useGLTF.preload('/models/female_base_mesh.glb');
useGLTF.preload('/models/low_poly_male_base_-_slender.glb');
