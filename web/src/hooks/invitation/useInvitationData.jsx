import { useState, useEffect, useRef, useCallback } from 'react';
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
  const [sortField, setSortField] = useState('');
  const [sortOrder, setSortOrder] = useState('');

  // 邀请详情弹窗
  const [showInviteeModal, setShowInviteeModal] = useState(false);
  const [showRecordModal, setShowRecordModal] = useState(false);
  const [selectedUser, setSelectedUser] = useState(null);

  // 用 ref 保存最新状态，供 interval 回调使用
  const stateRef = useRef({ activePage: 1, pageSize: ITEMS_PER_PAGE, searchKeyword: '', sortField: '', sortOrder: '' });
  stateRef.current = { activePage, pageSize, searchKeyword, sortField, sortOrder };

  const loadUsers = useCallback(async (page, size, keyword = '', sort = '', order = '') => {
    setLoading(true);
    let url = `/api/user/aff/list?p=${page}&page_size=${size}`;
    if (keyword) {
      url += `&keyword=${encodeURIComponent(keyword)}`;
    }
    if (sort) {
      url += `&sort=${encodeURIComponent(sort)}&order=${encodeURIComponent(order)}`;
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
  }, []);

  const handleSearch = (keyword) => {
    setSearchKeyword(keyword);
    setActivePage(1);
    loadUsers(1, pageSize, keyword, sortField, sortOrder);
  };

  const handlePageChange = (page) => {
    setActivePage(page);
    loadUsers(page, pageSize, searchKeyword, sortField, sortOrder);
  };

  const handlePageSizeChange = (size) => {
    localStorage.setItem('page-size', size + '');
    setPageSize(size);
    setActivePage(1);
    loadUsers(1, size, searchKeyword, sortField, sortOrder);
  };

  const handleSortChange = (sortKey, order) => {
    // Semi Design Table: order 为 'ascend' / 'descend' / false
    const newField = order ? sortKey : '';
    const newOrder = order === 'ascend' ? 'asc' : order === 'descend' ? 'desc' : '';
    setSortField(newField);
    setSortOrder(newOrder);
    setActivePage(1);
    loadUsers(1, pageSize, searchKeyword, newField, newOrder);
  };

  const refresh = () => {
    loadUsers(activePage, pageSize, searchKeyword, sortField, sortOrder);
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
    // 每 60 秒自动刷新
    const interval = setInterval(() => {
      const s = stateRef.current;
      loadUsers(s.activePage, s.pageSize, s.searchKeyword, s.sortField, s.sortOrder);
    }, 60000);
    return () => clearInterval(interval);
  }, [loadUsers, pageSize]);

  return {
    users,
    loading,
    activePage,
    pageSize,
    userCount,
    searchKeyword,
    sortField,
    sortOrder,
    handleSearch,
    handlePageChange,
    handlePageSizeChange,
    handleSortChange,
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
