<template>
  <div class="service-list">
    <!-- Filter bar -->
    <el-card class="filter-card">
      <el-form :inline="true" :model="filters">
        <el-form-item label="状态">
          <el-select v-model="filters.status" placeholder="全部状态" clearable style="width: 140px;">
            <el-option label="待审核" value="pending" />
            <el-option label="已通过" value="approved" />
            <el-option label="已拒绝" value="rejected" />
            <el-option label="待反馈" value="feedback_required" />
            <el-option label="已完成" value="completed" />
          </el-select>
        </el-form-item>
        <el-form-item label="类型">
          <el-select v-model="filters.type" placeholder="全部类型" clearable style="width: 120px;">
            <el-option label="退货" value="return" />
            <el-option label="换货" value="exchange" />
            <el-option label="维修" value="repair" />
            <el-option label="仅退款" value="refund_only" />
          </el-select>
        </el-form-item>
        <el-form-item label="优先级">
          <el-select v-model="filters.priority" placeholder="全部" clearable style="width: 120px;">
            <el-option label="低" value="low" />
            <el-option label="普通" value="normal" />
            <el-option label="高" value="high" />
            <el-option label="紧急" value="urgent" />
          </el-select>
        </el-form-item>
        <el-form-item label="日期">
          <el-date-picker
            v-model="dateRange"
            type="daterange"
            start-placeholder="开始日期"
            end-placeholder="结束日期"
            format="YYYY-MM-DD"
            value-format="YYYY-MM-DD"
            style="width: 260px;"
          />
        </el-form-item>
        <el-form-item>
          <el-input
            v-model="filters.search"
            placeholder="搜索单号/商品/买家"
            clearable
            style="width: 200px;"
            @keyup.enter="handleSearch"
          />
        </el-form-item>
        <el-form-item>
          <el-button type="primary" @click="handleSearch">搜索</el-button>
          <el-button @click="handleReset">重置</el-button>
        </el-form-item>
      </el-form>
    </el-card>

    <!-- Batch action bar -->
    <div class="batch-bar" v-if="selectedRows.length > 0">
      <span class="batch-info">已选择 <strong>{{ selectedRows.length }}</strong> 项</span>
      <el-button type="success" size="small" @click="handleBatchApprove">
        批量通过
        <el-badge :value="selectedRows.length" class="batch-badge" />
      </el-button>
      <el-button type="danger" size="small" @click="handleBatchReject">
        批量拒绝
        <el-badge :value="selectedRows.length" class="batch-badge" />
      </el-button>
    </div>

    <!-- Table -->
    <el-card style="margin-top: 16px;">
      <el-table
        :data="store.list"
        v-loading="store.loading"
        style="width: 100%;"
        stripe
        @selection-change="handleSelectionChange"
      >
        <el-table-column type="selection" width="50" />
        <el-table-column prop="service_no" label="服务单号" width="180" />
        <el-table-column label="商品" min-width="200">
          <template #default="{ row }">
            <div class="product-cell">
              <img
                :src="row.product_image || 'https://via.placeholder.com/40'"
                class="product-thumb"
              />
              <span class="product-name">{{ row.product_name }}</span>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="类型" width="90">
          <template #default="{ row }">
            <el-tag size="small">{{ typeMap[row.type] || row.type }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="买家" width="120">
          <template #default="{ row }">
            <span>{{ row.buyer_name }}</span>
            <el-tag v-if="row.vip_level && row.vip_level > 0" size="small" type="warning" class="vip-badge">
              VIP{{ row.vip_level }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="退款金额" width="110">
          <template #default="{ row }">
            <span class="amount" v-if="row.refund_amount">¥{{ row.refund_amount }}</span>
            <span v-else class="no-amount">-</span>
          </template>
        </el-table-column>
        <el-table-column label="优先级" width="90">
          <template #default="{ row }">
            <el-tag :type="priorityTagType[row.priority]" size="small">
              {{ priorityMap[row.priority] || row.priority || '普通' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="状态" width="100">
          <template #default="{ row }">
            <el-tag :type="statusTagType[row.status]" size="small">
              {{ statusMap[row.status] || row.status }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="申请时间" width="170">
          <template #default="{ row }">
            {{ formatTime(row.created_at) }}
          </template>
        </el-table-column>
        <el-table-column label="操作" width="180" fixed="right">
          <template #default="{ row }">
            <el-button text type="primary" size="small" @click="goDetail(row)">详情</el-button>
            <template v-if="row.status === 'pending'">
              <el-button text type="success" size="small" @click="handleQuickApprove(row)">通过</el-button>
              <el-button text type="danger" size="small" @click="handleQuickReject(row)">拒绝</el-button>
            </template>
          </template>
        </el-table-column>
      </el-table>

      <!-- Pagination -->
      <div class="pagination-wrapper">
        <el-pagination
          v-model:current-page="pagination.page"
          v-model:page-size="pagination.pageSize"
          :total="store.total"
          :page-sizes="[10, 20, 50, 100]"
          layout="total, sizes, prev, pager, next"
          @current-change="loadData"
          @size-change="handleSizeChange"
        />
      </div>
    </el-card>

    <!-- Reject dialog -->
    <el-dialog v-model="rejectDialog.visible" title="拒绝服务单" width="480px" :close-on-click-modal="false">
      <el-form>
        <el-form-item label="拒绝原因" required>
          <el-input
            v-model="rejectDialog.remark"
            type="textarea"
            :rows="4"
            placeholder="请填写拒绝原因（必填）"
            maxlength="500"
            show-word-limit
          />
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
import dayjs from 'dayjs'

const router = useRouter()
const route = useRoute()
const store = useServiceOrderStore()

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

const filters = reactive({ status: '', type: '', priority: '', search: '' })
const dateRange = ref(null)
const pagination = reactive({ page: 1, pageSize: 10 })
const selectedRows = ref([])
const rejectDialog = reactive({ visible: false, id: null, remark: '', loading: false, isBatch: false })

function formatTime(time) {
  return time ? dayjs(time).format('YYYY-MM-DD HH:mm:ss') : '-'
}

onMounted(() => {
  if (route.query.status) {
    filters.status = route.query.status
  }
  loadData()
})

function loadData() {
  const params = { page: pagination.page, pageSize: pagination.pageSize }
  if (filters.status) params.status = filters.status
  if (filters.type) params.type = filters.type
  if (filters.priority) params.priority = filters.priority
  if (filters.search) params.search = filters.search
  if (dateRange.value) {
    params.startDate = dateRange.value[0]
    params.endDate = dateRange.value[1]
  }
  store.fetchList(params)
}

function handleSearch() {
  pagination.page = 1
  loadData()
}

function handleReset() {
  filters.status = ''
  filters.type = ''
  filters.priority = ''
  filters.search = ''
  dateRange.value = null
  pagination.page = 1
  loadData()
}

function handleSizeChange() {
  pagination.page = 1
  loadData()
}

function handleSelectionChange(rows) {
  selectedRows.value = rows
}

function goDetail(row) {
  router.push(`/merchant/service/${row.id}`)
}

async function handleQuickApprove(row) {
  try {
    await ElMessageBox.confirm('确认通过该服务单？', '审核确认', { type: 'success' })
    await store.approve(row.id)
    ElMessage.success('已通过')
    loadData()
  } catch (e) {
    if (e !== 'cancel') {
      ElMessage.error(e.response?.data?.error || '操作失败')
    }
  }
}

function handleQuickReject(row) {
  rejectDialog.id = row.id
  rejectDialog.remark = ''
  rejectDialog.isBatch = false
  rejectDialog.visible = true
}

async function confirmReject() {
  if (!rejectDialog.remark.trim()) {
    ElMessage.warning('请填写拒绝原因')
    return
  }
  rejectDialog.loading = true
  try {
    if (rejectDialog.isBatch) {
      const ids = selectedRows.value.map(r => r.id)
      await store.batchReject(ids, rejectDialog.remark)
      ElMessage.success(`已批量拒绝 ${ids.length} 条服务单`)
    } else {
      await store.reject(rejectDialog.id, rejectDialog.remark)
      ElMessage.success('已拒绝')
    }
    rejectDialog.visible = false
    loadData()
  } catch (e) {
    ElMessage.error(e.response?.data?.error || '操作失败')
  } finally {
    rejectDialog.loading = false
  }
}

async function handleBatchApprove() {
  const ids = selectedRows.value.map(r => r.id)
  try {
    await ElMessageBox.confirm(`确认批量通过 ${ids.length} 条服务单？`, '批量审核', { type: 'warning' })
    await store.batchApprove(ids)
    ElMessage.success(`已批量通过 ${ids.length} 条服务单`)
    loadData()
  } catch (e) {
    if (e !== 'cancel') {
      ElMessage.error(e.response?.data?.error || '操作失败')
    }
  }
}

function handleBatchReject() {
  rejectDialog.remark = ''
  rejectDialog.isBatch = true
  rejectDialog.visible = true
}
</script>

<style scoped>
.service-list {
  padding: 20px;
}

.filter-card {
  margin-bottom: 16px;
}

.filter-card :deep(.el-form-item) {
  margin-bottom: 0;
}

.batch-bar {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 16px;
  background: #ecf5ff;
  border-radius: 4px;
  border: 1px solid #b3d8ff;
}

.batch-info {
  font-size: 14px;
  color: #409eff;
}

.batch-badge {
  margin-left: 6px;
}

.product-cell {
  display: flex;
  align-items: center;
  gap: 8px;
}

.product-thumb {
  width: 40px;
  height: 40px;
  border-radius: 4px;
  object-fit: cover;
  flex-shrink: 0;
}

.product-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.vip-badge {
  margin-left: 4px;
  transform: scale(0.85);
}

.amount {
  color: #f56c6c;
  font-weight: 600;
}

.no-amount {
  color: #c0c4cc;
}

.pagination-wrapper {
  margin-top: 16px;
  display: flex;
  justify-content: flex-end;
}
</style>
