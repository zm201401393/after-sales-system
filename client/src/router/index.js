import { createRouter, createWebHistory } from 'vue-router'

const routes = [
  {
    path: '/',
    redirect: '/merchant/dashboard'
  },
  {
    path: '/consumer/apply',
    name: 'ConsumerApply',
    component: () => import('../views/consumer/ApplyService.vue')
  },
  {
    path: '/merchant',
    redirect: '/merchant/dashboard'
  },
  {
    path: '/merchant/dashboard',
    name: 'Dashboard',
    component: () => import('../views/merchant/Dashboard.vue')
  },
  {
    path: '/merchant/service-list',
    name: 'ServiceList',
    component: () => import('../views/merchant/ServiceList.vue')
  },
  {
    path: '/merchant/service/:id',
    name: 'ServiceDetail',
    component: () => import('../views/merchant/ServiceDetail.vue')
  }
]

export default createRouter({
  history: createWebHistory(),
  routes
})
