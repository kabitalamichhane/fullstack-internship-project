export type Role = 'CUSTOMER' | 'VENDOR' | 'ADMIN';
export type User = { id: string; email: string; name: string; role: Role };
export type Category = { id: string; name: string; slug: string };

export type SearchItem = {
  id: string;
  title: string;
  description: string;
  priceCents: number;
  stock: number;
  ratingAvg: number;
  ratingCount: number;
  image: string | null;
  categorySlug: string;
  categoryName: string;
  storeName: string;
  vendorId: string;
};

export type Review = { id: string; rating: number; comment?: string; createdAt: string; user: { name: string } };

export type Product = {
  id: string;
  title: string;
  description: string;
  priceCents: number;
  stock: number;
  images: string[];
  isActive: boolean;
  ratingAvg: number;
  ratingCount: number;
  categoryId: string;
  category: Category;
  vendor?: { id: string; storeName: string; logoUrl?: string };
  reviews?: Review[];
};

export type CartLine = {
  productId: string;
  title: string;
  image: string | null;
  unitPriceCents: number;
  quantity: number;
  stock: number;
  storeName: string;
  lineTotalCents: number;
};
export type Cart = { items: CartLine[]; subtotalCents: number; itemCount: number };

export type OrderStatus = 'PENDING_PAYMENT' | 'PLACED' | 'PACKED' | 'SHIPPED' | 'DELIVERED' | 'CANCELLED';
export type OrderItem = { id: string; productId: string; title: string; unitPriceCents: number; quantity: number };
export type VendorOrder = {
  id: string;
  status: OrderStatus;
  subtotalCents: number;
  discountCents: number;
  commissionCents: number;
  vendorPayoutCents: number;
  transferId?: string;
  items: OrderItem[];
  vendor?: { storeName: string };
  order?: { id: string; createdAt: string; shippingAddress: Record<string, string>; user: { name: string; email: string } };
};
export type Order = {
  id: string;
  status: OrderStatus;
  subtotalCents: number;
  discountCents: number;
  totalCents: number;
  couponCode?: string;
  createdAt: string;
  shippingAddress: Record<string, string>;
  vendorOrders: VendorOrder[];
};
