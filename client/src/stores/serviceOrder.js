import { defineStore } from 'pinia'
import { ref } from 'vue'
import axios from 'axios'

export const useServiceOrderStore = defineStore('serviceOrder', () => {
  // State
  const stats = ref({
    total: 0,
    pending: 0,
    processing: 0,
    completed: 0,
    rejected: 0,
    todayNew: 0,
    avgProcessTime: 0,
    satisfaction: 0
  })
  const list = ref([])
  const total = ref(0)
  const detail = ref(null)
  const loading = ref(false)

  // Actions
  async function fetchStats() {
    loading.value = true
    try {
      const response = await axios.get('/api/service-orders/stats')
      stats.value = response.data
    } catch (error) {
      console.error('Failed to fetch stats:', error)
      throw error
    } finally {
      loading.value = false
    }
  }

  async function fetchList(params = {}) {
    loading.value = true
    try {
      const response = await axios.get('/api/service-orders', { params })
      list.value = response.data.list || response.data.data || []
      total.value = response.data.total || 0
      return response.data
    } catch (error) {
      console.error('Failed to fetch list:', error)
      throw error
    } finally {
      loading.value = false
    }
  }

  async function fetchDetail(id) {
    loading.value = true
    try {
      const response = await axios.get(`/api/service-orders/${id}`)
      detail.value = response.data
      return response.data
    } catch (error) {
      console.error('Failed to fetch detail:', error)
      throw error
    } finally {
      loading.value = false
    }
  }

  async function createServiceOrder(payload) {
    loading.value = true
    try {
      const response = await axios.post('/api/service-orders', payload)
      return response.data
    } catch (error) {
      console.error('Failed to create service order:', error)
      throw error
    } finally {
      loading.value = false
    }
  }

  async function approve(id, data = {}) {
    try {
      const response = await axios.post(`/api/service-orders/${id}/approve`, data)
      return response.data
    } catch (error) {
      console.error('Failed to approve:', error)
      throw error
    }
  }

  async function reject(id, data = {}) {
    try {
      const response = await axios.post(`/api/service-orders/${id}/reject`, data)
      return response.data
    } catch (error) {
      console.error('Failed to reject:', error)
      throw error
    }
  }

  async function feedback(id, data = {}) {
    try {
      const response = await axios.post(`/api/service-orders/${id}/feedback`, data)
      return response.data
    } catch (error) {
      console.error('Failed to submit feedback:', error)
      throw error
    }
  }

  async function complete(id) {
    try {
      const response = await axios.post(`/api/service-orders/${id}/complete`)
      return response.data
    } catch (error) {
      console.error('Failed to complete:', error)
      throw error
    }
  }

  async function rate(id, data = {}) {
    try {
      const response = await axios.post(`/api/service-orders/${id}/rate`, data)
      return response.data
    } catch (error) {
      console.error('Failed to rate:', error)
      throw error
    }
  }

  async function batchApprove(ids, remark = '') {
    try {
      const response = await axios.post('/api/service-orders/batch-approve', { ids, remark })
      return response.data
    } catch (error) {
      console.error('Failed to batch approve:', error)
      throw error
    }
  }

  async function batchReject(ids, remark = '') {
    try {
      const response = await axios.post('/api/service-orders/batch-reject', { ids, remark })
      return response.data
    } catch (error) {
      console.error('Failed to batch reject:', error)
      throw error
    }
  }

  async function fetchAISuggestion(id) {
    try {
      const response = await axios.get(`/api/service-orders/${id}/ai-suggestion`)
      return response.data
    } catch (error) {
      console.error('Failed to fetch AI suggestion:', error)
      throw error
    }
  }

  async function fetchCommunications(id) {
    try {
      const response = await axios.get(`/api/service-orders/${id}/communications`)
      return response.data
    } catch (error) {
      console.error('Failed to fetch communications:', error)
      throw error
    }
  }

  async function addCommunication(id, data = {}) {
    try {
      const response = await axios.post(`/api/service-orders/${id}/communications`, data)
      return response.data
    } catch (error) {
      console.error('Failed to add communication:', error)
      throw error
    }
  }

  async function fetchTimeline(id) {
    try {
      const response = await axios.get(`/api/service-orders/${id}/timeline`)
      return response.data
    } catch (error) {
      console.error('Failed to fetch timeline:', error)
      throw error
    }
  }

  async function fetchLogistics(id) {
    try {
      const response = await axios.get(`/api/service-orders/${id}/logistics`)
      return response.data
    } catch (error) {
      console.error('Failed to fetch logistics:', error)
      throw error
    }
  }

  async function addLogistics(id, data = {}) {
    try {
      const response = await axios.post(`/api/service-orders/${id}/logistics`, data)
      return response.data
    } catch (error) {
      console.error('Failed to add logistics:', error)
      throw error
    }
  }

  return {
    // State
    stats,
    list,
    total,
    detail,
    loading,
    // Actions
    fetchStats,
    fetchList,
    fetchDetail,
    createServiceOrder,
    approve,
    reject,
    feedback,
    complete,
    rate,
    batchApprove,
    batchReject,
    fetchAISuggestion,
    fetchCommunications,
    addCommunication,
    fetchTimeline,
    fetchLogistics,
    addLogistics
  }
})
