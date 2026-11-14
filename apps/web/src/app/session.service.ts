import { Injectable } from "@angular/core";

const KEY = "tumi.session";
const SECRET = "tumi.sessionKey";

@Injectable({ providedIn: "root" })
export class SessionService {
  id(): string {
    return this.read(KEY);
  }

  key(): string {
    return this.read(SECRET);
  }

  headers(): Record<string, string> {
    return { "X-Session-Key": this.key() };
  }

  remember(sessionId: string): void {
    localStorage.setItem(KEY, sessionId);
  }

  rotate(): void {
    localStorage.removeItem(KEY);
    localStorage.removeItem(SECRET);
    this.id();
    this.key();
  }

  private read(name: string): string {
    const existing = localStorage.getItem(name);
    if (existing) return existing;
    const created = crypto.randomUUID();
    localStorage.setItem(name, created);
    return created;
  }
}
