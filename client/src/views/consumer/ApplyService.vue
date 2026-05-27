<template>
  <div class="apply-page">
    <el-card>
      <template #header>
        <h2 class="form-title">申请售后服务</h2>
      </template>

      <el-form
        ref="formRef"
        :model="form"
        :rules="rules"
        label-width="110px"
        style="max-width: 700px; margin: 0 auto;"
      >
        <el-form-item label="选择订单" prop="order_id">
          <el-select
            v-model="form.order_id"
            placeholder="请选择需要售后的订单"
            filterable
            style="width: 100%;"
            @change="handleOrderChange"
          >
            <el-option
              v-for="order in orders"
              :key="order.id"
              :value="order.id"
              :label="`${order.order_no} - ${order.product_name}`"
            >
              <div class="order-option">
                <img
                  :src="order.product_image || 'https://via.placeholder.com/32'"
                  class="order-option-img"
                />
                <div class="order-option-info">
                  <div class="order-option-name">{{ order.product_name }}</div>
                  <div class="order-option-meta">{{ order.order_no }} | ¥{{ order.price }}</div>
                </div>
              </div>
            </el-option>
          </el-select>
        </el-form-item>

        <el-form-item label="服务类型" prop="type">
          <el-radio-group v-model="form.type" @change="handleTypeChange">
            <el-radio-button value="return">退货</el-radio-button>
            <el-radio-button value="exchange">换货</el-radio-button>
            <el-radio-button value="repair">维修</el-radio-button>
            <el-radio-button value="refund_only">仅退款</el-radio-button>
          </el-radio-group>
        </el-form-item>

        <!-- Exchange product selection -->
        <el-form-item label="换新商品" prop="exchange_product_id" v-if="form.type === 'exchange'">
          <div class="exchange-products">
            <div
              v-for="product in exchangeProducts"
              :key="product.id"
              class="exchange-item"
              :class="{ selected: form.exchange_product_id === product.id }"
              @click="form.exchange_product_id = product.id"
            >
              <img :src="product.image" class="exchange-img" />
              <div class="exchange-info">
                <div class="exchange-name">{{ product.name }}</div>
                <div class="exchange-spec">{{ product.spec }}</div>
                <div class="exchange-price">¥{{ product.price }}</div>
              </div>
              <div class="exchange-check" v-if="form.exchange_product_id === product.id">✓</div>
            </div>
          </div>
          <div class="exchange-hint" v-if="exchangeProducts.length === 0">请先选择订单</div>
        </el-form-item>

        <el-form-item label="申请原因" prop="reason">
          <el-select
            v-model="form.reason"
            placeholder="请选择原因"
            allow-create
            filterable
            style="width: 100%;"
          >
            <el-option v-for="r in reasonOptions" :key="r" :label="r" :value="r" />
          </el-select>
        </el-form-item>

        <el-form-item
          label="退款金额"
          prop="refund_amount"
          v-if="form.type === 'return' || form.type === 'refund_only'"
        >
          <el-input-number
            v-model="form.refund_amount"
            :min="0"
            :max="selectedOrderPrice"
            :precision="2"
            :step="0.01"
            style="width: 100%;"
            placeholder="请输入退款金额"
          />
        </el-form-item>

        <el-form-item label="收货地址" prop="address_id">
          <el-select
            v-model="form.address_id"
            placeholder="请选择收货地址"
            style="width: 100%;"
          >
            <el-option
              v-for="addr in addresses"
              :key="addr.id"
              :value="addr.id"
              :label="addr.summary"
            >
              <div class="address-option">
                <div class="addr-name">
                  {{ addr.name }} {{ addr.phone }}
                  <el-tag v-if="addr.is_default" size="small" type="warning">默认</el-tag>
                </div>
                <div class="addr-detail">{{ addr.province }}{{ addr.city }}{{ addr.district }}{{ addr.detail }}</div>
              </div>
            </el-option>
          </el-select>
          <div class="address-preview" v-if="selectedAddress">
            <div class="addr-preview-name">{{ selectedAddress.name }} {{ selectedAddress.phone }}</div>
            <div class="addr-preview-detail">{{ selectedAddress.province }}{{ selectedAddress.city }}{{ selectedAddress.district }}{{ selectedAddress.detail }}</div>
          </div>
        </el-form-item>

        <el-form-item label="优先级" prop="priority">
          <el-radio-group v-model="form.priority">
            <el-radio-button value="normal">普通</el-radio-button>
            <el-radio-button value="high">高</el-radio-button>
            <el-radio-button value="urgent">紧急</el-radio-button>
          </el-radio-group>
        </el-form-item>

        <el-form-item label="详细描述" prop="description">
          <el-input
            v-model="form.description"
            type="textarea"
            :rows="4"
            placeholder="请详细描述您遇到的问题（选填）"
            maxlength="1000"
            show-word-limit
          />
        </el-form-item>

        <el-form-item>
          <el-button type="primary" @click="handleSubmit" :loading="submitting">
            提交申请
          </el-button>
          <el-button @click="handleReset">重置</el-button>
        </el-form-item>
      </el-form>
    </el-card>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import axios from 'axios'
import { useServiceOrderStore } from '@/stores/serviceOrder'

const store = useServiceOrderStore()
const formRef = ref()
const orders = ref([])
const submitting = ref(false)

const form = ref({
  order_id: null,
  type: 'return',
  reason: '',
  refund_amount: 0,
  priority: 'normal',
  description: '',
  address_id: 1,
  exchange_product_id: null
})

// Mock addresses
const addresses = ref([
  { id: 1, name: '王梦琪', phone: '138****5001', province: '上海市', city: '浦东新区', district: '张江镇', detail: '科苑路88号创业大厦12楼', is_default: true, summary: '王梦琪 - 上海市浦东新区张江镇科苑路88号' },
  { id: 2, name: '王梦琪', phone: '138****5001', province: '江苏省', city: '苏州市', district: '工业园区', detail: '星湖街218号尼盛广场3栋', is_default: false, summary: '王梦琪 - 江苏省苏州市工业园区星湖街218号' },
  { id: 3, name: '李明（代收）', phone: '139****8862', province: '上海市', city: '徐汇区', district: '漕河泾', detail: '宜山路900号科技大厦A座', is_default: false, summary: '李明 - 上海市徐汇区宜山路900号' }
])

const selectedAddress = computed(() => addresses.value.find(a => a.id === form.value.address_id))

// Exchange products - based on selected order category
const exchangeProductsMap = {
  'Apple iPhone 15 Pro 256GB': [
    { id: 101, name: 'Apple iPhone 15 Pro 256GB', spec: '黑色钛金属 / 256GB', price: 8999, image: 'https://picsum.photos/seed/iphone15b/80' },
    { id: 102, name: 'Apple iPhone 15 Pro 256GB', spec: '白色钛金属 / 256GB', price: 8999, image: 'https://picsum.photos/seed/iphone15w/80' },
    { id: 103, name: 'Apple iPhone 15 Pro 512GB', spec: '黑色钛金属 / 512GB', price: 10999, image: 'https://picsum.photos/seed/iphone15p/80' }
  ],
  'Sony WH-1000XM5 降噪耳机': [
    { id: 201, name: 'Sony WH-1000XM5', spec: '黑色', price: 2499, image: 'https://picsum.photos/seed/sonyxm5b/80' },
    { id: 202, name: 'Sony WH-1000XM5', spec: '银白色', price: 2499, image: 'https://picsum.photos/seed/sonyxm5w/80' },
    { id: 203, name: 'Sony WH-1000XM5', spec: '午夜蓝 限定款', price: 2699, image: 'https://picsum.photos/seed/sonyxm5l/80' }
  ],
  'Nike Air Max 270 运动鞋 42码': [
    { id: 301, name: 'Nike Air Max 270', spec: '黑色 / 40码', price: 899, image: 'https://picsum.photos/seed/nike40/80' },
    { id: 302, name: 'Nike Air Max 270', spec: '黑色 / 41码', price: 899, image: 'https://picsum.photos/seed/nike41/80' },
    { id: 303, name: 'Nike Air Max 270', spec: '白色 / 42码', price: 899, image: 'https://picsum.photos/seed/nikew42/80' },
    { id: 304, name: 'Nike Air Max 270', spec: '黑色 / 43码', price: 899, image: 'https://picsum.photos/seed/nike43/80' }
  ],
  '戴森 V15 无线吸尘器': [
    { id: 401, name: '戴森 V15 Detect', spec: '金色 / 标准版', price: 4990, image: 'https://picsum.photos/seed/dysonv15g/80' },
    { id: 402, name: '戴森 V15 Detect', spec: '银灰色 / 标准版', price: 4990, image: 'https://picsum.photos/seed/dysonv15s/80' }
  ],
  'iPad Air M2 256GB 星光色': [
    { id: 501, name: 'iPad Air M2 256GB', spec: '深空灰', price: 4799, image: 'https://picsum.photos/seed/ipadg/80' },
    { id: 502, name: 'iPad Air M2 256GB', spec: '星光色', price: 4799, image: 'https://picsum.photos/seed/ipads/80' },
    { id: 503, name: 'iPad Air M2 256GB', spec: '紫色', price: 4799, image: 'https://picsum.photos/seed/ipadp/80' }
  ],
  '海尔冰箱 BCD-510 对开门': [
    { id: 601, name: '海尔 BCD-510', spec: '银色 / 标准版', price: 3599, image: 'https://picsum.photos/seed/haier510s/80' },
    { id: 602, name: '海尔 BCD-510', spec: '金色 / 标准版', price: 3599, image: 'https://picsum.photos/seed/haier510g/80' }
  ],
  "Levi's 501 经典牛仔裤": [
    { id: 701, name: "Levi's 501", spec: '深蓝色 / M码', price: 599, image: 'https://picsum.photos/seed/levis501m/80' },
    { id: 702, name: "Levi's 501", spec: '浅蓝色 / L码', price: 599, image: 'https://picsum.photos/seed/levis501l/80' },
    { id: 703, name: "Levi's 501", spec: '黑色 / M码', price: 599, image: 'https://picsum.photos/seed/levis501bm/80' }
  ],
  '飞利浦电动牙刷 HX6856': [
    { id: 801, name: '飞利浦 HX6856', spec: '粉色', price: 399, image: 'https://picsum.photos/seed/philipsp/80' },
    { id: 802, name: '飞利浦 HX6856', spec: '蓝色', price: 399, image: 'https://picsum.photos/seed/philipsb/80' }
  ],
  '小米14 Ultra 512GB': [
    { id: 901, name: '小米14 Ultra 512GB', spec: '黑色', price: 6499, image: 'https://picsum.photos/seed/mi14ub/80' },
    { id: 902, name: '小米14 Ultra 512GB', spec: '白色', price: 6499, image: 'https://picsum.photos/seed/mi14uw/80' }
  ],
  '雅诗兰黛小棕瓶精华 50ml': [
    { id: 1001, name: '雅诗兰黛小棕瓶精华', spec: '50ml / 新版', price: 760, image: 'https://picsum.photos/seed/estee50n/80' },
    { id: 1002, name: '雅诗兰黛小棕瓶精华', spec: '75ml / 大瓶装', price: 980, image: 'https://picsum.photos/seed/estee75/80' }
  ]
}

const exchangeProducts = computed(() => {
  if (!form.value.order_id) return []
  const order = orders.value.find(o => o.id === form.value.order_id)
  if (!order) return []
  return exchangeProductsMap[order.product_name] || [
    { id: 9901, name: order.product_name, spec: '同款换新', price: order.price, image: order.product_image || 'https://picsum.photos/seed/default/80' }
  ]
})

const selectedOrderPrice = computed(() => {
  const order = orders.value.find(o => o.id === form.value.order_id)
  return order ? order.price : 99999
})

const rules = {
  order_id: [{ required: true, message: '请选择订单', trigger: 'change' }],
  type: [{ required: true, message: '请选择服务类型', trigger: 'change' }],
  reason: [{ required: true, message: '请选择或填写原因', trigger: 'change' }],
  refund_amount: [{ required: true, message: '请输入退款金额', trigger: 'blur' }],
  priority: [{ required: true, message: '请选择优先级', trigger: 'change' }],
  address_id: [{ required: true, message: '请选择收货地址', trigger: 'change' }]
}

const reasonOptionsMap = {
  return: ['商品质量问题', '商品与描述不符', '收到错误商品', '不想要了', '其他'],
  exchange: ['尺码不合适', '颜色/款式选错', '商品有瑕疵需换新', '其他'],
  repair: ['使用故障', '外观损坏', '零部件缺失', '功能异常', '其他'],
  refund_only: ['商品质量问题', '商品与描述不符', '未收到货', '不想要了', '其他']
}

const reasonOptions = computed(() => {
  return reasonOptionsMap[form.value.type] || []
})

function handleOrderChange(orderId) {
  const order = orders.value.find(o => o.id === orderId)
  if (order && (form.value.type === 'return' || form.value.type === 'refund_only')) {
    form.value.refund_amount = order.price
  }
  form.value.exchange_product_id = null
}

function handleTypeChange() {
  form.value.reason = ''
  form.value.exchange_product_id = null
  if (form.value.type === 'return' || form.value.type === 'refund_only') {
    const order = orders.value.find(o => o.id === form.value.order_id)
    if (order) {
      form.value.refund_amount = order.price
    }
  } else {
    form.value.refund_amount = 0
  }
}

onMounted(async () => {
  try {
    const { data } = await axios.get('/api/orders')
    orders.value = Array.isArray(data) ? data : (data.list || data.data || [])
  } catch (e) {
    console.error('Failed to load orders:', e)
    ElMessage.error('加载订单列表失败')
  }
})

async function handleSubmit() {
  try {
    await formRef.value.validate()
  } catch (e) {
    return
  }

  submitting.value = true
  try {
    const payload = {
      order_id: form.value.order_id,
      type: form.value.type,
      reason: form.value.reason,
      priority: form.value.priority,
      description: form.value.description
    }
    if (form.value.type === 'return' || form.value.type === 'refund_only') {
      payload.refund_amount = form.value.refund_amount
    }
    const result = await store.createServiceOrder(payload)
    ElMessage.success(`申请成功！服务单号：${result.service_no}`)
    handleReset()
  } catch (e) {
    ElMessage.error(e.response?.data?.error || '提交失败')
  } finally {
    submitting.value = false
  }
}

function handleReset() {
  form.value = {
    order_id: null,
    type: 'return',
    reason: '',
    refund_amount: 0,
    priority: 'normal',
    description: '',
    address_id: 1,
    exchange_product_id: null
  }
  formRef.value?.resetFields()
}
</script>

<style scoped>
.apply-page {
  max-width: 800px;
  margin: 0 auto;
  padding: 20px;
}

.form-title {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
}

.order-option {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 4px 0;
}

.order-option-img {
  width: 32px;
  height: 32px;
  border-radius: 4px;
  object-fit: cover;
  flex-shrink: 0;
}

.order-option-info {
  flex: 1;
  overflow: hidden;
}

.order-option-name {
  font-size: 14px;
  color: #303133;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.order-option-meta {
  font-size: 12px;
  color: #909399;
}

/* Address */
.address-option {
  padding: 4px 0;
}

.addr-name {
  font-size: 13px;
  color: #303133;
  font-weight: 500;
  display: flex;
  align-items: center;
  gap: 6px;
}

.addr-detail {
  font-size: 12px;
  color: #909399;
  margin-top: 2px;
}

.address-preview {
  margin-top: 8px;
  padding: 10px 12px;
  background: #f8fafc;
  border-radius: 6px;
  border: 1px solid #e2e8f0;
}

.addr-preview-name {
  font-size: 13px;
  font-weight: 600;
  color: #1e293b;
  margin-bottom: 4px;
}

.addr-preview-detail {
  font-size: 12px;
  color: #64748b;
}

/* Exchange Products */
.exchange-products {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 10px;
  width: 100%;
}

.exchange-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  border: 2px solid #e2e8f0;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s;
  position: relative;
}

.exchange-item:hover {
  border-color: #93c5fd;
  background: #f0f9ff;
}

.exchange-item.selected {
  border-color: #3b82f6;
  background: #eff6ff;
}

.exchange-img {
  width: 48px;
  height: 48px;
  border-radius: 6px;
  object-fit: cover;
  flex-shrink: 0;
}

.exchange-info {
  flex: 1;
  min-width: 0;
}

.exchange-name {
  font-size: 13px;
  font-weight: 500;
  color: #1e293b;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.exchange-spec {
  font-size: 12px;
  color: #64748b;
  margin-top: 2px;
}

.exchange-price {
  font-size: 13px;
  font-weight: 600;
  color: #ef4444;
  margin-top: 2px;
}

.exchange-check {
  position: absolute;
  top: 6px;
  right: 8px;
  width: 20px;
  height: 20px;
  background: #3b82f6;
  color: #fff;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 11px;
  font-weight: 700;
}

.exchange-hint {
  color: #94a3b8;
  font-size: 13px;
}
</style>
