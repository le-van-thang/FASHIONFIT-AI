import React, { useState, useMemo, useEffect, useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, Center, useGLTF } from '@react-three/drei';
import { EffectComposer, Bloom } from '@react-three/postprocessing';
import * as THREE from 'three';
import type { Landmark, Gender, BodyMeasurements } from '../types';

// Custom Shader Material for Heatmap Mode (ColorMetric Shader)
// Computes height-based smooth gradient transition along the Y axis
const HeatmapShaderMaterial = {
  uniforms: {
    colorBottom: { value: new THREE.Color('#00f5a0') }, // Xanh Cyan
    colorTop: { value: new THREE.Color('#ffb703') },    // Vàng/Cam
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
      
      // Smooth interpolation between bottom (Cyan) and top (Yellow/Orange)
      float mixFactor = smoothstep(0.0, 1.0, h);
      vec3 finalColor = mix(colorBottom, colorTop, mixFactor);
      
      // Semi-transparent hologram overlay style
      gl_FragColor = vec4(finalColor, 0.85);
    }
  `
};

interface ModelProps {
  gender: Gender;
  viewMode: 'wireframe' | 'heatmap';
  weight: number;
}

const Model: React.FC<ModelProps> = ({ gender, viewMode, weight }) => {
  // Load female_base_mesh.glb as requested
  const { scene } = useGLTF('/models/female_base_mesh.glb');
  
  // Calculate bounding box of the scene to find vertical bounds dynamically
  const bounds = useMemo(() => {
    const box = new THREE.Box3().setFromObject(scene);
    const min = box.min.y;
    const max = box.max.y;
    return { min, max };
  }, [scene]);

  // Create materials
  const wireframeMaterial = useMemo(() => {
    return new THREE.MeshBasicMaterial({
      wireframe: true,
      color: new THREE.Color('#00f5a0'), // Neon cyan/green
      transparent: true,
      opacity: 0.8,
      depthWrite: false
    });
  }, []);

  const heatmapMaterial = useMemo(() => {
    return new THREE.ShaderMaterial({
      uniforms: {
        colorBottom: { value: new THREE.Color('#00f5a0') }, // Xanh Cyan
        colorTop: { value: new THREE.Color('#ffb703') },    // Vàng/Cam
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
        if (viewMode === 'wireframe') {
          child.material = wireframeMaterial;
        } else {
          // Heatmap mode
          child.material = heatmapMaterial;
        }
      }
    });
  }, [scene, viewMode, wireframeMaterial, heatmapMaterial]);

  // Slight breathing rotation animation to mimic hologram scanner
  const meshRef = useRef<THREE.Group>(null);
  useFrame((state) => {
    if (meshRef.current) {
      meshRef.current.rotation.y = Math.sin(state.clock.getElapsedTime() * 0.3) * 0.15;
    }
  });

  // Scale model chest/waist/hip shape slightly depending on weight offset from standard
  const scaleX = useMemo(() => {
    const baseWeight = gender === 'female' ? 52 : 65;
    const weightFactor = Math.max(0.8, Math.min(1.4, weight / baseWeight));
    return weightFactor;
  }, [gender, weight]);

  return (
    <group ref={meshRef} scale={[scaleX, 1, scaleX]}>
      <primitive object={scene} />
    </group>
  );
};

// Custom scanner laser effect overlay plane
const HologramScannerBeam: React.FC = () => {
  const meshRef = useRef<THREE.Mesh>(null);
  
  useFrame((state) => {
    if (meshRef.current) {
      // Animate laser plane up and down
      meshRef.current.position.y = Math.sin(state.clock.getElapsedTime() * 1.5) * 1.5;
    }
  });

  return (
    <mesh ref={meshRef} rotation={[-Math.PI / 2, 0, 0]}>
      <planeGeometry args={[3, 3]} />
      <meshBasicMaterial 
        color="#00f5a0" 
        transparent 
        opacity={0.3} 
        side={THREE.DoubleSide}
        depthWrite={false}
      />
    </mesh>
  );
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
  width,
  height
}) => {
  const [viewMode, setViewMode] = useState<'wireframe' | 'heatmap'>('wireframe');

  return (
    <div 
      style={{ 
        width: width ? `${width}px` : '100%', 
        height: height ? `${height}px` : '100%', 
        position: 'relative', 
        backgroundColor: '#090d16',
        borderRadius: 'var(--radius-md)',
        overflow: 'hidden',
        border: '1px solid rgba(6, 182, 212, 0.15)'
      }}
    >
      {/* 3D WebGL Canvas */}
      <Canvas
        camera={{ position: [0, 0.2, 3.2], fov: 45 }}
        style={{ width: '100%', height: '100%' }}
        gl={{ antialias: true, alpha: false }}
      >
        <color attach="background" args={['#090d16']} />
        
        {/* Futuristic Grid and Lighting */}
        <gridHelper args={[10, 20, '#0ea5e9', '#1e293b']} position={[0, -1.2, 0]} />
        <ambientLight intensity={0.4} />
        <directionalLight position={[10, 10, 5]} intensity={0.8} />
        <directionalLight position={[-10, -10, -5]} intensity={0.3} />

        <Center>
          <Model gender={gender} viewMode={viewMode} weight={weight} />
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
            intensity={1.2} 
            luminanceThreshold={0.15} 
            luminanceSmoothing={0.9} 
          />
        </EffectComposer>
      </Canvas>

      {/* Floating Toggle Controls Overlay */}
      <div 
        style={{ 
          position: 'absolute', 
          top: '12px', 
          right: '12px', 
          zIndex: 10, 
          display: 'flex', 
          gap: '0.25rem', 
          background: 'rgba(15, 23, 42, 0.85)', 
          padding: '0.25rem', 
          borderRadius: '20px', 
          border: '1px solid rgba(255, 255, 255, 0.1)' 
        }}
      >
        <button
          type="button"
          onClick={() => setViewMode('wireframe')}
          style={{ 
            background: viewMode === 'wireframe' ? '#3b82f6' : 'transparent', 
            color: '#fff', 
            border: 'none', 
            padding: '0.35rem 0.75rem', 
            borderRadius: '15px', 
            fontSize: '0.65rem', 
            cursor: 'pointer', 
            fontWeight: 600,
            transition: 'background 0.2s ease'
          }}
        >
          Lưới Neon
        </button>
        <button
          type="button"
          onClick={() => setViewMode('heatmap')}
          style={{ 
            background: viewMode === 'heatmap' ? '#3b82f6' : 'transparent', 
            color: '#fff', 
            border: 'none', 
            padding: '0.35rem 0.75rem', 
            borderRadius: '15px', 
            fontSize: '0.65rem', 
            cursor: 'pointer', 
            fontWeight: 600,
            transition: 'background 0.2s ease'
          }}
        >
          Nhiệt độ
        </button>
      </div>
    </div>
  );
};
