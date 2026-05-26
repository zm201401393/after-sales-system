<template>
  <div class="my-services">
    <el-card>
      <template #header>
        <div class="header-row">
          <h2 class="page-title">我的售后单</h2>
          <el-button type="primary" @click="$router.push('/consumer/apply')">
            新建申请
          </el-button>
        </div>
      </template>

      <el-table
        :data="serviceList"
        v-loading="loading"
        style="width: 100%;"
        stripe
        @row-click="goDetail"
      >
        <el-table-column prop="service_no" label="服务单号" width="180" />
        <el-table-column prop="product_name" label="商品名称" min-width="160" />
        <el-table-column label="类型" width="100">
          <template #default="{ row }">
            <el-tag size="small">{{ typeMap[row.type] || row.type }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="状态" width="110">
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
        <el-table-column label="满意度评分" width="160">
          <template #default="{ row }">
            <template v-if="row.status === 'completed' && row.satisfaction_rating">
              <el-rate
                :model-value="row.satisfaction_rating"
                disabled
                show-score
                score-template="{value}分"
              />
            </template>
            <span v-else class="no-rating">-</span>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="100" fixed="right">
          <template #default="{ row }">
            <el-button text type="primary" size="small" @click.stop="goDetail(row)">
              查看详情
            </el-button>
          </template>
        </el-table-column>
      </el-table>

      <el-empty v-if="!loading && serviceList.length === 0" description="暂无售后记录" />
    </el-card>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useServiceOrderStore } from '@/stores/serviceOrder'
import dayjs from 'dayjs'

const router = useRouter()
const store = useServiceOrderStore()

const serviceList = ref([])
const loading = ref(false)

const typeMap = {
  return: '退货',
  exchange: '换货',
  repair: '维修',
  refund_only: '仅退款'
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

function formatTime(time) {
  return time ? dayjs(time).format('YYYY-MM-DD HH:mm:ss') : '-'
}

function goDetail(row) {
  router.push(`/merchant/service/${row.id}`)
}

onMounted(async () => {
  loading.value = true
  try {
    const res = await store.fetchList({})
    if (res && res.list) {
      serviceList.value = res.list
    } else {
      serviceList.value = store.list
    }
  } catch (e) {
    console.error('Failed to fetch service list:', e)
  } finally {
    loading.value = false
  }
})
</script>

<style scoped>
.my-services {
  padding: 20px;
  max-width: 1200px;
  margin: 0 auto;
}

.header-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.page-title {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
}

.no-rating {
  color: #c0c4cc;
  font-size: 14px;
}

.el-table {
  cursor: pointer;
}
</style>
