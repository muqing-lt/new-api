import React from 'react';
import { useTranslation } from 'react-i18next';
import DocumentRenderer from '../../components/common/DocumentRenderer';

const TopupAgreement = () => {
  const { t } = useTranslation();

  return (
    <DocumentRenderer
      apiEndpoint='/api/topup-agreement'
      title={t('充值协议')}
      cacheKey='topup_agreement'
      emptyMessage={t('加载充值协议内容失败...')}
    />
  );
};

export default TopupAgreement;
