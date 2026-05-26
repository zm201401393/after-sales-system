const { query } = require('../db');

function generateAISuggestion(serviceOrder, consumer, communications) {
  let score = 50;
  const reasons = [];

  if (consumer.vip_level >= 2) { score += 15; reasons.push('高等级VIP客户（' + ['普通','银卡','金卡','钻石'][consumer.vip_level] + '），建议优先处理'); }
  else if (consumer.vip_level === 1) { score += 5; reasons.push('银卡会员客户'); }

  if (consumer.credit_score >= 90) { score += 10; reasons.push('消费者信用评分优秀（' + consumer.credit_score + '分）'); }
  else if (consumer.credit_score >= 70) { score += 3; }
  else if (consumer.credit_score < 60) { score -= 15; reasons.push('消费者信用评分较低（' + consumer.credit_score + '分），建议仔细审核'); }

  if (consumer.return_rate > 30) { score -= 20; reasons.push('消费者退货率偏高（' + consumer.return_rate.toFixed(1) + '%），存在恶意退货风险'); }
  else if (consumer.return_rate > 15) { score -= 5; reasons.push('消费者退货率中等（' + consumer.return_rate.toFixed(1) + '%）'); }

  if (consumer.order_count > 30) { score += 8; reasons.push('长期活跃客户（历史' + consumer.order_count + '单），忠诚度高'); }
  else if (consumer.order_count > 10) { score += 3; }

  const qualityReasons = ['商品质量问题', '商品与描述不符', '收到错误商品', '使用故障', '外观损坏'];
  if (qualityReasons.includes(serviceOrder.reason)) {
    score += 12; reasons.push('申请原因为"' + serviceOrder.reason + '"，属于商家责任范畴');
  }
  const buyerReasons = ['不想要了', '冲动消费想退款', '尺码不合适'];
  if (buyerReasons.includes(serviceOrder.reason)) {
    score -= 5; reasons.push('申请原因为"' + serviceOrder.reason + '"，属于买家个人原因');
  }

  if (serviceOrder.type === 'repair') {
    score += 5; reasons.push('维修请求，消费者有意愿保留商品');
  }
  if (serviceOrder.type === 'refund_only' && serviceOrder.refund_amount > 0) {
    const order = query('SELECT price FROM orders WHERE id=?', [serviceOrder.order_id]);
    if (order.length && serviceOrder.refund_amount > order[0].price * 0.8) {
      score -= 3; reasons.push('仅退款且金额较高（¥' + serviceOrder.refund_amount + '），建议确认商品状态');
    }
  }

  if (serviceOrder.priority === 'urgent') { reasons.push('标记为紧急工单，需优先处理'); }
  else if (serviceOrder.priority === 'high') { reasons.push('高优先级工单'); }

  if (communications.length === 0) {
    reasons.push('暂无沟通记录');
  } else {
    if (communications.length >= 3) { score += 5; reasons.push('已有' + communications.length + '轮沟通，建议尽快给出结论'); }
    const hasEvidence = communications.some(c => c.sender_type === 'consumer' && c.attachments && JSON.parse(c.attachments || '[]').length > 0);
    if (hasEvidence) { score += 10; reasons.push('消费者已提供图片/凭证'); }
    const consumerMsgs = communications.filter(c => c.sender_type === 'consumer');
    if (consumerMsgs.length >= 2) { score += 3; reasons.push('消费者多次主动沟通，态度积极'); }
  }

  const daysSinceCreated = (Date.now() - new Date(serviceOrder.created_at).getTime()) / 86400000;
  if (daysSinceCreated > 7) { score += 10; reasons.push('申请已超过7天未处理，需紧急响应'); }
  else if (daysSinceCreated > 3) { score += 5; reasons.push('申请已超过3天，建议尽快处理'); }

  score = Math.max(0, Math.min(100, score));

  let action, confidence, actionLabel;
  if (score >= 65) {
    action = 'approve'; confidence = Math.min(95, score); actionLabel = '建议通过';
  } else if (score <= 35) {
    action = 'reject'; confidence = Math.min(95, 100 - score); actionLabel = '建议拒绝';
  } else {
    action = 'request_feedback'; confidence = 55 + Math.abs(50 - score); actionLabel = '建议补充信息';
    reasons.push('综合信息不足以直接判断，建议要求消费者补充说明');
  }

  return { action, actionLabel, confidence, reasoning: reasons, score, generated_at: new Date().toISOString() };
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

module.exports = { getAISuggestion, generateAISuggestion };
