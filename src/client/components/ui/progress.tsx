import React from 'react';

interface ProgressProps {
  value: number;
  max?: number;
  className?: string;
  showLabel?: boolean;
  variant?: 'default' | 'success' | 'warning' | 'danger';
}

const Progress: React.FC<ProgressProps> = ({
  value,
  max = 100,
  className = '',
  showLabel = false,
  variant = 'default'
}) => {
  const percentage = Math.round((value / max) * 100);

  const baseClasses = 'w-full bg-gray-200 rounded-full h-2.5';
  const fillClasses = {
    default: 'bg-blue-600',
    success: 'bg-green-600',
    warning: 'bg-yellow-600',
    danger: 'bg-red-600'
  };

  const fillClassesVariant = fillClasses[variant];

  return (
    <div className={className}>
      <div
        className={fillClassesVariant}
        style={{ width: `${percentage}%` }}
      />
      {showLabel && (
        <span className="sr-only">{percentage}% complete</span>
      )}
    </div>
  );
};

export { Progress };