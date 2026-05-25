<template>
  <div class="service-list">
    <h2 class="page-title">服务单管理</h2>

    <el-card class="filter-card">
      <el-form :inline="true" :model="filters">
        <el-form-item label="状态">
          <el-select v-model="filters.status" placeholder="全部" clearable style="width: 130px;">
            <el-option label="待审核" value="pending" />
            <el-option label="已通过" value="approved" />
            <el-option label="已拒绝" value="rejected" />
            <el-option label="待反馈" value="feedback_required" />
            <el-option label="已完成" value="completed" />
          </el-select>
        </el-form-item>
        <el-form-item label="类型">
          <el-select v-model="filters.type" placeholder="全部" clearable style="width: 110px;">
            <el-option label="退货" value="return" />
            <el-option label="换货" value="exchange" />
            <el-option label="维修" value="repair" />
          </el-select>
        </el-form-item>
        <el-form-item label="日期">
          <el-date-picker v-model="dateRange" type="daterange" start-placeholder="开始" end-placeholder="结束" format="YYYY-MM-DD" value-format="YYYY-MM-DD" style="width: 260px;" />
        </el-form-item>
        <el-form-item>
          <el-input v-model="filters.search" placeholder="搜索单号/买家" clearable style="width: 200px;" @keyup.enter="handleSearch" />
        </el-form-item>
        <el-form-item>
          <el-button type="primary" @click="handleSearch">搜索</el-button>
          <el-button @click="handleReset">重置</el-button>
        </el-form-item>
      </el-form>
    </el-card>

    <el-card style="margin-top: 16px;">
      <el-table :data="store.list" v-loading="store.loading" style="width: 100%;" @row-click="goDetail">
        <el-table-column prop="service_no" label="服务单号" width="180" />
        <el-table-column label="商品信息" min-width="200">
          <template #default="{ row }">
            <div style="display: flex; align-items: center; gap: 8px;">
              <img :src="row.product_image" style="width: 40px; height: 40px; border-radius: 4px; object-fit: cover;" />
              <div>
                <div>{{ row.product_name }}</div>
                <div style="font-size: 12px; color: #999;">{{ row.order_no }}</div>
              </div>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="类型" width="80">
          <template #default="{ row }">{{ typeMap[row.type] }}</template>
        </el-table-column>
        <el-table-column prop="buyer_name" label="买家" width="80" />
        <el-table-column label="金额" width="100">
          <template #default="{ row }">¥{{ row.price }}</template>
        </el-table-column>
        <el-table-column label="状态" width="100">
          <template #default="{ row }">
            <ServiceStatusTag :status="row.status" />
          </template>
        </el-table-column>
        <el-table-column prop="created_at" label="申请时间" width="170" />
        <el-table-column label="操作" width="180" fixed="right">
          <template #default="{ row }">
            <el-button text type="primary" @click.stop="goDetail(row)">详情</el-button>
            <template v-if="row.status === 'pending'">
              <el-button text type="success" @click.stop="handleQuickApprove(row)">通过</el-button>
              <el-button text type="danger" @click.stop="handleQuickReject(row)">拒绝</el-button>
            </template>
            <template v-if="row.status === 'approved'">
              <el-button text type="primary" @click.stop="handleQuickComplete(row)">完成</el-button>
            </template>
          </template>
        </el-table-column>
      </el-table>

      <div style="margin-top: 16px; display: flex; justify-content: flex-end;">
        <el-pagination
          v-model:current-page="pagination.page"
          v-model:page-size="pagination.pageSize"
          :total="store.total"
          :page-sizes="[10, 20, 50]"
          layout="total, sizes, prev, pager, next"
          @current-change="loadData"
          @size-change="loadData"
        />
      </div>
    </el-card>

    <el-dialog v-model="rejectDialog.visible" title="拒绝服务单" width="450px">
      <el-input v-model="rejectDialog.remark" type="textarea" :rows="3" placeholder="请填写拒绝原因（必填）" />
      <template #footer>
        <el-button @click="rejectDialog.visible = false">取消</el-button>
        <el-button type="danger" @click="confirmReject" :loading="rejectDialog.loading">确认拒绝</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted, watch } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useServiceOrderStore } from '../../stores/serviceOrder'
import ServiceStatusTag from '../../components/ServiceStatusTag.vue'

const router = useRouter()
const route = useRoute()
const store = useServiceOrderStore()
const typeMap = { return: '退货', exchange: '换货', repair: '维修' }

const filters = reactive({ status: '', type: '', search: '' })
const dateRange = ref(null)
const pagination = reactive({ page: 1, pageSize: 10 })

const rejectDialog = reactive({ visible: false, id: null, remark: '', loading: false })

onMounted(() => {
  if (route.query.status) filters.status = route.query.status
  loadData()
})

function loadData() {
  const params = { page: pagination.page, pageSize: pagination.pageSize }
  if (filters.status) params.status = filters.status
  if (filters.type) params.type = filters.type
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
  filters.search = ''
  dateRange.value = null
  pagination.page = 1
  loadData()
}

function goDetail(row) {
  router.push(`/merchant/service/${row.id}`)
}

async function handleQuickApprove(row) {
  await ElMessageBox.confirm('确认通过该服务单？', '审核确认', { type: 'success' })
  try {
    await store.approve(row.id)
    ElMessage.success('已通过')
    loadData()
  } catch (e) {
    ElMessage.error(e.response?.data?.error || '操作失败')
  }
}

function handleQuickReject(row) {
  rejectDialog.id = row.id
  rejectDialog.remark = ''
  rejectDialog.visible = true
}

async function confirmReject() {
  if (!rejectDialog.remark.trim()) {
    ElMessage.warning('请填写拒绝原因')
    return
  }
  rejectDialog.loading = true
  try {
    await store.reject(rejectDialog.id, rejectDialog.remark)
    ElMessage.success('已拒绝')
    rejectDialog.visible = false
    loadData()
  } catch (e) {
    ElMessage.error(e.response?.data?.error || '操作失败')
  } finally {
    rejectDialog.loading = false
  }
}

async function handleQuickComplete(row) {
  await ElMessageBox.confirm('确认完成该服务单？', '完成确认', { type: 'success' })
  try {
    await store.complete(row.id)
    ElMessage.success('已完成')
    loadData()
  } catch (e) {
    ElMessage.error(e.response?.data?.error || '操作失败')
  }
}
</script>

<style scoped>
.page-title { margin: 0 0 20px; font-size: 20px; color: #303133; }
.filter-card :deep(.el-form-item) { margin-bottom: 0; }
.el-table { cursor: pointer; }
</style>
