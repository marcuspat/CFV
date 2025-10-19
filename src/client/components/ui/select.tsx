import React from 'react';

interface SelectProps {
  children: React.ReactNode;
  value?: string;
  onChange?: (value: string) => void;
  onValueChange?: (value: string) => void;
  className?: string;
  placeholder?: string;
  disabled?: boolean;
}

interface SelectContentProps {
  children: React.ReactNode;
  className?: string;
}

interface SelectItemProps {
  value: string;
  children: React.ReactNode;
  className?: string;
}

interface SelectTriggerProps {
  children: React.ReactNode;
  className?: string;
}

interface SelectValueProps {
  placeholder?: string;
  className?: string;
}

export const Select: React.FC<SelectProps> = ({
  children,
  value,
  onChange,
  onValueChange,
  className = '',
  placeholder = '',
  disabled = false
}) => {
  const handleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newValue = e.target.value;
    onChange?.(newValue);
    onValueChange?.(newValue);
  };

  return (
    <select
      value={value}
      onChange={handleChange}
      className={`block w-full px-3 py-2 border border-gray-300 bg-white rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 ${disabled ? 'bg-gray-50' : ''} ${className}`}
      disabled={disabled}
    >
      {placeholder && (
        <option value="" disabled>
          {placeholder}
        </option>
      )}
      {children}
    </select>
  );
};

export const SelectContent: React.FC<SelectContentProps> = ({ children, className = '' }) => (
  <div className={className}>
    {children}
  </div>
);

export const SelectItem: React.FC<SelectItemProps> = ({ value, children, className = '' }) => (
  <option value={value} className={className}>
    {children}
  </option>
);

export const SelectTrigger: React.FC<SelectTriggerProps> = ({ children, className = '' }) => (
  <div className={className}>
    {children}
  </div>
);

export const SelectValue: React.FC<SelectValueProps> = ({ placeholder, className = '' }) => (
  <span className={className}>
    {placeholder}
  </span>
);