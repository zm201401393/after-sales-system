<template>
  <div class="service-detail" v-loading="pageLoading">
    <div class="detail-header">
      <el-button @click="$router.back()" :icon="ArrowLeft">返回</el-button>
      <h2>服务单详情</h2>
      <el-tag v-if="detail" :type="statusTagType[detail.status]" effect="dark" size="large">
        {{ statusMap[detail.status] || detail.status }}
      </el-tag>
    </div>

    <template v-if="detail">
      <el-row :gutter="20">
        <!-- LEFT COLUMN -->
        <el-col :span="16">
          <!-- 服务单信息 -->
          <el-card class="detail-card">
            <template #header><span class="card-title">服务单信息</span></template>
            <el-descriptions :column="2" border>
              <el-descriptions-item label="服务单号">{{ detail.service_no }}</el-descriptions-item>
              <el-descriptions-item label="当前状态">
                <el-tag :type="statusTagType[detail.status]" effect="dark">
                  {{ statusMap[detail.status] || detail.status }}
                </el-tag>
              </el-descriptions-item>
              <el-descriptions-item label="服务类型">
                <el-tag>{{ typeMap[detail.type] || detail.type }}</el-tag>
              </el-descriptions-item>
              <el-descriptions-item label="优先级">
                <el-tag :type="priorityTagType[detail.priority]">
                  {{ priorityMap[detail.priority] || detail.priority || '普通' }}
                </el-tag>
              </el-descriptions-item>
              <el-descriptions-item label="申请原因" :span="2">{{ detail.reason || '-' }}</el-descriptions-item>
              <el-descriptions-item label="详细描述" :span="2">{{ detail.description || '无' }}</el-descriptions-item>
              <el-descriptions-item label="退款金额">
                <span v-if="detail.refund_amount" class="price">¥{{ detail.refund_amount }}</span>
                <span v-else>-</span>
              </el-descriptions-item>
              <el-descriptions-item label="实际退款金额">
                <span v-if="detail.actual_refund_amount" class="price">¥{{ detail.actual_refund_amount }}</span>
                <span v-else>-</span>
              </el-descriptions-item>
              <el-descriptions-item label="申请时间">{{ formatTime(detail.created_at) }}</el-descriptions-item>
              <el-descriptions-item label="更新时间">{{ formatTime(detail.updated_at) }}</el-descriptions-item>
            </el-descriptions>
          </el-card>

          <!-- 关联订单 -->
          <el-card class="detail-card">
            <template #header><span class="card-title">关联订单</span></template>
            <div class="order-info">
              <img
                :src="detail.product_image || 'https://via.placeholder.com/100'"
                class="product-img"
              />
              <div class="order-meta">
                <h3>{{ detail.product_name }}</h3>
                <p>订单号：{{ detail.order_no }}</p>
                <p>单价：<span class="price">¥{{ detail.price }}</span></p>
                <p>数量：{{ detail.quantity || 1 }}</p>
              </div>
            </div>
          </el-card>

          <!-- AI审核建议 -->
          <el-card class="detail-card ai-suggestion-card">
            <template #header>
              <div class="ai-header">
                <span class="card-title">AI审核建议</span>
                <el-tag type="info" size="small">智能分析</el-tag>
              </div>
            </template>
            <div v-if="aiLoading" v-loading="true" style="height: 120px;"></div>
            <div v-else-if="aiSuggestion">
              <div class="ai-action-row">
                <span class="ai-label">建议操作：</span>
                <el-tag
                  :type="aiActionTagType[aiSuggestion.action]"
                  effect="dark"
                  size="large"
                >
                  {{ aiActionMap[aiSuggestion.action] || aiSuggestion.action }}
                </el-tag>
              </div>
              <div class="ai-confidence-row">
                <span class="ai-label">置信度：</span>
                <el-progress
                  :percentage="Math.round((aiSuggestion.confidence || 0) * 100)"
                  :color="getConfidenceColor(aiSuggestion.confidence)"
                  :stroke-width="16"
                  style="flex: 1;"
                />
              </div>
              <div class="ai-reasoning">
                <span class="ai-label">分析理由：</span>
                <el-timeline class="reasoning-timeline">
                  <el-timeline-item
                    v-for="(reason, idx) in aiSuggestion.reasons || []"
                    :key="idx"
                    :color="aiActionColor[aiSuggestion.action] || '#409eff'"
                  >
                    {{ reason }}
                  </el-timeline-item>
                </el-timeline>
              </div>
              <div class="ai-adopt" v-if="detail.status === 'pending'">
                <el-button type="primary" @click="adoptSuggestion" :loading="adoptLoading">
                  采纳建议
                </el-button>
              </div>
            </div>
            <el-empty v-else description="暂无AI建议" :image-size="60" />
          </el-card>

          <!-- 协商记录 -->
          <el-card class="detail-card">
            <template #header><span class="card-title">协商记录</span></template>
            <div class="chat-container" v-if="communications.length > 0">
              <div
                v-for="(msg, idx) in communications"
                :key="idx"
                class="chat-message"
                :class="{ 'is-merchant': msg.sender === 'merchant', 'is-consumer': msg.sender === 'consumer' }"
              >
                <div class="chat-sender">
                  {{ msg.sender === 'merchant' ? '商家' : '消费者' }}
                </div>
                <div class="chat-bubble">
                  {{ msg.content }}
                </div>
                <div class="chat-time">{{ formatTime(msg.created_at) }}</div>
              </div>
            </div>
            <el-empty v-else description="暂无协商记录" :image-size="60" />
            <div class="chat-input">
              <el-input
                v-model="newMessage"
                placeholder="输入消息..."
                @keyup.enter="sendMessage"
              />
              <el-button type="primary" @click="sendMessage" :loading="sendingMessage" :disabled="!newMessage.trim()">
                发送
              </el-button>
            </div>
          </el-card>
        </el-col>

        <!-- RIGHT COLUMN -->
        <el-col :span="8">
          <!-- 消费者画像 -->
          <el-card class="detail-card">
            <template #header><span class="card-title">消费者画像</span></template>
            <div class="consumer-profile">
              <div class="profile-item">
                <span class="profile-label">买家姓名</span>
                <span class="profile-value">{{ detail.buyer_name }}</span>
              </div>
              <div class="profile-item">
                <span class="profile-label">VIP等级</span>
                <span class="profile-value">
                  <el-tag :type="vipTagType[detail.vip_level]" effect="dark" size="small">
                    {{ vipLevelMap[detail.vip_level] || '普通' }}
                  </el-tag>
                </span>
              </div>
              <div class="profile-item">
                <span class="profile-label">信用评分</span>
                <el-progress
                  :percentage="detail.credit_score || 80"
                  :color="getCreditColor(detail.credit_score || 80)"
                  :stroke-width="12"
                />
              </div>
              <div class="profile-item">
                <span class="profile-label">历史订单数</span>
                <span class="profile-value">{{ detail.order_count || 0 }} 单</span>
              </div>
              <div class="profile-item">
                <span class="profile-label">退货率</span>
                <el-progress
                  :percentage="detail.return_rate || 0"
                  :color="(detail.return_rate || 0) > 20 ? '#f56c6c' : '#67c23a'"
                  :stroke-width="12"
                />
              </div>
            </div>
          </el-card>

          <!-- 状态流转 -->
          <el-card class="detail-card">
            <template #header><span class="card-title">状态流转</span></template>
            <div v-if="timelineLoading" v-loading="true" style="height: 100px;"></div>
            <el-timeline v-else-if="timelineEvents.length > 0">
              <el-timeline-item
                v-for="(event, idx) in timelineEvents"
                :key="idx"
                :color="timelineColor[event.type] || '#409eff'"
                :timestamp="formatTime(event.timestamp)"
                placement="top"
              >
                <div class="timeline-title">{{ event.title }}</div>
                <div class="timeline-desc" v-if="event.description">{{ event.description }}</div>
              </el-timeline-item>
            </el-timeline>
            <el-empty v-else description="暂无流转记录" :image-size="60" />
          </el-card>

          <!-- 物流信息 -->
          <el-card class="detail-card">
            <template #header><span class="card-title">物流信息</span></template>
            <div v-if="logisticsLoading" v-loading="true" style="height: 80px;"></div>
            <template v-else-if="logistics">
              <div class="logistics-info">
                <div class="logistics-item">
                  <span class="logistics-label">物流公司：</span>
                  <span>{{ logistics.carrier || '-' }}</span>
                </div>
                <div class="logistics-item">
                  <span class="logistics-label">运单号：</span>
                  <span>{{ logistics.tracking_no || '-' }}</span>
                </div>
                <div class="logistics-item">
                  <span class="logistics-label">状态：</span>
                  <el-tag size="small">{{ logistics.status || '待发货' }}</el-tag>
                </div>
              </div>
              <el-steps
                v-if="logistics.steps && logistics.steps.length > 0"
                direction="vertical"
                :active="logistics.steps.length - 1"
                class="logistics-steps"
              >
                <el-step
                  v-for="(step, idx) in logistics.steps"
                  :key="idx"
                  :title="step.title"
                  :description="step.time"
                />
              </el-steps>
            </template>
            <el-empty v-else description="暂无物流信息" :image-size="60" />
          </el-card>

          <!-- 操作 -->
          <el-card class="detail-card" v-if="showActions">
            <template #header><span class="card-title">操作</span></template>
            <div class="action-area">
              <template v-if="detail.status === 'pending'">
                <el-form label-position="top">
                  <el-form-item label="备注信息">
                    <el-input
                      v-model="actionRemark"
                      type="textarea"
                      :rows="3"
                      placeholder="备注信息（拒绝和待反馈时必填）"
                    />
                  </el-form-item>
                  <el-form-item label="退款金额">
                    <el-input-number
                      v-model="actionRefundAmount"
                      :min="0"
                      :max="detail.refund_amount || 99999"
                      :precision="2"
                      :step="0.01"
                      style="width: 100%;"
                      placeholder="退款金额"
                    />
                  </el-form-item>
                </el-form>
                <div class="action-buttons">
                  <el-button type="success" @click="handleApprove" :loading="acting">通过</el-button>
                  <el-button type="danger" @click="handleReject" :loading="acting">拒绝</el-button>
                  <el-button type="warning" @click="handleFeedback" :loading="acting">待反馈</el-button>
                </div>
              </template>
              <template v-if="detail.status === 'approved'">
                <el-button type="primary" @click="handleComplete" :loading="acting" style="width: 100%;">
                  标记完成
                </el-button>
              </template>
            </div>
          </el-card>
        </el-col>
      </el-row>
    </template>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { ArrowLeft } from '@element-plus/icons-vue'
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

const typeMap = {
  return: '退货',
  exchange: '换货',
  repair: '维修',
  refund_only: '仅退款'
}

const priorityMap = {
  urgent: '紧急',
  high: '高',
  normal: '普通',
  low: '低'
}

const priorityTagType = {
  urgent: 'danger',
  high: 'warning',
  normal: '',
  low: 'info'
}

const statusMap = {
  pending: '待审核',
  approved: '已通过',
  rejected: '已拒绝',
  feedback_required: '待反馈',
  completed: '已完成'
}

const statusTagType = {
  pending: 'warning',
  approved: 'success',
  rejected: 'danger',
  feedback_required: 'info',
  completed: ''
}

const vipLevelMap = {
  0: '普通',
  1: '银卡',
  2: '金卡',
  3: '钻石'
}

const vipTagType = {
  0: 'info',
  1: '',
  2: 'warning',
  3: 'danger'
}

const aiActionMap = {
  approve: '建议通过',
  reject: '建议拒绝',
  feedback: '建议待反馈'
}

const aiActionTagType = {
  approve: 'success',
  reject: 'danger',
  feedback: 'warning'
}

const aiActionColor = {
  approve: '#67c23a',
  reject: '#f56c6c',
  feedback: '#e6a23c'
}

const timelineColor = {
  created: '#409eff',
  approved: '#67c23a',
  rejected: '#f56c6c',
  feedback: '#e6a23c',
  completed: '#00d1b2',
  system: '#909399'
}

const showActions = computed(() => {
  return detail.value && ['pending', 'approved'].includes(detail.value.status)
})

function formatTime(time) {
  return time ? dayjs(time).format('YYYY-MM-DD HH:mm:ss') : '-'
}

function getConfidenceColor(confidence) {
  const pct = (confidence || 0) * 100
  if (pct >= 80) return '#67c23a'
  if (pct >= 60) return '#e6a23c'
  return '#f56c6c'
}

function getCreditColor(score) {
  if (score >= 80) return '#67c23a'
  if (score >= 60) return '#e6a23c'
  return '#f56c6c'
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
    } else if (action === 'feedback') {
      await store.feedback(detail.value.id, { remark: 'AI建议采纳：待反馈' })
      ElMessage.success('已采纳建议：待反馈')
    }
    await store.fetchDetail(route.params.id)
  } catch (e) {
    ElMessage.error(e.response?.data?.error || '操作失败')
  } finally {
    adoptLoading.value = false
  }
}

async function sendMessage() {
  if (!newMessage.value.trim()) return
  sendingMessage.value = true
  try {
    await store.addCommunication(detail.value.id, {
      content: newMessage.value,
      sender: 'merchant'
    })
    communications.value.push({
      sender: 'merchant',
      content: newMessage.value,
      created_at: new Date().toISOString()
    })
    newMessage.value = ''
  } catch (e) {
    ElMessage.error(e.response?.data?.error || '发送失败')
  } finally {
    sendingMessage.value = false
  }
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
  } catch (e) {
    ElMessage.error(e.response?.data?.error || '操作失败')
  } finally {
    acting.value = false
  }
}

async function handleReject() {
  if (!actionRemark.value.trim()) {
    ElMessage.warning('拒绝时请填写原因')
    return
  }
  acting.value = true
  try {
    await store.reject(detail.value.id, { remark: actionRemark.value })
    ElMessage.success('已拒绝')
    await store.fetchDetail(route.params.id)
  } catch (e) {
    ElMessage.error(e.response?.data?.error || '操作失败')
  } finally {
    acting.value = false
  }
}

async function handleFeedback() {
  if (!actionRemark.value.trim()) {
    ElMessage.warning('待反馈时请填写需要消费者提供的信息')
    return
  }
  acting.value = true
  try {
    await store.feedback(detail.value.id, { remark: actionRemark.value })
    ElMessage.success('已标记为待反馈')
    await store.fetchDetail(route.params.id)
  } catch (e) {
    ElMessage.error(e.response?.data?.error || '操作失败')
  } finally {
    acting.value = false
  }
}

async function handleComplete() {
  acting.value = true
  try {
    await store.complete(detail.value.id)
    ElMessage.success('已完成')
    await store.fetchDetail(route.params.id)
  } catch (e) {
    ElMessage.error(e.response?.data?.error || '操作失败')
  } finally {
    acting.value = false
  }
}

onMounted(async () => {
  const id = route.params.id
  pageLoading.value = true

  try {
    await store.fetchDetail(id)
    if (detail.value && detail.value.refund_amount) {
      actionRefundAmount.value = detail.value.refund_amount
    }
  } catch (e) {
    ElMessage.error('加载服务单详情失败')
    console.error(e)
  } finally {
    pageLoading.value = false
  }

  // Load AI suggestion
  aiLoading.value = true
  try {
    const res = await store.fetchAISuggestion(id)
    aiSuggestion.value = res
  } catch (e) {
    console.error('Failed to load AI suggestion:', e)
  } finally {
    aiLoading.value = false
  }

  // Load communications
  try {
    const res = await store.fetchCommunications(id)
    communications.value = Array.isArray(res) ? res : (res?.list || [])
  } catch (e) {
    console.error('Failed to load communications:', e)
  }

  // Load timeline
  timelineLoading.value = true
  try {
    const res = await store.fetchTimeline(id)
    timelineEvents.value = Array.isArray(res) ? res : (res?.list || [])
  } catch (e) {
    console.error('Failed to load timeline:', e)
  } finally {
    timelineLoading.value = false
  }

  // Load logistics
  logisticsLoading.value = true
  try {
    const res = await store.fetchLogistics(id)
    logistics.value = res
  } catch (e) {
    console.error('Failed to load logistics:', e)
  } finally {
    logisticsLoading.value = false
  }
})
</script>

<style scoped>
.service-detail {
  padding: 20px;
}

.detail-header {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 20px;
}

.detail-header h2 {
  margin: 0;
  font-size: 20px;
  flex: 1;
}

.detail-card {
  margin-bottom: 16px;
}

.card-title {
  font-size: 16px;
  font-weight: 600;
}

.price {
  color: #f56c6c;
  font-weight: 600;
}

/* Order info */
.order-info {
  display: flex;
  gap: 16px;
}

.product-img {
  width: 100px;
  height: 100px;
  border-radius: 8px;
  object-fit: cover;
  flex-shrink: 0;
}

.order-meta h3 {
  margin: 0 0 8px;
  font-size: 16px;
}

.order-meta p {
  margin: 4px 0;
  font-size: 14px;
  color: #606266;
}

/* AI Suggestion */
.ai-suggestion-card {
  border: 2px solid transparent;
  background: linear-gradient(#fff, #fff) padding-box,
              linear-gradient(135deg, #667eea 0%, #764ba2 100%) border-box;
  border-radius: 6px;
}

.ai-header {
  display: flex;
  align-items: center;
  gap: 8px;
}

.ai-action-row {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 16px;
}

.ai-confidence-row {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 16px;
}

.ai-label {
  font-size: 14px;
  color: #606266;
  white-space: nowrap;
  min-width: 70px;
}

.reasoning-timeline {
  padding-left: 0;
  margin-top: 8px;
}

.ai-adopt {
  margin-top: 16px;
  text-align: right;
}

/* Chat */
.chat-container {
  max-height: 400px;
  overflow-y: auto;
  padding: 12px 0;
  margin-bottom: 12px;
}

.chat-message {
  margin-bottom: 16px;
}

.chat-message.is-consumer {
  text-align: left;
}

.chat-message.is-merchant {
  text-align: right;
}

.chat-sender {
  font-size: 12px;
  color: #909399;
  margin-bottom: 4px;
}

.chat-bubble {
  display: inline-block;
  max-width: 80%;
  padding: 10px 14px;
  border-radius: 12px;
  font-size: 14px;
  line-height: 1.5;
  text-align: left;
  word-break: break-word;
}

.is-consumer .chat-bubble {
  background: #f0f2f5;
  color: #303133;
  border-bottom-left-radius: 4px;
}

.is-merchant .chat-bubble {
  background: #409eff;
  color: #fff;
  border-bottom-right-radius: 4px;
}

.chat-time {
  font-size: 11px;
  color: #c0c4cc;
  margin-top: 4px;
}

.chat-input {
  display: flex;
  gap: 8px;
  border-top: 1px solid #ebeef5;
  padding-top: 12px;
}

/* Consumer profile */
.consumer-profile {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.profile-item {
  display: flex;
  align-items: center;
  gap: 8px;
}

.profile-label {
  font-size: 14px;
  color: #909399;
  min-width: 80px;
}

.profile-value {
  font-size: 14px;
  color: #303133;
  font-weight: 500;
}

/* Timeline */
.timeline-title {
  font-size: 14px;
  font-weight: 500;
  color: #303133;
}

.timeline-desc {
  font-size: 13px;
  color: #909399;
  margin-top: 4px;
}

/* Logistics */
.logistics-info {
  margin-bottom: 16px;
}

.logistics-item {
  display: flex;
  align-items: center;
  margin-bottom: 8px;
  font-size: 14px;
}

.logistics-label {
  color: #909399;
  min-width: 80px;
}

.logistics-steps {
  margin-top: 12px;
}

/* Actions */
.action-area {
  padding: 4px 0;
}

.action-buttons {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.action-buttons .el-button {
  flex: 1;
}
</style>
