import { defineStore } from 'pinia'
import { ref } from 'vue'
import axios from 'axios'

export const useServiceOrderStore = defineStore('serviceOrder', () => {
  const stats = ref({ pending: 0, approved: 0, rejected: 0, feedback_required: 0, completed: 0, total: 0 })
  const list = ref([])
  const total = ref(0)
  const detail = ref(null)
  const loading = ref(false)

  async function fetchStats() {
    const { data } = await axios.get('/api/service-orders/stats')
    stats.value = data
  }

  async function fetchList(params = {}) {
    loading.value = true
    try {
      const { data } = await axios.get('/api/service-orders', { params })
      list.value = data.data
      total.value = data.total
    } finally {
      loading.value = false
    }
  }

  async function fetchDetail(id) {
    loading.value = true
    try {
      const { data } = await axios.get(`/api/service-orders/${id}`)
      detail.value = data
    } finally {
      loading.value = false
    }
  }

  async function createServiceOrder(payload) {
    const { data } = await axios.post('/api/service-orders', payload)
    return data
  }

  async function approve(id, remark) {
    await axios.put(`/api/service-orders/${id}/approve`, { remark })
  }

  async function reject(id, remark) {
    await axios.put(`/api/service-orders/${id}/reject`, { remark })
  }

  async function feedback(id, remark) {
    await axios.put(`/api/service-orders/${id}/feedback`, { remark })
  }

  async function complete(id) {
    await axios.put(`/api/service-orders/${id}/complete`)
  }

  return { stats, list, total, detail, loading, fetchStats, fetchList, fetchDetail, createServiceOrder, approve, reject, feedback, complete }
})
