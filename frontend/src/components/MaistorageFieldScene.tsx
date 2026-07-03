"use client";

import { Canvas, useFrame } from "@react-three/fiber";
import { Line, Points, PointMaterial } from "@react-three/drei";
import { Bloom, EffectComposer } from "@react-three/postprocessing";
import { useMemo, useRef } from "react";
import type { Group } from "three";

const POINT_COUNT = 72;

function FieldGeometry() {
  const groupRef = useRef<Group>(null);
  const points = useMemo(() => {
    const values: number[] = [];
    for (let index = 0; index < POINT_COUNT; index += 1) {
      const lane = (index % 9) - 4;
      const depth = Math.floor(index / 9) - 4;
      values.push(lane * 0.82, Math.sin(index * 0.7) * 0.12, depth * 0.68);
    }
    return new Float32Array(values);
  }, []);

  const lines = useMemo(() => {
    return Array.from({ length: 9 }, (_, lane) => {
      const x = (lane - 4) * 0.82;
      return [
        [x, -0.05, -3.4],
        [x + 0.18, 0.05, -1.8],
        [x - 0.12, 0.0, 0.2],
        [x + 0.08, 0.08, 2.6],
      ] as [number, number, number][];
    });
  }, []);

  useFrame((state) => {
    if (!groupRef.current) return;
    groupRef.current.rotation.y = Math.sin(state.clock.elapsedTime * 0.12) * 0.08;
    groupRef.current.position.y = Math.sin(state.clock.elapsedTime * 0.2) * 0.04;
  });

  return (
    <group ref={groupRef} rotation={[0.82, 0, -0.12]} position={[0.2, -0.18, 0]}>
      <Points positions={points} stride={3} frustumCulled>
        <PointMaterial
          transparent
          color="#ff981a"
          size={0.035}
          sizeAttenuation
          depthWrite={false}
          opacity={0.52}
        />
      </Points>
      {lines.map((line, index) => (
        <Line
          key={index}
          points={line}
          color={index % 3 === 0 ? "#ff981a" : "#102b5c"}
          lineWidth={index % 3 === 0 ? 0.7 : 0.45}
          transparent
          opacity={index % 3 === 0 ? 0.34 : 0.22}
        />
      ))}
    </group>
  );
}

export default function MaistorageFieldScene() {
  return (
    <div
      className="pointer-events-none fixed inset-0 z-0 opacity-80 max-md:hidden motion-reduce:hidden"
      aria-hidden="true"
    >
      <Canvas
        camera={{ position: [0, 2.2, 5.8], fov: 48 }}
        dpr={[1, 1.4]}
        gl={{ antialias: false, powerPreference: "low-power", alpha: true }}
      >
        <ambientLight intensity={0.65} />
        <FieldGeometry />
        <EffectComposer enableNormalPass={false}>
          <Bloom intensity={0.18} luminanceThreshold={0.55} mipmapBlur />
        </EffectComposer>
      </Canvas>
    </div>
  );
}
