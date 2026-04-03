/*
Copyright (C) 2025 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.

For commercial licensing, please contact support@quantumnous.com
*/

import React, { useEffect, useState, useRef } from 'react';
import {
  Button,
  Col,
  Form,
  Row,
  Spin,
  Typography,
  Space,
  Tag,
  Toast,
} from '@douyinfe/semi-ui';
import { IconPlus, IconDelete } from '@douyinfe/semi-icons';
import { useTranslation } from 'react-i18next';
import {
  compareObjects,
  API,
  showError,
  showSuccess,
  showWarning,
} from '../../../helpers';

const DEFAULT_INPUTS = {
  QuotaForNewUser: '',
  PreConsumedQuota: '',
  QuotaForInviter: '',
  QuotaForInvitee: '',
  AffCommissionEnabled: false,
  AffCommissionRate: '5',
  AffCommissionTiers: '',
  'quota_setting.enable_free_model_pre_consume': true,
};

export default function SettingsCreditLimit(props) {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(false);
  const [inputs, setInputs] = useState(DEFAULT_INPUTS);
  const refForm = useRef();
  const [inputsRow, setInputsRow] = useState(inputs);
  const [tiers, setTiers] = useState([]);

  function onSubmit() {
    const updateArray = compareObjects(inputs, inputsRow);
    if (!updateArray.length) return showWarning(t('你似乎并没有修改什么'));
    const requestQueue = updateArray.map((item) => {
      let value = '';
      if (typeof inputs[item.key] === 'boolean') {
        value = String(inputs[item.key]);
      } else {
        value = inputs[item.key];
      }
      return API.put('/api/option/', {
        key: item.key,
        value,
      });
    });
    setLoading(true);
    Promise.all(requestQueue)
      .then((res) => {
        if (requestQueue.length === 1) {
          if (res.includes(undefined)) return;
        } else if (requestQueue.length > 1) {
          if (res.includes(undefined))
            return showError(t('部分保存失败，请重试'));
        }
        showSuccess(t('保存成功'));
        props.refresh();
      })
      .catch(() => {
        showError(t('保存失败，请重试'));
      })
      .finally(() => {
        setLoading(false);
      });
  }

  useEffect(() => {
    const currentInputs = { ...DEFAULT_INPUTS };
    const allowedKeys = Object.keys(DEFAULT_INPUTS);
    for (let key in props.options) {
      if (allowedKeys.includes(key)) {
        currentInputs[key] = props.options[key];
      }
    }
    if (typeof currentInputs.AffCommissionEnabled === 'string') {
      currentInputs.AffCommissionEnabled =
        currentInputs.AffCommissionEnabled === 'true';
    }
    setInputs(currentInputs);
    setInputsRow(structuredClone(currentInputs));
    refForm.current?.setValues(currentInputs);
    if (currentInputs.AffCommissionTiers) {
      try {
        const parsed = JSON.parse(currentInputs.AffCommissionTiers);
        setTiers(parsed);
      } catch {
        setTiers([]);
      }
    }
  }, [props.options]);

  const addTier = () => {
    const newTiers = [...tiers, { threshold: 0, rate: 0 }];
    setTiers(newTiers);
    const tiersJson = JSON.stringify(newTiers);
    setInputs({ ...inputs, AffCommissionTiers: tiersJson });
  };

  const removeTier = (index) => {
    const newTiers = tiers.filter((_, i) => i !== index);
    setTiers(newTiers);
    const tiersJson = newTiers.length > 0 ? JSON.stringify(newTiers) : '';
    setInputs({ ...inputs, AffCommissionTiers: tiersJson });
  };

  const updateTier = (index, field, value) => {
    const newTiers = tiers.map((tier, i) =>
      i === index ? { ...tier, [field]: Number(value) } : tier,
    );
    setTiers(newTiers);
    const tiersJson = JSON.stringify(newTiers);
    setInputs({ ...inputs, AffCommissionTiers: tiersJson });
  };
  return (
    <>
      <Spin spinning={loading}>
        <Form
          values={inputs}
          getFormApi={(formAPI) => (refForm.current = formAPI)}
          style={{ marginBottom: 15 }}
        >
          <Form.Section text={t('额度设置')}>
            <Row gutter={16}>
              <Col xs={24} sm={12} md={8} lg={8} xl={8}>
                <Form.InputNumber
                  label={t('新用户初始额度')}
                  field={'QuotaForNewUser'}
                  step={1}
                  min={0}
                  suffix={'Token'}
                  placeholder={''}
                  onChange={(value) =>
                    setInputs({
                      ...inputs,
                      QuotaForNewUser: String(value),
                    })
                  }
                />
              </Col>
              <Col xs={24} sm={12} md={8} lg={8} xl={8}>
                <Form.InputNumber
                  label={t('请求预扣费额度')}
                  field={'PreConsumedQuota'}
                  step={1}
                  min={0}
                  suffix={'Token'}
                  extraText={t('请求结束后多退少补')}
                  placeholder={''}
                  onChange={(value) =>
                    setInputs({
                      ...inputs,
                      PreConsumedQuota: String(value),
                    })
                  }
                />
              </Col>
              <Col xs={24} sm={12} md={8} lg={8} xl={8}>
                <Form.InputNumber
                  label={t('邀请新用户奖励额度')}
                  field={'QuotaForInviter'}
                  step={1}
                  min={0}
                  suffix={'Token'}
                  extraText={''}
                  placeholder={t('例如：2000')}
                  onChange={(value) =>
                    setInputs({
                      ...inputs,
                      QuotaForInviter: String(value),
                    })
                  }
                />
              </Col>
            </Row>
            <Row>
              <Col xs={24} sm={12} md={8} lg={8} xl={6}>
                <Form.InputNumber
                  label={t('新用户使用邀请码奖励额度')}
                  field={'QuotaForInvitee'}
                  step={1}
                  min={0}
                  suffix={'Token'}
                  extraText={''}
                  placeholder={t('例如：1000')}
                  onChange={(value) =>
                    setInputs({
                      ...inputs,
                      QuotaForInvitee: String(value),
                    })
                  }
                />
              </Col>
            </Row>
            <Row>
              <Col>
                <Form.Switch
                  label={t('对免费模型启用预消耗')}
                  field={'quota_setting.enable_free_model_pre_consume'}
                  extraText={t(
                    '开启后，对免费模型（倍率为0，或者价格为0）的模型也会预消耗额度',
                  )}
                  onChange={(value) =>
                    setInputs({
                      ...inputs,
                      'quota_setting.enable_free_model_pre_consume': value,
                    })
                  }
                />
              </Col>
            </Row>

            <Row>
              <Button size='default' onClick={onSubmit}>
                {t('保存额度设置')}
              </Button>
            </Row>
          </Form.Section>

          <Form.Section text={t('消费返佣设置')}>
            <Row>
              <Col>
                <Form.Switch
                  label={t('启用消费返佣')}
                  field={'AffCommissionEnabled'}
                  extraText={t(
                    '开启后，被邀请用户每次消费API时，按比例返还额度给邀请人',
                  )}
                  onChange={(value) =>
                    setInputs({
                      ...inputs,
                      AffCommissionEnabled: value,
                    })
                  }
                />
              </Col>
            </Row>
            <Row gutter={16}>
              <Col xs={24} sm={12} md={8} lg={8} xl={8}>
                <Form.InputNumber
                  label={t('默认返佣比例')}
                  field={'AffCommissionRate'}
                  step={1}
                  min={0}
                  max={100}
                  suffix={'%'}
                  extraText={t('被邀请人消费额度的返还百分比')}
                  placeholder={'5'}
                  onChange={(value) =>
                    setInputs({
                      ...inputs,
                      AffCommissionRate: String(value),
                    })
                  }
                />
              </Col>
            </Row>

            <Row>
              <Col span={24}>
                <Typography.Title heading={6} style={{ marginBottom: 8 }}>
                  {t('阶梯返佣规则')}
                </Typography.Title>
                <Typography.Text type='tertiary' size='small'>
                  {t(
                    '当邀请人的累计收益达到阈值时，返佣比例自动提升。阈值为额度单位。',
                  )}
                </Typography.Text>
              </Col>
            </Row>

            {tiers.map((tier, index) => (
              <Row key={index} gutter={16} style={{ marginTop: 8 }}>
                <Col xs={10} sm={8} md={6}>
                  <Form.InputNumber
                    label={index === 0 ? t('累计收益阈值') : ''}
                    noLabel={index !== 0}
                    field={`tier_threshold_${index}`}
                    step={1000}
                    min={0}
                    suffix={'Token'}
                    placeholder={t('例如：10000')}
                    initValue={tier.threshold}
                    onChange={(value) => updateTier(index, 'threshold', value)}
                  />
                </Col>
                <Col xs={10} sm={8} md={6}>
                  <Form.InputNumber
                    label={index === 0 ? t('提升后比例') : ''}
                    noLabel={index !== 0}
                    field={`tier_rate_${index}`}
                    step={1}
                    min={0}
                    max={100}
                    suffix={'%'}
                    placeholder={t('例如：10')}
                    initValue={tier.rate}
                    onChange={(value) => updateTier(index, 'rate', value)}
                  />
                </Col>
                <Col
                  xs={4}
                  sm={4}
                  md={4}
                  style={{
                    display: 'flex',
                    alignItems: 'flex-end',
                    paddingBottom: 12,
                  }}
                >
                  <Button
                    type='danger'
                    theme='borderless'
                    icon={<IconDelete />}
                    onClick={() => removeTier(index)}
                  />
                </Col>
              </Row>
            ))}

            <Row style={{ marginTop: 8 }}>
              <Col>
                <Button icon={<IconPlus />} theme='light' onClick={addTier}>
                  {t('添加阶梯规则')}
                </Button>
              </Col>
            </Row>

            <Row style={{ marginTop: 16 }}>
              <Button size='default' onClick={onSubmit}>
                {t('保存返佣设置')}
              </Button>
            </Row>
          </Form.Section>
        </Form>
      </Spin>
    </>
  );
}
