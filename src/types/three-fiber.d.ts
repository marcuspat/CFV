import '@react-three/fiber';

declare global {
  namespace JSX {
    interface IntrinsicElements {
      group: any;
      mesh: any;
      meshStandardMaterial: any;
      meshBasicMaterial: any;
      ringGeometry: any;
      sphereGeometry: any;
      boxGeometry: any;
      lineGeometry: any;
      ambientLight: any;
      directionalLight: any;
      pointLight: any;
      gridHelper: any;
    }
  }
}

export {};
