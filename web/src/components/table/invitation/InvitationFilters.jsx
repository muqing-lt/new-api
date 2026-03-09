import React, { useRef } from 'react';
import { Form, Button } from '@douyinfe/semi-ui';
import { IconSearch } from '@douyinfe/semi-icons';

const InvitationFilters = ({ handleSearch, loading, t }) => {
  const formApiRef = useRef(null);

  const handleReset = () => {
    if (!formApiRef.current) return;
    formApiRef.current.reset();
    setTimeout(() => {
      handleSearch('');
    }, 100);
  };

  return (
    <Form
      getFormApi={(api) => {
        formApiRef.current = api;
      }}
      onSubmit={() => {
        const keyword = formApiRef.current?.getValue('keyword') || '';
        handleSearch(keyword);
      }}
      allowEmpty={true}
      autoComplete='off'
      layout='horizontal'
      className='w-full md:w-auto'
    >
      <div className='flex flex-col md:flex-row items-center gap-2 w-full md:w-auto'>
        <div className='relative w-full md:w-64'>
          <Form.Input
            field='keyword'
            prefix={<IconSearch />}
            placeholder={t('搜索用户名或邀请码')}
            showClear
            pure
            size='small'
          />
        </div>
        <div className='flex gap-2 w-full md:w-auto'>
          <Button
            type='tertiary'
            htmlType='submit'
            loading={loading}
            className='flex-1 md:flex-initial md:w-auto'
            size='small'
          >
            {t('查询')}
          </Button>
          <Button
            type='tertiary'
            onClick={handleReset}
            className='flex-1 md:flex-initial md:w-auto'
            size='small'
          >
            {t('重置')}
          </Button>
        </div>
      </div>
    </Form>
  );
};

export default InvitationFilters;
