const BASE_URL = (import.meta.env.VITE_API_URL as string | undefined) ?? "/api/v1";

const TOKEN_KEY = "uytamir_token";

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY);
}

function handleUnauthorized(): never {
  clearToken(); // clear any legacy localStorage token
  window.location.href = "/login";
  throw new Error("Unauthorized");
}

async function apiClient<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const headers: HeadersInit = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string> | undefined),
  };

  const response = await fetch(`${BASE_URL}${path}`, {
    ...options,
    credentials: "include",   // send HttpOnly cookie on every request
    headers,
  });

  if (response.status === 401) {
    handleUnauthorized();
  }

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(errorBody || `HTTP ${response.status}`);
  }

  const contentType = response.headers.get("Content-Type") ?? "";
  if (contentType.includes("application/json")) {
    return response.json() as Promise<T>;
  }

  return response.text() as unknown as T;
}

// ---------- Auth types ----------

export interface AuthUser {
  id: string;
  phone: string | null;
  username: string | null;
  name: string | null;
  created_at: string;
}

export interface LoginResponse {
  user: AuthUser;
}

export interface RegisterData {
  username: string;
  password: string;
  name?: string;
}

export interface LoginData {
  username: string;
  password: string;
}

// ---------- Auth ----------

export async function requestOTP(phone: string): Promise<{ message: string }> {
  return apiClient<{ message: string }>("/auth/otp/request", {
    method: "POST",
    body: JSON.stringify({ phone }),
  });
}

export async function verifyOTP(phone: string, code: string): Promise<LoginResponse> {
  return apiClient<LoginResponse>("/auth/otp/verify", {
    method: "POST",
    body: JSON.stringify({ phone, code }),
  });
}

export async function getMe(): Promise<AuthUser> {
  return apiClient<AuthUser>("/auth/me");
}

export async function logoutApi(): Promise<void> {
  await apiClient<void>("/auth/logout", { method: "POST" });
}

export async function registerUser(data: RegisterData): Promise<LoginResponse> {
  return apiClient<LoginResponse>("/auth/register", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export async function loginWithPassword(data: LoginData): Promise<LoginResponse> {
  return apiClient<LoginResponse>("/auth/login", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

// ---------- Apartment types ----------

export interface Apartment {
  id: string;
  name: string;
  address: string | null;
  developer: string | null;
  created_at: string;
  rooms?: ApartmentRoom[];
}

export interface ApartmentRoom {
  id: string;
  name: string;
  floor_area: number | null;
}

export interface CreateApartmentData {
  name: string;
  address?: string;
  developer?: string;
}

// ---------- Apartments ----------

export async function getApartments(): Promise<Apartment[]> {
  return apiClient<Apartment[]>("/apartments");
}

export async function createApartment(
  data: CreateApartmentData
): Promise<Apartment> {
  return apiClient<Apartment>("/apartments", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

// ---------- Room types ----------

export interface WallElement {
  type: "eshik" | "deraza" | "balkon";
  width: number;
  height: number;
  sill_height?: number;
  position?: number;
}

export interface RoomWall {
  id: string;
  length: number;
  elements: WallElement[];
}

export interface RoomGeometryData {
  walls: RoomWall[];
}

export interface Room {
  id: string;
  apartment_id: string;
  name: string;
  // Synthetic fields — always set by StudioPage.localRoom before being consumed
  room_type: string;
  area: number;
  ceiling_height: number;
  width: number;
  length: number;
  num_doors: number;
  num_windows: number;
  has_balcony: boolean;
  renovation_level: string;
  design_state: Record<string, unknown>;
  created_at: string;
  // Backend API fields (RoomOut schema) — all optional/nullable
  ceiling_h?: number | null;
  geometry?: RoomGeometryData | null;
  surfaces?: Record<string, unknown> | null;
  furniture_layout?: unknown[] | null;
  state?: Record<string, unknown> | null;
  floor_area?: number | null;
  net_wall_area?: number | null;
  perimeter?: number | null;
  openings_count?: number | null;
  updated_at?: string | null;
}

export interface CreateRoomData {
  name: string;
  ceiling_h: number;
  geometry: RoomGeometryData;
}

export interface UpdateRoomData {
  name?: string;
  ceiling_h?: number;
  geometry?: RoomGeometryData;
  surfaces?: Record<string, unknown>;
  furniture_layout?: unknown[];
  state?: Record<string, unknown>;
  /** @deprecated use state instead */
  design_state?: Record<string, unknown>;
}

// ---------- Rooms ----------

export async function getRooms(aptId: string): Promise<Room[]> {
  return apiClient<Room[]>(`/apartments/${aptId}/rooms`);
}

export async function createRoom(
  aptId: string,
  data: CreateRoomData
): Promise<Room> {
  return apiClient<Room>(`/apartments/${aptId}/rooms`, {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export async function getRoom(roomId: string): Promise<Room> {
  return apiClient<Room>(`/rooms/${roomId}`);
}

export async function updateRoom(
  roomId: string,
  data: UpdateRoomData
): Promise<Room> {
  return apiClient<Room>(`/rooms/${roomId}`, {
    method: "PATCH",
    body: JSON.stringify(data),
  });
}

// ---------- Material types ----------

export interface Material {
  id: string;
  store_id: string;
  category: string;
  name_uz: string;
  unit: string;
  price_uzs: number;
  color_hex: string | null;
  texture_key: string | null;
  pbr_roughness: number;
}

export interface MaterialsPage {
  items: Material[];
  total: number;
  page: number;
  per_page: number;
}

export interface MaterialParams {
  category?: string;
  store?: string;
  page?: number;
  per_page?: number;
}

// ---------- Materials ----------

export async function getMaterials(params: MaterialParams = {}): Promise<Material[]> {
  const query = new URLSearchParams(
    Object.fromEntries(
      Object.entries(params)
        .filter(([, v]) => v !== undefined)
        .map(([k, v]) => [k, String(v)])
    )
  ).toString();
  const page = await apiClient<MaterialsPage>(`/materials${query ? `?${query}` : ""}`);
  return page.items;
}

// ---------- Furniture types ----------

export interface Furniture {
  id: string;
  name: string;
  category: string;
  width: number;
  depth: number;
  height: number;
  model_url: string | null;
  thumbnail_url: string | null;
  price: number;
}

export interface FurnitureParams {
  category?: string;
  search?: string;
  page?: number;
  page_size?: number;
}

// ---------- Furniture ----------

export async function getFurniture(
  params: FurnitureParams = {}
): Promise<Furniture[]> {
  const query = new URLSearchParams(
    Object.fromEntries(
      Object.entries(params)
        .filter(([, v]) => v !== undefined)
        .map(([k, v]) => [k, String(v)])
    )
  ).toString();
  return apiClient<Furniture[]>(`/furniture${query ? `?${query}` : ""}`);
}

// ---------- Store types ----------

export interface Store {
  id: string;
  name: string;
  address: string;
  phone: string | null;
  website: string | null;
}

// ---------- Stores ----------

export async function getStores(): Promise<Store[]> {
  return apiClient<Store[]>("/stores");
}

// ---------- Usta types ----------

export interface Usta {
  id: string;
  name: string;
  phone: string;
  telegram: string | null;
  category: string;
  district: string;
  rating: number;
  jobs_count: number;
  price_min: number;
  price_max: number;
  verified: boolean;
  avatar_url?: string | null;
}

export interface UstalarParams {
  specialization?: string;
  region?: string;
  sort?: "rating" | "price_asc" | "price_desc";
  page?: number;
  page_size?: number;
}

// ---------- Ustalar ----------

export async function getUstalar(params: UstalarParams = {}): Promise<Usta[]> {
  const query = new URLSearchParams(
    Object.fromEntries(
      Object.entries(params)
        .filter(([, v]) => v !== undefined)
        .map(([k, v]) => [k, String(v)])
    )
  ).toString();
  return apiClient<Usta[]>(`/ustalar${query ? `?${query}` : ""}`);
}

// ---------- Estimate types ----------

export interface EstimateLine {
  label: string;
  formula: string;
  quantity: number;
  unit: string;
  unit_price: number;
  total_uzs: number;
  is_approximate: boolean;
  store_id: string | null;
}

export interface EstimateResponse {
  id: string;
  room_id: string;
  lines: EstimateLine[];
  total_uzs: number;
  total_min: number;
  total_max: number;
  created_at: string;
  has_electrical: boolean;
}

// ---------- Estimate ----------

export async function createEstimate(
  roomId: string
): Promise<EstimateResponse> {
  return apiClient<EstimateResponse>(`/rooms/${roomId}/estimate`, {
    method: "POST",
  });
}

export async function getEstimatePDF(roomId: string): Promise<Blob> {
  const token = getToken();

  const headers: HeadersInit = {
    Accept: "application/pdf",
  };

  if (token) {
    (headers as Record<string, string>)["Authorization"] = `Bearer ${token}`;
  }

  const response = await fetch(`${BASE_URL}/rooms/${roomId}/estimate/pdf`, {
    headers,
  });

  if (response.status === 401) {
    handleUnauthorized();
  }

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  return response.blob();
}

// ---------- Draft Room types ----------

export interface DraftRoom {
  id: string;
  state: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

// ---------- Draft Rooms ----------

export async function createDraftRoom(
  state: Record<string, unknown> = {}
): Promise<DraftRoom> {
  return apiClient<DraftRoom>("/draft-rooms", {
    method: "POST",
    body: JSON.stringify({ state }),
  });
}

export async function getDraftRoom(id: string): Promise<DraftRoom> {
  return apiClient<DraftRoom>(`/draft-rooms/${id}`);
}

export async function updateDraftRoom(
  id: string,
  state: Record<string, unknown>
): Promise<DraftRoom> {
  return apiClient<DraftRoom>(`/draft-rooms/${id}`, {
    method: "PATCH",
    body: JSON.stringify({ state }),
  });
}

export async function deleteDraftRoom(id: string): Promise<void> {
  await apiClient<void>(`/draft-rooms/${id}`, { method: "DELETE" });
}

// ---------- Lead types ----------

export interface LeadData {
  usta_id: string;
  room_id?: string;
  message?: string;
  contact_phone?: string;
}

export interface LeadResponse {
  id: string;
  status: string;
  created_at: string;
}

// ---------- Lead ----------

export async function createLead(data: LeadData): Promise<LeadResponse> {
  return apiClient<LeadResponse>("/leads", {
    method: "POST",
    body: JSON.stringify(data),
  });
}
