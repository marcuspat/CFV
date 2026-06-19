/// <reference types="react-scripts" />

declare module '*.svg' {
  const content: string;
  export default content;
}

declare module '@react-three/fiber' {
  import { FC } from 'react';
  export const Canvas: FC<any>;
  export function useFrame(callback: (state: any, delta: number) => void): void;
  export function useThree(): any;
  export function extend(objects: Record<string, any>): void;
  export type RootState = any;
}

declare module '@react-three/drei' {
  import { FC } from 'react';
  export const OrbitControls: FC<any>;
  export const Html: FC<any>;
  export const Float: FC<any>;
  export const Text: FC<any>;
  export const Sphere: FC<any>;
  export const Box: FC<any>;
  export const Line: FC<any>;
  export const PerspectiveCamera: FC<any>;
}

declare module 'recharts' {
  import { FC } from 'react';
  export const LineChart: FC<any>;
  export const Line: FC<any>;
  export const XAxis: FC<any>;
  export const YAxis: FC<any>;
  export const CartesianGrid: FC<any>;
  export const Tooltip: FC<any>;
  export const Legend: FC<any>;
  export const ResponsiveContainer: FC<any>;
  export const AreaChart: FC<any>;
  export const Area: FC<any>;
  export const BarChart: FC<any>;
  export const Bar: FC<any>;
  export const PieChart: FC<any>;
  export const Pie: FC<any>;
  export const Cell: FC<any>;
  export const RadarChart: FC<any>;
  export const PolarGrid: FC<any>;
  export const PolarAngleAxis: FC<any>;
  export const PolarRadiusAxis: FC<any>;
  export const Radar: FC<any>;
}

declare module 'web-vitals' {
  export type ReportHandler = (metric: {
    id: string;
    name: string;
    value: number;
    rating: string;
    delta: number;
  }) => void;

  export function getCLS(callback: ReportHandler): void;
  export function getFID(callback: ReportHandler): void;
  export function getFCP(callback: ReportHandler): void;
  export function getLCP(callback: ReportHandler): void;
  export function getTTFB(callback: ReportHandler): void;
}

declare namespace JSX {
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
