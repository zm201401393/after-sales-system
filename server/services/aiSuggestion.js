const { query } = require('../db');

// Simulated consumer notes/remarks data
const consumerNotes = {
  1: [
    { date: '2026-04-20', note: '多次购买高端电子产品，属于优质客户', operator: '客服小张' },
    { date: '2026-05-01', note: '曾反馈iPhone屏幕问题，经核实确为产品缺陷', operator: '售后主管' }
  ],
  2: [
    { date: '2026-03-15', note: '客户购物偏好为数码电器，价格敏感度较高', operator: '客服小李' },
    { date: '2026-05-15', note: '退货频率有上升趋势，近3个月退货2次', operator: '风控系统' }
  ],
  3: [
    { date: '2026-02-20', note: '新注册用户，首次下单后多次退货，需重点关注', operator: '风控系统' },
    { date: '2026-04-10', note: '历史退款中有1次被判定为恶意退款', operator: '售后主管' },
    { date: '2026-05-08', note: '消费者来电态度恶劣，要求无理由退全款', operator: '客服小王' }
  ],
  4: [
    { date: '2026-01-10', note: '忠实老客户，累计消费超过5万元', operator: '系统标记' },
    { date: '2026-04-25', note: '偏好电子产品，退货均为正当理由，配合度好', operator: '客服小张' }
  ],
  5: [
    { date: '2026-05-01', note: '新注册用户，暂无历史消费备注', operator: '系统' }
  ]
};

function generateAISuggestion(serviceOrder, consumer, communications) {
  let score = 50;
  const reasons = [];
  const references = [];
  const detailAnalysis = [];

  // === Consumer Profile Analysis ===
  const vipNames = ['普通','银卡','金卡','钻石'];
  if (consumer.vip_level >= 2) {
    score += 15;
    const levelName = vipNames[consumer.vip_level];
    reasons.push(`高等级VIP客户（${levelName}），建议优先处理`);
    references.push({ type: 'user_tag', label: 'VIP等级', value: levelName, impact: 'positive' });
    detailAnalysis.push({
      category: '用户等级分析',
      content: `该消费者为${levelName}会员，属于平台高价值用户。${levelName}用户的售后满意度直接影响复购率，建议给予优先处理通道。`,
      data: `会员等级：${levelName} | 累计消费：${consumer.order_count}单`
    });
  } else if (consumer.vip_level === 1) {
    score += 5;
    references.push({ type: 'user_tag', label: 'VIP等级', value: '银卡', impact: 'neutral' });
    detailAnalysis.push({
      category: '用户等级分析',
      content: `该消费者为银卡会员，属于成长型用户，正常流程处理即可。`,
      data: `会员等级：银卡 | 累计消费：${consumer.order_count}单`
    });
  } else {
    references.push({ type: 'user_tag', label: 'VIP等级', value: '普通用户', impact: 'neutral' });
    detailAnalysis.push({
      category: '用户等级分析',
      content: `该消费者为普通用户，按照标准售后流程处理。`,
      data: `会员等级：普通 | 累计消费：${consumer.order_count}单`
    });
  }

  // Credit score
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
    detailAnalysis.push({
      category: '风险预警',
      content: `该用户信用评分${consumer.credit_score}分，低于平台平均水平（85分）。低信用分用户的售后申请中约32%存在不实描述，建议要求提供更多凭证。`,
      data: `信用评分：${consumer.credit_score}/100 | 平台平均：85分 | 风险等级：${consumer.credit_score < 50 ? '高' : '中'}`
    });
  }

  // Return rate
  if (consumer.return_rate > 30) {
    score -= 20;
    reasons.push(`消费者退货率偏高（${consumer.return_rate.toFixed(1)}%），存在恶意退货风险`);
    references.push({ type: 'history', label: '退货率', value: `${consumer.return_rate.toFixed(1)}%`, impact: 'negative' });
    detailAnalysis.push({
      category: '退货行为分析',
      content: `该消费者退货率达${consumer.return_rate.toFixed(1)}%，远超平台平均水平（8.5%）。近6个月退货频次呈上升趋势，存在"薅羊毛"或恶意退货可能。`,
      data: `退货率：${consumer.return_rate.toFixed(1)}% | 平台平均：8.5% | 超出倍数：${(consumer.return_rate / 8.5).toFixed(1)}倍`
    });
  } else if (consumer.return_rate > 15) {
    score -= 5;
    reasons.push(`消费者退货率中等（${consumer.return_rate.toFixed(1)}%）`);
    references.push({ type: 'history', label: '退货率', value: `${consumer.return_rate.toFixed(1)}%`, impact: 'neutral' });
  } else {
    references.push({ type: 'history', label: '退货率', value: `${consumer.return_rate.toFixed(1)}%`, impact: 'positive' });
  }

  // Order count
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

  // === Consumer Notes/Remarks ===
  const notes = consumerNotes[consumer.id] || [];
  if (notes.length > 0) {
    references.push({ type: 'remark', label: '客服备注', value: `共${notes.length}条备注记录`, impact: 'neutral' });
    const latestNote = notes[notes.length - 1];
    detailAnalysis.push({
      category: '客服备注记录',
      content: notes.map(n => `[${n.date}] ${n.operator}：${n.note}`).join('\n'),
      data: `最近备注时间：${latestNote.date} | 备注人：${latestNote.operator}`
    });
    // Check for negative notes
    const negativeKeywords = ['恶意', '恶劣', '频率上升', '重点关注', '风控'];
    const hasNegativeNote = notes.some(n => negativeKeywords.some(k => n.note.includes(k)));
    if (hasNegativeNote) {
      score -= 10;
      reasons.push('客服备注中存在风险标记，需谨慎审核');
    }
    const positiveKeywords = ['优质', '忠实', '配合度好', '正当理由'];
    const hasPositiveNote = notes.some(n => positiveKeywords.some(k => n.note.includes(k)));
    if (hasPositiveNote) {
      score += 5;
      reasons.push('客服备注显示该消费者历史记录良好');
    }
  }

  // === Historical Service Orders ===
  const historyOrders = query('SELECT id, type, status, reason, created_at FROM service_orders WHERE consumer_id=? AND id!=? ORDER BY created_at DESC', [consumer.id, serviceOrder.id]);
  const completedCount = historyOrders.filter(o => o.status === 'completed').length;
  const rejectedCount = historyOrders.filter(o => o.status === 'rejected').length;
  const approvedCount = historyOrders.filter(o => o.status === 'approved').length;
  if (historyOrders.length > 0) {
    references.push({ type: 'history', label: '历史售后', value: `${historyOrders.length}次（完成${completedCount}次，通过${approvedCount}次，拒绝${rejectedCount}次）`, impact: rejectedCount > completedCount ? 'negative' : 'neutral' });

    const historyDetail = historyOrders.slice(0, 5).map(o => {
      const typeNames = { return: '退货', exchange: '换货', repair: '维修', refund_only: '仅退款' };
      const statusNames = { pending: '待审核', approved: '已通过', rejected: '已拒绝', feedback_required: '待反馈', completed: '已完成' };
      return `${o.created_at?.substring(0, 10) || '-'} | ${typeNames[o.type] || o.type} | ${statusNames[o.status] || o.status} | 原因：${o.reason}`;
    }).join('\n');

    detailAnalysis.push({
      category: '历史售后记录',
      content: historyOrders.length > 5
        ? `近5条记录如下：\n${historyDetail}\n...共${historyOrders.length}条记录`
        : historyDetail,
      data: `总申请：${historyOrders.length}次 | 通过率：${historyOrders.length > 0 ? Math.round((completedCount + approvedCount) / historyOrders.length * 100) : 0}% | 拒绝率：${historyOrders.length > 0 ? Math.round(rejectedCount / historyOrders.length * 100) : 0}%`
    });

    if (rejectedCount >= 2) {
      score -= 8;
      reasons.push(`历史售后中有${rejectedCount}次被拒绝记录，需谨慎评估`);
    }
  }

  // === Reason Analysis ===
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

  // === Communication Analysis ===
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

    // Build communication summary for detail analysis
    const commSummary = communications.slice(-5).map(c => {
      const role = c.sender_type === 'consumer' ? '消费者' : '商家';
      return `[${role}] ${c.message.substring(0, 80)}`;
    }).join('\n');
    detailAnalysis.push({
      category: '沟通记录摘要',
      content: commSummary,
      data: `总消息：${communications.length}条 | 消费者：${consumerMsgs.length}条 | 商家：${merchantMsgs.length}条`
    });

    const lastConsumerMsg = consumerMsgs[consumerMsgs.length - 1];
    if (lastConsumerMsg) {
      references.push({ type: 'communication', label: '最近消费者消息', value: lastConsumerMsg.message.substring(0, 60), impact: 'neutral' });
    }
  }

  // === Time Pressure ===
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
    detailAnalysis,
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
