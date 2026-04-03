import React from 'react';
import { Tag, Space, Button, Tooltip, Typography } from '@douyinfe/semi-ui';
import { renderQuota, renderNumber } from '../../../helpers';

const { Paragraph } = Typography;

export const getInvitationColumns = ({ t, openInviteeModal, openRecordModal }) => {
  return [
    {
      title: 'ID',
      dataIndex: 'id',
      width: 70,
    },
    {
      title: t('用户名'),
      dataIndex: 'username',
      render: (text) => (
        <Paragraph copyable={{ content: text }} style={{ marginBottom: 0 }}>
          {text}
        </Paragraph>
      ),
    },
    {
      title: t('邀请码'),
      dataIndex: 'aff_code',
      render: (text) =>
        text ? (
          <Paragraph copyable={{ content: text }} style={{ marginBottom: 0 }}>
            <Tag color='blue' shape='circle'>
              {text}
            </Tag>
          </Paragraph>
        ) : (
          <Tag color='grey' shape='circle'>
            {t('未设置')}
          </Tag>
        ),
    },
    {
      title: t('邀请人数'),
      dataIndex: 'aff_count',
      render: (text) => (
        <Tag color='cyan' shape='circle'>
          {renderNumber(text)}
        </Tag>
      ),
    },
    {
      title: t('待提取收益'),
      dataIndex: 'aff_quota',
      render: (text) => (
        <Tag color='green' shape='circle'>
          {renderQuota(text)}
        </Tag>
      ),
    },
    {
      title: t('累计收益'),
      dataIndex: 'aff_history_quota',
      render: (text) => (
        <Tag color='orange' shape='circle'>
          {renderQuota(text)}
        </Tag>
      ),
    },
    {
      title: t('邀请人'),
      dataIndex: 'inviter_id',
      render: (text, record) => {
        if (text === 0) {
          return (
            <Tag color='grey' shape='circle'>
              {t('无')}
            </Tag>
          );
        }
        return (
          <Tooltip content={`ID: ${text}`}>
            <Tag color='white' shape='circle'>
              {record.inviter_username || `#${text}`}
            </Tag>
          </Tooltip>
        );
      },
    },
    {
      title: t('操作'),
      dataIndex: 'operate',
      fixed: 'right',
      width: 200,
      render: (text, record) => (
        <Space>
          <Button
            size='small'
            type='primary'
            disabled={record.aff_count === 0}
            onClick={() => openInviteeModal(record)}
          >
            {t('被邀请人')}
          </Button>
          <Button
            size='small'
            type='tertiary'
            disabled={record.aff_history_quota === 0}
            onClick={() => openRecordModal(record)}
          >
            {t('返佣记录')}
          </Button>
        </Space>
      ),
    },
  ];
};
