import axios from "axios";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
export const API = `${BACKEND_URL}/api`;

const api = axios.create({
  baseURL: API,
  timeout: 60000,
});

const inflightGets = new Map();
const responseCache = new Map();
const DEFAULT_GET_TTL = 20_000;

function stableValue(value) {
  if (value == null) return "";
  if (Array.isArray(value)) return value.map(stableValue);
  if (typeof value === "object") {
    return Object.keys(value).sort().reduce((acc, key) => {
      acc[key] = stableValue(value[key]);
      return acc;
    }, {});
  }
  return value;
}

function getCacheKey(url, config = {}) {
  const params = stableValue(config.params || {});
  const token = localStorage.getItem("md_token") || "";
  return `${token}|${url}|${JSON.stringify(params)}`;
}

function getTtl(url, config = {}) {
  if (config.responseType === "blob" || config.skipCache) return 0;
  if (url.includes("/orders") || url.includes("/summary") || url.includes("/caixa")) return 8_000;
  if (url.includes("/products") || url.includes("/categories") || url.includes("/restaurant")) return 120_000;
  if (url.includes("/delivery-people") || url.includes("/waiters") || url.includes("/tables")) return 60_000;
  return DEFAULT_GET_TTL;
}

function cloneResponse(response) {
  let data = response.data;
  if (data != null) {
    try {
      data = typeof structuredClone === "function"
        ? structuredClone(response.data)
        : JSON.parse(JSON.stringify(response.data));
    } catch {
      data = response.data;
    }
  }
  return {
    ...response,
    data,
  };
}

api.interceptors.request.use((config) => {
  const token = localStorage.getItem("md_token");
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

const rawGet = api.get.bind(api);
api.get = (url, config = {}) => {
  const ttl = getTtl(url, config);
  if (!ttl) return rawGet(url, config);

  const key = getCacheKey(url, config);
  const now = Date.now();
  const cached = responseCache.get(key);
  if (cached && now - cached.savedAt < ttl) {
    return Promise.resolve(cloneResponse(cached.response));
  }

  const inflight = inflightGets.get(key);
  if (inflight) return inflight.then(cloneResponse);

  const request = rawGet(url, config)
    .then((response) => {
      responseCache.set(key, { response: cloneResponse(response), savedAt: Date.now() });
      return response;
    })
    .finally(() => inflightGets.delete(key));

  inflightGets.set(key, request);
  return request;
};

function clearApiReadCache() {
  inflightGets.clear();
  responseCache.clear();
}

["post", "put", "patch", "delete"].forEach((method) => {
  const raw = api[method].bind(api);
  api[method] = (...args) => raw(...args).then((response) => {
    clearApiReadCache();
    return response;
  });
});

export function fileUrl(path) {
  if (!path) return null;
  if (path.startsWith("http")) return path;
  if (path.startsWith("/api/")) return `${BACKEND_URL}${path}`;
  return path;
}

export function formatApiError(detail) {
  if (detail == null) return "Algo deu errado. Tente novamente.";
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail))
    return detail.map((e) => (e && typeof e.msg === "string" ? e.msg : JSON.stringify(e))).join(" ");
  if (detail && typeof detail.msg === "string") return detail.msg;
  return String(detail);
}

export default api;
