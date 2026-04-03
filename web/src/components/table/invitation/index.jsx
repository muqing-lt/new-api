import React from 'react';
import CardPro from '../../common/ui/CardPro';
import InvitationTable from './InvitationTable';
import InvitationFilters from './InvitationFilters';
import InviteeListModal from './modals/InviteeListModal';
import CommissionRecordModal from './modals/CommissionRecordModal';
import { useInvitationData } from '../../../hooks/invitation/useInvitationData';
import { useIsMobile } from '../../../hooks/common/useIsMobile';
import { createCardProPagination } from '../../../helpers/utils';

const InvitationPage = () => {
  const invitationData = useInvitationData();
  const isMobile = useIsMobile();

  const {
    showInviteeModal,
    setShowInviteeModal,
    showRecordModal,
    setShowRecordModal,
    selectedUser,
    handleSearch,
    loading,
    t,
  } = invitationData;

  return (
    <>
      <InviteeListModal
        visible={showInviteeModal}
        onCancel={() => setShowInviteeModal(false)}
        user={selectedUser}
      />

      <CommissionRecordModal
        visible={showRecordModal}
        onCancel={() => setShowRecordModal(false)}
        user={selectedUser}
      />

      <CardPro
        type='type1'
        actionsArea={
          <div className='flex flex-col md:flex-row justify-end items-center gap-2 w-full'>
            <InvitationFilters
              handleSearch={handleSearch}
              loading={loading}
              t={t}
            />
          </div>
        }
        paginationArea={createCardProPagination({
          currentPage: invitationData.activePage,
          pageSize: invitationData.pageSize,
          total: invitationData.userCount,
          onPageChange: invitationData.handlePageChange,
          onPageSizeChange: invitationData.handlePageSizeChange,
          isMobile: isMobile,
          t: invitationData.t,
        })}
        t={invitationData.t}
      >
        <InvitationTable {...invitationData} />
      </CardPro>
    </>
  );
};

export default InvitationPage;
