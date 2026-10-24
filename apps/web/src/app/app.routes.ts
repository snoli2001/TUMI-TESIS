import { Routes } from "@angular/router";
import { CandidateDetailPage } from "./pages/candidate-detail";
import { CandidatesPage } from "./pages/candidates";
import { ChatPage } from "./pages/chat";
import { HistoryPage } from "./pages/history";

export const routes: Routes = [
  { path: "", component: ChatPage },
  { path: "candidatos", component: CandidatesPage },
  { path: "candidatos/:id", component: CandidateDetailPage },
  { path: "historial", component: HistoryPage },
];
