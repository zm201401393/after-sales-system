<template>
  <div class="service-detail" v-loading="store.loading">
    <div class="detail-header">
      <el-button @click="$router.back()" :icon="ArrowLeft">返回</el-button>
      <h2>服务单详情</h2>
    </div>

    <template v-if="detail">
      <el-row :gutter="16">
        <el-col :span="16">
          <el-card>
            <template #header><span>服务单信息</span></template>
            <el-descriptions :column="2" border>
              <el-descriptions-item label="服务单号">{{ detail.service_no }}</el-descriptions-item>
              <el-descriptions-item label="当前状态">
                <ServiceStatusTag :status="detail.status" effect="dark" />
              </el-descriptions-item>
              <el-descriptions-item label="服务类型">
                <el-tag>{{ typeMap[detail.type] }}</el-tag>
              </el-descriptions-item>
              <el-descriptions-item label="申请时间">{{ detail.created_at }}</el-descriptions-item>
              <el-descriptions-item label="申请原因" :span="2">{{ detail.reason }}</el-descriptions-item>
              <el-descriptions-item label="详细描述" :span="2">{{ detail.description || '无' }}</el-descriptions-item>
              <el-descriptions-item label="商家备注" :span="2">
                <span :style="{ color: detail.merchant_remark ? '#303133' : '#c0c4cc' }">{{ detail.merchant_remark || '暂无' }}</span>
              </el-descriptions-item>
              <el-descriptions-item label="最后更新">{{ detail.updated_at }}</el-descriptions-item>
            </el-descriptions>
          </el-card>

          <el-card style="margin-top: 16px;">
            <template #header><span>关联订单</span></template>
            <div class="order-info">
              <img :src="detail.product_image" class="product-img" />
              <div class="order-meta">
                <h3>{{ detail.product_name }}</h3>
                <p>订单号：{{ detail.order_no }}</p>
                <p>单价：<span class="price">¥{{ detail.price }}</span> | 数量：{{ detail.quantity }}</p>
                <p>买家：{{ detail.buyer_name }}（{{ detail.buyer_phone }}）</p>
                <p>下单时间：{{ detail.order_created_at }}</p>
              </div>
            </div>
          </el-card>
        </el-col>

        <el-col :span="8">
          <el-card>
            <template #header><span>状态流转</span></template>
            <el-timeline>
              <el-timeline-item timestamp="创建" placement="top" type="primary">
                <p>消费者提交售后申请</p>
                <p class="time">{{ detail.created_at }}</p>
              </el-timeline-item>
              <el-timeline-item
                v-if="detail.status !== 'pending'"
                :timestamp="statusActionMap[detail.status]"
                placement="top"
                :type="statusColorMap[detail.status]"
              >
                <p>{{ statusDescMap[detail.status] }}</p>
                <p v-if="detail.merchant_remark" class="remark">{{ detail.merchant_remark }}</p>
                <p class="time">{{ detail.updated_at }}</p>
              </el-timeline-item>
            </el-timeline>
          </el-card>

          <el-card v-if="showActions" style="margin-top: 16px;">
            <template #header><span>操作</span></template>
            <div class="action-area">
              <template v-if="detail.status === 'pending'">
                <el-input v-model="remark" type="textarea" :rows="3" placeholder="备注信息（拒绝和待反馈时必填）" style="margin-bottom: 12px;" />
                <div class="action-buttons">
                  <el-button type="success" @click="handleApprove" :loading="acting">审核通过</el-button>
                  <el-button type="danger" @click="handleReject" :loading="acting">拒绝</el-button>
                  <el-button type="warning" @click="handleFeedback" :loading="acting">待反馈</el-button>
                </div>
              </template>
              <template v-if="detail.status === 'approved'">
                <el-button type="primary" @click="handleComplete" :loading="acting" style="width: 100%;">标记完成</el-button>
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
import { useServiceOrderStore } from '../../stores/serviceOrder'
import ServiceStatusTag from '../../components/ServiceStatusTag.vue'

const route = useRoute()
const router = useRouter()
const store = useServiceOrderStore()

const detail = computed(() => store.detail)
const remark = ref('')
const acting = ref(false)
const typeMap = { return: '退货', exchange: '换货', repair: '维修' }

const statusActionMap = { approved: '审核通过', rejected: '已拒绝', feedback_required: '待反馈', completed: '已完成' }
const statusColorMap = { approved: 'success', rejected: 'danger', feedback_required: 'warning', completed: 'primary' }
const statusDescMap = {
  approved: '商家审核通过',
  rejected: '商家拒绝了该申请',
  feedback_required: '商家要求消费者补充信息',
  completed: '服务单已完成'
}

const showActions = computed(() => ['pending', 'approved'].includes(detail.value?.status))

onMounted(() => {
  store.fetchDetail(route.params.id)
})

async function handleApprove() {
  acting.value = true
  try {
    await store.approve(detail.value.id, remark.value || undefined)
    ElMessage.success('已通过')
    store.fetchDetail(route.params.id)
  } catch (e) {
    ElMessage.error(e.response?.data?.error || '操作失败')
  } finally {
    acting.value = false
  }
}

async function handleReject() {
  if (!remark.value.trim()) {
    ElMessage.warning('拒绝时请填写原因')
    return
  }
  acting.value = true
  try {
    await store.reject(detail.value.id, remark.value)
    ElMessage.success('已拒绝')
    store.fetchDetail(route.params.id)
  } catch (e) {
    ElMessage.error(e.response?.data?.error || '操作失败')
  } finally {
    acting.value = false
  }
}

async function handleFeedback() {
  if (!remark.value.trim()) {
    ElMessage.warning('待反馈时请填写需要消费者提供的信息')
    return
  }
  acting.value = true
  try {
    await store.feedback(detail.value.id, remark.value)
    ElMessage.success('已标记为待反馈')
    store.fetchDetail(route.params.id)
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
    store.fetchDetail(route.params.id)
  } catch (e) {
    ElMessage.error(e.response?.data?.error || '操作失败')
  } finally {
    acting.value = false
  }
}
</script>

<style scoped>
.detail-header { display: flex; align-items: center; gap: 12px; margin-bottom: 20px; }
.detail-header h2 { margin: 0; font-size: 20px; }

.order-info { display: flex; gap: 16px; }
.product-img { width: 120px; height: 120px; border-radius: 8px; object-fit: cover; }
.order-meta h3 { margin: 0 0 8px; font-size: 16px; }
.order-meta p { margin: 4px 0; font-size: 14px; color: #606266; }
.price { color: #f56c6c; font-weight: 600; }

.time { font-size: 12px; color: #909399; margin-top: 4px; }
.remark { font-size: 13px; color: #606266; background: #f5f7fa; padding: 6px 10px; border-radius: 4px; margin-top: 4px; }

.action-buttons { display: flex; gap: 8px; flex-wrap: wrap; }
.action-buttons .el-button { flex: 1; }
</style>
