import { useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import { COLS, ROWS, N } from '../physics/core';
import { colorAt } from '../colors';

export interface Pack3DProps {
  u: number[]; selected: number; onPick: (i: number) => void; explode: number; auto: boolean; showPlate: boolean;
  flow: number; laneU: number[]; cutRow: number; heatColors: boolean;
}
const pos = (i: number, ex: number): [number, number, number] => {
  const r = Math.floor(i / COLS), c = i % COLS, sp = 1.05 * (1 + ex);
  return [(c - (COLS - 1) / 2) * sp, 0, (r - (ROWS - 1) / 2) * sp];
};
function Cell({ i, u, sel, onPick, ex, dim, heat }: { i: number; u: number; sel: boolean; onPick: () => void; ex: number; dim: boolean; heat: boolean }) {
  const [r, g, b] = colorAt(u), col = heat ? new THREE.Color(r / 255, g / 255, b / 255) : new THREE.Color('#5b7088');
  return (
    <mesh position={pos(i, ex)} onClick={e => { e.stopPropagation(); onPick(); }} scale={sel ? 1.06 : 1} visible={!dim}>
      <cylinderGeometry args={[0.44, 0.44, 2.2, 28]} />
      <meshStandardMaterial color={col} emissive={col} emissiveIntensity={heat ? 0.15 + 0.7 * u * u : 0.05} metalness={0.35} roughness={0.4} />
    </mesh>
  );
}
function Coolant({ flow, laneU, ex }: { flow: number; laneU: number[]; ex: number }) {
  const refs = useRef<(THREE.Mesh | null)[]>([]);
  const PER = 9;
  useFrame(({ clock }) => {
    const t = clock.getElapsedTime(), sp = 0.04 + (flow / 100) * 0.35, span = COLS * 1.05 * (1 + ex);
    refs.current.forEach((m, k) => {
      if (!m) return; const lane = Math.floor(k / PER), j = k % PER, ph = (t * sp + j / PER) % 1;
      m.position.set((ph - 0.5) * span, -1.3, (lane - (ROWS - 1) / 2) * 1.05 * (1 + ex));
    });
  });
  return <>{Array.from({ length: ROWS * PER }, (_, k) => {
    const [r, g, b] = colorAt(laneU[Math.floor(k / PER)] ?? 0.3);
    return <mesh key={k} ref={m => { refs.current[k] = m; }}><sphereGeometry args={[0.07, 8, 8]} /><meshBasicMaterial color={new THREE.Color(r / 255, g / 255, b / 255)} /></mesh>;
  })}</>;
}
export default function Pack3D(p: Pack3DProps) {
  return (
    <Canvas camera={{ position: [7.5, 6.5, 9], fov: 45 }} dpr={[1, 2]} style={{ height: 460 }}>
      <color attach="background" args={['#05080e']} />
      <ambientLight intensity={0.7} /><directionalLight position={[6, 10, 5]} intensity={1.2} /><pointLight position={[-6, 3, -6]} intensity={0.6} color="#35d6ff" />
      <gridHelper args={[18, 18, '#1c2a3d', '#101b2a']} position={[0, -1.5, 0]} />
      {Array.from({ length: N }, (_, i) => (
        <Cell key={i} i={i} u={p.u[i] ?? 0} sel={i === p.selected} onPick={() => p.onPick(i)} ex={p.explode} dim={p.cutRow >= 0 && Math.floor(i / COLS) === p.cutRow} heat={p.heatColors} />
      ))}
      <mesh position={[0, 1.15, 0]}><boxGeometry args={[COLS * 1.05 * (1 + p.explode) + 0.2, 0.06, 0.18]} /><meshStandardMaterial color="#b88a3a" metalness={0.8} roughness={0.3} /></mesh>
      {p.showPlate && <>
        <mesh position={[0, -1.42, 0]}><boxGeometry args={[COLS * 1.05 * (1 + p.explode) + 0.5, 0.1, ROWS * 1.05 * (1 + p.explode) + 0.5]} /><meshStandardMaterial color="#1e3a5f" transparent opacity={0.55} /></mesh>
        <Coolant flow={p.flow} laneU={p.laneU} ex={p.explode} />
      </>}
      <OrbitControls enableDamping autoRotate={p.auto} autoRotateSpeed={0.8} minDistance={5} maxDistance={24} />
    </Canvas>
  );
}
