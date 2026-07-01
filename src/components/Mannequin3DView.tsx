import React, { useMemo, useEffect, useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, Center, useGLTF, PerspectiveCamera } from '@react-three/drei';
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
}

const Model: React.FC<ModelProps> = ({ path, viewMode, gender, weight, measurements, rotationAngle = 0 }) => {
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
    
    // Offset to center the model geometry precisely at origin [0, 0, 0]
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

  // Apply default rotation to primitive scene contents
  useEffect(() => {
    if (scene) scene.rotation.set(0, 0, 0);
    if (wireframeScene) wireframeScene.rotation.set(0, 0, 0);
  }, [scene, wireframeScene]);

  return (
    <group ref={meshRef} scale={scale}>
      <group position={[centerOffset.x, centerOffset.y, centerOffset.z]}>
        {/* Base solid translucent body */}
        <primitive object={scene} />

        {/* Grid overlay wireframe centered (hidden in heatmap mode) */}
        {viewMode !== 'heatmap' && (
          <primitive object={wireframeScene} />
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
class ModelErrorBoundary extends React.Component<
  {
    fallbackPath: string;
    viewMode: 'solid' | 'neon' | 'heatmap';
    gender: Gender;
    weight: number;
    measurements?: BodyMeasurements;
    rotationAngle?: number;
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
          rotationAngle={this.props.rotationAngle}
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
  measurements,
  rotationAngle = 0,
  scanRange = 'full'
}) => {
  const modelPath = gender === 'male' ? '/models/low_poly_male_base_-_slender.glb' : '/models/female_base_mesh.glb';
  const fallbackPath = '/models/female_base_mesh.glb';

  // Derived measurement values for HTML overlay
  const chestVal = measurements?.chestCircumference ? measurements.chestCircumference.toFixed(1) : null;
  const waistVal = measurements?.waistCircumference ? measurements.waistCircumference.toFixed(1) : null;
  const hipsVal  = measurements?.hipCircumference   ? measurements.hipCircumference.toFixed(1)   : null;
  const legVal   = measurements?.legLength           ? measurements.legLength.toFixed(1)           : null;

  // Shared style for label cards
  const labelCard: React.CSSProperties = {
    background: 'rgba(9, 13, 22, 0.88)',
    border: '1px solid rgba(0, 245, 255, 0.45)',
    borderRadius: '4px',
    padding: '3px 7px',
    whiteSpace: 'nowrap',
    color: '#00f5ff',
    fontSize: '10px',
    fontWeight: 700,
    fontFamily: 'system-ui, sans-serif',
    boxShadow: '0 0 10px rgba(0,245,255,0.2)',
    pointerEvents: 'none',
    userSelect: 'none',
  };
  const dot: React.CSSProperties = {
    width: 6, height: 6,
    borderRadius: '50%',
    background: '#00f5ff',
    boxShadow: '0 0 6px #00f5ff',
    flexShrink: 0,
  };
  const hLine: React.CSSProperties = {
    width: 28, height: 1,
    background: 'rgba(0,245,255,0.55)',
    flexShrink: 0,
  };

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
        
        {/* Camera */}
        <PerspectiveCamera makeDefault position={[0, 0, 5.6]} fov={36} />
        
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
            >
              <Model 
                path={modelPath} 
                viewMode={meshStyle} 
                gender={gender} 
                weight={weight} 
                measurements={measurements}
                rotationAngle={rotationAngle}
              />
            </ModelErrorBoundary>
          </React.Suspense>
          <HologramScannerBeam />
        </group>

        {/* Orbit Controls */}
        <OrbitControls 
          target={[0, 0, 0]}
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

      {/* ── Pure HTML measurement overlays (never affected by 3D camera) ── */}
      {measurements && (
        <>
          {/* NGỰC — right side, ~35% from top */}
          {chestVal && (
            <div style={{ position:'absolute', top:'33%', right:0, transform:'translateY(-50%)', display:'flex', alignItems:'center', pointerEvents:'none' }}>
              <div style={labelCard}>NGỰC: <span style={{color:'#fff'}}>{chestVal} cm</span></div>
              <div style={hLine} />
              <div style={dot} />
            </div>
          )}

          {/* EO — left side, ~50% from top */}
          {waistVal && (
            <div style={{ position:'absolute', top:'50%', left:0, transform:'translateY(-50%)', display:'flex', alignItems:'center', flexDirection:'row-reverse', pointerEvents:'none' }}>
              <div style={labelCard}>EO: <span style={{color:'#fff'}}>{waistVal} cm</span></div>
              <div style={hLine} />
              <div style={dot} />
            </div>
          )}

          {/* MÔNG — right side, ~62% from top */}
          {hipsVal && (
            <div style={{ position:'absolute', top:'62%', right:0, transform:'translateY(-50%)', display:'flex', alignItems:'center', pointerEvents:'none' }}>
              <div style={labelCard}>MÔNG: <span style={{color:'#fff'}}>{hipsVal} cm</span></div>
              <div style={hLine} />
              <div style={dot} />
            </div>
          )}

          {/* DÀI CHÂN — left side, ~78% from top */}
          {legVal && (
            <div style={{ position:'absolute', top:'78%', left:0, transform:'translateY(-50%)', display:'flex', alignItems:'center', flexDirection:'row-reverse', pointerEvents:'none' }}>
              <div style={labelCard}>DÀI CHÂN: <span style={{color:'#fff'}}>{legVal} cm</span></div>
              <div style={hLine} />
              <div style={dot} />
            </div>
          )}
        </>
      )}
    </div>
  );
};

// Preload models for immediate display
useGLTF.preload('/models/female_base_mesh.glb');
useGLTF.preload('/models/low_poly_male_base_-_slender.glb');
