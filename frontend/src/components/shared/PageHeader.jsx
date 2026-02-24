/**
 * Page Header Component
 * Consistent header layout for all pages
 */
import React from 'react';

const PageHeader = ({
  title,
  subtitle,
  actions,
  icon: Icon
}) => {
  return (
    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
      <div>
        <h1 className="text-xl lg:text-2xl font-bold flex items-center gap-2" style={{ fontFamily: 'Manrope, sans-serif' }}>
          {Icon && <Icon className="w-6 h-6" />}
          {title}
        </h1>
        {subtitle && (
          <p className="text-sm text-muted-foreground">
            {subtitle}
          </p>
        )}
      </div>
      {actions && (
        <div className="flex gap-2 flex-wrap">
          {actions}
        </div>
      )}
    </div>
  );
};

export default PageHeader;
