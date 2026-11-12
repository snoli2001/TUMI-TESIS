import { Component, inject } from "@angular/core";
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from "@angular/router";
import { filter } from "rxjs";

@Component({
  selector: "app-root",
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  templateUrl: "./app.html",
  styleUrl: "./app.scss",
})
export class App {
  constructor() {
    const router = inject(Router);
    let first = true;
    router.events.pipe(filter((event) => event instanceof NavigationEnd)).subscribe(() => {
      if (first) {
        first = false;
        return;
      }
      queueMicrotask(() => {
        const heading = document.querySelector("main h1");
        if (!(heading instanceof HTMLElement)) return;
        heading.tabIndex = -1;
        heading.focus();
      });
    });
  }
}
