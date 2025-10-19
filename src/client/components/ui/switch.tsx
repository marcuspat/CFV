import React, { useState } from 'react';

interface SwitchProps {
  checked?: boolean;
  onChange?: (checked: boolean) => void;
  onCheckedChange?: (checked: boolean) => void;
  className?: string;
  disabled?: boolean;
  label?: string;
}

const Switch: React.FC<SwitchProps> = ({
  checked: controlledChecked,
  onChange,
  onCheckedChange,
  className = '',
  disabled = false,
  label
}) => {
  const [internalChecked, setInternalChecked] = useState(controlledChecked ?? false);
  const actualChecked = controlledChecked !== undefined ? controlledChecked : internalChecked;

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newChecked = e.target.checked;
    setInternalChecked(newChecked);
    onChange?.(newChecked);
    onCheckedChange?.(newChecked);
  };

  return (
    <div className={`flex items-center ${className}`}>
      {label && (
        <label className="mr-3 text-sm font-medium text-gray-700">
          {label}
        </label>
      )}
      <button
        type="button"
        role="switch"
        aria-checked={actualChecked}
        onClick={() => {
          const newChecked = !actualChecked;
          setInternalChecked(newChecked);
          onChange?.(newChecked);
        }}
        disabled={disabled}
        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 ${
          actualChecked ? 'bg-blue-600' : 'bg-gray-200'
        }`}
      >
        <span
          className={`${
            actualChecked ? 'translate-x-6' : 'translate-x-1'
          } inline-block h-4 w-4 rounded-full bg-white transition-transform`}
        />
      </button>
    </div>
  );
};

export { Switch };