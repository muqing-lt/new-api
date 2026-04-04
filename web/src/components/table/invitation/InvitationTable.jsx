import React, { useMemo } from 'react';
import { Empty } from '@douyinfe/semi-ui';
import {
  IllustrationNoResult,
  IllustrationNoResultDark,
} from '@douyinfe/semi-illustrations';
import CardTable from '../../common/ui/CardTable';
import { getInvitationColumns } from './InvitationColumnDefs';

const InvitationTable = ({
  users,
  loading,
  activePage,
  pageSize,
  userCount,
  handlePageChange,
  handlePageSizeChange,
  handleSortChange,
  openInviteeModal,
  openRecordModal,
  t,
}) => {
  const columns = useMemo(
    () => getInvitationColumns({ t, openInviteeModal, openRecordModal }),
    [t, openInviteeModal, openRecordModal],
  );

  return (
    <CardTable
      columns={columns}
      dataSource={users}
      scroll={{ x: 'max-content' }}
      pagination={{
        currentPage: activePage,
        pageSize: pageSize,
        total: userCount,
        pageSizeOpts: [10, 20, 50, 100],
        showSizeChanger: true,
        onPageSizeChange: handlePageSizeChange,
        onPageChange: handlePageChange,
      }}
      hidePagination={true}
      loading={loading}
      onChange={({ sorter }) => {
        if (sorter && handleSortChange) {
          handleSortChange(sorter.dataIndex, sorter.sortOrder);
        }
      }}
      empty={
        <Empty
          image={<IllustrationNoResult style={{ width: 150, height: 150 }} />}
          darkModeImage={
            <IllustrationNoResultDark style={{ width: 150, height: 150 }} />
          }
          description={t('搜索无结果')}
          style={{ padding: 30 }}
        />
      }
      className='overflow-hidden'
      size='middle'
    />
  );
};

export default InvitationTable;
