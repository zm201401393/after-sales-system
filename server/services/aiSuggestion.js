const { query } = require('../db');

function generateAISuggestion(serviceOrder, consumer, communications) {
  let score = 50;
  const reasons = [];
  const references = [];

  // Consumer profile analysis
  if (consumer.vip_level >= 2) {
    score += 15;
    const levelName = ['普通','银卡','金卡','钻石'][consumer.vip_level];
    reasons.push(`高等级VIP客户（${levelName}），建议优先处理`);
    references.push({ type: 'user_tag', label: 'VIP等级', value: levelName, impact: 'positive' });
  } else if (consumer.vip_level === 1) {
    score += 5;
    references.push({ type: 'user_tag', label: 'VIP等级', value: '银卡', impact: 'neutral' });
  }

  if (consumer.credit_score >= 90) {
    score += 10;
    reasons.push(`消费者信用评分优秀（${consumer.credit_score}分），历史交易可信度高`);
    references.push({ type: 'user_tag', label: '信用评分', value: `${consumer.credit_score}分`, impact: 'positive' });
  } else if (consumer.credit_score >= 70) {
    score += 3;
    references.push({ type: 'user_tag', label: '信用评分', value: `${consumer.credit_score}分`, impact: 'neutral' });
  } else if (consumer.credit_score < 60) {
    score -= 15;
    reasons.push(`消费者信用评分较低（${consumer.credit_score}分），建议仔细审核申请真实性`);
    references.push({ type: 'user_tag', label: '信用评分', value: `${consumer.credit_score}分`, impact: 'negative' });
  }

  if (consumer.return_rate > 30) {
    score -= 20;
    reasons.push(`消费者退货率偏高（${consumer.return_rate.toFixed(1)}%），存在恶意退货风险`);
    references.push({ type: 'history', label: '退货率', value: `${consumer.return_rate.toFixed(1)}%`, impact: 'negative' });
  } else if (consumer.return_rate > 15) {
    score -= 5;
    reasons.push(`消费者退货率中等（${consumer.return_rate.toFixed(1)}%）`);
    references.push({ type: 'history', label: '退货率', value: `${consumer.return_rate.toFixed(1)}%`, impact: 'neutral' });
  } else {
    references.push({ type: 'history', label: '退货率', value: `${consumer.return_rate.toFixed(1)}%`, impact: 'positive' });
  }

  if (consumer.order_count > 30) {
    score += 8;
    reasons.push(`长期活跃客户（历史${consumer.order_count}单），忠诚度高`);
    references.push({ type: 'history', label: '历史订单', value: `${consumer.order_count}单`, impact: 'positive' });
  } else if (consumer.order_count > 10) {
    score += 3;
    references.push({ type: 'history', label: '历史订单', value: `${consumer.order_count}单`, impact: 'neutral' });
  } else {
    references.push({ type: 'history', label: '历史订单', value: `${consumer.order_count}单`, impact: 'neutral' });
  }

  // Check historical service orders for this consumer
  const historyOrders = query('SELECT id, type, status, reason FROM service_orders WHERE consumer_id=? AND id!=?', [consumer.id, serviceOrder.id]);
  const completedCount = historyOrders.filter(o => o.status === 'completed').length;
  const rejectedCount = historyOrders.filter(o => o.status === 'rejected').length;
  if (historyOrders.length > 0) {
    references.push({ type: 'history', label: '历史售后', value: `${historyOrders.length}次（通过${completedCount}次，拒绝${rejectedCount}次）`, impact: rejectedCount > completedCount ? 'negative' : 'neutral' });
    if (rejectedCount >= 2) {
      score -= 8;
      reasons.push(`历史售后中有${rejectedCount}次被拒绝记录，需谨慎评估`);
    }
  }

  // Reason analysis
  const qualityReasons = ['商品质量问题', '商品与描述不符', '收到错误商品', '使用故障', '外观损坏'];
  if (qualityReasons.includes(serviceOrder.reason)) {
    score += 12;
    reasons.push(`申请原因为"${serviceOrder.reason}"，属于商家责任范畴，应积极处理`);
    references.push({ type: 'order', label: '申请原因', value: serviceOrder.reason, impact: 'positive' });
  }
  const buyerReasons = ['不想要了', '冲动消费想退款', '尺码不合适'];
  if (buyerReasons.includes(serviceOrder.reason)) {
    score -= 5;
    reasons.push(`申请原因为"${serviceOrder.reason}"，属于买家个人原因`);
    references.push({ type: 'order', label: '申请原因', value: serviceOrder.reason, impact: 'negative' });
  }

  if (serviceOrder.type === 'repair') {
    score += 5;
    reasons.push('维修请求表明消费者有意愿保留商品，合作意愿较强');
  }
  if (serviceOrder.type === 'refund_only' && serviceOrder.refund_amount > 0) {
    const order = query('SELECT price FROM orders WHERE id=?', [serviceOrder.order_id]);
    if (order.length && serviceOrder.refund_amount > order[0].price * 0.8) {
      score -= 3;
      reasons.push(`仅退款且金额较高（¥${serviceOrder.refund_amount}），建议确认商品实际状态`);
    }
  }

  if (serviceOrder.priority === 'urgent') { reasons.push('标记为紧急工单，需优先处理'); }
  else if (serviceOrder.priority === 'high') { reasons.push('高优先级工单，建议尽快响应'); }

  // Communication analysis
  if (communications.length === 0) {
    references.push({ type: 'communication', label: '沟通记录', value: '暂无沟通', impact: 'neutral' });
  } else {
    const consumerMsgs = communications.filter(c => c.sender_type === 'consumer');
    const merchantMsgs = communications.filter(c => c.sender_type === 'merchant');
    references.push({ type: 'communication', label: '沟通记录', value: `共${communications.length}条（消费者${consumerMsgs.length}条，商家${merchantMsgs.length}条）`, impact: 'neutral' });

    if (communications.length >= 3) {
      score += 5;
      reasons.push(`已有${communications.length}轮沟通，消费者诉求明确，建议尽快给出结论`);
    }
    const hasEvidence = communications.some(c => c.sender_type === 'consumer' && c.attachments && JSON.parse(c.attachments || '[]').length > 0);
    if (hasEvidence) {
      score += 10;
      reasons.push('消费者已提供图片/凭证佐证，申请可信度较高');
    }
    if (consumerMsgs.length >= 2) {
      score += 3;
      reasons.push('消费者多次主动沟通，态度积极配合');
    }
    // Extract key messages as context
    const lastConsumerMsg = consumerMsgs[consumerMsgs.length - 1];
    if (lastConsumerMsg) {
      references.push({ type: 'communication', label: '最近消费者消息', value: lastConsumerMsg.message.substring(0, 60), impact: 'neutral' });
    }
  }

  // Time pressure
  const daysSinceCreated = (Date.now() - new Date(serviceOrder.created_at).getTime()) / 86400000;
  if (daysSinceCreated > 7) {
    score += 10;
    reasons.push('申请已超过7天未处理，需紧急响应避免投诉升级');
  } else if (daysSinceCreated > 3) {
    score += 5;
    reasons.push('申请已超过3天，建议尽快处理');
  }

  score = Math.max(0, Math.min(100, score));

  let action, actionLabel;
  if (score >= 65) {
    action = 'approve';
    actionLabel = '建议通过';
  } else if (score <= 35) {
    action = 'reject';
    actionLabel = '建议拒绝';
  } else {
    action = 'request_feedback';
    actionLabel = '建议补充信息';
    reasons.push('综合信息不足以直接判断，建议要求消费者补充更多说明或凭证');
  }

  // Generate one-line summary
  let summary = '';
  if (action === 'approve') {
    const mainReason = reasons[0] || '综合评估后建议通过';
    summary = `建议通过 — ${mainReason}`;
  } else if (action === 'reject') {
    const mainReason = reasons[0] || '综合评估后建议拒绝';
    summary = `建议拒绝 — ${mainReason}`;
  } else {
    summary = `建议要求补充信息 — 当前信息不足以做出判断，需消费者提供更多凭证`;
  }

  return {
    action,
    actionLabel,
    summary,
    reasoning: reasons,
    references,
    score,
    generated_at: new Date().toISOString()
  };
}

function getAISuggestion(serviceOrderId) {
  const orders = query(`SELECT so.*, o.price as order_price FROM service_orders so LEFT JOIN orders o ON so.order_id=o.id WHERE so.id=?`, [serviceOrderId]);
  if (!orders.length) return null;
  const so = orders[0];

  const consumers = query('SELECT * FROM consumers WHERE id=?', [so.consumer_id]);
  if (!consumers.length) return null;

  const comms = query('SELECT * FROM communication_records WHERE service_order_id=? ORDER BY created_at', [serviceOrderId]);

  return generateAISuggestion(so, consumers[0], comms);
}

function getBatchAISuggestions(serviceOrderIds) {
  const results = {};
  for (const id of serviceOrderIds) {
    const suggestion = getAISuggestion(id);
    if (suggestion) {
      results[id] = {
        action: suggestion.action,
        actionLabel: suggestion.actionLabel,
        summary: suggestion.summary
      };
    }
  }
  return results;
}

module.exports = { getAISuggestion, generateAISuggestion, getBatchAISuggestions };
