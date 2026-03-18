// Product
export interface Product {
  id: string
  name: string
  description: string
  price: number
  imageUrl: string
  category: string
  stock: number
  createdAt: Date
  updatedAt: Date
}

// Cart
export interface Cart {
  id: string
  userId: string
  items: CartItem[]
  createdAt: Date
  updatedAt: Date
}

export interface CartItem {
  id: string
  cartId: string
  productId: string
  quantity: number
  price: number
}

// Order
export type OrderStatus = 'PENDING' | 'CONFIRMED' | 'SHIPPED' | 'DELIVERED' | 'CANCELLED'

export interface Order {
  id: string
  userId: string
  status: OrderStatus
  totalPrice: number
  items: OrderItem[]
  createdAt: Date
  updatedAt: Date
}

export interface OrderItem {
  id: string
  orderId: string
  productId: string
  quantity: number
  price: number
}

// Shipment
export type ShipmentStatus = 'PROCESSING' | 'SHIPPED' | 'IN_TRANSIT' | 'DELIVERED'

export interface Shipment {
  id: string
  orderId: string
  userId: string
  status: ShipmentStatus
  trackingNumber: string | null
  shippedAt: Date | null
  deliveredAt: Date | null
  createdAt: Date
  updatedAt: Date
}

// User
export interface User {
  id: string
  email: string
  name: string
  apiKey: string
  createdAt: Date
  updatedAt: Date
}

// Kafka Events
export interface OrderCreatedEvent {
  orderId: string
  userId: string
  items: { productId: string; quantity: number; price: number }[]
  totalPrice: number
  createdAt: string
}

export interface OrderStatusUpdatedEvent {
  orderId: string
  status: OrderStatus
  trackingNumber?: string
  updatedAt: string
}
