import React, { useMemo, useEffect, useRef } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls, useGLTF, PerspectiveCamera, Html } from '@react-three/drei';
import { EffectComposer, Bloom } from '@react-three/postprocessing';
import * as THREE from 'three';
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';
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
      // Map vertical height Y to smooth cyan -> lime -> yellow -> red tension gradient
      float normY = clamp((vWorldPosition.y - minY) / (maxY - minY), 0.0, 1.0);
      
      vec3 colorLow = vec3(0.0, 0.85, 1.0);    // Cyan (Legs/Low tension)
      vec3 colorMid = vec3(0.2, 1.0, 0.3);     // Lime Green (Waist/Mid tension)
      vec3 colorHigh = vec3(1.0, 0.85, 0.0);   // Yellow (Chest/High tension)
      vec3 colorPeak = vec3(1.0, 0.2, 0.3);    // Crimson Red (Shoulders/Peak tension)
      
      vec3 finalColor;
      if (normY < 0.33) {
        finalColor = mix(colorLow, colorMid, normY / 0.33);
      } else if (normY < 0.66) {
        finalColor = mix(colorMid, colorHigh, (normY - 0.33) / 0.33);
      } else {
        finalColor = mix(colorHigh, colorPeak, (normY - 0.66) / 0.34);
      }
      
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
  
  // Deep clone scene objects via SkeletonUtils so male GLTF SkinnedMesh skeleton rotation works properly
  const baseScene = useMemo(() => {
    return SkeletonUtils.clone(scene);
  }, [scene]);

  const wireframeScene = useMemo(() => {
    return SkeletonUtils.clone(scene);
  }, [scene]);

  // Calculate bounding box of the scene to center model on X & Z, while placing feet precisely on grid floor Y = 0
  const { bounds, centerOffset } = useMemo(() => {
    baseScene.updateMatrixWorld(true);
    const box = new THREE.Box3();
    baseScene.traverse((child: any) => {
      if (child.isMesh && child.geometry) {
        child.geometry.computeBoundingBox();
        if (child.geometry.boundingBox) {
          const meshBox = child.geometry.boundingBox.clone();
          meshBox.applyMatrix4(child.matrixWorld);
          box.union(meshBox);
        }
      }
    });
    
    if (box.isEmpty()) {
      box.setFromObject(baseScene);
    }
    
    const size = new THREE.Vector3();
    box.getSize(size);
    
    const center = new THREE.Vector3();
    box.getCenter(center);
    
    // Offset to center model X & Z at 0, and align feet precisely on the grid floor at Y = 0
    const offset = new THREE.Vector3(-center.x, -box.min.y, -center.z);
    
    return {
      bounds: { min: 0, max: size.y },
      centerOffset: offset
    };
  }, [baseScene, path]);

  // Create materials for Sci-Fi Hologram style (Ocean Blue + Cyan Neon grid)
  const solidMaterial = useMemo(() => {
    return new THREE.MeshBasicMaterial({
      color: new THREE.Color('#00d8ff'), // Glowing bright electric sky blue
      transparent: false,
      opacity: 1.0,
      side: THREE.DoubleSide
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
    // 1. Traverse base body scene and ensure vertex normals exist
    baseScene.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        if (child.geometry) {
          child.geometry.computeVertexNormals();
        }
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
        if (child.geometry) {
          child.geometry.computeVertexNormals();
        }
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
  }, [baseScene, wireframeScene, viewMode, solidMaterial, neonMaterial, heatmapMaterial]);

  // Dynamic Y-scale adjustment for heatmap based on heightScale
  useEffect(() => {
    if (heatmapMaterial && heatmapMaterial.uniforms) {
      const heightVal = measurements?.height || 165;
      const heightScale = (heightVal / 165) * 0.95;
      heatmapMaterial.uniforms.minY.value = bounds.min * heightScale;
      heatmapMaterial.uniforms.maxY.value = bounds.max * heightScale;
    }
  }, [heatmapMaterial, bounds, measurements?.height]);

  // Apply Y-rotation (supporting front/side view angle and breathing rotation effect)
  const meshRef = useRef<THREE.Group>(null);
  useFrame((state) => {
    const genderOffset = gender === 'female' ? Math.PI : 0;
    const baseRotationY = (rotationAngle * Math.PI) / 180;
    const targetY = genderOffset + baseRotationY + Math.sin(state.clock.getElapsedTime() * 0.3) * 0.12;

    if (meshRef.current) {
      meshRef.current.rotation.y = targetY;
    }
  });

  // Scale model height by height factor (cm), and width/depth by weight
  const scale = useMemo(() => {
    const baseWeight = gender === 'female' ? 52 : 65;
    const weightFactor = Math.max(0.75, Math.min(1.45, weight / baseWeight));
    
    // Scale height based on physical height in cm (relative to baseline 165cm)
    const heightVal = measurements?.height || 165;
    const heightScale = heightVal / 165;
    const scaleMult = gender === 'female' ? 0.85 : 0.95;
    
    return [weightFactor * scaleMult, heightScale * scaleMult, weightFactor * scaleMult] as [number, number, number];
  }, [gender, weight, measurements]);

  // 5 key measurement ring heights on the body (Y coordinates relative to model origin)
  const measureRings = useMemo(() => [
    { id: 'neck',  y: gender === 'female' ? 1.46 : 1.58, color: '#22d3ee', radius: gender === 'female' ? 0.09 : 0.10 },
    { id: 'chest', y: gender === 'female' ? 1.28 : 1.40, color: '#22d3ee', radius: gender === 'female' ? 0.15 : 0.17 },
    { id: 'waist', y: gender === 'female' ? 1.10 : 1.18, color: '#a78bfa', radius: gender === 'female' ? 0.12 : 0.14 },
    { id: 'hips',  y: gender === 'female' ? 0.90 : 0.97, color: '#f59e0b', radius: gender === 'female' ? 0.16 : 0.17 },
    { id: 'thigh', y: gender === 'female' ? 0.72 : 0.80, color: '#34d399', radius: gender === 'female' ? 0.10 : 0.11 },
  ], [gender]);

  // Position for futuristic wrist radar ring (Wrist joint level)
  const wristRingPos = useMemo(() => [
    gender === 'female' ? -0.32 : 0.50,
    gender === 'female' ? 1.50 : 1.38,
    0
  ] as [number, number, number], [gender]);

  // Derived Y positions for 3D HTML labels to align with exact anatomical landmarks
  const neckPos = useMemo(() => [
    gender === 'female' ? -0.05 : -0.05,
    gender === 'female' ? 1.60 : 1.68,
    0
  ] as [number, number, number], [gender]);

  const shoulderPos = useMemo(() => [
    gender === 'female' ? 0.18 : 0.19,
    gender === 'female' ? 1.52 : 1.62,
    0
  ] as [number, number, number], [gender]);

  const chestPos = useMemo(() => [
    gender === 'female' ? -0.15 : -0.17,
    gender === 'female' ? 1.36 : 1.44,
    0
  ] as [number, number, number], [gender]);

  const armPos = useMemo(() => [
    gender === 'female' ? -0.32 : 0.50,
    gender === 'female' ? 1.50 : 1.38,
    0
  ] as [number, number, number], [gender]);

  const waistPos = useMemo(() => [
    gender === 'female' ? -0.12 : -0.14,
    gender === 'female' ? 1.10 : 1.18,
    0
  ] as [number, number, number], [gender]);

  const hipsPos = useMemo(() => [
    gender === 'female' ? 0.16 : 0.17,
    gender === 'female' ? 0.90 : 0.97,
    0
  ] as [number, number, number], [gender]);

  const thighPos = useMemo(() => [
    gender === 'female' ? -0.14 : -0.17,
    gender === 'female' ? 0.72 : 0.80,
    0
  ] as [number, number, number], [gender]);

  const calfPos = useMemo(() => [
    gender === 'female' ? -0.13 : -0.17,
    gender === 'female' ? 0.34 : 0.38,
    0
  ] as [number, number, number], [gender]);

  const legPos = useMemo(() => [
    gender === 'female' ? 0.11 : 0.14,
    gender === 'female' ? 0.46 : 0.52,
    0
  ] as [number, number, number], [gender]);

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

  // Side view positions
  const chestDepthPos = useMemo(() => [
    gender === 'female' ? 0.14 : 0.16,
    gender === 'female' ? 1.28 : 1.40,
    0
  ] as [number, number, number], [gender]);

  const waistDepthPos = useMemo(() => [
    gender === 'female' ? 0.10 : 0.12,
    gender === 'female' ? 1.10 : 1.18,
    0
  ] as [number, number, number], [gender]);

  const hipsDepthPos = useMemo(() => [
    gender === 'female' ? -0.16 : -0.17,
    gender === 'female' ? 0.90 : 0.97,
    0
  ] as [number, number, number], [gender]);

  // Derived side depth values
  const chestDepthVal = measurements?.chestDepth ? measurements.chestDepth.toFixed(1) : '24.0';
  const waistDepthVal = measurements?.waistDepth ? measurements.waistDepth.toFixed(1) : '20.0';
  const hipsDepthVal = measurements?.hipDepth ? measurements.hipDepth.toFixed(1) : '28.0';

  const isSideView = Math.abs((rotationAngle || 0) - 90) < 45;

  // Apply default rotation to primitive scene contents
  useEffect(() => {
    if (baseScene) baseScene.rotation.set(0, 0, 0);
    if (wireframeScene) wireframeScene.rotation.set(0, 0, 0);
  }, [baseScene, wireframeScene]);

  return (
    <group ref={meshRef} scale={scale}>
      <group position={[centerOffset.x, centerOffset.y, centerOffset.z]}>
        {/* Base solid translucent body */}
        <primitive 
          object={baseScene} 
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

        {/* Clean measurement ring indicators - pure Three.js */}
        {measurements && showLabels && measureRings.map((ring) => (
          <group key={ring.id} position={[0, ring.y, 0]}>
            {/* Glowing horizontal ring line */}
            <mesh rotation={[Math.PI / 2, 0, 0]}>
              <ringGeometry args={[ring.radius - 0.003, ring.radius + 0.003, 64]} />
              <meshBasicMaterial color={ring.color} transparent opacity={0.7} side={THREE.DoubleSide} />
            </mesh>
            {/* Outer subtle glow ring */}
            <mesh rotation={[Math.PI / 2, 0, 0]}>
              <ringGeometry args={[ring.radius - 0.008, ring.radius + 0.008, 64]} />
              <meshBasicMaterial color={ring.color} transparent opacity={0.15} side={THREE.DoubleSide} />
            </mesh>
          </group>
        ))}

        {/* Futuristic 3D Wrist Radar Ring */}
        {measurements && showLabels && (
          <group position={wristRingPos} rotation={[0, 0, Math.PI / 2]}>
            <mesh>
              <ringGeometry args={[0.040, 0.046, 32]} />
              <meshBasicMaterial color="#38bdf8" side={THREE.DoubleSide} transparent opacity={0.85} />
            </mesh>
            <mesh rotation={[Math.PI / 2, 0, 0]}>
              <ringGeometry args={[0.035, 0.040, 32]} />
              <meshBasicMaterial color="#00f2fe" side={THREE.DoubleSide} transparent opacity={0.5} />
            </mesh>
          </group>
        )}

        {/* 9 Staggered HUD HTML Cards to prevent overlapping */}
        {measurements && showLabels && (
          isSideView ? (
            <>
              {/* --- Side View Depth Cards (3 Cards) --- */}
              {/* 1. Sâu mông (Hip Depth) - Left side, width: 20px */}
              <Html position={hipsDepthPos} style={{ pointerEvents: 'none' }} zIndexRange={[1, 5]}>
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  transform: 'translate(-100%, -50%)',
                  fontFamily: 'system-ui, -apple-system, sans-serif'
                }}>
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
                    Sâu mông: <span style={{ color: '#fff' }}>{hipsDepthVal} cm</span>
                  </div>
                  <div style={{
                    width: '20px',
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
                      top: '-2px',
                      boxShadow: '0 0 6px #00f5ff'
                    }} />
                  </div>
                </div>
              </Html>

              {/* 2. Sâu ngực (Chest Depth) - Right side, width: 20px */}
              <Html position={chestDepthPos} style={{ pointerEvents: 'none' }} zIndexRange={[1, 5]}>
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  transform: 'translate(0%, -50%)',
                  fontFamily: 'system-ui, -apple-system, sans-serif'
                }}>
                  <div style={{
                    width: '20px',
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
                      top: '-2px',
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
                    Sâu ngực: <span style={{ color: '#fff' }}>{chestDepthVal} cm</span>
                  </div>
                </div>
              </Html>

              {/* 3. Sâu eo (Waist Depth) - Right side, width: 20px */}
              <Html position={waistDepthPos} style={{ pointerEvents: 'none' }} zIndexRange={[1, 5]}>
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  transform: 'translate(0%, -50%)',
                  fontFamily: 'system-ui, -apple-system, sans-serif'
                }}>
                  <div style={{
                    width: '20px',
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
                      top: '-2px',
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
                    Sâu eo: <span style={{ color: '#fff' }}>{waistDepthVal} cm</span>
                  </div>
                </div>
              </Html>
            </>
          ) : (
            <>
              {/* --- Front View Circumference/Length Cards (9 Cards) --- */}
              {/* 1. Cổ (Neck) - Left side, width: 20px */}
              <Html position={neckPos} style={{ pointerEvents: 'none' }} zIndexRange={[1, 5]}>
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  transform: 'translate(-100%, -50%)',
                  fontFamily: 'system-ui, -apple-system, sans-serif'
                }}>
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
                    Cổ: <span style={{ color: '#fff' }}>{neckVal} cm</span>
                  </div>
                  <div style={{
                    width: '20px',
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
                      top: '-2px',
                      boxShadow: '0 0 6px #00f5ff'
                    }} />
                  </div>
                </div>
              </Html>

              {/* 2. Ngực (Chest) - Left side, width: 20px */}
              <Html position={chestPos} style={{ pointerEvents: 'none' }} zIndexRange={[1, 5]}>
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  transform: 'translate(-100%, -50%)',
                  fontFamily: 'system-ui, -apple-system, sans-serif'
                }}>
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
                    Ngực: <span style={{ color: '#fff' }}>{chestVal} cm</span>
                  </div>
                  <div style={{
                    width: '20px',
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
                      top: '-2px',
                      boxShadow: '0 0 6px #00f5ff'
                    }} />
                  </div>
                </div>
              </Html>

              {/* 3. Eo (Waist) - Left side, width: 20px */}
              <Html position={waistPos} style={{ pointerEvents: 'none' }} zIndexRange={[1, 5]}>
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  transform: 'translate(-100%, -50%)',
                  fontFamily: 'system-ui, -apple-system, sans-serif'
                }}>
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
                    Eo: <span style={{ color: '#fff' }}>{waistVal} cm</span>
                  </div>
                  <div style={{
                    width: '20px',
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
                      top: '-2px',
                      boxShadow: '0 0 6px #00f5ff'
                    }} />
                  </div>
                </div>
              </Html>

              {/* 4. Đùi phải (Right Thigh) - Left side, width: 20px */}
              <Html position={thighPos} style={{ pointerEvents: 'none' }} zIndexRange={[1, 5]}>
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  transform: 'translate(-100%, -50%)',
                  fontFamily: 'system-ui, -apple-system, sans-serif'
                }}>
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
                    Đùi phải: <span style={{ color: '#fff' }}>{thighVal} cm</span>
                  </div>
                  <div style={{
                    width: '20px',
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
                      top: '-2px',
                      boxShadow: '0 0 6px #00f5ff'
                    }} />
                  </div>
                </div>
              </Html>

              {/* 5. Bắp chân (Right Calf) - Left side, width: 20px */}
              <Html position={calfPos} style={{ pointerEvents: 'none' }} zIndexRange={[1, 5]}>
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  transform: 'translate(-100%, -50%)',
                  fontFamily: 'system-ui, -apple-system, sans-serif'
                }}>
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
                    Bắp chân: <span style={{ color: '#fff' }}>{calfVal} cm</span>
                  </div>
                  <div style={{
                    width: '20px',
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
                      top: '-2px',
                      boxShadow: '0 0 6px #00f5ff'
                    }} />
                  </div>
                </div>
              </Html>

              {/* 6. Vai (Shoulder Width) - Right side, width: 20px */}
              <Html position={shoulderPos} style={{ pointerEvents: 'none' }} zIndexRange={[1, 5]}>
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  transform: 'translate(0%, -50%)',
                  fontFamily: 'system-ui, -apple-system, sans-serif'
                }}>
                  <div style={{
                    width: '20px',
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
                      top: '-2px',
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
                    Vai: <span style={{ color: '#fff' }}>{shoulderVal} cm</span>
                  </div>
                </div>
              </Html>

              {/* 7. Dài tay (Arm Length) - Positioned on right hand, but translated LEFT into the gap to prevent screen edge overflow! */}
              <Html position={armPos} style={{ pointerEvents: 'none' }} zIndexRange={[1, 5]}>
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  transform: 'translate(-100%, -50%)',
                  fontFamily: 'system-ui, -apple-system, sans-serif'
                }}>
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
                    Dài tay: <span style={{ color: '#fff' }}>{armVal} cm</span>
                  </div>
                  <div style={{
                    width: '20px',
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
                      top: '-2px',
                      boxShadow: '0 0 6px #00f5ff'
                    }} />
                  </div>
                </div>
              </Html>

              {/* 8. Mông (Hips) - Right side, width: 20px */}
              <Html position={hipsPos} style={{ pointerEvents: 'none' }} zIndexRange={[1, 5]}>
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  transform: 'translate(0%, -50%)',
                  fontFamily: 'system-ui, -apple-system, sans-serif'
                }}>
                  <div style={{
                    width: '20px',
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
                      top: '-2px',
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
                    Mông: <span style={{ color: '#fff' }}>{hipsVal} cm</span>
                  </div>
                </div>
              </Html>

              {/* 9. Dài chân (Leg Length) - Right side, width: 20px */}
              <Html position={legPos} style={{ pointerEvents: 'none' }} zIndexRange={[1, 5]}>
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  transform: 'translate(0%, -50%)',
                  fontFamily: 'system-ui, -apple-system, sans-serif'
                }}>
                  <div style={{
                    width: '20px',
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
                      top: '-2px',
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
                    Dài chân: <span style={{ color: '#fff' }}>{legVal} cm</span>
                  </div>
                </div>
              </Html>
            </>
          )
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
      // Locked level front/side view in PIP mode - centered at body height Y = 0.92
      camera.position.set(0, 0.92, 5.4);
      camera.lookAt(0, 0.92, 0);
    }
  });
  return null;
};

interface Mannequin3DViewProps {
  gender: Gender;
  weight: number;
  scaleFactor: number;
  landmarks: Landmark[];
  rotationAngle?: number;
  view?: 'front' | 'side';
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
  rotationAngle,
  view = 'front',
  cameraResetCounter = 0,
  showLabels = true,
  interactive = true
}) => {
  const modelPath = gender === 'male' ? '/models/low_poly_male_base_-_slender.glb' : '/models/female_base_mesh.glb';
  const fallbackPath = '/models/female_base_mesh.glb';

  const effectiveRotationAngle = (rotationAngle !== undefined && rotationAngle !== 0) ? rotationAngle : (view === 'side' ? 90 : 0);

  // Refs for camera focus target interpolation (default centered at body height Y = 0.92)
  const controlsRef = useRef<any>(null);
  const targetPoint = useRef(new THREE.Vector3(0, 0.92, 0));

  // Reset camera view when counter changes
  useEffect(() => {
    if (cameraResetCounter > 0) {
      if (controlsRef.current) {
        controlsRef.current.reset();
        controlsRef.current.target.set(0, 0.92, 0);
      }
      targetPoint.current.set(0, 0.92, 0);
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
        overflow: 'hidden',
        border: '1px solid rgba(0, 85, 255, 0.15)'
      }}
    >
      {/* 3D WebGL Canvas */}
      <Canvas
        style={{ width: '100%', height: '100%' }}
        gl={{ antialias: true, alpha: false }}
        onPointerMissed={() => {
          targetPoint.current.set(0, 0.92, 0);
        }}
      >
        <color attach="background" args={['#090d16']} />
        
        {/* Camera (Framed at Y = 0.92 so full body and HUD cards fit 100% centered) */}
        <PerspectiveCamera makeDefault position={[0, 0.92, showLabels ? 5.2 : 5.4]} fov={36} />
        
        <CameraController targetPoint={targetPoint} controlsRef={controlsRef} interactive={interactive} />

        {/* Futuristic Grid and Lighting */}
        <gridHelper args={[10, 20, '#0055ff', '#1e293b']} position={[0, 0, 0]} />
        <ambientLight intensity={0.5} />
        <directionalLight position={[10, 10, 5]} intensity={0.9} />
        <directionalLight position={[-10, -10, -5]} intensity={0.4} />

        <group>
          <React.Suspense fallback={null}>
            <ModelErrorBoundary
              fallbackPath={fallbackPath}
              viewMode={meshStyle}
              gender={gender}
              weight={weight}
              measurements={measurements}
              rotationAngle={effectiveRotationAngle}
              onClickModel={handleClickModel}
            >
              <Model 
                path={modelPath} 
                viewMode={meshStyle} 
                gender={gender} 
                weight={weight} 
                measurements={measurements}
                rotationAngle={effectiveRotationAngle}
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
            target={[0, 0.92, 0]}
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
