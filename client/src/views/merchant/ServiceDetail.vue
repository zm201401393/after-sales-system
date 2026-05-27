<template>
  <div class="service-detail" v-loading="pageLoading">
    <div class="detail-header">
      <button class="back-btn" @click="$router.back()">← 返回</button>
      <div class="header-info">
        <h2>{{ detail?.service_no || '' }}</h2>
        <span class="status-tag" :class="'s-' + detail?.status" v-if="detail">
          {{ statusMap[detail.status] || detail.status }}
        </span>
      </div>
    </div>

    <template v-if="detail">
      <div class="detail-grid">
        <div class="left-col">
          <!-- 服务单信息 -->
          <div class="card">
            <div class="card-head">
              <span class="card-title">服务单信息</span>
            </div>
            <div class="card-body">
              <div class="info-grid">
                <div class="info-item">
                  <span class="info-label">服务类型</span>
                  <span class="type-tag">{{ typeMap[detail.type] || detail.type }}</span>
                </div>
                <div class="info-item">
                  <span class="info-label">优先级</span>
                  <span class="priority-indicator" :class="'p-' + detail.priority">{{ priorityMap[detail.priority] || '普通' }}</span>
                </div>
                <div class="info-item full">
                  <span class="info-label">申请原因</span>
                  <span class="info-value">{{ detail.reason || '-' }}</span>
                </div>
                <div class="info-item full">
                  <span class="info-label">详细描述</span>
                  <span class="info-value desc">{{ detail.description || '无' }}</span>
                </div>
                <div class="info-item">
                  <span class="info-label">退款金额</span>
                  <span class="price" v-if="detail.refund_amount">¥{{ detail.refund_amount }}</span>
                  <span v-else class="info-value">-</span>
                </div>
                <div class="info-item">
                  <span class="info-label">实退金额</span>
                  <span class="price" v-if="detail.actual_refund_amount">¥{{ detail.actual_refund_amount }}</span>
                  <span v-else class="info-value">-</span>
                </div>
                <div class="info-item">
                  <span class="info-label">申请时间</span>
                  <span class="info-value">{{ formatTime(detail.created_at) }}</span>
                </div>
                <div class="info-item">
                  <span class="info-label">更新时间</span>
                  <span class="info-value">{{ formatTime(detail.updated_at) }}</span>
                </div>
              </div>
            </div>
          </div>

          <!-- 关联订单 -->
          <div class="card">
            <div class="card-head">
              <span class="card-title">关联订单</span>
            </div>
            <div class="card-body">
              <div class="order-info">
                <img :src="detail.product_image || 'https://via.placeholder.com/80'" class="product-img" />
                <div class="order-meta">
                  <h4>{{ detail.product_name }}</h4>
                  <p>订单号：<span class="mono">{{ detail.order_no }}</span></p>
                  <p>单价：<span class="price">¥{{ detail.price }}</span> × {{ detail.quantity || 1 }}</p>
                </div>
              </div>
            </div>
          </div>

          <!-- AI审核建议 -->
          <div class="card ai-card">
            <div class="card-head">
              <span class="card-title">AI 审核建议</span>
              <span class="ai-badge">智能分析</span>
            </div>
            <div class="card-body" v-if="aiLoading" v-loading="true" style="min-height: 100px;"></div>
            <div class="card-body" v-else-if="aiSuggestion">
              <!-- One-line conclusion -->
              <div class="ai-conclusion-box" :class="'ai-' + aiSuggestion.action">
                <span class="ai-action-icon">{{ aiSuggestion.action === 'approve' ? '✓' : aiSuggestion.action === 'reject' ? '✗' : '?' }}</span>
                <span class="ai-conclusion-text">{{ aiSuggestion.summary }}</span>
              </div>

              <!-- Analysis reasoning -->
              <div class="ai-analysis">
                <div class="ai-section-title">分析依据</div>
                <div class="ai-reasons">
                  <div v-for="(reason, idx) in aiSuggestion.reasoning" :key="idx" class="ai-reason-item">
                    <span class="reason-bullet" :class="'ai-' + aiSuggestion.action"></span>
                    <span class="reason-text">{{ reason }}</span>
                  </div>
                </div>
              </div>

              <!-- References -->
              <div class="ai-analysis" v-if="aiSuggestion.references && aiSuggestion.references.length">
                <div class="ai-section-title">参考信息</div>
                <div class="ai-refs">
                  <div v-for="(ref, idx) in aiSuggestion.references" :key="idx" class="ai-ref-item">
                    <span class="ref-type" :class="'ref-' + ref.type">{{ refTypeMap[ref.type] || ref.type }}</span>
                    <span class="ref-label">{{ ref.label }}：</span>
                    <span class="ref-value" :class="'impact-' + ref.impact">{{ ref.value }}</span>
                  </div>
                </div>
              </div>

              <!-- Adopt button -->
              <div class="ai-adopt" v-if="detail.status === 'pending'">
                <button class="adopt-btn" :class="'adopt-' + aiSuggestion.action" @click="adoptSuggestion" :disabled="adoptLoading">
                  {{ adoptLoading ? '处理中...' : '采纳建议' }}
                </button>
              </div>
            </div>
            <div class="card-body empty-ai" v-else>
              <span>暂无AI建议</span>
            </div>
          </div>

          <!-- 协商记录 -->
          <div class="card">
            <div class="card-head">
              <span class="card-title">协商记录</span>
              <span class="count-badge" v-if="communications.length">{{ communications.length }}</span>
            </div>
            <div class="card-body">
              <div class="chat-container" v-if="communications.length > 0">
                <div
                  v-for="(msg, idx) in communications"
                  :key="idx"
                  class="chat-msg"
                  :class="{ 'is-merchant': msg.sender_type === 'merchant' || msg.sender === 'merchant' }"
                >
                  <div class="chat-avatar">{{ (msg.sender_type || msg.sender) === 'merchant' ? '商' : '客' }}</div>
                  <div class="chat-body">
                    <div class="chat-bubble">{{ msg.message || msg.content }}</div>
                    <div class="chat-time">{{ formatTime(msg.created_at) }}</div>
                  </div>
                </div>
              </div>
              <div v-else class="empty-chat">暂无协商记录</div>
              <div class="chat-input">
                <input
                  v-model="newMessage"
                  placeholder="输入消息..."
                  @keyup.enter="sendMessage"
                  class="msg-input"
                />
                <button class="send-btn" @click="sendMessage" :disabled="!newMessage.trim() || sendingMessage">
                  发送
                </button>
              </div>
            </div>
          </div>
        </div>

        <div class="right-col">
          <!-- 消费者画像 -->
          <div class="card">
            <div class="card-head">
              <span class="card-title">消费者画像</span>
            </div>
            <div class="card-body">
              <div class="profile">
                <div class="profile-row">
                  <span class="profile-label">买家</span>
                  <span class="profile-value">
                    {{ detail.buyer_name }}
                    <span v-if="detail.vip_level > 0" class="vip-badge-lg">{{ vipLevelMap[detail.vip_level] }}</span>
                  </span>
                </div>
                <div class="profile-row">
                  <span class="profile-label">信用评分</span>
                  <div class="score-bar">
                    <div class="score-fill" :style="{ width: (detail.credit_score || 0) + '%', background: getCreditColor(detail.credit_score) }"></div>
                    <span class="score-text">{{ detail.credit_score || 0 }}</span>
                  </div>
                </div>
                <div class="profile-row">
                  <span class="profile-label">历史订单</span>
                  <span class="profile-value">{{ detail.order_count || 0 }} 单</span>
                </div>
                <div class="profile-row">
                  <span class="profile-label">退货率</span>
                  <div class="score-bar">
                    <div class="score-fill" :style="{ width: Math.min(detail.return_rate || 0, 100) + '%', background: (detail.return_rate || 0) > 20 ? '#ef4444' : '#10b981' }"></div>
                    <span class="score-text">{{ (detail.return_rate || 0).toFixed(1) }}%</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- 操作 -->
          <div class="card" v-if="showActions">
            <div class="card-head">
              <span class="card-title">操作</span>
            </div>
            <div class="card-body">
              <template v-if="detail.status === 'pending'">
                <textarea v-model="actionRemark" class="action-textarea" placeholder="备注信息（拒绝/待反馈时必填）" rows="3"></textarea>
                <div class="refund-row" v-if="detail.refund_amount">
                  <span class="refund-label">退款金额</span>
                  <el-input-number v-model="actionRefundAmount" :min="0" :max="detail.refund_amount || 99999" :precision="2" :step="0.01" size="small" style="width: 100%;" />
                </div>
                <div class="action-btns">
                  <button class="btn btn-approve" @click="handleApprove" :disabled="acting">通过</button>
                  <button class="btn btn-reject" @click="handleReject" :disabled="acting">拒绝</button>
                  <button class="btn btn-feedback" @click="handleFeedback" :disabled="acting">待反馈</button>
                </div>
              </template>
              <template v-if="detail.status === 'approved'">
                <button class="btn btn-complete" @click="handleComplete" :disabled="acting" style="width: 100%;">标记完成</button>
              </template>
            </div>
          </div>

          <!-- 状态流转 -->
          <div class="card">
            <div class="card-head">
              <span class="card-title">状态流转</span>
            </div>
            <div class="card-body" v-if="timelineLoading" v-loading="true" style="min-height: 80px;"></div>
            <div class="card-body" v-else-if="timelineEvents.length > 0">
              <div class="timeline">
                <div v-for="(event, idx) in timelineEvents" :key="idx" class="tl-item" :class="{ last: idx === timelineEvents.length - 1 }">
                  <div class="tl-dot" :class="'tl-' + (event.event_type || event.type)"></div>
                  <div class="tl-content">
                    <div class="tl-title">{{ event.title }}</div>
                    <div class="tl-desc" v-if="event.description">{{ event.description }}</div>
                    <div class="tl-time">{{ formatTime(event.created_at || event.timestamp) }}</div>
                  </div>
                </div>
              </div>
            </div>
            <div class="card-body empty-chat" v-else>暂无流转记录</div>
          </div>

          <!-- 物流信息 -->
          <div class="card">
            <div class="card-head">
              <span class="card-title">物流信息</span>
            </div>
            <div class="card-body" v-if="logisticsLoading" v-loading="true" style="min-height: 60px;"></div>
            <div class="card-body" v-else-if="logistics && (Array.isArray(logistics) ? logistics.length > 0 : logistics.carrier)">
              <div class="logistics-info">
                <template v-if="Array.isArray(logistics)">
                  <div v-for="(l, idx) in logistics" :key="idx" class="logistics-item">
                    <p><strong>{{ l.carrier || '-' }}</strong> {{ l.tracking_no || '' }}</p>
                    <p class="logi-status">{{ l.status || '待发货' }}</p>
                  </div>
                </template>
                <template v-else>
                  <p><strong>{{ logistics.carrier || '-' }}</strong> {{ logistics.tracking_no || '' }}</p>
                  <p class="logi-status">{{ logistics.status || '待发货' }}</p>
                </template>
              </div>
            </div>
            <div class="card-body empty-chat" v-else>暂无物流信息</div>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { useServiceOrderStore } from '@/stores/serviceOrder'
import dayjs from 'dayjs'

const route = useRoute()
const router = useRouter()
const store = useServiceOrderStore()

const pageLoading = ref(false)
const aiLoading = ref(false)
const timelineLoading = ref(false)
const logisticsLoading = ref(false)
const adoptLoading = ref(false)
const sendingMessage = ref(false)
const acting = ref(false)

const detail = computed(() => store.detail)
const aiSuggestion = ref(null)
const communications = ref([])
const timelineEvents = ref([])
const logistics = ref(null)
const newMessage = ref('')
const actionRemark = ref('')
const actionRefundAmount = ref(0)

const typeMap = { return: '退货', exchange: '换货', repair: '维修', refund_only: '仅退款' }
const priorityMap = { urgent: '紧急', high: '高', normal: '普通', low: '低' }
const statusMap = { pending: '待审核', approved: '已通过', rejected: '已拒绝', feedback_required: '待反馈', completed: '已完成' }
const vipLevelMap = { 0: '普通', 1: '银卡', 2: '金卡', 3: '钻石' }
const refTypeMap = { user_tag: '用户标签', history: '历史记录', communication: '沟通记录', order: '订单信息' }

const showActions = computed(() => detail.value && ['pending', 'approved'].includes(detail.value.status))

function formatTime(time) { return time ? dayjs(time).format('YYYY-MM-DD HH:mm:ss') : '-' }
function getCreditColor(score) {
  if (score >= 80) return '#10b981'
  if (score >= 60) return '#f59e0b'
  return '#ef4444'
}

async function adoptSuggestion() {
  if (!aiSuggestion.value) return
  adoptLoading.value = true
  try {
    const action = aiSuggestion.value.action
    if (action === 'approve') {
      await store.approve(detail.value.id, { remark: 'AI建议采纳：通过' })
      ElMessage.success('已采纳建议：通过')
    } else if (action === 'reject') {
      await store.reject(detail.value.id, { remark: 'AI建议采纳：拒绝' })
      ElMessage.success('已采纳建议：拒绝')
    } else {
      await store.feedback(detail.value.id, { remark: 'AI建议采纳：待反馈' })
      ElMessage.success('已采纳建议：待反馈')
    }
    await store.fetchDetail(route.params.id)
  } catch (e) { ElMessage.error(e.response?.data?.error || '操作失败') }
  finally { adoptLoading.value = false }
}

async function sendMessage() {
  if (!newMessage.value.trim()) return
  sendingMessage.value = true
  try {
    await store.addCommunication(detail.value.id, { content: newMessage.value, sender: 'merchant' })
    communications.value.push({ sender_type: 'merchant', message: newMessage.value, created_at: new Date().toISOString() })
    newMessage.value = ''
  } catch (e) { ElMessage.error(e.response?.data?.error || '发送失败') }
  finally { sendingMessage.value = false }
}

async function handleApprove() {
  acting.value = true
  try {
    const data = {}
    if (actionRemark.value) data.remark = actionRemark.value
    if (actionRefundAmount.value) data.actual_refund_amount = actionRefundAmount.value
    await store.approve(detail.value.id, data)
    ElMessage.success('已通过')
    await store.fetchDetail(route.params.id)
  } catch (e) { ElMessage.error(e.response?.data?.error || '操作失败') }
  finally { acting.value = false }
}

async function handleReject() {
  if (!actionRemark.value.trim()) { ElMessage.warning('拒绝时请填写原因'); return }
  acting.value = true
  try {
    await store.reject(detail.value.id, { remark: actionRemark.value })
    ElMessage.success('已拒绝')
    await store.fetchDetail(route.params.id)
  } catch (e) { ElMessage.error(e.response?.data?.error || '操作失败') }
  finally { acting.value = false }
}

async function handleFeedback() {
  if (!actionRemark.value.trim()) { ElMessage.warning('请填写需要消费者提供的信息'); return }
  acting.value = true
  try {
    await store.feedback(detail.value.id, { remark: actionRemark.value })
    ElMessage.success('已标记为待反馈')
    await store.fetchDetail(route.params.id)
  } catch (e) { ElMessage.error(e.response?.data?.error || '操作失败') }
  finally { acting.value = false }
}

async function handleComplete() {
  acting.value = true
  try {
    await store.complete(detail.value.id)
    ElMessage.success('已完成')
    await store.fetchDetail(route.params.id)
  } catch (e) { ElMessage.error(e.response?.data?.error || '操作失败') }
  finally { acting.value = false }
}

onMounted(async () => {
  const id = route.params.id
  pageLoading.value = true
  try { await store.fetchDetail(id); if (detail.value?.refund_amount) actionRefundAmount.value = detail.value.refund_amount }
  catch (e) { ElMessage.error('加载失败'); console.error(e) }
  finally { pageLoading.value = false }

  aiLoading.value = true
  try { aiSuggestion.value = await store.fetchAISuggestion(id) }
  catch (e) { console.error(e) }
  finally { aiLoading.value = false }

  try { const res = await store.fetchCommunications(id); communications.value = Array.isArray(res) ? res : (res?.list || []) }
  catch (e) { console.error(e) }

  timelineLoading.value = true
  try { const res = await store.fetchTimeline(id); timelineEvents.value = Array.isArray(res) ? res : (res?.list || []) }
  catch (e) { console.error(e) }
  finally { timelineLoading.value = false }

  logisticsLoading.value = true
  try { logistics.value = await store.fetchLogistics(id) }
  catch (e) { console.error(e) }
  finally { logisticsLoading.value = false }
})
</script>

<style scoped>
.service-detail { max-width: 1200px; margin: 0 auto; }

.detail-header {
  display: flex;
  align-items: center;
  gap: 16px;
  margin-bottom: 20px;
}

.back-btn {
  border: none;
  background: #f1f5f9;
  padding: 6px 12px;
  border-radius: 6px;
  font-size: 13px;
  color: #475569;
  cursor: pointer;
  font-weight: 500;
  transition: background 0.15s;
}
.back-btn:hover { background: #e2e8f0; }

.header-info { display: flex; align-items: center; gap: 12px; flex: 1; }
.header-info h2 { margin: 0; font-size: 18px; font-weight: 600; color: #1e293b; }

.status-tag {
  font-size: 12px;
  font-weight: 600;
  padding: 4px 10px;
  border-radius: 6px;
}
.s-pending { background: #fffbeb; color: #d97706; }
.s-approved { background: #ecfdf5; color: #059669; }
.s-rejected { background: #fef2f2; color: #dc2626; }
.s-feedback_required { background: #f5f3ff; color: #7c3aed; }
.s-completed { background: #ecfeff; color: #0891b2; }

.detail-grid {
  display: grid;
  grid-template-columns: 1fr 340px;
  gap: 16px;
}

.left-col, .right-col {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.card {
  background: #fff;
  border-radius: 10px;
  border: 1px solid #f1f5f9;
  overflow: hidden;
  box-shadow: 0 1px 3px rgba(0,0,0,0.04);
}

.card-head {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 16px;
  border-bottom: 1px solid #f8fafc;
}

.card-title {
  font-size: 14px;
  font-weight: 600;
  color: #1e293b;
}

.card-body { padding: 14px 16px; }

/* Info grid */
.info-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}
.info-item { display: flex; flex-direction: column; gap: 4px; }
.info-item.full { grid-column: span 2; }
.info-label { font-size: 11px; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.5px; }
.info-value { font-size: 13px; color: #374151; }
.info-value.desc { color: #6b7280; line-height: 1.5; }
.price { color: #ef4444; font-weight: 600; font-size: 14px; }
.mono { font-family: 'SF Mono', 'Cascadia Code', monospace; font-size: 12px; color: #64748b; }

.type-tag { display: inline-block; padding: 2px 8px; background: #f1f5f9; border-radius: 4px; font-size: 12px; color: #475569; }

.priority-indicator { font-size: 12px; font-weight: 500; padding: 2px 8px; border-radius: 4px; }
.p-urgent { background: #fef2f2; color: #dc2626; }
.p-high { background: #fffbeb; color: #d97706; }
.p-normal { background: #f8fafc; color: #64748b; }
.p-low { background: #f8fafc; color: #94a3b8; }

/* Order */
.order-info { display: flex; gap: 14px; align-items: center; }
.product-img { width: 64px; height: 64px; border-radius: 8px; object-fit: cover; flex-shrink: 0; }
.order-meta h4 { margin: 0 0 6px; font-size: 14px; font-weight: 600; color: #1e293b; }
.order-meta p { margin: 2px 0; font-size: 13px; color: #6b7280; }

/* AI Card */
.ai-card {
  border: 1px solid #e0e7ff;
  background: linear-gradient(135deg, #fafbff 0%, #f5f3ff 100%);
}

.ai-badge {
  font-size: 10px;
  background: linear-gradient(135deg, #6366f1, #8b5cf6);
  color: #fff;
  padding: 2px 8px;
  border-radius: 4px;
  font-weight: 500;
}

.ai-conclusion-box {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 14px;
  border-radius: 8px;
  margin-bottom: 14px;
}
.ai-conclusion-box.ai-approve { background: #ecfdf5; border: 1px solid #a7f3d0; }
.ai-conclusion-box.ai-reject { background: #fef2f2; border: 1px solid #fecaca; }
.ai-conclusion-box.ai-request_feedback { background: #fffbeb; border: 1px solid #fde68a; }

.ai-action-icon {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 700;
  font-size: 14px;
  flex-shrink: 0;
}
.ai-approve .ai-action-icon { background: #10b981; color: #fff; }
.ai-reject .ai-action-icon { background: #ef4444; color: #fff; }
.ai-request_feedback .ai-action-icon { background: #f59e0b; color: #fff; }

.ai-conclusion-text { font-size: 13px; font-weight: 600; color: #1e293b; line-height: 1.4; }

.ai-analysis { margin-bottom: 12px; }
.ai-section-title { font-size: 12px; font-weight: 600; color: #64748b; margin-bottom: 8px; text-transform: uppercase; letter-spacing: 0.5px; }

.ai-reasons { display: flex; flex-direction: column; gap: 6px; }
.ai-reason-item { display: flex; align-items: flex-start; gap: 8px; font-size: 13px; color: #374151; line-height: 1.5; }
.reason-bullet {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  margin-top: 6px;
  flex-shrink: 0;
}
.reason-bullet.ai-approve { background: #10b981; }
.reason-bullet.ai-reject { background: #ef4444; }
.reason-bullet.ai-request_feedback { background: #f59e0b; }

.ai-refs { display: flex; flex-direction: column; gap: 6px; }
.ai-ref-item {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  padding: 6px 10px;
  background: #fff;
  border-radius: 6px;
  border: 1px solid #f1f5f9;
}
.ref-type {
  font-size: 10px;
  padding: 1px 6px;
  border-radius: 3px;
  font-weight: 600;
  flex-shrink: 0;
}
.ref-user_tag { background: #dbeafe; color: #1d4ed8; }
.ref-history { background: #fef3c7; color: #92400e; }
.ref-communication { background: #d1fae5; color: #065f46; }
.ref-order { background: #e0e7ff; color: #3730a3; }
.ref-label { color: #6b7280; flex-shrink: 0; }
.ref-value { color: #374151; font-weight: 500; }
.impact-positive { color: #059669; }
.impact-negative { color: #dc2626; }
.impact-neutral { color: #374151; }

.ai-adopt { text-align: right; margin-top: 12px; }
.adopt-btn {
  border: none;
  padding: 8px 20px;
  border-radius: 6px;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  color: #fff;
  transition: opacity 0.15s;
}
.adopt-btn:hover { opacity: 0.9; }
.adopt-btn:disabled { opacity: 0.5; cursor: not-allowed; }
.adopt-approve { background: #10b981; }
.adopt-reject { background: #ef4444; }
.adopt-request_feedback { background: #f59e0b; }

.count-badge { font-size: 11px; background: #e0e7ff; color: #4f46e5; padding: 1px 7px; border-radius: 10px; font-weight: 600; }

/* Chat */
.chat-container { max-height: 300px; overflow-y: auto; margin-bottom: 12px; display: flex; flex-direction: column; gap: 10px; }
.chat-msg { display: flex; gap: 8px; }
.chat-msg.is-merchant { flex-direction: row-reverse; }
.chat-avatar {
  width: 28px; height: 28px; border-radius: 50%; display: flex; align-items: center; justify-content: center;
  font-size: 11px; font-weight: 600; flex-shrink: 0;
  background: #f1f5f9; color: #64748b;
}
.chat-msg.is-merchant .chat-avatar { background: #3b82f6; color: #fff; }
.chat-body { max-width: 75%; }
.chat-bubble { padding: 8px 12px; border-radius: 10px; font-size: 13px; line-height: 1.5; background: #f1f5f9; color: #374151; }
.chat-msg.is-merchant .chat-bubble { background: #3b82f6; color: #fff; border-bottom-right-radius: 4px; }
.chat-msg:not(.is-merchant) .chat-bubble { border-bottom-left-radius: 4px; }
.chat-time { font-size: 11px; color: #94a3b8; margin-top: 3px; }
.chat-msg.is-merchant .chat-time { text-align: right; }
.empty-chat { text-align: center; color: #94a3b8; font-size: 13px; padding: 20px 0; }
.empty-ai { text-align: center; color: #94a3b8; font-size: 13px; padding: 24px 0; }

.chat-input { display: flex; gap: 8px; border-top: 1px solid #f1f5f9; padding-top: 10px; }
.msg-input {
  flex: 1; border: 1px solid #e2e8f0; border-radius: 6px; padding: 8px 12px;
  font-size: 13px; outline: none; transition: border-color 0.15s;
}
.msg-input:focus { border-color: #3b82f6; }
.send-btn {
  border: none; background: #3b82f6; color: #fff; padding: 8px 16px; border-radius: 6px;
  font-size: 13px; font-weight: 500; cursor: pointer; transition: background 0.15s;
}
.send-btn:hover { background: #2563eb; }
.send-btn:disabled { background: #94a3b8; cursor: not-allowed; }

/* Profile */
.profile { display: flex; flex-direction: column; gap: 12px; }
.profile-row { display: flex; align-items: center; gap: 8px; }
.profile-label { font-size: 12px; color: #94a3b8; min-width: 60px; }
.profile-value { font-size: 13px; color: #374151; font-weight: 500; display: flex; align-items: center; gap: 6px; }
.vip-badge-lg {
  font-size: 10px; background: linear-gradient(135deg, #f59e0b, #d97706); color: #fff;
  padding: 2px 6px; border-radius: 4px; font-weight: 600;
}
.score-bar { flex: 1; height: 8px; background: #f1f5f9; border-radius: 4px; position: relative; overflow: hidden; }
.score-fill { height: 100%; border-radius: 4px; transition: width 0.3s; }
.score-text { position: absolute; right: 6px; top: -1px; font-size: 10px; font-weight: 600; color: #475569; line-height: 10px; }

/* Actions */
.action-textarea {
  width: 100%; border: 1px solid #e2e8f0; border-radius: 6px; padding: 8px 12px;
  font-size: 13px; resize: none; outline: none; font-family: inherit; margin-bottom: 10px;
}
.action-textarea:focus { border-color: #3b82f6; }
.refund-row { display: flex; align-items: center; gap: 8px; margin-bottom: 10px; }
.refund-label { font-size: 12px; color: #6b7280; white-space: nowrap; }
.action-btns { display: flex; gap: 8px; }
.btn {
  border: none; padding: 8px 0; border-radius: 6px; font-size: 13px; font-weight: 500;
  cursor: pointer; flex: 1; transition: opacity 0.15s; color: #fff;
}
.btn:hover { opacity: 0.9; }
.btn:disabled { opacity: 0.5; cursor: not-allowed; }
.btn-approve { background: #10b981; }
.btn-reject { background: #ef4444; }
.btn-feedback { background: #f59e0b; }
.btn-complete { background: #3b82f6; }

/* Timeline */
.timeline { display: flex; flex-direction: column; }
.tl-item { display: flex; gap: 10px; padding-bottom: 14px; position: relative; }
.tl-item:not(.last)::before {
  content: ''; position: absolute; left: 5px; top: 14px; bottom: 0; width: 1px; background: #e2e8f0;
}
.tl-dot { width: 10px; height: 10px; border-radius: 50%; flex-shrink: 0; margin-top: 4px; background: #94a3b8; }
.tl-created { background: #3b82f6; }
.tl-approved { background: #10b981; }
.tl-rejected { background: #ef4444; }
.tl-feedback_requested { background: #f59e0b; }
.tl-completed { background: #06b6d4; }
.tl-logistics_updated { background: #8b5cf6; }
.tl-content { min-width: 0; }
.tl-title { font-size: 13px; font-weight: 500; color: #374151; }
.tl-desc { font-size: 12px; color: #6b7280; margin-top: 2px; }
.tl-time { font-size: 11px; color: #94a3b8; margin-top: 2px; }

/* Logistics */
.logistics-info p { margin: 4px 0; font-size: 13px; color: #374151; }
.logistics-item { margin-bottom: 8px; padding-bottom: 8px; border-bottom: 1px solid #f1f5f9; }
.logistics-item:last-child { border-bottom: none; margin-bottom: 0; padding-bottom: 0; }
.logi-status { font-size: 12px; color: #6b7280; }
</style>
