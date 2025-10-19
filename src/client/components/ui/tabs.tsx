import React, { useState } from 'react';

interface TabsProps {
  children: React.ReactNode;
  className?: string;
  defaultActive?: string;
  value?: string;
  onValueChange?: (value: string) => void;
}

interface TabProps {
  label: string;
  value: string;
  children: React.ReactNode;
  className?: string;
}

interface TabContentProps {
  value: string;
  children: React.ReactNode;
  className?: string;
}

interface TabsListProps {
  children: React.ReactNode;
  className?: string;
}

interface TabsTriggerProps {
  value: string;
  children: React.ReactNode;
  className?: string;
}

export const Tabs: React.FC<TabsProps> = ({
  children,
  className = '',
  defaultActive = '',
  value,
  onValueChange
}) => {
  const [internalActiveTab, setInternalActiveTab] = useState(defaultActive);
  const activeTab = value !== undefined ? value : internalActiveTab;

  const handleTabChange = (newValue: string) => {
    if (value === undefined) {
      setInternalActiveTab(newValue);
    }
    onValueChange?.(newValue);
  };

  // Extract tab headers from children
  const tabHeaders = React.Children.toArray(children).map((child) => {
    if (React.isValidElement(child)) {
      const props = child.props as TabProps;
      if (props.value) {
        return {
          value: props.value,
          label: props.label,
          className: props.className
        };
      }
    }
    return null;
  }).filter((tab): tab is NonNullable<typeof tab> => tab !== null);

  const activeContent = React.Children.toArray(children).find((child) => {
    if (React.isValidElement(child)) {
      const props = child.props as TabProps;
      return props.value === activeTab;
    }
    return false;
  });

  return (
    <div className={className}>
      <div className="border-b border-gray-200">
        <nav className="-mb-px flex space-x-8">
          {tabHeaders.map((tab) => (
            <button
              key={tab.value}
              onClick={() => handleTabChange(tab.value)}
              className={`py-2 px-1 border-b-2 font-medium text-sm ${
                activeTab === tab.value
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              } ${tab.className || ''}`}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </div>
      <div className="mt-4">
        {activeContent}
      </div>
    </div>
  );
};

export const Tab: React.FC<TabProps> = ({ children }) => {
  return <>{children}</>;
};

export const TabContent: React.FC<TabContentProps> = ({ children }) => {
  return <div>{children}</div>;
};

export const TabsList: React.FC<TabsListProps> = ({ children, className = '' }) => (
  <div className={`flex space-x-1 ${className}`}>
    {children}
  </div>
);

export const TabsTrigger: React.FC<TabsTriggerProps> = ({ value, children, className = '' }) => (
  <button
    className={`px-3 py-2 text-sm font-medium rounded-md ${className}`}
    onClick={() => {
      // This would be handled by the parent Tabs component
    }}
  >
    {children}
  </button>
);

export { TabContent as TabsContent }; // Alias for compatibility