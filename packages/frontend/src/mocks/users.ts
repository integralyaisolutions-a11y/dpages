import type { UserApi } from "@/lib/api";
import { mockRequest } from "@/lib/mockClient";

// Credencials de prova (mock, no reals):
//   office@dpages.cat      / office123
//   workshop@dpages.cat    / workshop123
//   packaging@dpages.cat   / packaging123
//   production@dpages.cat  / production123

let users: UserApi[] = [
  { id: "u-office", name: "Marta Oficina", email: "office@dpages.cat", password: "office123", role: "office", status: "active" },
  { id: "u-workshop", name: "Jordi Obrador", email: "workshop@dpages.cat", password: "workshop123", role: "workshop", status: "active" },
  { id: "u-packaging", name: "Anna Empaquetat", email: "packaging@dpages.cat", password: "packaging123", role: "packaging", status: "active" },
  { id: "u-production", name: "Pau Producció", email: "production@dpages.cat", password: "production123", role: "production", status: "active" },
];

export function getMockUsers(): Promise<UserApi[]> {
  return mockRequest(users);
}

export function createMockUser(user: UserApi): Promise<UserApi[]> {
  users = [...users, user];
  return mockRequest(users);
}

export function updateMockUser(id: string, user: UserApi): Promise<UserApi[]> {
  users = users.map((item) => (item.id === id ? user : item));
  return mockRequest(users);
}

export function deleteMockUser(id: string): Promise<UserApi[]> {
  users = users.filter((item) => item.id !== id);
  return mockRequest(users);
}

export type CredentialsResult = { ok: true; user: UserApi } | { ok: false; reason: "invalid" | "inactive" };

export function validateCredentials(email: string, password: string): Promise<CredentialsResult> {
  const found = users.find((user) => user.email.toLowerCase() === email.toLowerCase() && user.password === password);
  if (!found) return mockRequest({ ok: false, reason: "invalid" });
  if (found.status !== "active") return mockRequest({ ok: false, reason: "inactive" });
  return mockRequest({ ok: true, user: found });
}
