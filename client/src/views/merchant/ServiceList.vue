<template>
  <div class="service-list">
    <div class="filter-bar">
      <div class="filter-row">
        <div class="filter-group">
          <el-select v-model="filters.status" placeholder="状态" clearable size="default" class="filter-select">
            <el-option label="待审核" value="pending" />
            <el-option label="已通过" value="approved" />
            <el-option label="已拒绝" value="rejected" />
            <el-option label="待反馈" value="feedback_required" />
            <el-option label="已完成" value="completed" />
          </el-select>
          <el-select v-model="filters.type" placeholder="类型" clearable size="default" class="filter-select">
            <el-option label="退货" value="return" />
            <el-option label="换货" value="exchange" />
            <el-option label="维修" value="repair" />
            <el-option label="仅退款" value="refund_only" />
          </el-select>
          <el-select v-model="filters.priority" placeholder="优先级" clearable size="default" class="filter-select">
            <el-option label="低" value="low" />
            <el-option label="普通" value="normal" />
            <el-option label="高" value="high" />
            <el-option label="紧急" value="urgent" />
          </el-select>
          <el-date-picker
            v-model="dateRange"
            type="daterange"
            start-placeholder="开始"
            end-placeholder="结束"
            format="YYYY-MM-DD"
            value-format="YYYY-MM-DD"
            size="default"
            class="filter-date"
          />
          <el-input
            v-model="filters.search"
            placeholder="搜索单号/商品/买家"
            clearable
            size="default"
            class="filter-search"
            @keyup.enter="handleSearch"
          />
        </div>
        <div class="filter-actions">
          <el-button type="primary" @click="handleSearch" size="default">搜索</el-button>
          <el-button @click="handleReset" size="default">重置</el-button>
        </div>
      </div>
    </div>

    <div class="batch-bar" v-if="selectedRows.length > 0">
      <span class="batch-info">已选择 <strong>{{ selectedRows.length }}</strong> 项</span>
      <el-button type="success" size="small" @click="handleBatchApprove">批量通过</el-button>
      <el-button type="danger" size="small" @click="handleBatchReject">批量拒绝</el-button>
    </div>

    <div class="table-card" v-loading="store.loading">
      <div class="order-list">
        <div
          v-for="row in store.list"
          :key="row.id"
          class="order-row"
          :class="{ 'is-pending': row.status === 'pending' }"
        >
          <div class="order-main" @click="goDetail(row)">
            <div class="order-check" @click.stop>
              <el-checkbox
                :model-value="isSelected(row)"
                @change="toggleSelect(row, $event)"
              />
            </div>
            <div class="order-col col-no">
              <span class="mono">{{ row.service_no }}</span>
            </div>
            <div class="order-col col-product">
              <img :src="row.product_image || 'https://via.placeholder.com/32'" class="product-thumb" />
              <span class="product-name">{{ row.product_name }}</span>
            </div>
            <div class="order-col col-type">
              <span class="type-tag">{{ typeMap[row.type] || row.type }}</span>
            </div>
            <div class="order-col col-buyer">
              <span>{{ row.buyer_name }}</span>
              <span v-if="row.vip_level > 0" class="vip-badge">V{{ row.vip_level }}</span>
            </div>
            <div class="order-col col-amount">
              <span class="amount" v-if="row.refund_amount">¥{{ row.refund_amount }}</span>
              <span v-else class="no-amount">-</span>
            </div>
            <div class="order-col col-priority">
              <span class="priority-indicator" :class="'p-' + row.priority">
                {{ priorityMap[row.priority] || '普通' }}
              </span>
            </div>
            <div class="order-col col-status">
              <span class="status-badge" :class="'s-' + row.status">
                {{ statusMap[row.status] || row.status }}
              </span>
            </div>
            <div class="order-col col-time">{{ formatTime(row.created_at) }}</div>
            <div class="order-col col-actions" @click.stop>
              <a class="act-link" @click="goDetail(row)">详情</a>
              <template v-if="row.status === 'pending'">
                <a class="act-link act-approve" @click="handleQuickApprove(row)">通过</a>
                <a class="act-link act-reject" @click="handleQuickReject(row)">拒绝</a>
              </template>
            </div>
          </div>

          <!-- AI suggestion inline for pending orders -->
          <div
            v-if="row.status === 'pending' && aiSuggestions[row.id]"
            class="ai-row"
            @click="goDetail(row)"
          >
            <div class="ai-icon">✨</div>
            <div class="ai-content">
              <span class="ai-label" :class="'ai-' + aiSuggestions[row.id].action">
                {{ aiSuggestions[row.id].actionLabel }}
              </span>
              <span class="ai-summary">
                {{ aiSuggestions[row.id].summary.replace(/^[^—]*— /, '') }}
              </span>
            </div>
          </div>
        </div>

        <div v-if="store.list.length === 0 && !store.loading" class="empty-state">
          暂无数据
        </div>
      </div>

      <div class="table-header">
        <div class="th-check"></div>
        <div class="th col-no">服务单号</div>
        <div class="th col-product">商品</div>
        <div class="th col-type">类型</div>
        <div class="th col-buyer">买家</div>
        <div class="th col-amount">金额</div>
        <div class="th col-priority">优先级</div>
        <div class="th col-status">状态</div>
        <div class="th col-time">时间</div>
        <div class="th col-actions">操作</div>
      </div>

      <div class="pagination-wrapper">
        <el-pagination
          v-model:current-page="pagination.page"
          v-model:page-size="pagination.pageSize"
          :total="store.total"
          :page-sizes="[10, 20, 50]"
          layout="total, sizes, prev, pager, next"
          size="default"
          @current-change="loadData"
          @size-change="handleSizeChange"
        />
      </div>
    </div>

    <el-dialog v-model="rejectDialog.visible" title="拒绝服务单" width="440px" :close-on-click-modal="false">
      <el-form>
        <el-form-item label="拒绝原因" required>
          <el-input v-model="rejectDialog.remark" type="textarea" :rows="3" placeholder="请填写拒绝原因（必填）" maxlength="500" show-word-limit />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="rejectDialog.visible = false">取消</el-button>
        <el-button type="danger" @click="confirmReject" :loading="rejectDialog.loading">确认拒绝</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useServiceOrderStore } from '@/stores/serviceOrder'
import axios from 'axios'
import dayjs from 'dayjs'

const router = useRouter()
const route = useRoute()
const store = useServiceOrderStore()

const typeMap = { return: '退货', exchange: '换货', repair: '维修', refund_only: '仅退款' }
const priorityMap = { urgent: '紧急', high: '高', normal: '普通', low: '低' }
const statusMap = { pending: '待审核', approved: '已通过', rejected: '已拒绝', feedback_required: '待反馈', completed: '已完成' }

const filters = reactive({ status: '', type: '', priority: '', search: '' })
const dateRange = ref(null)
const pagination = reactive({ page: 1, pageSize: 10 })
const selectedRows = ref([])
const rejectDialog = reactive({ visible: false, id: null, remark: '', loading: false, isBatch: false })
const aiSuggestions = ref({})

function formatTime(time) { return time ? dayjs(time).format('YYYY-MM-DD HH:mm') : '-' }
function isSelected(row) { return selectedRows.value.some(r => r.id === row.id) }
function toggleSelect(row, val) {
  if (val) { selectedRows.value.push(row) }
  else { selectedRows.value = selectedRows.value.filter(r => r.id !== row.id) }
}

onMounted(() => {
  if (route.query.status) filters.status = route.query.status
  loadData()
})

async function loadData() {
  const params = { page: pagination.page, pageSize: pagination.pageSize }
  if (filters.status) params.status = filters.status
  if (filters.type) params.type = filters.type
  if (filters.priority) params.priority = filters.priority
  if (filters.search) params.search = filters.search
  if (dateRange.value) { params.startDate = dateRange.value[0]; params.endDate = dateRange.value[1] }
  await store.fetchList(params)
  loadAISuggestions()
}

async function loadAISuggestions() {
  const pendingIds = store.list.filter(r => r.status === 'pending').map(r => r.id)
  if (pendingIds.length === 0) { aiSuggestions.value = {}; return }
  try {
    const res = await axios.post('/api/service-orders/batch-ai-suggestions', { ids: pendingIds })
    aiSuggestions.value = res.data
  } catch (e) { console.error(e) }
}

function handleSearch() { pagination.page = 1; loadData() }
function handleReset() {
  filters.status = ''; filters.type = ''; filters.priority = ''; filters.search = ''
  dateRange.value = null; pagination.page = 1; loadData()
}
function handleSizeChange() { pagination.page = 1; loadData() }
function goDetail(row) { router.push(`/merchant/service/${row.id}`) }

async function handleQuickApprove(row) {
  try {
    await ElMessageBox.confirm('确认通过该服务单？', '审核确认', { type: 'success' })
    await store.approve(row.id)
    ElMessage.success('已通过')
    loadData()
  } catch (e) { if (e !== 'cancel') ElMessage.error(e.response?.data?.error || '操作失败') }
}

function handleQuickReject(row) {
  rejectDialog.id = row.id; rejectDialog.remark = ''; rejectDialog.isBatch = false; rejectDialog.visible = true
}

async function confirmReject() {
  if (!rejectDialog.remark.trim()) { ElMessage.warning('请填写拒绝原因'); return }
  rejectDialog.loading = true
  try {
    if (rejectDialog.isBatch) {
      const ids = selectedRows.value.map(r => r.id)
      await store.batchReject(ids, rejectDialog.remark)
      ElMessage.success(`已批量拒绝 ${ids.length} 条`)
    } else {
      await store.reject(rejectDialog.id, rejectDialog.remark)
      ElMessage.success('已拒绝')
    }
    rejectDialog.visible = false; loadData()
  } catch (e) { ElMessage.error(e.response?.data?.error || '操作失败') }
  finally { rejectDialog.loading = false }
}

async function handleBatchApprove() {
  const ids = selectedRows.value.map(r => r.id)
  try {
    await ElMessageBox.confirm(`确认批量通过 ${ids.length} 条？`, '批量审核', { type: 'warning' })
    await store.batchApprove(ids)
    ElMessage.success(`已批量通过 ${ids.length} 条`)
    loadData()
  } catch (e) { if (e !== 'cancel') ElMessage.error(e.response?.data?.error || '操作失败') }
}

function handleBatchReject() {
  rejectDialog.remark = ''; rejectDialog.isBatch = true; rejectDialog.visible = true
}
</script>

<style scoped>
.service-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.filter-bar {
  background: #fff;
  border-radius: 10px;
  padding: 14px 16px;
  border: 1px solid #f1f5f9;
  box-shadow: 0 1px 3px rgba(0,0,0,0.04);
}

.filter-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.filter-group { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.filter-select { width: 110px; }
.filter-date { width: 220px; }
.filter-search { width: 180px; }
.filter-actions { display: flex; gap: 8px; flex-shrink: 0; }

.batch-bar {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 16px;
  background: linear-gradient(135deg, #eff6ff, #f0f9ff);
  border-radius: 8px;
  border: 1px solid #bfdbfe;
}

.batch-info { font-size: 13px; color: #3b82f6; }

.table-card {
  background: #fff;
  border-radius: 10px;
  border: 1px solid #f1f5f9;
  overflow: hidden;
  box-shadow: 0 1px 3px rgba(0,0,0,0.04);
  display: flex;
  flex-direction: column;
}

.table-header {
  display: none;
}

.order-list {
  flex: 1;
}

.order-row {
  border-bottom: 1px solid #f8fafc;
  transition: background 0.15s;
}

.order-row:last-child { border-bottom: none; }
.order-row:hover { background: #fafbfc; }

.order-main {
  display: grid;
  grid-template-columns: 40px 150px 1fr 70px 110px 80px 72px 80px 130px 140px;
  align-items: center;
  padding: 12px 16px;
  cursor: pointer;
  gap: 4px;
}

.order-check { display: flex; align-items: center; justify-content: center; }

.order-col {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 13px;
  color: #374151;
}

.mono {
  font-family: 'SF Mono', 'Cascadia Code', 'Consolas', monospace;
  font-size: 12px;
  color: #64748b;
}

.product-thumb {
  width: 30px;
  height: 30px;
  border-radius: 5px;
  object-fit: cover;
  flex-shrink: 0;
  vertical-align: middle;
  margin-right: 6px;
}

.product-name {
  font-size: 13px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.col-product {
  display: flex;
  align-items: center;
}

.type-tag {
  display: inline-block;
  padding: 2px 7px;
  background: #f1f5f9;
  border-radius: 4px;
  font-size: 12px;
  color: #475569;
}

.col-buyer { display: flex; align-items: center; gap: 4px; }

.vip-badge {
  font-size: 10px;
  background: linear-gradient(135deg, #f59e0b, #d97706);
  color: #fff;
  padding: 1px 4px;
  border-radius: 3px;
  font-weight: 600;
}

.amount { color: #ef4444; font-weight: 600; font-size: 13px; }
.no-amount { color: #d1d5db; }

.priority-indicator {
  font-size: 11px;
  font-weight: 500;
  padding: 2px 6px;
  border-radius: 4px;
}
.p-urgent { background: #fef2f2; color: #dc2626; }
.p-high { background: #fffbeb; color: #d97706; }
.p-normal { background: #f8fafc; color: #64748b; }
.p-low { background: #f8fafc; color: #94a3b8; }

.status-badge {
  font-size: 11px;
  font-weight: 500;
  padding: 3px 7px;
  border-radius: 4px;
  white-space: nowrap;
}
.s-pending { background: #fffbeb; color: #d97706; }
.s-approved { background: #ecfdf5; color: #059669; }
.s-rejected { background: #fef2f2; color: #dc2626; }
.s-feedback_required { background: #f5f3ff; color: #7c3aed; }
.s-completed { background: #ecfeff; color: #0891b2; }

.col-time { font-size: 12px; color: #6b7280; }

.col-actions { display: flex; gap: 8px; }
.act-link { font-size: 12px; font-weight: 500; color: #3b82f6; cursor: pointer; white-space: nowrap; }
.act-link:hover { color: #2563eb; }
.act-approve { color: #10b981; }
.act-approve:hover { color: #059669; }
.act-reject { color: #ef4444; }
.act-reject:hover { color: #dc2626; }

/* AI Suggestion Inline Row */
.ai-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 16px 10px 56px;
  cursor: pointer;
}

.ai-icon {
  font-size: 12px;
  flex-shrink: 0;
}

.ai-content {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  line-height: 1.4;
  min-width: 0;
}

.ai-label {
  flex-shrink: 0;
  font-weight: 600;
  padding: 1px 6px;
  border-radius: 3px;
  font-size: 11px;
}

.ai-label.ai-approve { background: #ecfdf5; color: #059669; }
.ai-label.ai-reject { background: #fef2f2; color: #dc2626; }
.ai-label.ai-request_feedback { background: #fffbeb; color: #d97706; }

.ai-summary {
  color: #64748b;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.empty-state {
  text-align: center;
  padding: 48px 0;
  color: #94a3b8;
  font-size: 14px;
}

.pagination-wrapper {
  padding: 12px 16px;
  display: flex;
  justify-content: flex-end;
  border-top: 1px solid #f1f5f9;
}
</style>
