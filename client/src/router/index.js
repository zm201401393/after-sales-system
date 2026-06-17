import { createRouter, createWebHistory } from 'vue-router'

const routes = [
  {
    path: '/',
    redirect: '/merchant/dashboard'
  },
  {
    path: '/merchant/dashboard',
    name: 'Dashboard',
    component: () => import('../views/merchant/Dashboard.vue'),
    meta: { title: '工作台' }
  },
  {
    path: '/merchant/service-list',
    name: 'ServiceList',
    component: () => import('../views/merchant/ServiceList.vue'),
    meta: { title: '服务单管理' }
  },
  {
    path: '/merchant/service/:id',
    name: 'ServiceDetail',
    component: () => import('../views/merchant/ServiceDetail.vue'),
    meta: { title: '服务单详情' }
  },
  {
    path: '/merchant/ai-templates',
    name: 'AITemplates',
    component: () => import('../views/merchant/AITemplates.vue'),
    meta: { title: '协商agent管理' }
  },
  {
    path: '/consumer/apply',
    name: 'ApplyService',
    component: () => import('../views/consumer/ApplyService.vue'),
    meta: { title: '消费者申请' }
  },
  {
    path: '/consumer/my-services',
    name: 'MyServices',
    component: () => import('../views/consumer/MyServices.vue'),
    meta: { title: '我的售后' }
  }
]

const router = createRouter({
  history: createWebHistory(),
  routes
})

router.beforeEach((to, from, next) => {
  if (to.meta && to.meta.title) {
    document.title = `${to.meta.title} - 售后服务管理系统`
  }
  next()
})

export default router
