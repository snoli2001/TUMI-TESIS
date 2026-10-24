import { Injectable } from "@angular/core";

const KEY = "tumi.session";

@Injectable({ providedIn: "root" })
export class SessionService {
  id(): string {
    const existing = localStorage.getItem(KEY);
    if (existing) return existing;
    const created = crypto.randomUUID();
    localStorage.setItem(KEY, created);
    return created;
  }

  remember(sessionId: string): void {
    localStorage.setItem(KEY, sessionId);
  }
}
