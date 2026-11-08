export type ApiError = { error?: string; message?: string };

async function request<T>(url: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(url, {
    credentials: "include",
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    ...options,
  });
  const data = (await response.json().catch(() => ({}))) as T & ApiError;
  if (!response.ok) throw new Error(data.error || data.message || "Não foi possível concluir a operação.");
  return data;
}

export const api = {
  register: (payload: { name: string; email: string; password: string; role: "usuario" | "profissional"; specialty?: string }) => request<{ user: { id: number; name: string; email: string; role: string } }>("/api/auth/register", { method: "POST", body: JSON.stringify(payload) }),
  login: (payload: { email: string; password: string }) => request<{ user: { id: number; name: string; email: string; role: string; isModerationBlocked?: boolean; moderationBlockedUntil?: string | null; moderationBlockReason?: string | null } }>("/api/auth/login", { method: "POST", body: JSON.stringify(payload) }),
  logout: () => request<{ ok: boolean }>("/api/auth/logout", { method: "POST" }),
  me: () => request<{ user: { id: number; name: string; email: string; role: string; isModerationBlocked?: boolean; moderationBlockedUntil?: string | null; moderationBlockReason?: string | null } }>("/api/auth/me"),
  changePassword: (currentPassword: string, newPassword: string) => request<{ ok: boolean; message: string }>("/api/auth/change-password", { method: "POST", body: JSON.stringify({ currentPassword, newPassword }) }),
  accountSettings: () => request<{ settings: Record<string, any> }>("/api/account/settings"),
  saveAccountSettings: (payload: Record<string, unknown>) => request<{ ok: boolean }>("/api/account/settings", { method: "PUT", body: JSON.stringify(payload) }),
  notifications: () => request<{ notifications: Array<Record<string, any>> }>("/api/notifications"),
  markNotificationRead: (id: number) => request<{ ok: boolean }>(`/api/notifications/${id}/read`, { method: "POST" }),
  markAllNotificationsRead: () => request<{ ok: boolean }>("/api/notifications/read-all", { method: "POST" }),
  createReport: (payload: { targetType: "profile" | "post" | "request" | "message"; targetId: number; reason: string; details?: string }) => request<{ ok: boolean; message: string }>("/api/reports", { method: "POST", body: JSON.stringify(payload) }),
  adminReports: (status = "todas", archived = false) => request<{ reports: Array<Record<string, any>> }>(`/api/admin/reports?status=${encodeURIComponent(status)}&archived=${archived}`),
  updateAdminReport: (id: number, status: string, reviewNote?: string) => request<{ report: Record<string, any> }>(`/api/admin/reports/${id}`, { method: "PATCH", body: JSON.stringify({ status, reviewNote }) }),
  archiveAdminReport: (id: number, archived: boolean) => request<{ ok: boolean; archived: boolean }>(`/api/admin/reports/${id}/archive`, { method: "PATCH", body: JSON.stringify({ archived }) }),
  moderateReportedTarget: (id: number, action: string, days = 0, note = "") => request<{ ok: boolean }>(`/api/admin/reports/${id}/action`, { method: "POST", body: JSON.stringify({ action, days, note }) }),
  adminAccountAppeals: () => request<{ appeals: Array<Record<string, any>> }>("/api/admin/account-appeals"),
  updateAdminAccountAppeal: (id: number, status: string, adminNote?: string) => request<{ ok: boolean }>(`/api/admin/account-appeals/${id}`, { method: "PATCH", body: JSON.stringify({ status, adminNote }) }),
  accountAppealStatus: () => request<{ appeal: Record<string, any> | null }>("/api/account/appeal/status"),
  submitAccountAppeal: (message: string) => request<{ appeal: Record<string, any> }>("/api/account/appeal", { method: "POST", body: JSON.stringify({ message }) }),
  adminServiceIssues: (status = "todas") => request<{ issues: Array<Record<string, any>> }>(`/api/admin/service-issues?status=${encodeURIComponent(status)}`),
  updateAdminServiceIssue: (id: number, status: string, reviewNote?: string) => request<{ issue: Record<string, any> }>(`/api/admin/service-issues/${id}`, { method: "PATCH", body: JSON.stringify({ status, reviewNote }) }),
  adminUsers: (params = "") => request<{ users: Array<Record<string, any>>; total: number; offset: number; limit: number }>(`/api/admin/users${params ? `?${params}` : ""}`),
  adminUser: (id: number) => request<{ account: Record<string, any>; posts: Array<Record<string, any>>; reviews: Array<Record<string, any>>; identityVerification: Record<string, any> | null }>(`/api/admin/users/${id}`),
  reviewIdentityVerification: (id: number, status: "verificada" | "ajuste_solicitado", note = "") => request<{ ok: boolean; status: string }>(`/api/admin/users/${id}/identity-verification`, { method: "PATCH", body: JSON.stringify({ status, note }) }),
  adminStartConversation: (id: number) => request<{ conversation: { id: number } }>(`/api/admin/users/${id}/conversation`, { method: "POST" }),
  feed: () => request<{ items: Array<Record<string, any>> }>("/api/feed"),
  searchUsers: (params = "") => request<{ users: Array<Record<string, any>> }>(`/api/users/search${params ? `?${params}` : ""}`),
  forgotPassword: (email: string) => request<{ ok: boolean }>("/api/auth/forgot-password", { method: "POST", body: JSON.stringify({ email }) }),
  resetPassword: (token: string, password: string) => request<{ ok: boolean }>("/api/auth/reset-password", { method: "POST", body: JSON.stringify({ token, password }) }),
  serviceRequests: () => request<{ requests: unknown[] }>("/api/service-requests"),
  deleteServiceRequest: (requestId: number) => request<{ ok: boolean }>(`/api/service-requests/${requestId}`, { method: "DELETE" }),
  proposals: () => request<{ proposals: Array<Record<string, any>> }>("/api/proposals"),
  bookings: () => request<{ bookings: Array<Record<string, any>> }>("/api/bookings"),
  professionals: (params = "") => request<{ professionals: unknown[] }>(`/api/professionals${params ? `?${params}` : ""}`),
  professionalProfile: (id: number) => request<{ profile: Record<string, any>; posts: Array<Record<string, any>>; reviews: Array<Record<string, any>> }>(`/api/professionals/${id}/profile`),
  followUser: (id: number) => request<{ following: boolean }>(`/api/users/${id}/follow`, { method: "POST" }),
  unfollowUser: (id: number) => request<{ following: boolean }>(`/api/users/${id}/follow`, { method: "DELETE" }),
  createServiceRequest: (payload: Record<string, unknown>) => request<{ request: unknown }>("/api/service-requests", { method: "POST", body: JSON.stringify(payload) }),
  sendProposal: (requestId: number, payload: { amount: number; message: string; estimatedDays?: number; availableStartAt: string }) => request<{ proposal: unknown; conversation: { id: number } }>(`/api/service-requests/${requestId}/proposals`, { method: "POST", body: JSON.stringify(payload) }),
  acceptProposal: (proposalId: number) => request<{ booking: Record<string, any> }>(`/api/proposals/${proposalId}/accept`, { method: "POST" }),
  updateBookingArrival: (bookingId: number, status: "a_caminho" | "cheguei") => request<{ booking: Record<string, any> }>(`/api/bookings/${bookingId}/arrival`, { method: "POST", body: JSON.stringify({ status }) }),
  startBooking: (bookingId: number) => request<{ booking: Record<string, any> }>(`/api/bookings/${bookingId}/start`, { method: "POST" }),
  completeBooking: (bookingId: number, payload: { finalAmount: number; completionImageUrl?: string }) => request<{ booking: Record<string, any> }>(`/api/bookings/${bookingId}/complete`, { method: "POST", body: JSON.stringify(payload) }),
  confirmBooking: (bookingId: number, paidDirectly: boolean) => request<{ booking: Record<string, any>; paidDirectly: boolean }>(`/api/bookings/${bookingId}/confirm`, { method: "POST", body: JSON.stringify({ paidDirectly }) }),
  reportBookingIssue: (bookingId: number, details: string) => request<{ booking: Record<string, any> }>(`/api/bookings/${bookingId}/issue`, { method: "POST", body: JSON.stringify({ details }) }),
  wallet: () => request<{ entries: Array<Record<string, any>>; completedBookings: Array<Record<string, any>>; totals: { income: number; expenses: number; balance: number } }>("/api/wallet"),
  createWalletEntry: (payload: { entryType: "receita" | "despesa"; bookingId?: number; description?: string; amount?: number; paymentMethod?: string }) => request<{ entry: Record<string, any> }>("/api/wallet/entries", { method: "POST", body: JSON.stringify(payload) }),
  createReview: (payload: { professionalId?: number; userId?: number; bookingId?: number; requestId?: number; rating: number; comment?: string }) => request<{ review: unknown }>("/api/reviews", { method: "POST", body: JSON.stringify(payload) }),
  profile: () => request<{ profile: Record<string, any> }>("/api/profile"),
  updateProfile: (payload: Record<string, unknown>) => request<{ profile: Record<string, any> }>("/api/profile", { method: "PUT", body: JSON.stringify(payload) }),
  identityVerification: () => request<{ request: Record<string, any> | null }>("/api/account/identity-verification"),
  submitIdentityVerification: (cpf: string, birthDate: string) => request<{ request: Record<string, any> }>("/api/account/identity-verification", { method: "POST", body: JSON.stringify({ cpf, birthDate }) }),
  uploadImage: async (file: File) => {
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => typeof reader.result === "string" ? resolve(reader.result) : reject(new Error("Não foi possível ler a imagem."));
      reader.onerror = () => reject(new Error("Não foi possível ler a imagem."));
      reader.readAsDataURL(file);
    });
    return request<{ url: string }>("/api/uploads", { method: "POST", body: JSON.stringify({ filename: file.name, dataUrl }) });
  },
  profilePosts: () => request<{ posts: Array<Record<string, any>> }>("/api/profile/posts"),
  createProfilePost: (payload: { title: string; description: string; imageUrl?: string }) => request<{ post: Record<string, any> }>("/api/profile/posts", { method: "POST", body: JSON.stringify(payload) }),
  deleteProfilePost: (postId: number) => request<{ ok: boolean }>(`/api/profile/posts/${postId}`, { method: "DELETE" }),
  reactToPost: (postId: number) => request<{ liked: boolean; likesCount: number }>(`/api/posts/${postId}/reaction`, { method: "POST" }),
  postComments: (postId: number) => request<{ comments: Array<Record<string, any>> }>(`/api/posts/${postId}/comments`),
  createPostComment: (postId: number, body: string) => request<{ comment: Record<string, any>; commentsCount: number }>(`/api/posts/${postId}/comments`, { method: "POST", body: JSON.stringify({ body }) }),
  createConversation: (professionalId: number, requestId?: number, customerId?: number) => request<{ conversation: { id: number } }>("/api/conversations", { method: "POST", body: JSON.stringify({ professionalId, requestId, customerId }) }),
  conversations: () => request<{ conversations: Array<Record<string, any>> }>("/api/conversations"),
  messages: (conversationId: number) => request<{ messages: Array<Record<string, any>>; markedRead?: number }>(`/api/conversations/${conversationId}/messages`),
  sendMessage: (conversationId: number, body: string, attachmentUrl?: string) => request<{ message: Record<string, any> }>(`/api/conversations/${conversationId}/messages`, { method: "POST", body: JSON.stringify({ body, attachmentUrl }) }),
};
