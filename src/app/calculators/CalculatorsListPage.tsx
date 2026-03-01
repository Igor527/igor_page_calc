import React from 'react';
import PageLayout from '@/components/PageLayout';

const CalculatorsListPage: React.FC<{ isAdmin?: boolean }> = ({ isAdmin = false }) => {
  return <PageLayout pageId="calculators" isAdmin={isAdmin} />;
};

export default CalculatorsListPage;
