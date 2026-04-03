import React from 'react';
import { Typography, Card, Progress, Tag } from '@douyinfe/semi-ui';
import { TrendingUp } from 'lucide-react';
import { renderQuota } from '../../helpers';

const { Text } = Typography;

const CommissionTierCard = ({ t, dashboardData }) => {
  if (!dashboardData) return null;

  const {
    current_rate,
    default_rate,
    tiers,
    current_tier,
    next_tier,
    progress,
    remaining,
    aff_history_quota,
  } = dashboardData;

  const isHighest = !next_tier && current_tier;

  return (
    <Card
      className='!rounded-xl w-full'
      title={
        <div className='flex items-center gap-2'>
          <TrendingUp size={16} />
          <Text>{t('返佣等级')}</Text>
        </div>
      }
    >
      <div className='space-y-4'>
        {/* 当前返佣比例 */}
        <div className='text-center py-2'>
          <div className='text-4xl font-bold' style={{ color: 'var(--semi-color-primary)' }}>
            {current_rate}%
          </div>
          <Text type='tertiary' className='text-sm'>
            {t('当前返佣比例')}
          </Text>
        </div>

        {/* 阶梯列表 */}
        {tiers && tiers.length > 0 && (
          <div className='space-y-2'>
            {/* 默认比例 */}
            <div className='flex justify-between items-center px-3 py-2 rounded-lg bg-[var(--semi-color-fill-0)]'>
              <Text type='tertiary' className='text-sm'>
                {t('默认比例')}
              </Text>
              <Tag size='small' color='grey'>
                {default_rate}%
              </Tag>
            </div>
            {/* 阶梯规则 */}
            {tiers.map((tier, index) => {
              const isCurrent = current_tier && current_tier.threshold === tier.threshold && current_tier.rate === tier.rate;
              return (
                <div
                  key={index}
                  className={`flex justify-between items-center px-3 py-2 rounded-lg ${isCurrent ? 'bg-[var(--semi-color-primary-light-default)]' : 'bg-[var(--semi-color-fill-0)]'}`}
                >
                  <Text type={isCurrent ? 'primary' : 'tertiary'} className='text-sm'>
                    {t('累计返佣达到')} {renderQuota(tier.threshold)}
                  </Text>
                  <Tag size='small' color={isCurrent ? 'blue' : 'grey'}>
                    {tier.rate}%
                  </Tag>
                </div>
              );
            })}
          </div>
        )}

        {/* 进度条 */}
        <div className='pt-2'>
          <div className='flex justify-between items-center mb-2'>
            <Text type='tertiary' className='text-xs'>
              {renderQuota(aff_history_quota)}
            </Text>
            <Text type='tertiary' className='text-xs'>
              {isHighest
                ? t('已达最高阶梯')
                : next_tier
                  ? renderQuota(next_tier.threshold)
                  : ''}
            </Text>
          </div>
          <Progress
            percent={progress}
            showInfo={false}
            stroke={isHighest ? 'var(--semi-color-success)' : 'var(--semi-color-primary)'}
            aria-label='Commission progress'
          />
          <div className='text-center mt-2'>
            <Text type='tertiary' className='text-xs'>
              {isHighest
                ? t('已达最高阶梯')
                : next_tier
                  ? `${t('距下一阶梯还差')} ${renderQuota(remaining)}`
                  : ''}
            </Text>
          </div>
        </div>
      </div>
    </Card>
  );
};

export default CommissionTierCard;
