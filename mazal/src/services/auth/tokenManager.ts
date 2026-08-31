/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

const AUTH_TOKEN_KEY = "mazal_auth_token";
let inMemoryToken: string | null = null;

export class TokenManager {
  public static getToken(): string | null {
    if (inMemoryToken) return inMemoryToken;
    try {
      if (typeof sessionStorage !== "undefined") {
        inMemoryToken = sessionStorage.getItem(AUTH_TOKEN_KEY);
      }
    } catch (e) {}
    return inMemoryToken;
  }

  public static setToken(token: string | null): void {
    inMemoryToken = token;
    try {
      if (typeof sessionStorage !== "undefined") {
        if (token) {
          sessionStorage.setItem(AUTH_TOKEN_KEY, token);
        } else {
          sessionStorage.removeItem(AUTH_TOKEN_KEY);
        }
      }
    } catch (e) {}
  }

  public static clearToken(): void {
    this.setToken(null);
  }

  public static getAuthHeaders(): Record<string, string> {
    const token = this.getToken();
    return token ? { Authorization: `Bearer ${token}` } : {};
  }
}
