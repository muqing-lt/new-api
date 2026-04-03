import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { API, showError } from '../../helpers';
import { ITEMS_PER_PAGE } from '../../constants';

export const useInvitationData = () => {
  const { t } = useTranslation();

  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activePage, setActivePage] = useState(1);
  const [pageSize, setPageSize] = useState(ITEMS_PER_PAGE);
  const [userCount, setUserCount] = useState(0);
  const [searchKeyword, setSearchKeyword] = useState('');

  // 邀请详情弹窗
  const [showInviteeModal, setShowInviteeModal] = useState(false);
  const [showRecordModal, setShowRecordModal] = useState(false);
  const [selectedUser, setSelectedUser] = useState(null);

  const loadUsers = async (page, size, keyword = '') => {
    setLoading(true);
    let url = `/api/user/aff/list?p=${page}&page_size=${size}`;
    if (keyword) {
      url += `&keyword=${encodeURIComponent(keyword)}`;
    }
    const res = await API.get(url);
    const { success, message, data } = res.data;
    if (success) {
      const items = data.items || [];
      setUsers(items.map((u) => ({ ...u, key: u.id })));
      setActivePage(data.page);
      setUserCount(data.total);
    } else {
      showError(message);
    }
    setLoading(false);
  };

  const handleSearch = (keyword) => {
    setSearchKeyword(keyword);
    setActivePage(1);
    loadUsers(1, pageSize, keyword);
  };

  const handlePageChange = (page) => {
    setActivePage(page);
    loadUsers(page, pageSize, searchKeyword);
  };

  const handlePageSizeChange = (size) => {
    localStorage.setItem('page-size', size + '');
    setPageSize(size);
    setActivePage(1);
    loadUsers(1, size, searchKeyword);
  };

  const refresh = () => {
    loadUsers(activePage, pageSize, searchKeyword);
  };

  const openInviteeModal = (user) => {
    setSelectedUser(user);
    setShowInviteeModal(true);
  };

  const openRecordModal = (user) => {
    setSelectedUser(user);
    setShowRecordModal(true);
  };

  useEffect(() => {
    loadUsers(1, pageSize);
  }, []);

  return {
    users,
    loading,
    activePage,
    pageSize,
    userCount,
    searchKeyword,
    handleSearch,
    handlePageChange,
    handlePageSizeChange,
    refresh,
    showInviteeModal,
    setShowInviteeModal,
    showRecordModal,
    setShowRecordModal,
    selectedUser,
    openInviteeModal,
    openRecordModal,
    t,
  };
};
