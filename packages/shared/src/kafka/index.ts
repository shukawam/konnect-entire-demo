export const KAFKA_TOPICS = {
  ORDER_CREATED: 'order.created',
  ORDER_STATUS_UPDATED: 'order.status-updated',
} as const

export const KAFKA_CONSUMER_GROUPS = {
  SHIPPING_SERVICE: 'shipping-service-group',
  ORDER_SERVICE: 'order-service-group',
} as const
