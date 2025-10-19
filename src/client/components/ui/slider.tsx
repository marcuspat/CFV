import React, { useState } from 'react';

interface SliderProps {
  min?: number;
  max?: number;
  value?: number;
  onChange?: (value: number) => void;
  className?: string;
  disabled?: boolean;
  showValue?: boolean;
}

const Slider: React.FC<SliderProps> = ({
  min = 0,
  max = 100,
  value: controlledValue,
  onChange,
  className = '',
  disabled = false,
  showValue = false
}) => {
  const [internalValue, setInternalValue] = useState(controlledValue ?? min);
  const actualValue = controlledValue !== undefined ? controlledValue : internalValue;

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = parseInt(e.target.value, 10);
    setInternalValue(newValue);
    onChange?.(newValue);
  };

  return (
    <div className={`space-y-2 ${className}`}>
      <input
        type="range"
        min={min}
        max={max}
        value={actualValue}
        onChange={handleChange}
        disabled={disabled}
        className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
      />
      {showValue && (
        <div className="text-sm text-gray-600">
          Value: {actualValue}
        </div>
      )}
    </div>
  );
};

export { Slider };